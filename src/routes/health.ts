import { Router } from 'express';
import { ping } from '../db/pool.ts';

export const healthRouter: Router = Router();

/**
 * GET /api/health
 * 服务与数据库探活，供负载均衡 / 容器健康检查使用。
 */
healthRouter.get('/health', async (_req, res) => {
  const startedAt = Date.now();

  try {
    await ping();
    res.json({
      status: 'ok',
      uptimeSeconds: Math.round(process.uptime()),
      database: { status: 'up', latencyMs: Date.now() - startedAt },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      database: {
        status: 'down',
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : String(error),
      },
      timestamp: new Date().toISOString(),
    });
  }
});
