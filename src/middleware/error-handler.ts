import type { ErrorRequestHandler } from 'express';
import mongoose from 'mongoose';
import { AppError } from '../utils/errors.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  if (error instanceof AppError) {
    status = error.statusCode; code = error.code; message = error.message;
  } else if (error instanceof mongoose.mongo.MongoServerError && error.code === 11000) {
    status = 409; code = 'DUPLICATE_EMAIL'; message = 'A user with this email already exists';
  } else if (error instanceof mongoose.Error.ValidationError || error instanceof mongoose.Error.CastError) {
    status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid field value';
  } else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.parse.failed') {
    status = 400; code = 'INVALID_JSON'; message = 'Request body must contain valid JSON';
  } else if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'Request body exceeds the 100 KB limit';
  }
  if (status === 500) console.error(error);
  res.status(status).json({ error: { code, message } });
};
