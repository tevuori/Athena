// ===== Error log service =====
// Persists client + server errors to the ErrorLog table so admins can monitor
// outages from the Settings UI before users report them.

import prisma from "../db/client";

export interface ErrorLogEntry {
  level?: "error" | "warn" | "fatal";
  source: "client" | "server";
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  userId?: string;
}

/** Persist a single error entry. Never throws — logging must not break the request. */
export async function logError(entry: ErrorLogEntry): Promise<void> {
  try {
    await prisma.errorLog.create({
      data: {
        level: entry.level ?? "error",
        source: entry.source,
        message: entry.message.slice(0, 2000),
        stack: entry.stack?.slice(0, 10000) ?? null,
        url: entry.url?.slice(0, 2000) ?? null,
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
        userId: entry.userId ?? null,
      },
    });
  } catch {
    // If the DB write fails, fall back to console — never throw from the logger.
    console.error("[error-log] Failed to persist error:", entry.message);
  }
}

/** Persist a batch of client errors (from the /api/client-errors endpoint). */
export async function logClientErrors(
  errors: Array<{
    message: string;
    stack?: string;
    source?: string;
    lineno?: number;
    colno?: number;
    url: string;
    userAgent: string;
    userId?: string;
    componentStack?: string;
    timestamp: string;
  }>,
  authUserId?: string,
): Promise<void> {
  for (const err of errors) {
    const userId = err.userId ?? authUserId ?? null;
    const stackParts = [
      err.stack,
      err.componentStack,
      err.source ? `${err.source}:${err.lineno ?? ""}:${err.colno ?? ""}` : undefined,
    ].filter(Boolean);
    await logError({
      source: "client",
      message: err.message,
      stack: stackParts.join("\n"),
      url: err.url,
      userAgent: err.userAgent,
      userId: userId ?? undefined,
    });
  }
}

// ----- Admin query helpers -----

export interface ErrorLogQuery {
  source?: "client" | "server";
  resolved?: boolean;
  limit?: number;
  offset?: number;
}

export async function listErrors(query: ErrorLogQuery) {
  const where: Record<string, unknown> = {};
  if (query.source) where.source = query.source;
  if (query.resolved !== undefined) where.resolved = query.resolved;

  const limit = Math.min(query.limit ?? 100, 500);
  const offset = query.offset ?? 0;

  const [items, total] = await Promise.all([
    prisma.errorLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: { username: true, displayName: true },
        },
      },
    }),
    prisma.errorLog.count({ where }),
  ]);

  return { items, total };
}

export async function resolveError(id: string): Promise<void> {
  await prisma.errorLog.update({
    where: { id },
    data: { resolved: true },
  });
}

export async function resolveAllErrors(): Promise<number> {
  const result = await prisma.errorLog.updateMany({
    where: { resolved: false },
    data: { resolved: true },
  });
  return result.count;
}

export async function deleteError(id: string): Promise<void> {
  await prisma.errorLog.delete({ where: { id } });
}

export async function deleteResolvedErrors(): Promise<number> {
  const result = await prisma.errorLog.deleteMany({
    where: { resolved: true },
  });
  return result.count;
}

export async function getErrorStats(): Promise<{
  total: number;
  unresolved: number;
  client: number;
  server: number;
  last24h: number;
}> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [total, unresolved, client, server, last24h] = await Promise.all([
    prisma.errorLog.count(),
    prisma.errorLog.count({ where: { resolved: false } }),
    prisma.errorLog.count({ where: { source: "client" } }),
    prisma.errorLog.count({ where: { source: "server" } }),
    prisma.errorLog.count({ where: { timestamp: { gte: dayAgo } } }),
  ]);
  return { total, unresolved, client, server, last24h };
}
