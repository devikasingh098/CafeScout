import { relations } from "drizzle-orm";
import { amenityReports, cafeFavorites, users, userPreferences } from "./schema";

export const usersRelations = relations(users, ({ many, one }) => ({
  favorites: many(cafeFavorites),
  amenityReports: many(amenityReports),
  preferences: one(userPreferences),
}));

export const cafeFavoritesRelations = relations(cafeFavorites, ({ one }) => ({
  user: one(users, { fields: [cafeFavorites.userId], references: [users.id] }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, { fields: [userPreferences.userId], references: [users.id] }),
}));

export const amenityReportsRelations = relations(amenityReports, ({ one }) => ({
  user: one(users, { fields: [amenityReports.userId], references: [users.id] }),
}));
