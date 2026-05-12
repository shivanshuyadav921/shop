import express from 'express';
import { logger, loadEnv } from '@shop/common-utils';
import fraudRoutes from './routes/fraudRoutes';
import { initSchema } from './db';
import { config } from './config';

loadEnv();

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'fraud-service' }));
app.use('/api', fraudRoutes);

initSchema().catch((error) => {
  logger.error('Failed to initialize fraud DB schema', { error });
  process.exit(1);
});

app.listen(config.port, () => {
  logger.info('Fraud service listening', { port: config.port });
});
