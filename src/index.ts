import { createApp } from './app.ts';
import { env } from './config/env.ts';
import { closePool, ping } from './db/pool.ts';

async function main(): Promise<void> {
  const app = createApp();

  // 启动时探活一次，连不上也照常启动（health 接口会返回 503），便于先排查配置
  try {
    await ping();
    console.log(`[db] 已连接 mysql://${env.db.host}:${env.db.port}/${env.db.database}`);
  } catch (error) {
    console.error(
      `[db] 连接失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const server = app.listen(env.port, () => {
    console.log(`[http] 服务已启动：http://localhost:${env.port} (${env.nodeEnv})`);
  });

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[http] 收到 ${signal}，正在关闭…`);

    server.close(() => {
      void closePool()
        .catch((error: unknown) => {
          console.error('[db] 关闭连接池失败:', error);
        })
        .finally(() => {
          console.log('[http] 已关闭');
          process.exit(0);
        });
    });

    // 兜底：10 秒内没关完就强制退出
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[process] 未处理的 Promise 拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[process] 未捕获的异常:', error);
  process.exit(1);
});

main().catch((error: unknown) => {
  console.error('[boot] 启动失败:', error);
  process.exit(1);
});
