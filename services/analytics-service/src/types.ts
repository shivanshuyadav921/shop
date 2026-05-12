export interface BusinessMetric {
  name: string;
  value: number;
  unit: string;
  details?: Record<string, unknown>;
}

export interface AnalyticsDashboard {
  gmv: number;
  settlementSuccessRate: number;
  failedPayments: number;
  dealerUtilization: number;
  outstandingCredit: number;
  fraudAlerts: number;
  refundRatio: number;
}

export interface AnalyticsReport {
  id: string;
  report_name: string;
  generated_at: string;
  payload: Record<string, unknown>;
}
