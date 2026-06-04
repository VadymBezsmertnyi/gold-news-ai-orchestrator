import { FF_BASE_URL } from './news-forexfactory.constants';

export function getForexFactoryCookie(): string | undefined {
  const raw =
    process.env.FOREX_FACTORY_COOKIE?.trim() ?? process.env.FF_COOKIE?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export function hasForexFactoryCookie(): boolean {
  return getForexFactoryCookie() !== undefined;
}

/** Як у XauSync `news-forexfactory.helpers.ts` + опційний Cookie з env. */
export function buildForexFactoryHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent':
      process.env.FOREX_FACTORY_USER_AGENT?.trim() ??
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    Referer: FF_BASE_URL,
  };
  const cookie = getForexFactoryCookie();
  if (cookie) headers.Cookie = cookie;
  return headers;
}
