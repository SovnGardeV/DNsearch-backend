import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `缺少必需的环境变量 ${name}，请复制 .env.example 为 .env 并填写数据库连接信息。`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function port(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new Error(`环境变量 ${name} 必须是 1-65535 之间的整数，当前值：${raw}`);
  }
  return parsed;
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

// 本地/测试环境连远程测试库，正式环境连本机库。
const dbHost = isProduction
  ? optional('DB_HOST_PROD', '127.0.0.1')
  : optional('DB_HOST_DEV', '47.106.37.94');

export const env = {
  nodeEnv,
  isProduction,
  port: port('PORT', 3000),
  db: {
    host: dbHost,
    port: port('DB_PORT', 3306),
    user: required('DB_USER'),
    password: optional('DB_PASSWORD', ''),
    database: required('DB_DATABASE'),
    connectionLimit: port('DB_POOL_SIZE', 10),
  },
} as const;

export type Env = typeof env;
