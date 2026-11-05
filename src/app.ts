import express from 'express';
import type { Express } from 'express';
import { errorHandler, notFoundHandler, requestLogger } from './middlewares/error-handler.ts';
import { dragonNestRouter } from './routes/dragonnest-items.ts';
import { healthRouter } from './routes/health.ts';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(requestLogger);

  // 业务路由
  app.use('/api', healthRouter);
  app.use('/dragonnest', dragonNestRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
