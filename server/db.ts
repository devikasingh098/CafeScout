import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { amenityReports, cafeFavorites, InsertUser, users, userPreferences } from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.lastSignedIn = user.lastSignedIn ?? new Date();
  updateSet.lastSignedIn = values.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listCafeFavorites(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ cafeData: cafeFavorites.cafeData }).from(cafeFavorites)
    .where(eq(cafeFavorites.userId, userId)).orderBy(desc(cafeFavorites.createdAt));
  return rows.flatMap(row => {
    try {
      return [JSON.parse(row.cafeData) as Record<string, unknown>];
    } catch {
      return [];
    }
  });
}

export async function saveCafeFavorite(userId: number, placeId: string, name: string, cafeData: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.insert(cafeFavorites).values({ userId, placeId, name, cafeData }).onDuplicateKeyUpdate({
    set: { name, cafeData, updatedAt: new Date() },
  });
}

export async function removeCafeFavorite(userId: number, placeId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.delete(cafeFavorites).where(and(eq(cafeFavorites.userId, userId), eq(cafeFavorites.placeId, placeId)));
}

export type PersistedPreferences = {
  minRating: number;
  maxDistanceKm: number;
  priceLevel: number | null;
  openNow: boolean;
  category: string;
  sortBy: string;
  wifi: string;
  powerOutlets: string;
};

export async function getUserPreferences(userId: number): Promise<PersistedPreferences | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  const row = result[0];
  if (!row) return null;
  return {
    minRating: row.minRating10 / 10,
    maxDistanceKm: row.maxDistanceKm,
    priceLevel: row.priceLevel,
    openNow: row.openNow,
    category: row.category,
    sortBy: row.sortBy,
    wifi: row.wifi,
    powerOutlets: row.powerOutlets,
  };
}

export async function saveUserPreferences(userId: number, preferences: PersistedPreferences) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const values = {
    userId,
    minRating10: Math.round(preferences.minRating * 10),
    maxDistanceKm: Math.round(preferences.maxDistanceKm),
    priceLevel: preferences.priceLevel,
    openNow: preferences.openNow,
    category: preferences.category,
    sortBy: preferences.sortBy,
    wifi: preferences.wifi,
    powerOutlets: preferences.powerOutlets,
  };
  await db.insert(userPreferences).values(values).onDuplicateKeyUpdate({
    set: { ...values, updatedAt: new Date() },
  });
}

export type PersistedAmenityReport = {
  placeId: string;
  cafeName: string;
  wifiSpeedMbps: number | null;
  powerOutlets: "unknown" | "none" | "some" | "many";
  note: string | null;
  updatedAt: Date;
};

export async function getAmenityReport(userId: number, placeId: string): Promise<PersistedAmenityReport | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(amenityReports)
    .where(and(eq(amenityReports.userId, userId), eq(amenityReports.placeId, placeId))).limit(1);
  return result[0] ?? null;
}

export async function saveAmenityReport(userId: number, report: Omit<PersistedAmenityReport, "updatedAt">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.insert(amenityReports).values({ ...report, userId }).onDuplicateKeyUpdate({
    set: { cafeName: report.cafeName, wifiSpeedMbps: report.wifiSpeedMbps, powerOutlets: report.powerOutlets, note: report.note, updatedAt: new Date() },
  });
}
