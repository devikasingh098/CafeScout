import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { MapView } from "@/components/Map";
import { useTheme } from "@/contexts/ThemeContext";
import {
  applyFilters,
  autocompleteLocations,
  buildRecommendations,
  formatDistance,
  formatPrice,
  geocodeLocation,
  getCafeType,
  getPlaceDetails,
  readFavorites,
  searchCafes,
  writeFavorites,
} from "@/lib/cafescout";
import { trpc } from "@/lib/trpc";
import type { AmenityReport, Cafe, CafeFilters, LocationPoint, Recommendation, SearchSuggestion } from "@/types/cafe";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Coffee,
  Compass,
  ExternalLink,
  Filter,
  Heart,
  Info,
  LogIn,
  LogOut,
  LocateFixed,
  MapPin,
  Menu,
  Moon,
  Navigation,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const DEFAULT_CENTER = { lat: 37.7749, lng: -122.4194 };
type View = "home" | "explore" | "favorites" | "about";

function display(value: string | number | undefined, fallback = "Not available"): string {
  return value === undefined || value === "" ? fallback : String(value);
}

function amenityLabel(cafe: Cafe) {
  const labels: string[] = [];
  if (cafe.wifiSpeedMbps !== undefined) labels.push(`Wi-Fi ${cafe.wifiSpeedMbps} Mbps`);
  if (cafe.powerOutlets === "many") labels.push("Many outlets");
  else if (cafe.powerOutlets === "some") labels.push("Outlets available");
  return labels;
}

function directionsFor(cafe: Cafe) {
  const destination = cafe.location ? `${cafe.location.lat},${cafe.location.lng}` : encodeURIComponent(cafe.name);
  const place = cafe.placeId ? `&destination_place_id=${encodeURIComponent(cafe.placeId)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}${place}`;
}

export default function Home() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();

  const { theme, toggleTheme } = useTheme();
  const [view, setView] = useState<View>("home");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [location, setLocation] = useState<LocationPoint>({ ...DEFAULT_CENTER, label: "Choose a location to begin" });
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const localFavoritesRef = useRef<Cafe[]>(readFavorites());
  const [favorites, setFavorites] = useState<Cafe[]>(() => localFavoritesRef.current);
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);
  const [selectedCafe, setSelectedCafe] = useState<Cafe | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapRetry, setMapRetry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [locationStatus, setLocationStatus] = useState<string | null>(null);
  const [filters, setFilters] = useState<CafeFilters>({ minRating: 0, maxDistanceKm: 10, priceLevel: null, openNow: false, category: "all", sortBy: "nearest", wifi: "any", powerOutlets: "any" });
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const preferenceHydratedRef = useRef(false);
  const localFavoritesMigratedRef = useRef(false);

  const favoritesQuery = trpc.cafescout.favorites.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const preferencesQuery = trpc.cafescout.preferences.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const saveFavoriteMutation = trpc.cafescout.saveFavorite.useMutation({ onError: () => toast.error("Couldn't sync that favorite", { description: "It is still saved locally in this browser." }) });
  const removeFavoriteMutation = trpc.cafescout.removeFavorite.useMutation({ onError: () => toast.error("Couldn't sync that change", { description: "Try again when you're back online." }) });
  const savePreferencesMutation = trpc.cafescout.savePreferences.useMutation({ onError: () => toast.error("Preferences could not sync", { description: "Your current filters are still active locally." }) });

  const visibleCafes = useMemo(() => applyFilters(cafes, filters), [cafes, filters]);
  const recommendations = useMemo(() => buildRecommendations(cafes, favorites, filters), [cafes, favorites, filters]);

  useEffect(() => {
    if (!isAuthenticated || favoritesQuery.data === undefined || localFavoritesMigratedRef.current) return;
    localFavoritesMigratedRef.current = true;
    const remoteFavorites = favoritesQuery.data as Cafe[];
    if (remoteFavorites.length > 0 || localFavoritesRef.current.length === 0) {
      setFavorites(remoteFavorites);
      writeFavorites(remoteFavorites);
      return;
    }
    localFavoritesRef.current.forEach(cafe => {
      saveFavoriteMutation.mutate({ placeId: cafe.placeId, name: cafe.name, cafeData: JSON.stringify(cafe) });
    });
  }, [favoritesQuery.data, isAuthenticated, saveFavoriteMutation]);

  useEffect(() => {
    if (!isAuthenticated || preferencesQuery.data === undefined) return;
    preferenceHydratedRef.current = true;
    if (preferencesQuery.data) {
      const persisted = preferencesQuery.data as Partial<CafeFilters>;
      setFilters(current => ({ ...current, ...persisted }));
    }
  }, [isAuthenticated, preferencesQuery.data]);

  useEffect(() => {
    if (!isAuthenticated || !preferenceHydratedRef.current) return;
    const timeout = window.setTimeout(() => savePreferencesMutation.mutate(filters), 450);
    return () => window.clearTimeout(timeout);
  }, [filters, isAuthenticated, savePreferencesMutation]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !query.trim()) {
      setSuggestions([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      autocompleteLocations(query.trim(), mapRef.current!).then(setSuggestions).catch(() => setSuggestions([]));
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [query, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    markersRef.current.forEach(marker => marker.setMap(null));
    markersRef.current = [];

    cafes.forEach(cafe => {
      if (!cafe.location) return;
      const marker = new google.maps.Marker({
        map,
        position: cafe.location,
        title: cafe.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: selectedCafeId === cafe.placeId ? 10 : 7,
          fillColor: selectedCafeId === cafe.placeId ? "#2d6d63" : "#b85230",
          fillOpacity: 1,
          strokeColor: "#fff8ef",
          strokeWeight: selectedCafeId === cafe.placeId ? 3 : 2,
        },
        zIndex: selectedCafeId === cafe.placeId ? 10 : 1,
      });
      marker.addListener("click", () => {
        setSelectedCafeId(cafe.placeId);
        void openCafe(cafe);
      });
      markersRef.current.push(marker);
    });

    const centerMarker = new google.maps.Marker({
      map,
      position: { lat: location.lat, lng: location.lng },
      title: location.label,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: "#2d6d63",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 4,
      },
      zIndex: 5,
    });
    markersRef.current.push(centerMarker);
  }, [cafes, location, selectedCafeId]);

  function goTo(nextView: View) {
    setView(nextView);
    setMobileNavOpen(false);
    window.setTimeout(() => window.scrollTo({ top: nextView === "home" ? 0 : 120, behavior: "smooth" }), 20);
  }

  async function loadCafes(nextLocation: LocationPoint) {
    setLocation(nextLocation);
    setError(null);
    setLocationStatus(null);
    setSuggestions([]);
    setLoading(true);
    setCafes([]);
    if (mapRef.current) {
      mapRef.current.panTo({ lat: nextLocation.lat, lng: nextLocation.lng });
      mapRef.current.setZoom(14);
    }
    try {
      if (!mapRef.current) throw new Error("Map is still loading");
      const results = await searchCafes(mapRef.current, nextLocation);
      setCafes(results);
      if (!results.length) setLocationStatus("No cafes were returned for this area. Try a nearby neighborhood.");
    } catch {
      setError("We couldn't reach live place data right now. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function findNearMe() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not available in this browser. Search for a city or neighborhood instead.");
      return;
    }
    setLocationStatus("Requesting your location…");
    navigator.geolocation.getCurrentPosition(
      position => {
        const nextLocation = { lat: position.coords.latitude, lng: position.coords.longitude, label: "Near your current location" };
        void loadCafes(nextLocation);
      },
      reason => {
        const message = reason.code === 1 ? "Location permission was denied. You can still search any city or area." : reason.code === 3 ? "Location took too long to respond. Try searching instead." : "We couldn't determine your location. Try searching for an area.";
        setLocationStatus(message);
      },
      { enableHighAccuracy: false, timeout: 9000, maximumAge: 300000 },
    );
  }

  async function selectSuggestion(suggestion: SearchSuggestion) {
    if (!mapRef.current || !suggestion.placeId) return;
    setQuery(suggestion.structuredFormatting?.mainText || suggestion.description);
    const nextLocation = await geocodeLocation(mapRef.current, suggestion.placeId);
    if (nextLocation) await loadCafes(nextLocation);
  }

  async function submitSearch() {
    if (!mapRef.current || !query.trim()) return;
    setSuggestions([]);
    const first = suggestions[0];
    if (first) {
      await selectSuggestion(first);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const geocoder = new google.maps.Geocoder();
      const result = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
        geocoder.geocode({ address: query.trim() }, (results, status) => status === "OK" && results?.length ? resolve(results) : reject(new Error(status)));
      });
      const point = result[0].geometry.location;
      await loadCafes({ lat: point.lat(), lng: point.lng(), label: result[0].formatted_address || query.trim() });
    } catch {
      setLoading(false);
      setError("We couldn't find that place. Try a city, neighborhood, landmark, or address.");
    }
  }

  async function openCafe(cafe: Cafe) {
    setSelectedCafe(cafe);
    setSelectedCafeId(cafe.placeId);
    setDetailsLoading(true);
    if (mapRef.current) {
      const details = await getPlaceDetails(mapRef.current, cafe.placeId);
      if (details) {
        const enriched = { ...cafe, ...details, distanceKm: cafe.distanceKm };
        setSelectedCafe(enriched);
        setFavorites(current => current.map(item => item.placeId === enriched.placeId ? enriched : item));
      }
    }
    setDetailsLoading(false);
  }

  function toggleFavorite(cafe: Cafe) {
    setFavorites(current => {
      const alreadySaved = current.some(item => item.placeId === cafe.placeId);
      const next = alreadySaved ? current.filter(item => item.placeId !== cafe.placeId) : [...current, cafe];
      writeFavorites(next);
      if (isAuthenticated) {
        if (alreadySaved) {
          removeFavoriteMutation.mutate({ placeId: cafe.placeId });
        } else {
          saveFavoriteMutation.mutate({ placeId: cafe.placeId, name: cafe.name, cafeData: JSON.stringify(cafe) });
        }
      }
      toast.success(alreadySaved ? "Removed from favorites" : "Saved to favorites", { description: cafe.name });
      return next;
    });
  }

  function openDirections(cafe: Cafe) {
    window.open(directionsFor(cafe), "_blank", "noopener,noreferrer");
  }

  function handleReportSaved(report: AmenityReport) {
    const amenityUpdate = { wifiSpeedMbps: report.wifiSpeedMbps ?? undefined, powerOutlets: report.powerOutlets === "unknown" ? undefined : report.powerOutlets };
    setSelectedCafe(current => current ? { ...current, ...amenityUpdate } : current);
    setCafes(current => current.map(cafe => cafe.placeId === report.placeId ? { ...cafe, ...amenityUpdate } : cafe));
    setFavorites(current => current.map(cafe => cafe.placeId === report.placeId ? { ...cafe, ...amenityUpdate } : cafe));
  }

  function resetFilters() {
    setFilters({ minRating: 0, maxDistanceKm: 10, priceLevel: null, openNow: false, category: "all", sortBy: "nearest", wifi: "any", powerOutlets: "any" });
  }

  const activeFilters = Number(filters.minRating > 0) + Number(filters.maxDistanceKm < 10) + Number(filters.priceLevel !== null) + Number(filters.openNow) + Number(filters.category !== "all") + Number(filters.wifi !== "any") + Number(filters.powerOutlets !== "any");

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 glass">
        <div className="container flex h-[72px] items-center justify-between gap-4">
          <button className="flex items-center gap-3 text-left" onClick={() => goTo("home")} aria-label="Go to CafeScout home">
            <span className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20"><Coffee size={20} strokeWidth={2.4} /></span>
            <span><span className="display-font block text-[1.28rem] font-semibold leading-none tracking-tight">CafeScout</span><span className="mt-1 block text-[10px] font-semibold uppercase tracking-[.18em] text-muted-foreground">Find your daily ritual</span></span>
          </button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            <NavButton active={view === "home"} onClick={() => goTo("home")}>Home</NavButton>
            <NavButton active={view === "explore"} onClick={() => goTo("explore")}>Explore</NavButton>
            <NavButton active={view === "favorites"} onClick={() => goTo("favorites")} count={favorites.length}>Favorites</NavButton>
            <NavButton active={view === "about"} onClick={() => goTo("about")}>About</NavButton>
          </nav>
          <div className="flex items-center gap-2">
            {isAuthenticated ? <>
              <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground sm:flex"><UserRound size={14} className="text-primary" />{user?.name || "Signed in"}</span>
              <button onClick={() => void logout()} className="hidden size-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:-translate-y-0.5 hover:text-foreground sm:grid" aria-label="Sign out"><LogOut size={16} /></button>
              <button onClick={() => void logout()} className="grid size-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:hidden" aria-label="Sign out"><LogOut size={16} /></button>
            </> : <>
              <button onClick={() => startLogin()} className="grid size-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:text-foreground sm:hidden" aria-label="Sign in to sync"><LogIn size={16} className="text-primary" /></button>
              <button onClick={() => startLogin()} className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold transition hover:-translate-y-0.5 hover:bg-secondary sm:flex"><LogIn size={14} className="text-primary" />{authLoading ? "Checking…" : "Sign in to sync"}</button>
            </>}
            <button onClick={() => toggleTheme?.()} className="grid size-10 place-items-center rounded-full border border-border bg-card text-muted-foreground transition hover:-translate-y-0.5 hover:text-foreground" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <button onClick={() => setMobileNavOpen(open => !open)} className="grid size-10 place-items-center rounded-full border border-border bg-card md:hidden" aria-label="Toggle navigation menu" aria-expanded={mobileNavOpen}>{mobileNavOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </div>
        </div>
        {mobileNavOpen && <div className="container border-t border-border/70 py-3 md:hidden"><div className="grid gap-1"><NavButton active={view === "home"} onClick={() => goTo("home")}>Home</NavButton><NavButton active={view === "explore"} onClick={() => goTo("explore")}>Explore</NavButton><NavButton active={view === "favorites"} onClick={() => goTo("favorites")} count={favorites.length}>Favorites</NavButton><NavButton active={view === "about"} onClick={() => goTo("about")}>About</NavButton></div></div>}
      </header>

      <main>
        {view === "about" ? <AboutView onExplore={() => goTo("explore")} /> : view === "favorites" ? <FavoritesView favorites={favorites} onSelect={openCafe} onFavorite={toggleFavorite} onDirections={openDirections} onExplore={() => goTo("explore")} /> : <>
          {view === "home" && <Hero onFind={findNearMe} onExplore={() => goTo("explore")} />}
          <section id="discovery" className={`${view === "home" ? "pt-3" : "pt-12"} pb-20`}>
            <div className="container">
              <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <p className="eyebrow text-primary">{view === "explore" ? "Live discovery" : "Start exploring"}</p>
                  <h2 className="display-font mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">{cafes.length ? `Cafes near ${location.label}` : "Find a table worth lingering at"}</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Search a place or use your location to see real-time cafes, opening status, and details from Google Maps.</p>
                </div>
                {cafes.length > 0 && <div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="size-2 rounded-full bg-emerald-500" />Live place data <span className="mx-1 text-border">•</span> Updated just now</div>}
              </div>
              <SearchPanel query={query} setQuery={setQuery} suggestions={suggestions} onSelect={selectSuggestion} onSubmit={submitSearch} onFind={findNearMe} />
              {locationStatus && <div className="mb-5 flex items-start gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground"><Info size={16} className="mt-0.5 shrink-0 text-primary" /><span>{locationStatus}</span></div>}
              {cafes.length > 0 && <RecommendationStrip recommendations={recommendations} onSelect={openCafe} />}
              <FilterBar filters={filters} setFilters={setFilters} activeFilters={activeFilters} resetFilters={resetFilters} />
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,.92fr)]">
                <div className="relative min-h-[430px] overflow-hidden rounded-[1.75rem] border border-border bg-[#e6ded4] shadow-inner dark:bg-[#2c312e] lg:sticky lg:top-24 lg:h-[calc(100vh-132px)] lg:min-h-[620px]">
                  <MapView key={mapRetry} className="h-full min-h-[430px]" initialCenter={DEFAULT_CENTER} initialZoom={12} onMapReady={map => { mapRef.current = map; setMapReady(true); setMapError(null); }} onError={mapErrorValue => { setMapReady(false); setMapError(mapErrorValue.message); }} />
                  <div className="pointer-events-none absolute inset-x-4 top-4 flex items-start justify-between gap-3"><div className="rounded-full border border-white/50 bg-[#fffdf9]/90 px-3 py-2 text-xs font-semibold text-[#2c211c] shadow-lg backdrop-blur dark:border-white/10 dark:bg-[#241e1b]/90 dark:text-[#f7f0e8]"><MapPin size={13} className="mr-1.5 inline text-primary" />{location.label}</div><div className="rounded-full border border-white/50 bg-[#fffdf9]/90 px-3 py-2 text-xs font-semibold text-[#2c211c] shadow-lg backdrop-blur dark:border-white/10 dark:bg-[#241e1b]/90 dark:text-[#f7f0e8]"><span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500" />Google Maps</div></div>
                  {!mapReady && !mapError && <div className="absolute inset-0 grid place-items-center bg-[#e6ded4]/70 backdrop-blur-sm dark:bg-[#2c312e]/80"><div className="rounded-2xl bg-card px-5 py-4 text-center shadow-xl"><div className="mx-auto mb-2 size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" /><p className="text-sm font-semibold">Preparing your map</p><p className="mt-1 text-xs text-muted-foreground">Securely loading map data…</p></div></div>}
                  {mapError && <div className="absolute inset-0 grid place-items-center bg-[#e6ded4]/80 p-4 backdrop-blur-sm dark:bg-[#2c312e]/85"><div className="max-w-xs rounded-2xl bg-card p-5 text-center shadow-xl"><span className="mx-auto grid size-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><CircleAlert size={19} /></span><p className="mt-3 text-sm font-bold">Map unavailable</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Live place search still needs the map connection. Check your network and try again.</p><button onClick={() => { setMapError(null); setMapRetry(value => value + 1); }} className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground">Retry map</button></div></div>}
                  {cafes.length === 0 && !loading && <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-white/60 bg-[#fffdf9]/90 p-4 shadow-lg backdrop-blur dark:border-white/10 dark:bg-[#241e1b]/90"><p className="text-sm font-semibold">Your map is ready</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Choose a location above to place live cafe pins here.</p></div>}
                </div>
                <div className="min-w-0">
                  <div className="mb-4 flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{cafes.length ? `${visibleCafes.length} places found` : "Your shortlist"}</p><p className="mt-1 text-xs text-muted-foreground">{cafes.length ? "Sorted by your preferences" : "Results will appear here"}</p></div>{cafes.length > 0 && <label className="relative"><span className="sr-only">Sort cafes</span><select value={filters.sortBy} onChange={event => setFilters(current => ({ ...current, sortBy: event.target.value as CafeFilters["sortBy"] }))} className="appearance-none rounded-full border border-border bg-card py-2 pl-3 pr-8 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring"><option value="nearest">Nearest</option><option value="rating">Highest rated</option><option value="reviews">Most reviewed</option></select><ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /></label>}</div>
                  {loading && <div className="grid gap-3"><CafeSkeleton /><CafeSkeleton /><CafeSkeleton /></div>}
                  {!loading && error && <ErrorState message={error} onRetry={() => void loadCafes(location)} />}
                  {!loading && !error && cafes.length === 0 && <StartState onFind={findNearMe} onExplore={() => document.getElementById("discovery-search")?.focus()} />}
                  {!loading && !error && cafes.length > 0 && visibleCafes.length === 0 && <EmptyState onReset={resetFilters} />}
                  {!loading && !error && visibleCafes.length > 0 && <div className="grid gap-3">{visibleCafes.map((cafe, index) => <CafeCard key={cafe.placeId} cafe={cafe} index={index} isFavorite={favorites.some(item => item.placeId === cafe.placeId)} selected={selectedCafeId === cafe.placeId} onSelect={openCafe} onFavorite={toggleFavorite} onDirections={openDirections} />)}</div>}
                </div>
              </div>
            </div>
          </section>
        </>}
      </main>
      {selectedCafe && <CafeDetails cafe={selectedCafe} loading={detailsLoading} isFavorite={favorites.some(item => item.placeId === selectedCafe.placeId)} isAuthenticated={isAuthenticated} onReportSaved={handleReportSaved} onClose={() => setSelectedCafe(null)} onFavorite={toggleFavorite} onDirections={openDirections} />}
      <footer className="border-t border-border/70 py-8"><div className="container flex flex-col justify-between gap-3 text-xs text-muted-foreground sm:flex-row"><p>© 2026 CafeScout. Find your daily ritual.</p><p className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-primary" />Built with live Google Maps place data</p></div></footer>
    </div>
  );
}

function NavButton({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return <button onClick={onClick} className={`flex items-center justify-between gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}>{children}{count !== undefined && <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-white/20" : "bg-secondary"}`}>{count}</span>}</button>;
}

function Hero({ onFind, onExplore }: { onFind: () => void; onExplore: () => void }) {
  return <section className="relative overflow-hidden pb-10 pt-14 sm:pb-16 sm:pt-20"><div className="container"><div className="relative overflow-hidden rounded-[2rem] bg-[#2f211d] px-6 py-12 text-[#fff8ef] shadow-2xl shadow-[#2f211d]/20 sm:px-12 sm:py-16 lg:px-20 lg:py-20"><div className="pointer-events-none absolute -right-20 -top-28 size-[28rem] rounded-full border-[1.5rem] border-[#d5a63e]/20" /><div className="pointer-events-none absolute -bottom-40 right-32 size-[24rem] rounded-full border border-[#e07853]/20" /><div className="pointer-events-none absolute bottom-8 right-12 hidden rotate-[-15deg] text-[10rem] opacity-[.08] sm:block">☕</div><div className="relative max-w-3xl"><p className="eyebrow text-[#e9b35c]">A better way to cafe-hop</p><h1 className="display-font mt-5 max-w-3xl text-5xl font-semibold leading-[.98] tracking-[-.04em] sm:text-7xl">Find your next <span className="text-[#e9b35c]">favorite cafe.</span></h1><p className="mt-6 max-w-xl text-base leading-7 text-[#decfc2] sm:text-lg">Discover highly-rated cafes around you using live location and place data. From first sip to last page, make every coffee break count.</p><div className="mt-8 flex flex-col gap-3 sm:flex-row"><button onClick={onFind} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#e9b35c] px-5 py-3.5 text-sm font-bold text-[#30200e] shadow-lg shadow-[#e9b35c]/20 transition hover:-translate-y-0.5 active:scale-[.98]"> <LocateFixed size={17} /> Find cafes near me</button><button onClick={onExplore} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-3.5 text-sm font-bold text-[#fff8ef] transition hover:bg-white/15 active:scale-[.98]">Explore cafes <ArrowRight size={17} /></button></div><div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#bdaea3]"><span className="flex items-center gap-2"><Check size={14} className="text-[#e9b35c]" />Real-time places</span><span className="flex items-center gap-2"><Check size={14} className="text-[#e9b35c]" />Privacy-conscious</span><span className="flex items-center gap-2"><Check size={14} className="text-[#e9b35c]" />Your preferences</span></div></div></div></div></section>;
}

function SearchPanel({ query, setQuery, suggestions, onSelect, onSubmit, onFind }: { query: string; setQuery: (value: string) => void; suggestions: SearchSuggestion[]; onSelect: (suggestion: SearchSuggestion) => void; onSubmit: () => void; onFind: () => void }) {
  return <div className="relative z-20 mb-6 rounded-[1.5rem] border border-border bg-card p-3 soft-shadow"><div className="flex flex-col gap-3 md:flex-row"><div className="relative flex min-w-0 flex-1 items-center rounded-xl bg-background"><Search className="ml-4 shrink-0 text-muted-foreground" size={19} /><input id="discovery-search" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void onSubmit(); }} placeholder="Search cafes, areas, or locations…" className="h-14 min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-muted-foreground/80" aria-label="Search cafes, areas, or locations" />{query && <button onClick={() => setQuery("")} className="mr-2 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary" aria-label="Clear search"><X size={15} /></button>}{suggestions.length > 0 && <div className="absolute left-0 right-0 top-[calc(100%+8px)] overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-2xl"><p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Suggestions</p>{suggestions.map(suggestion => <button key={suggestion.placeId || suggestion.description} onClick={() => void onSelect(suggestion)} className="flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-secondary"><MapPin size={16} className="mt-0.5 shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{suggestion.structuredFormatting?.mainText || suggestion.description}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{suggestion.structuredFormatting?.secondaryText || suggestion.description}</span></span></button>)}</div>}</div><button onClick={onFind} className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-bold transition hover:bg-secondary"><LocateFixed size={17} className="text-primary" /><span className="hidden sm:inline">Use my location</span><span className="sm:hidden">Near me</span></button><button onClick={() => void onSubmit()} className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/15 transition hover:-translate-y-0.5 active:scale-[.98]">Search <ArrowRight size={17} /></button></div></div>;
}

function FilterBar({ filters, setFilters, activeFilters, resetFilters }: { filters: CafeFilters; setFilters: React.Dispatch<React.SetStateAction<CafeFilters>>; activeFilters: number; resetFilters: () => void }) {
  const selectClass = "rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-ring";
  return <div className="mb-5 flex flex-wrap items-center gap-2"><div className="mr-1 flex items-center gap-2 text-sm font-bold"><SlidersHorizontal size={16} className="text-primary" /> Refine</div><select aria-label="Filter by rating" value={filters.minRating} onChange={event => setFilters(current => ({ ...current, minRating: Number(event.target.value) }))} className={selectClass}><option value={0}>Any rating</option><option value={4}>4.0+ rating</option><option value={4.5}>4.5+ rating</option></select><select aria-label="Filter by distance" value={filters.maxDistanceKm} onChange={event => setFilters(current => ({ ...current, maxDistanceKm: Number(event.target.value) }))} className={selectClass}><option value={10}>Within 10 km</option><option value={1}>Within 1 km</option><option value={3}>Within 3 km</option><option value={5}>Within 5 km</option></select><select aria-label="Filter by price" value={filters.priceLevel ?? "any"} onChange={event => setFilters(current => ({ ...current, priceLevel: event.target.value === "any" ? null : Number(event.target.value) }))} className={selectClass}><option value="any">Any price</option><option value={0}>$ · Budget</option><option value={1}>$$ · Casual</option><option value={2}>$$$ · Treat</option><option value={3}>$$$$ · Special</option></select><button onClick={() => setFilters(current => ({ ...current, openNow: !current.openNow }))} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${filters.openNow ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}>Open now</button><select aria-label="Filter by cafe type" value={filters.category} onChange={event => setFilters(current => ({ ...current, category: event.target.value as CafeFilters["category"] }))} className={selectClass}><option value="all">All cafe types</option><option value="cafe">Cafe</option><option value="coffee">Coffee bar</option><option value="bakery">Bakery</option><option value="brunch">Brunch</option></select><select aria-label="Filter by Wi-Fi speed" value={filters.wifi} onChange={event => setFilters(current => ({ ...current, wifi: event.target.value as CafeFilters["wifi"] }))} className={selectClass}><option value="any">Wi-Fi: Any</option><option value="available">Wi-Fi: Available</option><option value="fast">Wi-Fi: Fast 25+ Mbps</option><option value="gigabit">Wi-Fi: Gigabit 100+ Mbps</option></select><select aria-label="Filter by power outlets" value={filters.powerOutlets} onChange={event => setFilters(current => ({ ...current, powerOutlets: event.target.value as CafeFilters["powerOutlets"] }))} className={selectClass}><option value="any">Outlets: Any</option><option value="some">Outlets: Available</option><option value="many">Outlets: Many</option></select>{activeFilters > 0 && <button onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"><X size={13} /> Clear {activeFilters}</button>}<p className="basis-full text-[11px] text-muted-foreground">Amenity filters use verified or your own CafeScout reports; places without a report are not matched when a requirement is selected.</p></div>;
}

function RecommendationStrip({ recommendations, onSelect }: { recommendations: Recommendation[]; onSelect: (cafe: Cafe) => void }) {
  if (!recommendations.length) return null;
  return <div className="mb-6 overflow-hidden rounded-[1.5rem] border border-[#e8d7ad] bg-[#fff8e8] p-4 dark:border-[#675431] dark:bg-[#302816]"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-xl bg-[#e9b35c]/20 text-[#a36f13]"><Sparkles size={16} /></span><div><p className="text-sm font-bold text-[#5c431a] dark:text-[#f1d18b]">Recommended for you</p><p className="text-xs text-[#8b6c31] dark:text-[#c4a96c]">A simple blend of rating, distance, price, and open status.</p></div></div><span className="hidden text-[10px] font-bold uppercase tracking-[.14em] text-[#9d7d3e] sm:block">Preference-based</span></div><div className="mt-3 grid gap-2 md:grid-cols-3">{recommendations.map(recommendation => <button key={recommendation.placeId} onClick={() => onSelect(recommendation)} className="group flex min-w-0 items-center gap-3 rounded-xl border border-[#eadbb9] bg-white/60 p-2.5 text-left transition hover:-translate-y-0.5 hover:bg-white dark:border-[#5a4a2d] dark:bg-black/10 dark:hover:bg-black/20"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#efe3c5] text-[#8b6423] dark:bg-[#4d3e24]"><Coffee size={16} /></span><span className="min-w-0"><span className="block truncate text-xs font-bold text-[#543d1b] dark:text-[#f1d18b]">{recommendation.name}</span><span className="mt-0.5 block truncate text-[11px] text-[#8b6c31] dark:text-[#c4a96c]">{recommendation.recommendationReasons.join(" · ")}</span></span><ChevronRight size={14} className="ml-auto shrink-0 text-[#b18b44] transition group-hover:translate-x-0.5" /></button>)}</div></div>;
}

function CafeCard({ cafe, index, selected, isFavorite, onSelect, onFavorite, onDirections }: { cafe: Cafe; index: number; selected: boolean; isFavorite: boolean; onSelect: (cafe: Cafe) => void; onFavorite: (cafe: Cafe) => void; onDirections: (cafe: Cafe) => void }) {
  const amenities = amenityLabel(cafe);
  return <article className={`group animate-in overflow-hidden rounded-[1.35rem] border bg-card transition hover:-translate-y-0.5 hover:shadow-lg ${selected ? "border-primary ring-2 ring-primary/15" : "border-border"}`} style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}><div className="flex gap-3 p-3"><div className="relative h-[112px] w-[112px] shrink-0 overflow-hidden rounded-xl">{cafe.photoUrl ? <img src={cafe.photoUrl} alt={`${cafe.name} cafe`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" loading="lazy" /> : <div className="photo-placeholder grid h-full w-full place-items-center text-white/75"><Coffee size={28} strokeWidth={1.4} /></div>}<button onClick={() => onFavorite(cafe)} className={`absolute right-2 top-2 grid size-8 place-items-center rounded-full shadow-md backdrop-blur transition ${isFavorite ? "bg-white text-primary" : "bg-black/25 text-white hover:bg-white hover:text-primary"}`} aria-label={isFavorite ? `Remove ${cafe.name} from favorites` : `Save ${cafe.name} to favorites`}>{isFavorite ? <Heart size={15} fill="currentColor" /> : <Heart size={15} />}</button></div><div className="min-w-0 flex-1 py-0.5"><div className="flex items-start justify-between gap-2"><button onClick={() => onSelect(cafe)} className="min-w-0 text-left"><h3 className="truncate text-[15px] font-bold leading-5 transition group-hover:text-primary">{cafe.name}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{getCafeType(cafe)} <span className="mx-1 text-border">•</span> {formatDistance(cafe.distanceKm)}</p></button>{cafe.openNow !== undefined && <span className={`mt-0.5 shrink-0 text-[10px] font-bold ${cafe.openNow ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{cafe.openNow ? "OPEN" : "CLOSED"}</span>}</div><div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="inline-flex items-center gap-1 rounded-md bg-[#fff2ce] px-1.5 py-1 font-bold text-[#8f681a] dark:bg-[#493b20] dark:text-[#e8c878]"><Star size={12} fill="currentColor" />{display(cafe.rating, "—")}</span><span className="text-muted-foreground">{cafe.userRatingsTotal ? `${cafe.userRatingsTotal.toLocaleString()} reviews` : "Reviews not available"}</span><span className="ml-auto font-semibold text-muted-foreground">{formatPrice(cafe.priceLevel)}</span></div>{amenities.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{amenities.map(label => <span key={label} className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-secondary-foreground">{label}</span>)}</div>}<div className="mt-3 flex items-center gap-2"><button onClick={() => onSelect(cafe)} className="text-xs font-bold text-primary hover:underline">View details</button><button onClick={() => onDirections(cafe)} className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"><Navigation size={12} /> Directions</button></div></div></div><div className="border-t border-border/70 px-3 py-2"><p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground"><MapPin size={12} className="shrink-0 text-primary" />{display(cafe.address)}</p></div></article>;
}

function AmenityReportEditor({ cafe, isAuthenticated, onSaved }: { cafe: Cafe; isAuthenticated: boolean; onSaved: (report: AmenityReport) => void }) {
  const reportQuery = trpc.cafescout.amenityReport.useQuery({ placeId: cafe.placeId }, { enabled: isAuthenticated, retry: false });
  const saveReport = trpc.cafescout.saveAmenityReport.useMutation();
  const [wifi, setWifi] = useState("");
  const [outlets, setOutlets] = useState<AmenityReport["powerOutlets"]>("unknown");
  const [note, setNote] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || reportQuery.data === undefined || hydrated) return;
    setHydrated(true);
    const report = reportQuery.data;
    if (report) {
      setWifi(report.wifiSpeedMbps === null ? "" : String(report.wifiSpeedMbps));
      setOutlets(report.powerOutlets);
      setNote(report.note || "");
    }
  }, [hydrated, isAuthenticated, reportQuery.data]);

  if (!isAuthenticated) return <div className="mt-7 rounded-2xl border border-dashed border-border bg-secondary/40 p-4"><p className="text-sm font-bold">Know this cafe well?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Sign in to submit your own Wi-Fi and power-outlet report.</p></div>;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const wifiSpeedMbps = wifi.trim() === "" ? null : Number(wifi);
    if (wifiSpeedMbps !== null && (!Number.isInteger(wifiSpeedMbps) || wifiSpeedMbps < 0 || wifiSpeedMbps > 10000)) {
      toast.error("Enter a Wi-Fi speed from 0 to 10,000 Mbps");
      return;
    }
    saveReport.mutate({ placeId: cafe.placeId, cafeName: cafe.name, wifiSpeedMbps, powerOutlets: outlets, note: note.trim() || null }, {
      onSuccess: () => {
        const report: AmenityReport = { placeId: cafe.placeId, cafeName: cafe.name, wifiSpeedMbps, powerOutlets: outlets, note: note.trim() || null };
        onSaved(report);
        toast.success(reportQuery.data ? "Amenity report updated" : "Amenity report saved", { description: "Your report is private to your account." });
      },
      onError: () => toast.error("Could not save your amenity report", { description: "Please try again when you are online." }),
    });
  }

  return <form onSubmit={submit} className="mt-7 rounded-2xl border border-border bg-secondary/35 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-bold">Your amenity report</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Share what you observed. You can update it any time.</p></div><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">Private</span></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold">Wi-Fi speed (Mbps)<input type="number" min="0" max="10000" step="1" value={wifi} onChange={event => setWifi(event.target.value)} placeholder="e.g. 50" className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label className="grid gap-1.5 text-xs font-semibold">Power outlets<select value={outlets} onChange={event => setOutlets(event.target.value as AmenityReport["powerOutlets"])} className="h-10 rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring"><option value="unknown">Not sure</option><option value="none">None</option><option value="some">Some available</option><option value="many">Many available</option></select></label></div><label className="mt-3 grid gap-1.5 text-xs font-semibold">Optional note<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="For example: outlets by the window seats" rows={2} className="resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><div className="mt-3 flex items-center justify-between gap-3"><span className="text-[11px] text-muted-foreground">{note.length}/500 characters</span><button type="submit" disabled={saveReport.isPending} className="rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground transition hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60">{saveReport.isPending ? "Saving…" : reportQuery.data ? "Update report" : "Save report"}</button></div></form>;
}

function CafeDetails({ cafe, loading, isFavorite, isAuthenticated, onReportSaved, onClose, onFavorite, onDirections }: { cafe: Cafe; loading: boolean; isFavorite: boolean; isAuthenticated: boolean; onReportSaved: (report: AmenityReport) => void; onClose: () => void; onFavorite: (cafe: Cafe) => void; onDirections: (cafe: Cafe) => void }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#211713]/60 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={`${cafe.name} details`}><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-[2rem] bg-card shadow-2xl sm:rounded-[2rem]"><div className="relative h-52 sm:h-64">{cafe.photoUrl ? <img src={cafe.photoUrl} alt={`${cafe.name} cafe`} className="h-full w-full object-cover" /> : <div className="photo-placeholder grid h-full w-full place-items-center text-white/75"><Coffee size={60} strokeWidth={1.1} /></div>}<div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/15" /><button onClick={onClose} className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-black/30 text-white backdrop-blur transition hover:bg-black/50" aria-label="Close cafe details"><X size={19} /></button><div className="absolute bottom-5 left-5 right-5 text-white"><p className="eyebrow text-[#e9b35c]">{getCafeType(cafe)}</p><h2 className="display-font mt-2 text-3xl font-semibold leading-none sm:text-4xl">{cafe.name}</h2></div></div><div className="p-5 sm:p-7"><div className="flex flex-wrap items-center gap-3"><span className="inline-flex items-center gap-1 rounded-lg bg-[#fff2ce] px-2 py-1.5 text-sm font-bold text-[#8f681a] dark:bg-[#493b20] dark:text-[#e8c878]"><Star size={14} fill="currentColor" />{display(cafe.rating, "—")}</span><span className="text-sm text-muted-foreground">{cafe.userRatingsTotal ? `${cafe.userRatingsTotal.toLocaleString()} reviews` : "Reviews not available"}</span><span className="text-sm font-semibold text-muted-foreground">{formatPrice(cafe.priceLevel)}</span>{cafe.openNow !== undefined && <span className={`ml-auto text-sm font-bold ${cafe.openNow ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{cafe.openNow ? "Open now" : "Closed now"}</span>}</div>{loading && <div className="mt-5 flex items-center gap-2 text-xs text-muted-foreground"><span className="size-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading latest details…</div>}<div className="mt-6 grid gap-4"><DetailRow icon={<MapPin size={17} />} label="Address" value={display(cafe.address)} /><DetailRow icon={<Compass size={17} />} label="Distance" value={formatDistance(cafe.distanceKm)} />{cafe.phoneNumber && <DetailRow icon={<Info size={17} />} label="Contact" value={cafe.phoneNumber} />}{cafe.weekdayDescriptions?.length ? <div className="flex gap-3"><span className="mt-0.5 text-primary"><BookOpen size={17} /></span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">Opening hours</p><div className="mt-2 grid gap-1 text-sm">{cafe.weekdayDescriptions.map(day => <p key={day}>{day}</p>)}</div></div></div> : <DetailRow icon={<BookOpen size={17} />} label="Opening hours" value="Not available" />}</div><AmenityReportEditor cafe={cafe} isAuthenticated={isAuthenticated} onSaved={onReportSaved} /><div className="mt-7 flex flex-col gap-2 sm:flex-row"><button onClick={() => onDirections(cafe)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/15 transition hover:-translate-y-0.5"><Navigation size={16} /> Get directions</button><button onClick={() => onFavorite(cafe)} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition ${isFavorite ? "border-primary/30 bg-primary/10 text-primary" : "border-border hover:bg-secondary"}`}><Heart size={16} fill={isFavorite ? "currentColor" : "none"} />{isFavorite ? "Saved to favorites" : "Save to favorites"}</button>{cafe.websiteUri && <button onClick={() => window.open(cafe.websiteUri, "_blank", "noopener,noreferrer")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 text-sm font-bold transition hover:bg-secondary" aria-label="Open cafe website"><ExternalLink size={16} /> Website</button>}</div><p className="mt-5 text-center text-[11px] leading-5 text-muted-foreground">Details shown are supplied by Google Maps and may change. CafeScout does not store your precise location.</p></div></div></div>;
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex gap-3"><span className="mt-0.5 text-primary">{icon}</span><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm leading-6">{value}</p></div></div>;
}

function CafeSkeleton() { return <div className="flex gap-3 rounded-[1.35rem] border border-border bg-card p-3"><div className="h-[112px] w-[112px] shrink-0 animate-pulse rounded-xl bg-secondary" /><div className="flex-1 space-y-3 py-2"><div className="h-4 w-3/4 animate-pulse rounded bg-secondary" /><div className="h-3 w-1/2 animate-pulse rounded bg-secondary" /><div className="h-7 w-full animate-pulse rounded bg-secondary" /><div className="h-3 w-2/3 animate-pulse rounded bg-secondary" /></div></div>; }
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) { return <div className="rounded-[1.35rem] border border-[#efc8bf] bg-[#fff5f2] p-6 dark:border-[#633b34] dark:bg-[#321f1b]"><div className="flex gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#efc8bf]/40 text-destructive"><CircleAlert size={18} /></span><div><p className="text-sm font-bold">Something went wrong</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{message}</p><button onClick={onRetry} className="mt-4 text-xs font-bold text-primary hover:underline">Try again</button></div></div></div>; }
function StartState({ onFind, onExplore }: { onFind: () => void; onExplore: () => void }) { return <div className="rounded-[1.35rem] border border-dashed border-border bg-card p-7 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-primary"><MapPin size={22} /></span><h3 className="display-font mt-4 text-2xl font-semibold">A good cafe is closer than you think</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Use your current location or search for a place to see real cafes, ratings, and open status.</p><div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row"><button onClick={onFind} className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Find near me</button><button onClick={onExplore} className="rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary">Search a place</button></div></div>; }
function EmptyState({ onReset }: { onReset: () => void }) { return <div className="rounded-[1.35rem] border border-dashed border-border bg-card p-7 text-center"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-secondary text-muted-foreground"><Filter size={21} /></span><h3 className="display-font mt-4 text-2xl font-semibold">Nothing matches those filters</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">Try widening your distance or relaxing a preference.</p><button onClick={onReset} className="mt-5 rounded-xl border border-border px-4 py-3 text-sm font-bold hover:bg-secondary">Clear filters</button></div>; }

function FavoritesView({ favorites, onSelect, onFavorite, onDirections, onExplore }: { favorites: Cafe[]; onSelect: (cafe: Cafe) => void; onFavorite: (cafe: Cafe) => void; onDirections: (cafe: Cafe) => void; onExplore: () => void }) {
  return <section className="min-h-[70vh] pb-20 pt-14"><div className="container"><div className="max-w-2xl"><p className="eyebrow text-primary">Your saved places</p><h1 className="display-font mt-3 text-5xl font-semibold tracking-tight">Favorites worth the walk.</h1><p className="mt-4 text-base leading-7 text-muted-foreground">Keep your go-to spots close. Favorites live only in this browser, so your list stays private and portable.</p></div>{favorites.length === 0 ? <div className="mt-12 max-w-xl rounded-[1.75rem] border border-dashed border-border bg-card p-10 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-secondary text-primary"><Heart size={25} /></span><h2 className="display-font mt-5 text-3xl font-semibold">Your list is waiting</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Tap the heart on any cafe you love and it will show up here for next time.</p><button onClick={onExplore} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Explore cafes <ArrowRight size={16} /></button></div> : <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{favorites.map((cafe, index) => <CafeCard key={cafe.placeId} cafe={cafe} index={index} selected={false} isFavorite onSelect={onSelect} onFavorite={onFavorite} onDirections={onDirections} />)}</div>}</div></section>;
}

function AboutView({ onExplore }: { onExplore: () => void }) {
  return <section className="pb-20 pt-14"><div className="container"><div className="max-w-3xl"><p className="eyebrow text-primary">The CafeScout approach</p><h1 className="display-font mt-3 text-5xl font-semibold leading-[1.04] tracking-tight sm:text-6xl">Less scrolling. More <span className="text-primary">sipping.</span></h1><p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">CafeScout turns a coffee craving into a small, useful plan: a trusted map, the details that matter, and a shortlist shaped by how you actually choose.</p><button onClick={onExplore} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground">Start exploring <ArrowRight size={17} /></button></div><div className="mt-14 grid gap-4 md:grid-cols-3"><AboutCard icon={<MapPin />} title="Search the real world" text="Search a neighborhood, landmark, or address. CafeScout uses live Google Maps place data instead of invented listings." /><AboutCard icon={<Sparkles />} title="Make it yours" text="Ratings, distance, price, open status, and your saved places contribute to simple, transparent recommendations." /><AboutCard icon={<CircleAlert />} title="Privacy, by default" text="Your precise location is used for the current search and is not permanently stored. Favorites stay in your browser." /></div><div className="mt-14 grid gap-5 rounded-[2rem] border border-border bg-card p-6 sm:p-9 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="eyebrow text-primary">How it works</p><h2 className="display-font mt-3 text-3xl font-semibold">A calm interface for a very important question.</h2></div><div className="grid gap-5 sm:grid-cols-3"><Step number="01" title="Choose a place" /><Step number="02" title="Tune your preferences" /><Step number="03" title="Pick your next ritual" /></div></div></div></section>;
}
function AboutCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) { return <div className="rounded-[1.5rem] border border-border bg-card p-6 transition hover:-translate-y-1 hover:shadow-lg"><span className="grid size-11 place-items-center rounded-2xl bg-secondary text-primary">{icon}</span><h2 className="mt-5 text-lg font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>; }
function Step({ number, title }: { number: string; title: string }) { return <div><span className="text-xs font-bold tracking-[.16em] text-primary">{number}</span><p className="mt-2 text-sm font-bold leading-5">{title}</p></div>; }
