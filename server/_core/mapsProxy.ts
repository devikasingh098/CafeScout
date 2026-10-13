import type { Express, Request, Response } from "express";
import { ENV } from "./env";

// The Forge Maps key is scoped to the deployed WebDev project origin. Preview
// URLs are temporary and are not accepted by the proxy, so the server makes
// the upstream request with the stable project origin and serves the loader
// from this app's own origin.
const PROJECT_ORIGIN = "https://cafescout-afsczmyg.manus.space";

export function registerMapsProxy(app: Express) {
  app.get("/api/maps/script", async (_req: Request, res: Response) => {
    const mapsApiUrl = process.env.VITE_FRONTEND_FORGE_API_URL || ENV.forgeApiUrl;
    const mapsApiKey = process.env.VITE_FRONTEND_FORGE_API_KEY;

    if (!mapsApiUrl || !mapsApiKey) {
      res.status(503).type("text/plain").send("Google Maps is not configured");
      return;
    }

    const url = new URL(
      `${mapsApiUrl.replace(/\/+$/, "")}/v1/maps/proxy/maps/api/js`
    );
    url.searchParams.set("key", mapsApiKey);
    url.searchParams.set("v", "weekly");
    url.searchParams.set("libraries", "marker,places,geocoding,geometry");

    try {
      const upstream = await fetch(url, {
        headers: { Origin: PROJECT_ORIGIN },
      });
      const body = await upstream.arrayBuffer();

      res
        .status(upstream.status)
        .type(upstream.headers.get("content-type") || "text/javascript")
        .set("Cache-Control", "public, max-age=1800")
        .send(Buffer.from(body));
    } catch (error) {
      console.error("[Maps] Failed to load proxy script", error);
      res.status(502).type("text/plain").send("Google Maps script unavailable");
    }
  });
}
