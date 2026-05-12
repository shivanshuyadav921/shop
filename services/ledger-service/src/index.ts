import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { loadEnv, logger } from '@shop/common-utils';
import { initSchema } from './db';
import { config } from './config';
import ledgerRoutes from './routes/ledgerRoutes';

loadEnv();

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ledger-service' }));
app.use('/', ledgerRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error in ledger-service', { error: err });
  res.status(500).json({ error: 'Internal server error.' });
});

initSchema()
  .then(() => {
    app.listen(config.port, () => {
      logger.info('Ledger service listening', { port: config.port });
    });
  })
  .catch((err) => {
    logger.error('Failed to initialize ledger schema', { error: err });
    process.exit(1);
  });
