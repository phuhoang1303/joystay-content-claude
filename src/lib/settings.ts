import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./db/client";
import { setting } from "./db/schema";

export const PROVIDER_NAMES = ["claude-cli", "anthropic-api", "manual"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

const SETTING_SCHEMAS = {
  "ai.provider": z.enum(PROVIDER_NAMES),
  "cost.monthlyPaidCapUsd": z.number().min(0).max(10_000),
} as const;

type SettingKey = keyof typeof SETTING_SCHEMAS;
type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

export function getSetting<K extends SettingKey>(db: Db, key: K): SettingValue<K> | undefined {
  const row = db.select().from(setting).where(eq(setting.key, key)).get();
  if (!row) return undefined;
  try {
    const parsed = SETTING_SCHEMAS[key].safeParse(JSON.parse(row.value));
    return parsed.success ? (parsed.data as SettingValue<K>) : undefined;
  } catch {
    return undefined;
  }
}

export function setSetting<K extends SettingKey>(db: Db, key: K, value: SettingValue<K>): void {
  const json = JSON.stringify(SETTING_SCHEMAS[key].parse(value));
  db.insert(setting)
    .values({ key, value: json })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value: json, updatedAt: sql`(cast(unixepoch('subsec') * 1000 as integer))` },
    })
    .run();
}

export const DEFAULT_PROVIDER: ProviderName = "claude-cli";
export const DEFAULT_MONTHLY_CAP_USD = 10;

export function getProviderName(db: Db): ProviderName {
  return getSetting(db, "ai.provider") ?? DEFAULT_PROVIDER;
}

/** Cap from Settings, else MONTHLY_PAID_CAP_USD env, else the default. */
export function getMonthlyCapUsd(db: Db): number {
  const fromDb = getSetting(db, "cost.monthlyPaidCapUsd");
  if (fromDb !== undefined) return fromDb;
  const fromEnv = Number(process.env.MONTHLY_PAID_CAP_USD);
  return Number.isFinite(fromEnv) && fromEnv >= 0 && process.env.MONTHLY_PAID_CAP_USD
    ? fromEnv
    : DEFAULT_MONTHLY_CAP_USD;
}
