import path from "node:path";
import { getDb, runMigrations } from "@/lib/db/client";
import { seedDatabase } from "@/lib/db/seed";

const db = getDb();
runMigrations(db);
const s = seedDatabase(db, path.resolve(process.cwd(), "docs"));
console.log(
  `Seed xong (workspace #${s.workspaceId}): ` +
    `workspace mới=${s.createdWorkspace}, brand profile mới=${s.createdBrandProfile}, ` +
    `thêm ${s.pillarsAdded} chủ đề, thêm ${s.examplesAdded} bài mẫu.`,
);
