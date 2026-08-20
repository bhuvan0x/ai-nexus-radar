const { collectRadarData } = require("../src/nexus-radar");

const DEMO_CACHE_MS = 30_000;
let cache = { expiresAt: 0, data: null };

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.BRIGHTDATA_API_KEY) {
    return res.status(503).json({
      live: false,
      error: "Live radar is not configured. Add BRIGHTDATA_API_KEY to the Vercel project environment."
    });
  }

  const now = Date.now();
  if (cache.data && cache.expiresAt > now) {
    return res.status(200).json({ ...cache.data, cached: true });
  }

  try {
    const data = await collectRadarData();
    const payload = {
      live: true,
      cached: false,
      collectedAt: data.collectedAt,
      collectorId: data.collectorId,
      targetUrl: data.targetUrl,
      ...data.result
    };
    cache = { data: payload, expiresAt: now + DEMO_CACHE_MS };
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Radar API error:", error);
    return res.status(502).json({
      live: false,
      error: "The live collector could not be reached.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};
