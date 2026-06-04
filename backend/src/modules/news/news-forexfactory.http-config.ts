import { FF_BASE_URL } from './news-forexfactory.constants';

/**
 * Cloudflare on ForexFactory blocks server requests without browser cookies.
 * Copy the full Cookie header from DevTools (while logged in on forexfactory.com)
 * into FOREX_FACTORY_COOKIE in backend/.env
 */
export function getForexFactoryCookie(): string | undefined {
  const raw =
    process.env.FOREX_FACTORY_COOKIE?.trim() ?? process.env.FF_COOKIE?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export function hasForexFactoryCookie(): boolean {
  return getForexFactoryCookie() != null;
}

/** Headers aligned with a real Chrome navigation (see browser DevTools fetch). */
export function buildForexFactoryBrowserHeaders(): Record<string, string> {
  const cookie = getForexFactoryCookie();
  const userAgent =
    process.env.FOREX_FACTORY_USER_AGENT?.trim() ??
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

  const headers: Record<string, string> = {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language':
      process.env.FOREX_FACTORY_ACCEPT_LANGUAGE?.trim() ?? 'en-US,en;q=0.9',
    'User-Agent': userAgent,
    'sec-ch-ua':
      process.env.FOREX_FACTORY_SEC_CH_UA?.trim() ??
      '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform':
      process.env.FOREX_FACTORY_SEC_CH_UA_PLATFORM?.trim() ?? '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    Referer: `${FF_BASE_URL}/`,
    Priority: 'u=0, i',
  };

  if (cookie) headers.Cookie = cookie;

  return headers;
}

export const FOREX_FACTORY_403_HINT =
  'ForexFactory returned 403. Set FOREX_FACTORY_COOKIE in backend/.env — copy the Cookie header from browser DevTools after opening https://www.forexfactory.com (needs cf_clearance).';
