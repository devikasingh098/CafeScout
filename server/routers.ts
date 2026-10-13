import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getUserPreferences,
  getAmenityReport,
  listCafeFavorites,
  removeCafeFavorite,
  saveCafeFavorite,
  saveUserPreferences,
  saveAmenityReport,
} from "./db";

const preferencesInput = z.object({
  minRating: z.number().min(0).max(5),
  maxDistanceKm: z.number().int().min(1).max(100),
  priceLevel: z.number().int().min(0).max(3).nullable(),
  openNow: z.boolean(),
  category: z.enum(["all", "cafe", "coffee", "bakery", "brunch"]),
  sortBy: z.enum(["nearest", "rating", "reviews"]),
  wifi: z.enum(["any", "available", "fast", "gigabit"]),
  powerOutlets: z.enum(["any", "some", "many"]),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  cafescout: router({
    favorites: protectedProcedure.query(({ ctx }) => listCafeFavorites(ctx.user.id)),
    saveFavorite: protectedProcedure
      .input(z.object({ placeId: z.string().min(1).max(255), name: z.string().min(1).max(500), cafeData: z.string().min(2).max(20000) }))
      .mutation(async ({ ctx, input }) => {
        JSON.parse(input.cafeData);
        await saveCafeFavorite(ctx.user.id, input.placeId, input.name, input.cafeData);
        return { success: true } as const;
      }),
    removeFavorite: protectedProcedure
      .input(z.object({ placeId: z.string().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        await removeCafeFavorite(ctx.user.id, input.placeId);
        return { success: true } as const;
      }),
    preferences: protectedProcedure.query(({ ctx }) => getUserPreferences(ctx.user.id)),
    savePreferences: protectedProcedure
      .input(preferencesInput)
      .mutation(async ({ ctx, input }) => {
        await saveUserPreferences(ctx.user.id, input);
        return { success: true } as const;
      }),
    amenityReport: protectedProcedure
      .input(z.object({ placeId: z.string().min(1).max(255) }))
      .query(({ ctx, input }) => getAmenityReport(ctx.user.id, input.placeId)),
    saveAmenityReport: protectedProcedure
      .input(z.object({
        placeId: z.string().min(1).max(255),
        cafeName: z.string().min(1).max(500),
        wifiSpeedMbps: z.number().int().min(0).max(10000).nullable(),
        powerOutlets: z.enum(["unknown", "none", "some", "many"]),
        note: z.string().max(500).nullable(),
      }))
      .mutation(async ({ ctx, input }) => {
        await saveAmenityReport(ctx.user.id, input);
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
