import { api } from "./api";
import type { AnalyticsOverview } from "../types";

export const analyticsApi = {
  overview: () => api.get<AnalyticsOverview>("/api/analytics/overview"),
};
