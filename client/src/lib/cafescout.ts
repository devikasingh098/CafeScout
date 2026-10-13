import type { Cafe, CafeFilters, LocationPoint, Recommendation, SearchSuggestion } from "@/types/cafe";

const FAVORITES_KEY = "cafescout:favorites";
const LOCATION_KEY = "cafescout:last-location";

export function readFavorites(): Cafe[] {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]") as Cafe[];
  } catch {
    return [];
  }
}

export function writeFavorites(favorites: Cafe[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

export function readLastLocation(): LocationPoint | null {
  try {
    return JSON.parse(localStorage.getItem(LOCATION_KEY) || "null") as LocationPoint | null;
  } catch {
    return null;
  }
}

export function writeLastLocation(location: LocationPoint) {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(location));
}

export function formatPrice(priceLevel?: number) {
  if (priceLevel === undefined || priceLevel === null) return "Not available";
  return "$".repeat(Math.max(1, Math.min(4, priceLevel + 1)));
}

export function formatDistance(distanceKm?: number) {
  if (distanceKm === undefined) return "Not available";
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(1)} km`;
}

export function getCafeType(cafe: Cafe) {
  const types = cafe.types || [];
  if (types.some(type => type.includes("bakery"))) return "Bakery";
  if (types.some(type => type.includes("brunch") || type.includes("meal"))) return "Brunch";
  if (types.some(type => type.includes("coffee"))) return "Coffee bar";
  return "Cafe";
}

export function haversineDistance(a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral) {
  const earthRadiusKm = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function applyFilters(cafes: Cafe[], filters: CafeFilters): Cafe[] {
  const filtered = cafes.filter(cafe => {
    const categoryMatch = filters.category === "all" ||
      (filters.category === "bakery" && cafe.types?.some(type => type.includes("bakery"))) ||
      (filters.category === "brunch" && cafe.types?.some(type => type.includes("brunch") || type.includes("meal"))) ||
      (filters.category === "coffee" && cafe.types?.some(type => type.includes("coffee"))) ||
      (filters.category === "cafe" && cafe.types?.some(type => type.includes("cafe")));
    const ratingMatch = (cafe.rating ?? 0) >= filters.minRating;
    const distanceMatch = cafe.distanceKm === undefined || cafe.distanceKm <= filters.maxDistanceKm;
    const priceMatch = filters.priceLevel === null || cafe.priceLevel === undefined || cafe.priceLevel <= filters.priceLevel;
    const openMatch = !filters.openNow || cafe.openNow === true;
    const wifiMatch = filters.wifi === "any" || (cafe.wifiSpeedMbps !== undefined && (filters.wifi === "available" || (filters.wifi === "fast" && cafe.wifiSpeedMbps >= 25) || (filters.wifi === "gigabit" && cafe.wifiSpeedMbps >= 100)));
    const outletMatch = filters.powerOutlets === "any" || (cafe.powerOutlets !== undefined && cafe.powerOutlets !== "none" && (filters.powerOutlets === "some" || cafe.powerOutlets === "many"));
    return categoryMatch && ratingMatch && distanceMatch && priceMatch && openMatch && wifiMatch && outletMatch;
  });

  return [...filtered].sort((a, b) => {
    if (filters.sortBy === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
    if (filters.sortBy === "reviews") return (b.userRatingsTotal ?? 0) - (a.userRatingsTotal ?? 0);
    return (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY);
  });
}

export function buildRecommendations(cafes: Cafe[], favorites: Cafe[], filters: CafeFilters): Recommendation[] {
  const favoriteIds = new Set(favorites.map(cafe => cafe.placeId));
  return cafes
    .map(cafe => {
      let score = 0;
      const reasons: string[] = [];
      if (cafe.rating) {
        score += (cafe.rating / 5) * 45;
        if (cafe.rating >= 4.5) reasons.push("highly rated");
      }
      if (cafe.distanceKm !== undefined) {
        score += Math.max(0, 25 - cafe.distanceKm * 4);
        if (cafe.distanceKm <= 1) reasons.push("close to you");
      }
      if (filters.priceLevel === null || cafe.priceLevel === undefined || cafe.priceLevel <= filters.priceLevel) {
        score += 10;
        if (cafe.priceLevel !== undefined) reasons.push("fits your price range");
      }
      if (cafe.openNow) {
        score += 12;
        reasons.push("open now");
      }
      if (filters.wifi !== "any" && cafe.wifiSpeedMbps !== undefined) {
        score += filters.wifi === "gigabit" && cafe.wifiSpeedMbps >= 100 ? 10 : filters.wifi === "fast" && cafe.wifiSpeedMbps >= 25 ? 7 : 3;
        reasons.push("Wi-Fi fits your needs");
      }
      if (filters.powerOutlets !== "any" && cafe.powerOutlets) {
        score += filters.powerOutlets === "many" && cafe.powerOutlets === "many" ? 8 : 4;
        reasons.push("power outlets available");
      }
      if (favoriteIds.has(cafe.placeId)) {
        score += 8;
        reasons.push("saved by you");
      }
      return { ...cafe, recommendationScore: score, recommendationReasons: reasons.slice(0, 2) };
    })
    .filter(cafe => cafe.recommendationReasons.length > 0)
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .slice(0, 3);
}

function getPhotoUrl(photo?: google.maps.places.PlacePhoto) {
  try {
    return photo?.getUrl({ maxWidth: 900, maxHeight: 640 });
  } catch {
    return undefined;
  }
}

export function placeResultToCafe(result: google.maps.places.PlaceResult, origin?: google.maps.LatLngLiteral): Cafe | null {
  if (!result.place_id || !result.name) return null;
  const position = result.geometry?.location;
  const location = position ? { lat: position.lat(), lng: position.lng(), label: result.formatted_address || result.name } : undefined;
  return {
    placeId: result.place_id,
    name: result.name,
    rating: result.rating,
    userRatingsTotal: result.user_ratings_total,
    address: result.formatted_address || result.vicinity,
    location,
    distanceKm: origin && location ? haversineDistance(origin, location) : undefined,
    priceLevel: result.price_level,
    openNow: result.opening_hours?.isOpen?.(),
    weekdayDescriptions: result.opening_hours?.weekday_text,
    phoneNumber: result.formatted_phone_number,
    websiteUri: result.website,
    photoUrl: getPhotoUrl(result.photos?.[0]),
    types: result.types,
  };
}

export function searchCafes(map: google.maps.Map, center: google.maps.LatLngLiteral): Promise<Cafe[]> {
  return new Promise((resolve, reject) => {
    const service = new google.maps.places.PlacesService(map);
    service.nearbySearch({ location: center, radius: 3500, type: "cafe" }, (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
        reject(new Error(status || "Places search failed"));
        return;
      }
      resolve(results.map(result => placeResultToCafe(result, center)).filter(Boolean) as Cafe[]);
    });
  });
}

export function getPlaceDetails(map: google.maps.Map, placeId: string): Promise<Cafe | null> {
  return new Promise(resolve => {
    const service = new google.maps.places.PlacesService(map);
    service.getDetails({ placeId, fields: ["place_id", "name", "rating", "user_ratings_total", "formatted_address", "geometry", "price_level", "opening_hours", "formatted_phone_number", "website", "photos", "types"] }, (result, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !result) {
        resolve(null);
        return;
      }
      resolve(placeResultToCafe(result));
    });
  });
}

export function autocompleteLocations(input: string, map: google.maps.Map): Promise<SearchSuggestion[]> {
  return new Promise(resolve => {
    const service = new google.maps.places.AutocompleteService();
    service.getPlacePredictions({ input, types: ["geocode", "establishment"] }, (predictions, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions) {
        resolve([]);
        return;
      }
      void map;
      resolve(predictions.slice(0, 5).map(prediction => ({
        description: prediction.description,
        placeId: prediction.place_id,
        structuredFormatting: {
          mainText: prediction.structured_formatting?.main_text,
          secondaryText: prediction.structured_formatting?.secondary_text,
        },
      })));
    });
  });
}

export function geocodeLocation(map: google.maps.Map, placeId: string): Promise<LocationPoint | null> {
  return new Promise(resolve => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ placeId }, (results, status) => {
      const geometry = results?.[0]?.geometry?.location;
      if (status !== "OK" || !geometry) {
        resolve(null);
        return;
      }
      const location = { lat: geometry.lat(), lng: geometry.lng(), label: results?.[0]?.formatted_address || "Selected location" };
      map.panTo(location);
      map.setZoom(14);
      resolve(location);
    });
  });
}
