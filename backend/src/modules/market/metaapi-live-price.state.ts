import type { MetatraderAccount } from 'metaapi.cloud-sdk';

export interface LiveGoldPrice {
  symbol: string;
  bid: number;
  ask: number;
  price: number;
  time: Date;
  source: 'metaapi';
}

export interface MetaApiLivePriceState {
  api: import('metaapi.cloud-sdk').default | null;
  currentAccount: MetatraderAccount | null;
  connectionInstance: {
    connect: () => Promise<void>;
    close: () => Promise<void>;
    waitSynchronized?: (opts?: { timeoutInSeconds?: number }) => Promise<void>;
    terminalState?: unknown;
    addSynchronizationListener: (listener: unknown) => void;
    removeSynchronizationListener: (listener: unknown) => void;
    subscribeToMarketData: (
      symbol: string,
      subscriptions: Array<{ type: string; intervalInMilliseconds?: number }>,
    ) => Promise<void>;
    unsubscribeFromMarketData?: (
      symbol: string,
      subscriptions: Array<{ type: string }>,
    ) => Promise<void>;
  } | null;
  synchronizationListener: unknown | null;
  isStopping: boolean;
  isConnecting: boolean;
  isSynchronized: boolean;
  brokerReady: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  waitBrokerInFlight: Promise<MetatraderAccount> | null;
  latestPrice: LiveGoldPrice | null;
}

export const initialMetaApiLivePriceState = (): MetaApiLivePriceState => ({
  api: null,
  currentAccount: null,
  connectionInstance: null,
  synchronizationListener: null,
  isStopping: false,
  isConnecting: false,
  isSynchronized: false,
  brokerReady: false,
  reconnectTimer: null,
  waitBrokerInFlight: null,
  latestPrice: null,
});

export class MetaApiLivePriceStateStore {
  private state: MetaApiLivePriceState = initialMetaApiLivePriceState();

  getState(): MetaApiLivePriceState {
    return this.state;
  }

  patch(partial: Partial<MetaApiLivePriceState>): MetaApiLivePriceState {
    this.state = { ...this.state, ...partial };
    return this.state;
  }

  reset(): MetaApiLivePriceState {
    this.state = initialMetaApiLivePriceState();
    return this.state;
  }
}
