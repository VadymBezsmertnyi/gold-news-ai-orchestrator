import { FF_BASE_URL } from './news-forexfactory.constants';

/**
 * Локальна розробка: Cloudflare cookie з браузера (оновлюйте коли знову 403).
 * Пріоритет: FOREX_FACTORY_COOKIE в .env → цей дефолт.
 */
const FOREX_FACTORY_COOKIE_DEFAULT = [
  'cf_clearance=kuyjvnQCvmUj8es8gSmZbE9S1JpRnXnNfPzd40VxDlM-1774004414-1.2.1.1-d8WvG9os4j1WdrdMgeF6dLpUd07CU2xim777IYfpt7V10Zwgh_TB3vOqqvvFOQX_SMh45JcNbsiVA5hr.XYmQ4Q7LI1y4CuPZH2YjWO9jDUKE3iD0Xl7icGMmemF0YedvdVWdOzNrfSiHadQW4OMzPEqj21Xe7gp3sPVgjSE1muuIMnXXz9GQeMbkk0OSwrA7w20Axvn3kLVkC9_hMAIeoPT_zRdE2QPpOFXyPXA31I',
  'fflastvisit=1780592163',
  'fflastactivity=0',
  'ffsettingshash=4d98a2ca581dc67378548cbc092cf322',
  'fftab-history=calendar',
  'auth_user=de7f6a20fa4d0a2ab8de67d09bd0182e5abf9c4a679baebcc033e4d7f9588019%3Ae9e02d4039be36ea83a60c5d546633fe6f932d67acbea185b1ea719931b7c88e',
  '__cf_bm=hGgRo2OWsr4VGSMkU3AMFfiuZDIs490ysQ.uD2MpJWM-1780592163.6231246-1.0.1.1-c8McLrWxY85xreZus_93NkWKyTObQq8dbCvzJaqpc0VT_HJoJtBbs.vqRGebnUY6JhqQZrYxXNLuj3VIC.ztzUOtpRbO5FSgkIOR9AQoj_Zexsf5yB1F12G8IEb28BYNCVw8yPCVeyjXfGMbU3t0Yw',
].join('; ');

export function getForexFactoryCookie(): string {
  const fromEnv =
    process.env.FOREX_FACTORY_COOKIE?.trim() ?? process.env.FF_COOKIE?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return FOREX_FACTORY_COOKIE_DEFAULT;
}

export function hasForexFactoryCookie(): boolean {
  return getForexFactoryCookie().length > 0;
}

/** Заголовки як у Chrome (DevTools → fetch). */
export function buildForexFactoryBrowserHeaders(): Record<string, string> {
  const userAgent =
    process.env.FOREX_FACTORY_USER_AGENT?.trim() ??
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

  return {
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language':
      process.env.FOREX_FACTORY_ACCEPT_LANGUAGE?.trim() ??
      'ru,uk;q=0.9,en-US;q=0.8,en;q=0.7',
    'User-Agent': userAgent,
    'sec-ch-ua':
      '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    Referer: `${FF_BASE_URL}/`,
    Priority: 'u=0, i',
    Cookie: getForexFactoryCookie(),
  };
}

export const FOREX_FACTORY_403_HINT =
  'ForexFactory 403 — оновіть FOREX_FACTORY_COOKIE_DEFAULT у news-forexfactory.http-config.ts (cf_clearance з DevTools).';
