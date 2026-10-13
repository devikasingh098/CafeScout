import { boolean, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const cafeFavorites = mysqlTable("cafe_favorites", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  placeId: varchar("placeId", { length: 255 }).notNull(),
  name: varchar("name", { length: 500 }).notNull(),
  cafeData: text("cafeData").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userPlaceUnique: uniqueIndex("cafe_favorites_user_place_idx").on(table.userId, table.placeId),
}));

export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  minRating10: int("minRating10").default(0).notNull(),
  maxDistanceKm: int("maxDistanceKm").default(10).notNull(),
  priceLevel: int("priceLevel"),
  openNow: boolean("openNow").default(false).notNull(),
  category: varchar("category", { length: 32 }).default("all").notNull(),
  sortBy: varchar("sortBy", { length: 32 }).default("nearest").notNull(),
  wifi: varchar("wifi", { length: 16 }).default("any").notNull(),
  powerOutlets: varchar("powerOutlets", { length: 16 }).default("any").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const amenityReports = mysqlTable("amenity_reports", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  placeId: varchar("placeId", { length: 255 }).notNull(),
  cafeName: varchar("cafeName", { length: 500 }).notNull(),
  wifiSpeedMbps: int("wifiSpeedMbps"),
  powerOutlets: mysqlEnum("powerOutlets", ["unknown", "none", "some", "many"]).default("unknown").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  userPlaceUnique: uniqueIndex("amenity_reports_user_place_idx").on(table.userId, table.placeId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CafeFavorite = typeof cafeFavorites.$inferSelect;
export type InsertCafeFavorite = typeof cafeFavorites.$inferInsert;
export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;
export type AmenityReport = typeof amenityReports.$inferSelect;
export type InsertAmenityReport = typeof amenityReports.$inferInsert;
