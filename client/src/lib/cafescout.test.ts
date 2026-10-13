import { describe, expect, it } from "vitest";
import { applyFilters } from "./cafescout";
import type { Cafe, CafeFilters } from "@/types/cafe";

const baseFilters: CafeFilters = {
  minRating: 0,
  maxDistanceKm: 10,
  priceLevel: null,
  openNow: false,
  category: "all",
  sortBy: "nearest",
  wifi: "any",
  powerOutlets: "any",
};

const cafes: Cafe[] = [
  { placeId: "fast-many", name: "Fast & Plugged", wifiSpeedMbps: 100, powerOutlets: "many", distanceKm: 1 },
  { placeId: "basic-some", name: "Basic & Shared", wifiSpeedMbps: 10, powerOutlets: "some", distanceKm: 2 },
  { placeId: "unknown", name: "Unknown Amenities", distanceKm: 3 },
];

describe("amenity filters", () => {
  it("filters cafes by minimum Wi-Fi speed", () => {
    const result = applyFilters(cafes, { ...baseFilters, wifi: "fast" });
    expect(result.map(cafe => cafe.placeId)).toEqual(["fast-many"]);
  });

  it("filters cafes by required power outlets", () => {
    const result = applyFilters(cafes, { ...baseFilters, powerOutlets: "some" });
    expect(result.map(cafe => cafe.placeId)).toEqual(["fast-many", "basic-some"]);
  });

  it("does not treat unknown amenity data as a match", () => {
    const result = applyFilters(cafes, { ...baseFilters, wifi: "available", powerOutlets: "many" });
    expect(result.map(cafe => cafe.placeId)).toEqual(["fast-many"]);
  });
});
