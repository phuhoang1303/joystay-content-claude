import { dbFilePath, getDb, runMigrations } from "@/lib/db/client";

runMigrations(getDb());
console.log(`Đã migrate database: ${dbFilePath()}`);
