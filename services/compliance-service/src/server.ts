import express from 'express';
import bodyParser from 'body-parser';
import complianceRoutes from './routes/complianceRoutes';
import { initSchema } from './db';
import { config } from './config';
import { logger, loadEnv } from '@shop/common-utils';

loadEnv();

const app = express();
app.use(bodyParser.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'compliance-service' }));
app.use('/api', complianceRoutes);

initSchema().catch((error) => {
  logger.error('Failed to initialize compliance DB schema', { error });
  process.exit(1);
});

app.listen(config.port, () => {
  logger.info('Compliance service listening', { port: config.port });
});
