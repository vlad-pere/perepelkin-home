import './fastify-augment.js';
import { loadEnvFile } from './env.js';
import { loadConfig } from './config.js';
import { openDb } from './db/db.js';
import { createApp } from './app.js';

loadEnvFile();
const config = loadConfig();
const db = openDb(config.dbPath);
const app = await createApp({ db, config, logger: true });

await app.listen({ port: config.port, host: config.host });

function shutdown(signal: string): void {
  void (async () => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    db.close();
    process.exit(0);
  })();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
