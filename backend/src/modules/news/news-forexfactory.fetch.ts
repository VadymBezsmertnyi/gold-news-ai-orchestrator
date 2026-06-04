import { Logger } from '@nestjs/common';
import axios from 'axios';
import { Impit } from 'impit';

import { buildForexFactoryHeaders } from './news-forexfactory.http-config';

export type ForexFactoryFetchTransport = 'axios' | 'impit';

export interface ForexFactoryGetJsonResult<T> {
  data: T;
  status: number;
  transport: ForexFactoryFetchTransport;
  durationMs: number;
}

const logger = new Logger('NewsForexFactoryClient');

let impitInstance: Impit | null | undefined;
let impitUnavailable = false;

function isImpitEnabled(): boolean {
  return process.env.FOREX_FACTORY_DISABLE_IMPIT !== 'true';
}

function isWwwForexFactoryUrl(url: string): boolean {
  return url.includes('www.forexfactory.com');
}

function getImpit(): Impit | null {
  if (!isImpitEnabled() || impitUnavailable) return null;
  if (impitInstance !== undefined) return impitInstance;

  try {
    impitInstance = new Impit({ browser: 'chrome' });
    return impitInstance;
  } catch (error) {
    impitUnavailable = true;
    impitInstance = null;
    logger.warn(
      `impit init failed — calendar may 403 locally. ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

function transportOrder(url: string): ForexFactoryFetchTransport[] {
  const impit = getImpit();
  if (!impit) return ['axios'];

  // www — Cloudflare TLS check; impit first. mds-api — axios first, impit on 403.
  return isWwwForexFactoryUrl(url) ? ['impit', 'axios'] : ['axios', 'impit'];
}

async function axiosGetJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; data: T }> {
  const response = await axios.get<T>(url, {
    timeout: 15_000,
    maxRedirects: 5,
    headers,
    validateStatus: () => true,
  });
  return { status: response.status, data: response.data };
}

async function impitGetJson<T>(
  url: string,
  headers: Record<string, string>,
): Promise<{ status: number; data: T }> {
  const impit = getImpit();
  if (!impit) throw new Error('impit not available');

  const response = await impit.fetch(url, { headers });
  const text = await response.text();
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new Error(
      `impit non-JSON response (${response.status}): ${text.slice(0, 120)}`,
    );
  }
  return { status: response.status, data };
}

/**
 * GET JSON з видимим логом запиту/відповіді та обходом Cloudflare через impit.
 */
export async function forexFactoryGetJson<T>(
  label: string,
  url: string,
): Promise<ForexFactoryGetJsonResult<T>> {
  const started = Date.now();
  const headers = buildForexFactoryHeaders();
  const cookie = headers.Cookie ? 'cookie=set' : 'cookie=none';
  logger.log(`→ GET ${label} (${cookie})`);

  const transports = transportOrder(url);
  let lastStatus = 0;

  for (let i = 0; i < transports.length; i += 1) {
    const transport = transports[i];
    const isLast = i === transports.length - 1;

    try {
      const { status, data } =
        transport === 'impit'
          ? await impitGetJson<T>(url, headers)
          : await axiosGetJson<T>(url, headers);

      lastStatus = status;

      if (status === 403 && !isLast) {
        logger.warn(
          `← ${label} 403 via ${transport} (${Date.now() - started}ms) — retry impit/axios`,
        );
        continue;
      }

      if (status >= 400) {
        throw Object.assign(new Error(`HTTP ${status}`), { status });
      }

      const durationMs = Date.now() - started;
      logger.log(`← ${label} ${status} in ${durationMs}ms via ${transport}`);
      return { data, status, transport, durationMs };
    } catch (error: unknown) {
      if (!isLast && transport === 'impit') {
        logger.warn(
          `← ${label} impit error (${Date.now() - started}ms) — fallback axios`,
        );
        continue;
      }
      throw error;
    }
  }

  throw Object.assign(new Error(`HTTP ${lastStatus || 403}`), {
    status: lastStatus || 403,
  });
}
