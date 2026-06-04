import { SynchronizationListener } from 'metaapi.cloud-sdk';
import type { MetatraderSymbolPrice } from 'metaapi.cloud-sdk';

// local
import type { MetaApiLivePriceStateStore } from './metaapi-live-price.state';

export interface MetaApiPriceListenerCallbacks {
  symbol: string;
  onConnected: () => void;
  onDisconnected: () => void;
  onPrice: (bid: number, ask: number, time: Date) => void;
}

export const createMetaApiPriceListener = (
  stateStore: MetaApiLivePriceStateStore,
  callbacks: MetaApiPriceListenerCallbacks,
): SynchronizationListener =>
  new (class extends SynchronizationListener {
    onConnected(_instanceIndex: string, _replicas: number): Promise<void> {
      callbacks.onConnected();
      return Promise.resolve();
    }

    onDisconnected(_instanceIndex: string): Promise<void> {
      stateStore.patch({
        isSynchronized: false,
        brokerReady: false,
      });
      callbacks.onDisconnected();
      return Promise.resolve();
    }

    onSymbolPricesUpdated(
      _instanceIndex: string,
      prices: MetatraderSymbolPrice[],
    ): Promise<void> {
      const symbol = callbacks.symbol;
      const priceForSymbol = Array.isArray(prices)
        ? prices.find((p) => p?.symbol === symbol)
        : undefined;
      if (!priceForSymbol) return Promise.resolve();

      const bid = priceForSymbol.bid;
      const ask = priceForSymbol.ask;
      if (bid == null || ask == null) return Promise.resolve();

      const state = stateStore.getState();
      if (!state.brokerReady && state.connectionInstance?.terminalState)
        stateStore.patch({ brokerReady: true });

      const time =
        priceForSymbol.time instanceof Date ? priceForSymbol.time : new Date();
      callbacks.onPrice(bid, ask, time);
      return Promise.resolve();
    }
  })();
