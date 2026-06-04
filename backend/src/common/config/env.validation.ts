export interface AppEnv {
  DATABASE_URL: string;
  DIRECT_URL?: string;
  METAAPI_TOKEN?: string;
  METAAPI_ACCOUNT_ID?: string;
  METAAPI_SYMBOL?: string;
  NODE_ENV: string;
  PORT: number;
}

export const validateEnv = (): AppEnv => ({
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  DIRECT_URL: process.env.DIRECT_URL,
  METAAPI_TOKEN: process.env.METAAPI_TOKEN,
  METAAPI_ACCOUNT_ID: process.env.METAAPI_ACCOUNT_ID,
  METAAPI_SYMBOL: process.env.METAAPI_SYMBOL,
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3001),
});
