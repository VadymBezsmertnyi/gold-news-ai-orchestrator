import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import MetaApi from 'metaapi.cloud-sdk';

// common
import type { AppEnv } from '../../common/config/env.validation';
import { MOCK_GOLD_PRICE, XAUUSD_SYMBOL } from '../../constants';

export interface CurrentGoldPrice {
  symbol: string;
  price: number;
  bid?: number;
  ask?: number;
  source: 'metaapi' | 'mock';
  capturedAt: Date;
  rawPayload?: Record<string, unknown>;
}

type MetaApiRpcConnection = {
  connect: () => Promise<void>;
  waitSynchronized: (timeout?: number) => Promise<void>;
  subscribeToMarketData: (symbol: string) => Promise<void>;
  getSymbolPrice: (symbol: string) => Promise<{
    bid?: number;
    ask?: number;
    time?: Date | string;
  }>;
};

@Injectable()
export class MetaApiPriceService {
  private readonly logger = new Logger(MetaApiPriceService.name);
  private rpcConnectPromise: Promise<void> | null = null;
  private rpcConnection: MetaApiRpcConnection | null = null;

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  async getCurrentGoldPrice(): Promise<CurrentGoldPrice> {
    const token = this.config.get('METAAPI_TOKEN', { infer: true });
    const accountId = this.config.get('METAAPI_ACCOUNT_ID', { infer: true });

    if (!token || !accountId) return this.mockPrice('missing_metaapi_credentials');

    try {
      const api = new MetaApi(token, {
        application: 'gold-news-ai-orchestrator',
        useSharedClientApi: true,
      });
      const account = await api.metatraderAccountApi.getAccount(accountId);
      if (!account) return this.mockPrice('account_not_found');

      const acc = account as {
        state?: string;
        deploy?: () => Promise<void>;
        connectionStatus?: string;
      };
      if (acc.state != null && acc.state !== 'DEPLOYED' && acc.deploy)
        await acc.deploy().catch((err: unknown) => {
          this.logger.warn('MetaApi deploy skipped or failed', err);
        });

      const connection = account.getRPCConnection() as unknown as MetaApiRpcConnection;
      await this.ensureRpcReady(connection);

      await connection.subscribeToMarketData(XAUUSD_SYMBOL);
      const quote = await connection.getSymbolPrice(XAUUSD_SYMBOL);
      const bid = quote.bid ?? MOCK_GOLD_PRICE;
      const ask = quote.ask ?? bid;
      const mid = (bid + ask) / 2;

      return {
        symbol: XAUUSD_SYMBOL,
        price: mid,
        bid,
        ask,
        source: 'metaapi',
        capturedAt: new Date(),
        rawPayload: quote as unknown as Record<string, unknown>,
      };
    } catch (error) {
      this.logger.warn('MetaApi price fetch failed, using mock', error);
      return this.mockPrice('metaapi_error');
    }
  }

  private async ensureRpcReady(connection: MetaApiRpcConnection): Promise<void> {
    if (this.rpcConnection === connection && this.rpcConnectPromise === null)
      return;

    if (!this.rpcConnectPromise) {
      this.rpcConnection = connection;
      this.rpcConnectPromise = (async () => {
        await connection.connect();
        if (typeof connection.waitSynchronized === 'function')
          await connection.waitSynchronized(30);
      })();
    }

    await this.rpcConnectPromise;
  }

  private mockPrice(reason: string): CurrentGoldPrice {
    return {
      symbol: XAUUSD_SYMBOL,
      price: MOCK_GOLD_PRICE,
      source: 'mock',
      capturedAt: new Date(),
      rawPayload: { reason },
    };
  }
}
