import type { RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env.ts';
import { closePool, select } from '../db/pool.ts';

interface ServerInfoRow extends RowDataPacket {
  version: string;
  db: string | null;
  user: string;
}

function hintFor(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;

  switch (code) {
    case 'ECONNREFUSED':
      return 'MySQL 没有在监听该地址/端口，请确认服务已启动，或检查 DB_HOST / DB_PORT。';
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return 'DB_HOST 无法解析，请检查主机名拼写。';
    case 'ETIMEDOUT':
      return '连接超时，检查网络、防火墙或 DB_HOST 是否可达。';
    case 'ER_ACCESS_DENIED_ERROR':
      return '用户名或密码不正确，请检查 DB_USER / DB_PASSWORD。';
    case 'ER_BAD_DB_ERROR':
      return '目标数据库不存在，请先创建：CREATE DATABASE dnsearch DEFAULT CHARSET utf8mb4;';
    default:
      return '';
  }
}

async function main(): Promise<void> {
  console.log(
    `[db:check] ${env.db.user}@${env.db.host}:${env.db.port}/${env.db.database}`,
  );

  try {
    const rows = await select<ServerInfoRow>(
      'SELECT VERSION() AS version, DATABASE() AS db, CURRENT_USER() AS user',
    );
    const info = rows[0];

    console.log('[db:check] 连接成功');
    console.log(`  MySQL 版本 : ${info?.version ?? '未知'}`);
    console.log(`  当前库     : ${info?.db ?? '(未选择)'}`);
    console.log(`  当前账号   : ${info?.user ?? '未知'}`);
    console.log(`  连接池上限 : ${env.db.connectionLimit}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[db:check] 连接失败：${message}`);

    const hint = hintFor(error);
    if (hint) console.error(`[db:check] 建议：${hint}`);

    process.exitCode = 1;
  } finally {
    await closePool().catch(() => undefined);
  }
}

await main();
