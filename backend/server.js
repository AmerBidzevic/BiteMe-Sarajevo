const express = require("express")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json())

const PORT = Number(process.env.PORT || 4000)
const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS || 900)
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || ""
const USE_GOOGLE_PLACES = String(process.env.USE_GOOGLE_PLACES || "false").toLowerCase() === "true"

const SARAJEVO_CENTER = {
  latitude: 43.8563,
  longitude: 18.4131
}

const cache = new Map()

function distanceBetweenKm(first, second) {
  const earthRadiusKm = 6371
  const deltaLatitude = ((second.latitude - first.latitude) * Math.PI) / 180
  const deltaLongitude = ((second.longitude - first.longitude) * Math.PI) / 180
  const startLatitude = (first.latitude * Math.PI) / 180
  const endLatitude = (second.latitude * Math.PI) / 180

  const a = Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) + Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2) * Math.cos(startLatitude) * Math.cos(endLatitude)

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalizeKind(kind) {
  if (kind === "coffee" || kind === "food") {
    return kind
  }

  return "all"
}

function normalizeCoordinates(latitude, longitude) {
  const parsedLatitude = Number(latitude)
  const parsedLongitude = Number(longitude)

  if (!Number.isFinite(parsedLatitude) || !Number.isFinite(parsedLongitude)) {
    return SARAJEVO_CENTER
  }

  return {
    latitude: parsedLatitude,
    longitude: parsedLongitude
  }
}

function normalizeRadiusKm(radiusKm) {
  const parsed = Number(radiusKm)
  if (!Number.isFinite(parsed)) {
    return 6
  }

  return Math.max(1, Math.min(20, parsed))
}

function normalizePriceLevel(priceLevel) {
  if (!Number.isFinite(priceLevel)) {
    return 2
  }

  if (priceLevel <= 1) {
    return 1
  }

  if (priceLevel === 2) {
    return 2
  }

  if (priceLevel === 3) {
    return 3
  }

  return 4
}

function inferKindFromTypes(types) {
  const values = Array.isArray(types) ? types : []
  return values.includes("cafe") ? "coffee" : "food"
}

function inferCuisineFromTypes(types, kind) {
  const values = Array.isArray(types) ? types : []

  if (kind === "coffee") {
    return values.includes("bakery") ? "Cafe and desserts" : "Coffee"
  }

  if (values.includes("fast_food")) {
    return "Fast food"
  }

  if (values.includes("meal_takeaway")) {
    return "Takeaway"
  }

  return "Restaurant"
}

function buildPriceNote(priceLevel) {
  if (priceLevel === 1) {
    return "Very affordable option"
  }

  if (priceLevel === 2) {
    return "Moderate prices for most visitors"
  }

  if (priceLevel === 3) {
    return "A bit pricier than average"
  }

  return "Higher-end pricing"
}

function dedupeVenues(venues) {
  const seen = new Set()
  const result = []

  for (const venue of venues) {
    const key = venue.googlePlaceId || `${venue.name.toLowerCase()}|${venue.latitude.toFixed(4)}|${venue.longitude.toFixed(4)}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(venue)
    }
  }

  return result
}

async function fetchGooglePlacesByType({ type, center, radiusMeters }) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json")
  url.searchParams.set("location", `${center.latitude},${center.longitude}`)
  url.searchParams.set("radius", String(radiusMeters))
  url.searchParams.set("type", type)
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY)

  const first = await fetch(url)
  if (!first.ok) {
    return []
  }

  const firstPayload = await first.json()
  const results = Array.isArray(firstPayload.results) ? [...firstPayload.results] : []

  let nextPageToken = firstPayload.next_page_token
  let rounds = 0

  while (nextPageToken && rounds < 2) {
    rounds += 1
    await new Promise(resolve => setTimeout(resolve, 1800))

    const pageUrl = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json")
    pageUrl.searchParams.set("pagetoken", nextPageToken)
    pageUrl.searchParams.set("key", GOOGLE_MAPS_API_KEY)

    const nextResponse = await fetch(pageUrl)
    if (!nextResponse.ok) {
      break
    }

    const nextPayload = await nextResponse.json()
    if (Array.isArray(nextPayload.results)) {
      results.push(...nextPayload.results)
    }

    nextPageToken = nextPayload.next_page_token
  }

  return results
}

async function fetchFromGooglePlaces({ kind, center, radiusKm }) {
  if (!USE_GOOGLE_PLACES || !GOOGLE_MAPS_API_KEY) {
    return []
  }

  const radiusMeters = Math.round(radiusKm * 1000)
  const requestedTypes = kind === "coffee" ? ["cafe"] : kind === "food" ? ["restaurant", "fast_food"] : ["cafe", "restaurant", "fast_food"]

  const allResults = []
  for (const type of requestedTypes) {
    const entries = await fetchGooglePlacesByType({ type, center, radiusMeters })
    allResults.push(...entries)
  }

  const mapped = allResults
    .map(item => {
      const latitude = item?.geometry?.location?.lat
      const longitude = item?.geometry?.location?.lng
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null
      }

      const placeId = item.place_id
      const inferredKind = inferKindFromTypes(item.types)
      const resolvedKind = kind === "all" ? inferredKind : kind
      const priceLevel = normalizePriceLevel(Number(item.price_level))

      return {
        id: `g-${placeId || Math.random().toString(36).slice(2)}`,
        source: "google",
        externalId: placeId,
        googlePlaceId: placeId,
        mapsUrl: placeId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.name + ", Sarajevo")}&query_place_id=${encodeURIComponent(placeId)}` : undefined,
        name: item.name || "Unknown place",
        type: resolvedKind,
        cuisine: inferCuisineFromTypes(item.types, resolvedKind),
        area: item.vicinity || "Sarajevo",
        latitude,
        longitude,
        priceLevel,
        distanceKm: distanceBetweenKm(center, { latitude, longitude }),
        rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : 4.2,
        isOpenNow: typeof item?.opening_hours?.open_now === "boolean" ? item.opening_hours.open_now : undefined,
        tags: Array.isArray(item.types) ? item.types.slice(0, 6) : [],
        priceNote: buildPriceNote(priceLevel)
      }
    })
    .filter(Boolean)

  return dedupeVenues(mapped)
}

async function fetchFromOverpass({ kind, center, radiusKm }) {
  const radiusMeters = Math.round(radiusKm * 1000)

  const amenityFilter = kind === "coffee" ? `node(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"="cafe"];way(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"="cafe"];relation(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"="cafe"];` : kind === "food" ? `node(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"~"restaurant|fast_food|food_court|biergarten"];way(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"~"restaurant|fast_food|food_court|biergarten"];relation(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"~"restaurant|fast_food|food_court|biergarten"];` : `node(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"~"cafe|restaurant|fast_food|food_court|biergarten"];way(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"~"cafe|restaurant|fast_food|food_court|biergarten"];relation(around:${radiusMeters},${center.latitude},${center.longitude})["amenity"~"cafe|restaurant|fast_food|food_court|biergarten"];`

  const query = `[out:json][timeout:25];(${amenityFilter});out center tags;`
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query
  })

  if (!response.ok) {
    return []
  }

  const payload = await response.json()
  const elements = Array.isArray(payload.elements) ? payload.elements : []

  const mapped = elements
    .map(element => {
      const latitude = element.lat ?? element.center?.lat
      const longitude = element.lon ?? element.center?.lon
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null
      }

      const tags = element.tags || {}
      const name = tags.name?.trim()
      if (!name) {
        return null
      }

      const inferredKind = (tags.amenity || "").toLowerCase().includes("cafe") ? "coffee" : "food"
      const resolvedKind = kind === "all" ? inferredKind : kind
      const rawPrice = tags.price_level || tags.price
      const priceLevel = /^\$+$/.test(rawPrice || "") ? normalizePriceLevel((rawPrice || "").length) : normalizePriceLevel(Number(rawPrice))

      return {
        id: `osm-${element.id}`,
        source: "osm",
        externalId: String(element.id),
        mapsUrl: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`,
        name,
        type: resolvedKind,
        cuisine: tags.cuisine
          ? tags.cuisine
              .split(";")
              .map(item => item.trim())
              .filter(Boolean)
              .slice(0, 2)
              .join(" / ")
          : resolvedKind === "coffee"
            ? "Coffee"
            : "Restaurant",
        area: tags["addr:suburb"] || tags["addr:city"] || "Sarajevo",
        latitude,
        longitude,
        priceLevel,
        distanceKm: distanceBetweenKm(center, { latitude, longitude }),
        rating: 4.2,
        tags: [tags.amenity, tags.cuisine, tags["addr:street"], tags.operator].filter(Boolean),
        priceNote: buildPriceNote(priceLevel)
      }
    })
    .filter(Boolean)

  return dedupeVenues(mapped)
}

function getCacheKey(params) {
  return JSON.stringify({
    kind: params.kind,
    latitude: Number(params.center.latitude.toFixed(3)),
    longitude: Number(params.center.longitude.toFixed(3)),
    radiusKm: Number(params.radiusKm.toFixed(1))
  })
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sarajevo-eat-picker-backend" })
})

app.get("/venues/nearby", async (req, res) => {
  const kind = normalizeKind(String(req.query.kind || "all"))
  const center = normalizeCoordinates(req.query.latitude, req.query.longitude)
  const radiusKm = normalizeRadiusKm(req.query.radiusKm)

  const key = getCacheKey({ kind, center, radiusKm })
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ venues: cached.venues, source: cached.source, cached: true })
    return
  }

  try {
    let venues = await fetchFromOverpass({ kind, center, radiusKm })
    let source = "osm"

    if (venues.length === 0 && USE_GOOGLE_PLACES && GOOGLE_MAPS_API_KEY) {
      venues = await fetchFromGooglePlaces({ kind, center, radiusKm })
      source = "google"
    }

    const sorted = venues.sort((a, b) => {
      if (a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm
      }
      return b.rating - a.rating
    })

    cache.set(key, {
      venues: sorted,
      source,
      expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000
    })

    res.json({ venues: sorted, source, cached: false })
  } catch (error) {
    res.status(500).json({
      venues: [],
      source: "none",
      error: error instanceof Error ? error.message : "Unknown error"
    })
  }
})

function startServer(port, retriesLeft) {
  const server = app.listen(port, () => {
    console.log(`Sarajevo Eat Picker backend running on http://localhost:${port}`)
  })

  server.on("error", error => {
    if (error && error.code === "EADDRINUSE" && retriesLeft > 0) {
      const nextPort = port + 1
      console.warn(`Port ${port} is busy. Retrying on ${nextPort}...`)
      startServer(nextPort, retriesLeft - 1)
      return
    }

    throw error
  })
}

startServer(PORT, 5)
