import express from 'express';
import { logger, loadEnv } from '@shop/common-utils';
import invoiceRoutes from './routes/invoiceRoutes';
import { initSchema } from './db';
import { config } from './config';

loadEnv();

const app = express();
app.use(express.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'invoice-service' }));
app.use('/api', invoiceRoutes);

initSchema().catch((error) => {
  console.error('Failed to initialize DB schema:', error);
  process.exit(1);
});

app.listen(config.port, () => {
  logger.info('Invoice service listening', { port: config.port });
});
