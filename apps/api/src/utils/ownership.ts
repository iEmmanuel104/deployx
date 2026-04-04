import { eq, and, isNull } from "drizzle-orm";
import type { DeployxDb } from "@deployx/db";
import { projects } from "@deployx/db";

export async function getOwnedProject(
  db: DeployxDb,
  userId: string,
  projectId: string,
) {
  const [project] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);

  if (!project) {
    const err = new Error("Project not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return project;
}
