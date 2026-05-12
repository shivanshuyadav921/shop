import cron from 'cron';
import { config } from './config';
import { generateScheduledReport, refreshMaterializedViews } from './services/analyticsService';

export function scheduleReports() {
  const job = new cron.CronJob(config.reportSchedule, async () => {
    try {
      await refreshMaterializedViews();
      await generateScheduledReport('scheduled_daily_analytics');
      console.log('Analytics scheduled report generated');
    } catch (error) {
      console.error('Failed to run analytics schedule', error);
    }
  });
  job.start();
}
