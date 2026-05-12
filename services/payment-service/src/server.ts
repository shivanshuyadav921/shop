import express from 'express';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import cors from 'cors';
import { logger, loadEnv } from '@shop/common-utils';
import paymentRoutes from './routes/paymentRoutes';
import { initSchema } from './db';
import { registerAdapter } from './providers/providerRegistry';
import { HttpRailProviderAdapter } from './providers/httpRailProvider';
import { config } from './config';

loadEnv();

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'payment-service' }));
app.use('/api', paymentRoutes);

for (const providerConfig of config.paymentProviderConfigs) {
  registerAdapter(new HttpRailProviderAdapter(providerConfig));
}

initSchema().catch((error) => {
  logger.error('Failed to initialize payment DB schema', { error });
  process.exit(1);
});

app.listen(config.port, () => {
  logger.info('Payment service listening', { port: config.port, providers: config.paymentProviderConfigs.map((provider) => provider.providerId) });
});
