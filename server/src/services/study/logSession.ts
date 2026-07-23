// ===== Study Hub session logging (shared by route + Athena tools) =====

import prisma from "../../db/client";

export async function logSessionSafe(
  userId: string,
  type: string,
  title: string,
  sourceRef: string,
  meta: Record<string, unknown> = {}
): Promise<string> {
  const s = await prisma.studySession.create({
    data: { userId, type, title, sourceRef, meta: JSON.stringify(meta) },
  });
  return s.id;
}
