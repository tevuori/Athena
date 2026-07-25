/**
 * Admin-only analytics overview.
 *
 * GET /api/analytics/overview returns aggregate, anonymous usage stats:
 *   - total + active user counts (active = distinct users with a refresh
 *     token used in the last 7/30 days)
 *   - per-feature usage totals over the last 30 days (from UsageStat),
 *     sorted descending, plus a per-day series for the top 5 features
 *   - feature adoption: how many users have each integration credential
 *   - content totals: aggregate counts of user-created items across apps
 *
 * No userIds, usernames, or any per-user data are ever returned — only
 * scalar counts. This is the single source for the admin Analytics view.
 */

import { Hono } from "hono";
import prisma from "../db/client";
import { adminGuard } from "../middleware/admin";
import { flushAnalytics, dayBucket } from "../services/analytics";

const analytics = new Hono();
analytics.use("*", ...adminGuard);

const DAYS_WINDOW = 30;
const TREND_TOP_N = 5;

/** GET /api/analytics/overview — aggregate anonymous usage stats (admin). */
analytics.get("/overview", async (c) => {
  // Flush the in-memory buffer first so the view reflects recent activity.
  await flushAnalytics();

  const now = new Date();
  const windowStart = new Date(now.getTime() - DAYS_WINDOW * 86_400_000);
  const active7d = new Date(now.getTime() - 7 * 86_400_000);
  const active30d = new Date(now.getTime() - 30 * 86_400_000);

  // Run independent queries in parallel.
  const [
    totalUsers,
    active7,
    active30,
    usageRows,
    adoption,
    contentTotals,
  ] = await Promise.all([
    prisma.user.count(),

    // Distinct users with a refresh token used in the last 7 days.
    prisma.refreshToken.findMany({
      where: { lastUsedAt: { gte: active7d } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.refreshToken.findMany({
      where: { lastUsedAt: { gte: active30d } },
      select: { userId: true },
      distinct: ["userId"],
    }),

    // Per-feature usage over the window.
    prisma.usageStat.findMany({
      where: { day: { gte: dayBucket(windowStart) } },
      select: { feature: true, day: true, count: true },
    }),

    // Feature adoption: # users with each integration configured.
    Promise.all([
      prisma.spotifyCredential.count(),
      prisma.microsoftCredential.count(),
      prisma.aiCredential.count(),
      prisma.vutCredentials.count(),
      prisma.ntfyConfig.count(),
      prisma.proactiveAlertConfig.count({ where: { enabled: true } }),
      prisma.ttsCredential.count(),
    ]),

    // Content totals (aggregate across all users).
    Promise.all([
      prisma.note.count(),
      prisma.task.count(),
      prisma.task.count({ where: { status: "DONE" } }),
      prisma.task.count({ where: { status: "IN_PROGRESS" } }),
      prisma.task.count({ where: { status: "TODO" } }),
      prisma.vFile.count(),
      prisma.flashcardDeck.count(),
      prisma.flashcard.count(),
      prisma.course.count(),
      prisma.assignment.count(),
      prisma.calendarEvent.count(),
      prisma.chatConversation.count(),
      prisma.studySession.count(),
      prisma.whiteboard.count(),
      prisma.habit.count(),
      prisma.studySource.count(),
      prisma.studyChat.count(),
      prisma.podcast.count(),
      prisma.teacherSession.count(),
      prisma.ntfyMessage.count(),
    ]),
  ]);

  // Aggregate usage rows: total per feature + per-day series.
  const totalsByFeature = new Map<string, number>();
  const daysByFeature = new Map<string, Map<string, number>>(); // feature -> YYYY-MM-DD -> count
  for (const row of usageRows) {
    const dayStr = row.day.toISOString().slice(0, 10);
    totalsByFeature.set(row.feature, (totalsByFeature.get(row.feature) ?? 0) + row.count);
    let days = daysByFeature.get(row.feature);
    if (!days) {
      days = new Map();
      daysByFeature.set(row.feature, days);
    }
    days.set(dayStr, (days.get(dayStr) ?? 0) + row.count);
  }

  const featureUsage = Array.from(totalsByFeature.entries())
    .map(([feature, total]) => ({ feature, total }))
    .sort((a, b) => b.total - a.total);

  // Per-day series for the top N features (last DAYS_WINDOW days, zero-filled).
  const topFeatures = featureUsage.slice(0, TREND_TOP_N).map((f) => f.feature);
  const trend: Record<string, { day: string; count: number }[]> = {};
  const allDays: string[] = [];
  for (let i = DAYS_WINDOW - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    allDays.push(d.toISOString().slice(0, 10));
  }
  for (const feature of topFeatures) {
    const days = daysByFeature.get(feature) ?? new Map();
    trend[feature] = allDays.map((dayStr) => ({ day: dayStr, count: days.get(dayStr) ?? 0 }));
  }

  const [
    spotifyUsers, msUsers, aiUsers, vutUsers, ntfyUsers, proactiveUsers, ttsUsers,
  ] = adoption;
  const [
    notes, tasks, tasksDone, tasksInProgress, tasksTodo, files, decks, cards,
    courses, assignments, calendarEvents, chats, studySessions, whiteboards,
    habits, studySources, studyChats, podcasts, teacherSessions, ntfyMessages,
  ] = contentTotals;

  return c.json({
    windowDays: DAYS_WINDOW,
    users: {
      total: totalUsers,
      active7d: active7.length,
      active30d: active30.length,
    },
    featureUsage,
    trend,
    adoption: {
      spotify: spotifyUsers,
      microsoft: msUsers,
      ai: aiUsers,
      vut: vutUsers,
      ntfy: ntfyUsers,
      proactiveAlerts: proactiveUsers,
      tts: ttsUsers,
    },
    content: {
      notes,
      tasks,
      tasksDone,
      tasksInProgress,
      tasksTodo,
      files,
      flashcardDecks: decks,
      flashcards: cards,
      courses,
      assignments,
      calendarEvents,
      chatConversations: chats,
      studySessions,
      whiteboards,
      habits,
      studySources,
      studyChats,
      podcasts,
      teacherSessions,
      ntfyMessages,
    },
  });
});

export default analytics;
