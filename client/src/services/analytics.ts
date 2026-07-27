// ===== Analytics API client =====
// Two endpoints:
//   - GET /api/analytics/overview : admin-only aggregate anonymous usage stats
//   - GET /api/analytics/me       : the signed-in user's own gamification &
//                                   study-analytics dashboard payload

import { api } from "./api";
import type { AnalyticsDashboard, AnalyticsOverview } from "../types";

export const analyticsApi = {
  overview: () => api.get<AnalyticsOverview>("/api/analytics/overview"),
  myDashboard: () => api.get<AnalyticsDashboard>("/api/analytics/me"),
};
