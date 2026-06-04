import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import MetaApi from 'metaapi.cloud-sdk';
import type { MetatraderAccount } from 'metaapi.cloud-sdk';

// common
import type { AppEnv } from '../../common/config/env.validation';
import { MOCK_GOLD_PRICE, XAUUSD_SYMBOL } from '../../constants';

// modules
import { METAAPI_LOG_TYPES } from '../server-logs/server-logs.constants';
import { ServerLogsService } from '../server-logs/server-logs.service';
import { MarketService } from './market.service';

// local
import {
  METAAPI_HISTORY_START_MS,
  METAAPI_LOG_THROTTLE_MS,
  METAAPI_RECONNECT_DELAY_MS,
  METAAPI_SIGNIFICANT_MOVE_PERCENT,
  METAAPI_SNAPSHOT_THROTTLE_MS,
  METAAPI_WAIT_BROKER_POLL_MS,
  METAAPI_WAIT_BROKER_TIMEOUT_MS,
  METAAPI_WAIT_TERMINAL_STATE_MS,
  METAAPI_WAIT_TERMINAL_STATE_POLL_MS,
} from './metaapi-live-price.constants';
import { createMetaApiPriceListener } from './metaapi-live-price.listener';
import {
  MetaApiLivePriceStateStore,
  type LiveGoldPrice,
} from './metaapi-live-price.state';

export interface MarketPriceView {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  source: 'metaapi' | 'mock';
  connected: boolean;
  updatedAt: Date;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

@Injectable()
export class MetaApiLivePriceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MetaApiLivePriceService.name);
  private readonly stateStore = new MetaApiLivePriceStateStore();
  private readonly symbol: string;

  private isStopping = false;
  private isDisconnected = true;
  private disconnectPromise: Promise<void> | null = null;
  private connectPromise: Promise<void> | null = null;
  private disconnectLogged = false;

  private lastSnapshotAt = 0;
  private lastLogAt = 0;
  private lastMockWarnAt = 0;
  private lastLoggedPrice: number | null = null;

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly serverLogs: ServerLogsService,
    @Inject(forwardRef(() => MarketService))
    private readonly marketService: MarketService,
  ) {
    this.symbol = process.env.METAAPI_SYMBOL?.trim() || XAUUSD_SYMBOL;
  }

  onModuleInit(): void {
    if (!this.isDisconnected || this.isStopping) return;
    void this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  isConnected(): boolean {
    if (this.isDisconnected || this.isStopping) return false;
    const state = this.stateStore.getState();
    return !!state.connectionInstance && state.brokerReady;
  }

  getLatestPrice(): LiveGoldPrice | null {
    return this.stateStore.getState().latestPrice;
  }

  getStatus(): {
    connected: boolean;
    synchronized: boolean;
    hasLivePrice: boolean;
    symbol: string;
  } {
    const state = this.stateStore.getState();
    return {
      connected: this.isConnected(),
      synchronized: state.isSynchronized,
      hasLivePrice: state.latestPrice != null,
      symbol: this.symbol,
    };
  }

  async connect(): Promise<void> {
    if (this.isStopping || !this.isDisconnected) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.runConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isDisconnected) return;
    if (this.disconnectPromise) return this.disconnectPromise;

    this.disconnectPromise = this.runDisconnect();
    try {
      await this.disconnectPromise;
    } finally {
      this.disconnectPromise = null;
    }
  }

  resolveMarketPrice(): MarketPriceView {
    const live = this.getLatestPrice();
    const connected = this.isConnected();
    if (live)
      return {
        symbol: live.symbol,
        price: live.price,
        bid: live.bid,
        ask: live.ask,
        source: 'metaapi',
        connected,
        updatedAt: live.time,
      };

    const now = Date.now();
    if (now - this.lastMockWarnAt >= METAAPI_LOG_THROTTLE_MS) {
      this.lastMockWarnAt = now;
      void this.serverLogs.warn(
        METAAPI_LOG_TYPES.FALLBACK_MOCK,
        'Using mock XAUUSD price — MetaAPI not connected or no live tick yet',
        this.getStatus(),
      );
      this.logger.warn('MetaAPI fallback to mock price');
    }

    return {
      symbol: this.symbol,
      price: MOCK_GOLD_PRICE,
      bid: MOCK_GOLD_PRICE,
      ask: MOCK_GOLD_PRICE,
      source: 'mock',
      connected: false,
      updatedAt: new Date(),
    };
  }

  private async runDisconnect(): Promise<void> {
    if (this.isStopping && this.isDisconnected) return;

    this.isStopping = true;
    const state = this.stateStore.getState();

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      this.stateStore.patch({ reconnectTimer: null });
    }

    const connection = state.connectionInstance;
    const listener = state.synchronizationListener;

    if (connection && listener) {
      try {
        connection.removeSynchronizationListener(listener);
      } catch (err) {
        this.logger.warn('MetaApi removeSynchronizationListener error', err);
      }
    }

    if (
      connection &&
      state.marketDataSubscribed &&
      connection.unsubscribeFromMarketData
    ) {
      try {
        await connection
          .unsubscribeFromMarketData(this.symbol, [{ type: 'quotes' }])
          .catch(() => {});
      } catch {
        /* ignore */
      }
      this.stateStore.patch({ marketDataSubscribed: false });
    }

    if (connection) {
      try {
        await Promise.race([connection.close(), sleep(3000)]);
      } catch (err) {
        this.logger.warn('MetaApi close error', err);
      }
    }

    const api = state.api;
    if (api) {
      try {
        api.close();
      } catch (err) {
        this.logger.warn('MetaApi SDK close error', err);
      }
    }

    this.stateStore.reset();
    this.isDisconnected = true;
    this.isStopping = true;

    if (!this.disconnectLogged) {
      this.disconnectLogged = true;
      await this.serverLogs.info(
        METAAPI_LOG_TYPES.DISCONNECTED,
        'MetaAPI disconnected',
      );
      this.logger.log('MetaAPI disconnected');
    }
  }

  private async runConnect(): Promise<void> {
    const state = this.stateStore.getState();
    if (this.isStopping || state.isConnecting) return;

    const token = this.config.get('METAAPI_TOKEN', { infer: true });
    const accountId = this.config.get('METAAPI_ACCOUNT_ID', { infer: true });

    if (!token || !accountId) {
      await this.serverLogs.warn(
        METAAPI_LOG_TYPES.FALLBACK_MOCK,
        'MetaAPI credentials missing — live price disabled',
      );
      return;
    }

    this.stateStore.patch({ isConnecting: true });
    await this.serverLogs.info(
      METAAPI_LOG_TYPES.CONNECT_START,
      'MetaAPI streaming connect started',
      { symbol: this.symbol, accountId },
    );

    try {
      await this.teardownConnectionResources();

      const api = new MetaApi(token, {
        application: 'gold-news-ai-orchestrator',
        useSharedClientApi: true,
        keepHashTrees: false,
      });
      this.stateStore.patch({ api });

      const account = await api.metatraderAccountApi.getAccount(accountId);
      if (!account) throw new Error(`MetaApi account ${accountId} not found`);

      await this.ensureDeployed(account);
      const connectedAccount = await this.waitBrokerConnected(account.id);

      const historyStartTime = new Date(Date.now() - METAAPI_HISTORY_START_MS);
      const streamingConn = connectedAccount.getStreamingConnection(
        undefined,
        historyStartTime,
      ) as NonNullable<
        ReturnType<MetaApiLivePriceStateStore['getState']>['connectionInstance']
      >;

      const listener = createMetaApiPriceListener(this.stateStore, {
        symbol: this.symbol,
        onConnected: () => {
          void this.serverLogs.info(
            METAAPI_LOG_TYPES.CONNECTED,
            'MetaAPI websocket connected',
          );
        },
        onDisconnected: () => {
          if (this.isStopping) return;
          void this.serverLogs.warn(
            METAAPI_LOG_TYPES.DISCONNECTED,
            'MetaAPI websocket disconnected (will reconnect)',
          );
          this.scheduleReconnect();
        },
        onPrice: (bid, ask, time) => this.handlePriceTick(bid, ask, time),
      });

      this.stateStore.patch({
        currentAccount: connectedAccount,
        connectionInstance: streamingConn,
        synchronizationListener: listener,
        isSynchronized: false,
        brokerReady: false,
        marketDataSubscribed: false,
      });

      streamingConn.addSynchronizationListener(listener);
      await streamingConn.connect();

      await this.waitSynchronized(streamingConn);

      if (streamingConn.terminalState) {
        await streamingConn.subscribeToMarketData(this.symbol, [
          { type: 'quotes', intervalInMilliseconds: 1000 },
        ]);
        this.stateStore.patch({ marketDataSubscribed: true });
        this.logger.log(`MetaAPI subscribed to ${this.symbol} quotes`);
      }

      this.isDisconnected = false;
      this.isStopping = false;

      await this.serverLogs.info(
        METAAPI_LOG_TYPES.CONNECTED,
        `MetaAPI live price stream ready for ${this.symbol}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown MetaAPI error';
      await this.serverLogs.error(
        METAAPI_LOG_TYPES.ERROR,
        `MetaAPI connect failed: ${message}`,
      );
      this.logger.error('MetaAPI connect failed', error);
      if (!this.isStopping) this.scheduleReconnect();
    } finally {
      this.stateStore.patch({ isConnecting: false });
    }
  }

  private handlePriceTick(bid: number, ask: number, time: Date): void {
    if (this.isStopping) return;

    const price = (bid + ask) / 2;
    const live: LiveGoldPrice = {
      symbol: this.symbol,
      bid,
      ask,
      price,
      time,
      source: 'metaapi',
    };
    this.stateStore.patch({ latestPrice: live });

    const now = Date.now();
    const movePercent =
      this.lastLoggedPrice == null || this.lastLoggedPrice === 0
        ? METAAPI_SIGNIFICANT_MOVE_PERCENT + 1
        : (Math.abs(price - this.lastLoggedPrice) / this.lastLoggedPrice) * 100;
    const shouldLog =
      now - this.lastLogAt >= METAAPI_LOG_THROTTLE_MS ||
      movePercent >= METAAPI_SIGNIFICANT_MOVE_PERCENT;

    if (shouldLog) {
      this.lastLogAt = now;
      this.lastLoggedPrice = price;
      void this.serverLogs.info(
        METAAPI_LOG_TYPES.PRICE_UPDATE,
        `XAUUSD ${bid.toFixed(2)} / ${ask.toFixed(2)} (mid ${price.toFixed(2)})`,
        { bid, ask, price },
      );
    }

    if (now - this.lastSnapshotAt < METAAPI_SNAPSHOT_THROTTLE_MS) return;
    this.lastSnapshotAt = now;

    void this.marketService.handlePriceUpdate(price, 'metaapi').catch((err) => {
      this.logger.warn('handlePriceUpdate failed', err);
    });
  }

  private async teardownConnectionResources(): Promise<void> {
    const state = this.stateStore.getState();
    const connection = state.connectionInstance;
    const listener = state.synchronizationListener;
    if (!connection) return;

    if (listener) {
      try {
        connection.removeSynchronizationListener(listener);
      } catch {
        /* ignore */
      }
    }

    if (state.marketDataSubscribed && connection.unsubscribeFromMarketData) {
      try {
        await connection
          .unsubscribeFromMarketData(this.symbol, [{ type: 'quotes' }])
          .catch(() => {});
      } catch {
        /* ignore */
      }
    }

    try {
      await connection.close();
    } catch {
      /* ignore */
    }

    this.stateStore.patch({
      connectionInstance: null,
      synchronizationListener: null,
      currentAccount: null,
      marketDataSubscribed: false,
      isSynchronized: false,
      brokerReady: false,
    });
  }

  private async ensureDeployed(account: MetatraderAccount): Promise<void> {
    const acc = account as {
      state?: string;
      deploy?: () => Promise<void>;
    };
    if (
      acc.state != null &&
      acc.state !== 'DEPLOYED' &&
      typeof acc.deploy === 'function'
    )
      await acc.deploy();
  }

  private async waitBrokerConnected(
    accountId: string,
  ): Promise<MetatraderAccount> {
    const state = this.stateStore.getState();
    if (state.waitBrokerInFlight) return state.waitBrokerInFlight;

    const api = state.api;
    if (!api) throw new Error('MetaApi SDK not initialized');

    const promise = (async (): Promise<MetatraderAccount> => {
      const start = Date.now();
      while (Date.now() - start < METAAPI_WAIT_BROKER_TIMEOUT_MS) {
        if (this.isStopping) break;
        const fresh = await api.metatraderAccountApi.getAccount(accountId);
        if (fresh?.connectionStatus === 'CONNECTED') return fresh;
        await sleep(METAAPI_WAIT_BROKER_POLL_MS);
      }
      throw new Error(
        `MetaApi account ${accountId} did not reach CONNECTED within timeout`,
      );
    })();

    this.stateStore.patch({ waitBrokerInFlight: promise });
    try {
      return await promise;
    } finally {
      this.stateStore.patch({ waitBrokerInFlight: null });
    }
  }

  private async waitSynchronized(
    conn: NonNullable<
      ReturnType<MetaApiLivePriceStateStore['getState']>['connectionInstance']
    >,
  ): Promise<void> {
    let syncOk = false;
    if (typeof conn.waitSynchronized === 'function') {
      try {
        await conn.waitSynchronized({ timeoutInSeconds: 30 });
        syncOk = true;
      } catch (err) {
        this.logger.warn('waitSynchronized failed', err);
      }
    }

    if (!syncOk && !conn.terminalState) {
      const syncStart = Date.now();
      while (Date.now() - syncStart < METAAPI_WAIT_TERMINAL_STATE_MS) {
        if (this.isStopping || conn.terminalState) {
          syncOk = !!conn.terminalState;
          break;
        }
        await sleep(METAAPI_WAIT_TERMINAL_STATE_POLL_MS);
      }
    } else if (conn.terminalState) syncOk = true;

    this.stateStore.patch({
      isSynchronized: syncOk,
      brokerReady: syncOk || !!conn.terminalState,
    });

    if (syncOk)
      await this.serverLogs.info(
        METAAPI_LOG_TYPES.SYNCHRONIZED,
        'MetaAPI terminal state ready',
      );
  }

  private scheduleReconnect(): void {
    if (this.isStopping || this.isDisconnected) return;
    const state = this.stateStore.getState();
    if (state.reconnectTimer || state.isConnecting) return;

    const timer = setTimeout(() => {
      this.stateStore.patch({ reconnectTimer: null });
      if (this.isStopping || this.isDisconnected) return;
      void this.connect().catch((err) => {
        this.logger.warn('MetaAPI reconnect failed', err);
      });
    }, METAAPI_RECONNECT_DELAY_MS);
    timer.unref?.();
    this.stateStore.patch({ reconnectTimer: timer });
  }
}
