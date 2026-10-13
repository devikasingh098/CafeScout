# CafeScout — Smart Cafe Finder

CafeScout is a polished, responsive cafe-discovery web app for finding the next place worth lingering at. It combines browser geolocation, Google Maps place data, transparent preference-based recommendations, and persistent favorites in a warm coffeehouse-inspired interface.

## Features

- **Live cafe discovery:** Search a city, neighborhood, landmark, or address and retrieve nearby cafes from Google Maps Places.
- **Current location:** Use the Browser Geolocation API with clear permission-denied, timeout, and unavailable-location states.
- **Interactive map:** Google Maps with synchronized location and cafe markers, zooming, panning, and selected-place highlighting.
- **Cafe cards and details:** Shows only data returned by the place API: rating, review count, address, distance, price level, open status, hours, phone, website, and photos when available.
- **Smart filters:** Rating, distance, price, open now, cafe category, Wi-Fi speed, and power-outlet filters can be combined. Wi-Fi requirements include available, 25+ Mbps, and 100+ Mbps; outlet requirements include available and many. Results sort by nearest, highest rated, or most reviewed.
- **Transparent recommendations:** “Recommended for you” uses a simple score based on rating, distance, price fit, open status, and saved places. It is not described as AI-powered.
- **Favorites:** Save and remove cafes with optimistic local feedback and server persistence for signed-in users.
- **User amenity reports:** Signed-in users can submit and update their own Wi-Fi speed, outlet availability, and optional notes from a cafe’s details view. Reports are private to the submitting account.
- **Preference persistence:** Rating, distance, price, open-now, category, and sort preferences sync to the database for signed-in users.
- **Authentication:** Manus OAuth sign-in and sign-out are wired through the generated secure session flow.
- **Responsive routes:** Home, Explore, Favorites, and About views with mobile navigation and desktop split map/results layout.
- **Theme support:** Light/dark mode persists in `localStorage`.
- **Accessible UX:** Semantic controls, labels, keyboard search, alt text, visible focus states, responsive tap targets, empty states, loading skeletons, and recoverable API errors.

## Tech stack

- React 19
- TypeScript
- Vite 7
- Tailwind CSS 4
- tRPC 11 + TanStack Query
- Drizzle ORM + MySQL/TiDB
- Manus OAuth
- Google Maps JavaScript API + Places API through the Manus Maps proxy
- Browser Geolocation API
- `localStorage` as an offline-first fallback for favorites and theme preferences

Amenity filters use optional verified CafeScout amenity fields (`wifiSpeedMbps` and `powerOutlets`) on cafe records. Google Places does not reliably return Wi-Fi speed or outlet counts, so unknown places are intentionally excluded when a specific amenity requirement is selected rather than being presented as confirmed matches.

## Running locally

```bash
pnpm install
pnpm run dev
```

Validate the complete app before deployment:

```bash
pnpm run check
pnpm test
pnpm run build
```

## Database setup

The database capability is already enabled for this WebDev project. The schema is defined in `drizzle/schema.ts` and the current migration is in `drizzle/0000_amusing_dormammu.sql`.

The application creates and uses these tables:

| Table | Purpose |
| --- | --- |
| `users` | Manus OAuth user identity and session-linked profile information |
| `cafe_favorites` | One saved cafe per user and Google `placeId`, with the place snapshot needed to render the saved list |
| `user_preferences` | One row per user for filters, category, sorting, and open-now preference |
| `amenity_reports` | One private, editable amenity report per user and cafe |

The database migration has been applied to the managed project database. For future schema changes:

```bash
pnpm drizzle-kit generate
```

Review the generated SQL, then apply it through the project’s database migration workflow. Do not put secrets or `.env` files in source control.

## Authentication and persistence behavior

CafeScout remains usable without signing in. Anonymous users receive the original browser-local experience. When a user signs in, the app:

1. Loads their saved favorites and preferences from tRPC procedures backed by Drizzle.
2. Migrates existing browser-local favorites to the database if their server list is empty.
3. Persists new favorite changes and debounced preference updates to the database.
4. Keeps the local copy as an offline or transient-failure fallback.

Favorites store a serialized snapshot of place data so a saved list remains useful even before a fresh map search. Precise geolocation coordinates are not written to the database.

Amenity reports are ownership-scoped by the authenticated user ID and the Google `placeId`. Saving the same cafe again performs an update rather than creating a duplicate. Reports contain the observed Wi-Fi speed, outlet availability, and an optional 500-character note; they do not contain precise location history.

## Environment variables

### Managed WebDev environment

The upgrade provisions the database and auth environment. The app uses these managed values server-side:

```bash
DATABASE_URL
JWT_SECRET
VITE_APP_ID
OAUTH_SERVER_URL
VITE_OAUTH_PORTAL_URL
OWNER_OPEN_ID
OWNER_NAME
```

The existing Maps integration uses the managed frontend values:

```bash
VITE_FRONTEND_FORGE_API_URL
VITE_FRONTEND_FORGE_API_KEY
```

Do not hardcode or commit any of these values.

### Independent hosting

When deploying outside the managed environment, provide a compatible MySQL/TiDB `DATABASE_URL`, secure session configuration, Manus OAuth application values, and a compatible Maps proxy configuration. Never expose a server-only database URL or secret in client code.

## Google Maps setup

The app loads the Maps JavaScript API with the `marker`, `places`, `geocoding`, and `geometry` libraries. It uses:

- `PlacesService.nearbySearch` for cafe results.
- `AutocompleteService` for location suggestions.
- `Geocoder` for selected suggestions and free-form addresses.
- Google Maps markers for cafe and selected-location pins.

API failures are surfaced as retryable map and search states instead of crashing the application.

## Project structure

```text
client/
  src/
    _core/hooks/useAuth.ts   # generated auth state and login/logout helpers
    components/Map.tsx       # Google Maps proxy loader and map canvas
    contexts/ThemeContext.tsx
    lib/cafescout.ts         # Places helpers, filters, scoring, local fallback
    lib/trpc.ts              # typed API client
    pages/Home.tsx           # app shell and discovery experience
    types/cafe.ts            # client-side cafe and filter types
    App.tsx
    main.tsx
server/
  db.ts                      # Drizzle queries and persistence helpers
  routers.ts                 # protected tRPC API procedures
drizzle/
  schema.ts                 # users, favorites, and preferences schema
  relations.ts
  migrations/
README.md
```

## Privacy notes

CafeScout uses precise location only when the user explicitly selects “Use my location.” The point is used for the current search and map view; it is not permanently stored in the database. Favorites and theme preferences remain available locally, while signed-in favorites and filters sync to the user’s protected records.

## Future improvements

- Add optional account profile settings and a clear “delete my saved data” action.
- Add walking, cycling, and transit travel-time sorting through Directions/Routes.
- Add saved search presets and notification preferences.
- Add richer place photos and review excerpts when those fields are available.
- Add integration tests for persistence procedures and browser tests for OAuth, permissions, filters, and map failures.
