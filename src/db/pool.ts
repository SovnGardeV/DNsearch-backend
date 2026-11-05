import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env.ts';

/**
 * 全局连接池。整个进程只创建一次，按需借还连接。
 * 不要在请求里调用 pool.getConnection() 后忘记 release，优先使用下面的封装函数。
 */
export const pool: Pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: env.db.connectionLimit,
  queueLimit: 0,
  connectTimeout: 10_000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

/** 查询多行，用于 SELECT。 */
export async function select<T extends RowDataPacket>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const [rows] = await pool.query<T[]>(sql, params);
  return rows;
}

/** 执行写入，返回 insertId / affectedRows 等元信息。 */
export async function mutate(
  sql: string,
  params: unknown[] = [],
): Promise<ResultSetHeader> {
  const [result] = await pool.query<ResultSetHeader>(sql, params);
  return result;
}

/** 在同一个连接上执行事务：回调抛错时自动回滚。 */
export async function withTransaction<T>(
  run: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  } finally {
    connection.release();
  }
}

/** 探活：连接池可用时返回，否则抛出原始连接错误。 */
export async function ping(): Promise<void> {
  await pool.query('SELECT 1');
}

/** 进程退出前释放全部连接。 */
export async function closePool(): Promise<void> {
  await pool.end();
}
