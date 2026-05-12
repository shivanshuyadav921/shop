import express from 'express';
import {
  getDashboardMetrics,
  refreshMaterializedViews,
  getMaterializedView,
  generateScheduledReport,
  listReports,
} from '../services/analyticsService';

const router = express.Router();

router.get('/dashboard', async (_req, res) => {
  try {
    const dashboard = await getDashboardMetrics();
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load dashboard' });
  }
});

router.post('/refresh', async (_req, res) => {
  try {
    await refreshMaterializedViews();
    res.json({ status: 'refreshed' });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to refresh views' });
  }
});

router.get('/views/:name', async (req, res) => {
  try {
    const rows = await getMaterializedView(req.params.name);
    res.json(rows);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Failed to fetch view' });
  }
});

router.post('/reports', async (req, res) => {
  try {
    const report = await generateScheduledReport(req.body.reportName || 'daily_analytics_report');
    res.status(201).json(report);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate report' });
  }
});

router.get('/reports', async (req, res) => {
  try {
    const reports = await listReports(Number(req.query.limit) || 20);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list reports' });
  }
});

export default router;
