import express from 'express';
import { logger, getEnv, loadEnv } from '@shop/common-utils';

loadEnv();

const app = express();
app.use(express.json());

const port = parseInt(getEnv('PORT', '3005'), 10);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'audit-service' });
});

app.post('/audit/events', (req, res) => {
  logger.info('Audit event received', { event: req.body });
  res.status(202).json({ status: 'queued' });
});

app.listen(port, () => {
  logger.info('Audit service listening', { port });
});
