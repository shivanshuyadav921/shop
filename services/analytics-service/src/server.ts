import express from 'express';
import bodyParser from 'body-parser';
import { logger, loadEnv } from '@shop/common-utils';
import analyticsRoutes from './routes/analyticsRoutes';
import { initSchema } from './db';
import { config } from './config';
import { scheduleReports } from './scheduler';

loadEnv();

const app = express();
app.use(bodyParser.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'analytics-service' }));
app.use('/api', analyticsRoutes);

initSchema().catch((error) => {
  logger.error('Failed to initialize analytics DB schema', { error });
  process.exit(1);
});

scheduleReports();

app.listen(config.port, () => {
  logger.info('Analytics service listening', { port: config.port });
});
