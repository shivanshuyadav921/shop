import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { loadEnv, logger } from '@shop/common-utils';
import { initSchema } from './db';
import { config } from './config';
import { globalRateLimiter } from './middleware/rateLimiter';
import { requireIpWhitelist } from './middleware/ipWhitelist';
import { requireGeoRestriction } from './middleware/geoRestriction';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';

loadEnv();

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(globalRateLimiter);
app.use(requireIpWhitelist);
app.use(requireGeoRestriction);

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));
app.use('/', authRoutes);
app.use('/', adminRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error in auth-service', { error: err });
  res.status(500).json({ error: 'Internal server error.' });
});

initSchema()
  .then(() => {
    app.listen(config.port, () => {
      logger.info('Auth service listening', { port: config.port });
    });
  })
  .catch((err) => {
    logger.error('Failed to initialize auth schema', { error: err });
    process.exit(1);
  });
