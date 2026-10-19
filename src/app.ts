import express from 'express';
import mongoose from 'mongoose';
import { router } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { AppError } from './utils/errors.js';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.get('/health', (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
});
app.use(router);
app.use((_req, _res, next) => next(new AppError(404, 'ROUTE_NOT_FOUND', 'Route not found')));
app.use(errorHandler);
