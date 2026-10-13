import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  listCafeFavorites: vi.fn(),
  saveCafeFavorite: vi.fn(),
  removeCafeFavorite: vi.fn(),
  getUserPreferences: vi.fn(),
  saveUserPreferences: vi.fn(),
  getAmenityReport: vi.fn(),
  saveAmenityReport: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const user: AuthenticatedUser = {
  id: 42,
  openId: "cafescout-test-user",
  email: "test@example.com",
  name: "Cafe Scout Tester",
  loginMethod: "manus",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const cafe = {
  placeId: "place-123",
  name: "Test Cafe",
  address: "1 Coffee Street",
};

describe("cafescout persistence procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.listCafeFavorites.mockResolvedValue([cafe]);
    dbMocks.getUserPreferences.mockResolvedValue({ minRating: 4.5, maxDistanceKm: 3, priceLevel: 2, openNow: true, category: "cafe", sortBy: "rating", wifi: "fast", powerOutlets: "many" });
    dbMocks.saveCafeFavorite.mockResolvedValue(undefined);
    dbMocks.removeCafeFavorite.mockResolvedValue(undefined);
    dbMocks.saveUserPreferences.mockResolvedValue(undefined);
    dbMocks.getAmenityReport.mockResolvedValue({ placeId: cafe.placeId, cafeName: cafe.name, wifiSpeedMbps: 50, powerOutlets: "some", note: "Window seats have outlets", updatedAt: new Date() });
    dbMocks.saveAmenityReport.mockResolvedValue(undefined);
  });

  it("returns only the authenticated user's favorites", async () => {
    const caller = appRouter.createCaller(createContext(user));
    await expect(caller.cafescout.favorites()).resolves.toEqual([cafe]);
    expect(dbMocks.listCafeFavorites).toHaveBeenCalledWith(42);
  });

  it("saves and removes a favorite for the authenticated user", async () => {
    const caller = appRouter.createCaller(createContext(user));
    await expect(caller.cafescout.saveFavorite({ placeId: cafe.placeId, name: cafe.name, cafeData: JSON.stringify(cafe) })).resolves.toEqual({ success: true });
    expect(dbMocks.saveCafeFavorite).toHaveBeenCalledWith(42, cafe.placeId, cafe.name, JSON.stringify(cafe));

    await expect(caller.cafescout.removeFavorite({ placeId: cafe.placeId })).resolves.toEqual({ success: true });
    expect(dbMocks.removeCafeFavorite).toHaveBeenCalledWith(42, cafe.placeId);
  });

  it("persists filter preferences for the authenticated user", async () => {
    const caller = appRouter.createCaller(createContext(user));
    const preferences = { minRating: 4.5, maxDistanceKm: 3, priceLevel: 2, openNow: true, category: "cafe" as const, sortBy: "rating" as const, wifi: "fast" as const, powerOutlets: "many" as const };
    await expect(caller.cafescout.preferences()).resolves.toEqual(preferences);
    await expect(caller.cafescout.savePreferences(preferences)).resolves.toEqual({ success: true });
    expect(dbMocks.saveUserPreferences).toHaveBeenCalledWith(42, preferences);
  });

  it("rejects unauthenticated persistence access", async () => {
    const caller = appRouter.createCaller(createContext(null));
    await expect(caller.cafescout.favorites()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(dbMocks.listCafeFavorites).not.toHaveBeenCalled();
  });

  it("loads and updates only the authenticated user's amenity report", async () => {
    const caller = appRouter.createCaller(createContext(user));
    await expect(caller.cafescout.amenityReport({ placeId: cafe.placeId })).resolves.toMatchObject({ wifiSpeedMbps: 50, powerOutlets: "some" });
    expect(dbMocks.getAmenityReport).toHaveBeenCalledWith(42, cafe.placeId);

    const report = { placeId: cafe.placeId, cafeName: cafe.name, wifiSpeedMbps: 100, powerOutlets: "many" as const, note: "Outlets along the back wall" };
    await expect(caller.cafescout.saveAmenityReport(report)).resolves.toEqual({ success: true });
    expect(dbMocks.saveAmenityReport).toHaveBeenCalledWith(42, report);
  });

  it("rejects invalid amenity report values", async () => {
    const caller = appRouter.createCaller(createContext(user));
    await expect(caller.cafescout.saveAmenityReport({ placeId: cafe.placeId, cafeName: cafe.name, wifiSpeedMbps: -1, powerOutlets: "many", note: null })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
