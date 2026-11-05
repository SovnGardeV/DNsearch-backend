import type { ErrorRequestHandler, RequestHandler } from 'express';
import { env } from '../config/env.ts';

/** 极简访问日志：方法、路径、状态码、耗时。 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    console.log(
      `[http] ${req.method} ${req.originalUrl} ${res.statusCode} ${elapsedMs.toFixed(1)}ms`,
    );
  });

  next();
};

/** 未匹配到任何路由时的 404。 */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: {
      message: `接口不存在：${req.method} ${req.originalUrl}`,
    },
  });
};

/** 全局错误处理，必须放在所有路由之后，并保留 4 个参数。 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  const status: number =
    typeof err?.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  const message =
    status >= 500 && env.isProduction
      ? '服务器内部错误'
      : err instanceof Error
        ? err.message
        : '未知错误';

  if (status >= 500) {
    console.error('[http] unhandled error:', err);
  }

  res.status(status).json({
    error: {
      message,
      ...(err?.details ? { details: err.details } : {}),
    },
  });
};
