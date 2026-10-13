export type LocationPoint = {
  lat: number;
  lng: number;
  label: string;
};

export type Cafe = {
  placeId: string;
  name: string;
  rating?: number;
  userRatingsTotal?: number;
  address?: string;
  location?: LocationPoint;
  distanceKm?: number;
  priceLevel?: number;
  openNow?: boolean;
  weekdayDescriptions?: string[];
  phoneNumber?: string;
  websiteUri?: string;
  photoUrl?: string;
  types?: string[];
  /** Optional CafeScout/community amenity data; Google Places does not provide these fields. */
  wifiSpeedMbps?: number;
  powerOutlets?: "none" | "some" | "many";
};

export type AmenityReport = {
  placeId: string;
  cafeName: string;
  wifiSpeedMbps: number | null;
  powerOutlets: "unknown" | "none" | "some" | "many";
  note: string | null;
  updatedAt?: string;
};

export type CafeFilters = {
  minRating: number;
  maxDistanceKm: number;
  priceLevel: number | null;
  openNow: boolean;
  category: "all" | "cafe" | "bakery" | "coffee" | "brunch";
  sortBy: "nearest" | "rating" | "reviews";
  wifi: "any" | "available" | "fast" | "gigabit";
  powerOutlets: "any" | "some" | "many";
};

export type SearchSuggestion = {
  description: string;
  placeId?: string;
  structuredFormatting?: {
    mainText?: string;
    secondaryText?: string;
  };
};

export type Recommendation = Cafe & {
  recommendationScore: number;
  recommendationReasons: string[];
};
