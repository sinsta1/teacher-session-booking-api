import mongoose from 'mongoose';
import { app } from './app.js';
import { readConfig } from './config/env.js';
import { connectDatabase } from './config/database.js';

try {
  const config = readConfig();
  await connectDatabase(config.mongoUri);
  const server = app.listen(config.port, () => console.log(`API listening on port ${config.port}`));
  server.on('error', async (error) => {
    console.error('HTTP server failed:', error.message);
    await mongoose.disconnect();
    process.exitCode = 1;
  });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const timeout = setTimeout(() => process.exit(1), 10000);
    timeout.unref();
    try {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      await mongoose.disconnect();
    } catch (error) {
      console.error('Shutdown failed:', error);
      process.exitCode = 1;
    } finally { clearTimeout(timeout); }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Startup failed:', error instanceof Error ? error.message : error);
  await mongoose.disconnect();
  process.exitCode = 1;
}
