import express from 'express';
import {
  runFraudCheck,
  getFraudEvent,
  listFraudEvents,
  listReviewQueue,
  createReview,
  submitReview,
  blockTransaction,
} from '../services/fraudService';
import { listAlerts, acknowledgeAlert } from '../services/alertService';

const router = express.Router();

router.post('/transactions/check', async (req, res) => {
  try {
    const result = await runFraudCheck(req.body);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Fraud check failed' });
  }
});

router.get('/transactions/:id', async (req, res) => {
  try {
    const event = await getFraudEvent(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch event' });
  }
});

router.get('/transactions', async (req, res) => {
  try {
    const events = await listFraudEvents(Number(req.query.limit) || 50);
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch events' });
  }
});

router.get('/alerts', async (_req, res) => {
  try {
    const alerts = await listAlerts();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch alerts' });
  }
});

router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const alert = await acknowledgeAlert(req.params.id);
    res.json(alert);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to acknowledge alert' });
  }
});

router.get('/reviews', async (_req, res) => {
  try {
    const reviews = await listReviewQueue();
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch review queue' });
  }
});

router.post('/reviews', async (req, res) => {
  try {
    const { eventId, transactionId, dealerId } = req.body;
    const review = await createReview(eventId, transactionId, dealerId);
    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create review' });
  }
});

router.post('/reviews/:id/action', async (req, res) => {
  try {
    const { reviewerId, status, notes } = req.body;
    const review = await submitReview(req.params.id, reviewerId, status, notes);
    res.json(review);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to submit review' });
  }
});

router.post('/transactions/:id/block', async (req, res) => {
  try {
    const event = await blockTransaction(req.params.id);
    res.json(event);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to block transaction' });
  }
});

export default router;
