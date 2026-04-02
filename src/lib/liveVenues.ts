import { PlaceType, Venue } from "@/data/venues"

type FetchLiveVenuesParams = {
  kind: PlaceType | null
  currentLocation?: {
    latitude: number
    longitude: number
  } | null
  maxDistanceKm: number
}

type BackendVenue = {
  id: string
  name: string
  type: PlaceType
  source?: "local" | "google" | "osm"
  externalId?: string
  googlePlaceId?: string
  mapsUrl?: string
  cuisine: string
  area: string
  latitude: number
  longitude: number
  priceLevel: 1 | 2 | 3 | 4
  distanceKm: number
  rating: number
  isOpenNow?: boolean
  tags: string[]
  priceNote: string
}

type BackendResponse = {
  venues: BackendVenue[]
}

type OverpassElement = {
  id: number
  lat?: number
  lon?: number
  center?: {
    lat: number
    lon: number
  }
  tags?: Record<string, string>
}

type OverpassResponse = {
  elements?: OverpassElement[]
}

const SARAJEVO_CENTER = {
  latitude: 43.8563,
  longitude: 18.4131
}

function distanceBetweenKm(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const earthRadiusKm = 6371
  const deltaLatitude = ((second.latitude - first.latitude) * Math.PI) / 180
  const deltaLongitude = ((second.longitude - first.longitude) * Math.PI) / 180
  const startLatitude = (first.latitude * Math.PI) / 180
  const endLatitude = (second.latitude * Math.PI) / 180

  const a = Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) + Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2) * Math.cos(startLatitude) * Math.cos(endLatitude)

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function toNumber(value: string | undefined) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizePriceLevel(price: string | undefined): 1 | 2 | 3 | 4 {
  if (!price) {
    return 2
  }

  if (/^\$+$/.test(price)) {
    const level = price.length
    if (level <= 1) {
      return 1
    }
    if (level === 2) {
      return 2
    }
    if (level === 3) {
      return 3
    }
    return 4
  }

  const numeric = Math.round(toNumber(price))
  if (numeric <= 1) {
    return 1
  }
  if (numeric === 2) {
    return 2
  }
  if (numeric === 3) {
    return 3
  }
  return 4
}

function inferType(tags: Record<string, string>, requestedKind: PlaceType | null): PlaceType {
  if (requestedKind) {
    return requestedKind
  }

  const amenity = (tags.amenity ?? "").toLowerCase()
  return amenity.includes("cafe") ? "coffee" : "food"
}

function inferCuisine(tags: Record<string, string>, resolvedType: PlaceType) {
  if (tags.cuisine) {
    return tags.cuisine
      .split(";")
      .map(item => item.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" / ")
  }

  if (resolvedType === "coffee") {
    return "Coffee"
  }

  return "Restaurant"
}

function buildPriceNote(priceLevel: 1 | 2 | 3 | 4) {
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

function uniqueByNameAndCoords(venues: Venue[]) {
  const seen = new Set<string>()
  const result: Venue[] = []

  for (const venue of venues) {
    const key = `${venue.name.toLowerCase()}|${venue.latitude.toFixed(4)}|${venue.longitude.toFixed(4)}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(venue)
    }
  }

  return result
}

async function fetchFromBackend(params: FetchLiveVenuesParams): Promise<Venue[]> {
  const baseUrl = process.env.EXPO_PUBLIC_PLACES_API_URL
  if (!baseUrl) {
    return []
  }

  const center = params.currentLocation ?? SARAJEVO_CENTER
  const radiusKm = Math.max(1, Math.min(12, params.maxDistanceKm || 6))

  const search = new URLSearchParams({
    kind: params.kind ?? "all",
    latitude: String(center.latitude),
    longitude: String(center.longitude),
    radiusKm: String(radiusKm),
    city: "Sarajevo"
  })

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/venues/nearby?${search.toString()}`)
  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as BackendResponse
  return Array.isArray(payload.venues) ? payload.venues : []
}

async function fetchFromOverpass(params: FetchLiveVenuesParams): Promise<Venue[]> {
  const center = params.currentLocation ?? SARAJEVO_CENTER
  const radiusMeters = Math.round(Math.max(1000, Math.min(12000, (params.maxDistanceKm || 6) * 1000)))

  const amenityFilter = params.kind === "coffee" ? "node(around:" + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"="cafe"];way(around:' + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"="cafe"];relation(around:' + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"="cafe"];' : params.kind === "food" ? "node(around:" + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"~"restaurant|fast_food|food_court|biergarten"];way(around:' + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"~"restaurant|fast_food|food_court|biergarten"];relation(around:' + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"~"restaurant|fast_food|food_court|biergarten"];' : "node(around:" + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"~"cafe|restaurant|fast_food|food_court|biergarten"];way(around:' + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"~"cafe|restaurant|fast_food|food_court|biergarten"];relation(around:' + radiusMeters + "," + center.latitude + "," + center.longitude + ')["amenity"~"cafe|restaurant|fast_food|food_court|biergarten"];'

  const query = `[out:json][timeout:25];(${amenityFilter});out center tags;`
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: query
  })

  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as OverpassResponse
  const elements = Array.isArray(payload.elements) ? payload.elements : []

  const mapped = elements
    .map((element): Venue | null => {
      const latitude = element.lat ?? element.center?.lat
      const longitude = element.lon ?? element.center?.lon
      if (typeof latitude !== "number" || typeof longitude !== "number") {
        return null
      }

      const tags = element.tags ?? {}
      const name = tags.name?.trim()
      if (!name) {
        return null
      }

      const resolvedType = inferType(tags, params.kind)
      const cuisine = inferCuisine(tags, resolvedType)
      const priceLevel = normalizePriceLevel(tags["price"] ?? tags["price_level"])
      const distanceKm = distanceBetweenKm(center, { latitude, longitude })
      const mapsUrl = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=18/${latitude}/${longitude}`

      return {
        id: `osm-${element.id}`,
        source: "osm" as const,
        externalId: String(element.id),
        mapsUrl,
        name,
        type: resolvedType,
        cuisine,
        area: tags["addr:suburb"] ?? tags["addr:city"] ?? "Sarajevo",
        latitude,
        longitude,
        priceLevel,
        distanceKm,
        rating: 4.2,
        tags: [tags.amenity, tags.cuisine, tags["addr:street"], tags.operator].filter(Boolean) as string[],
        priceNote: buildPriceNote(priceLevel)
      }
    })
    .filter((venue): venue is Venue => venue !== null)

  return uniqueByNameAndCoords(mapped)
}

export async function fetchLiveVenues(params: FetchLiveVenuesParams): Promise<{ venues: Venue[]; source: "backend" | "osm" | "none" }> {
  try {
    const backendVenues = await fetchFromBackend(params)
    if (backendVenues.length > 0) {
      return { venues: backendVenues, source: "backend" }
    }
  } catch {
    // Ignore backend failures and continue to open-data fallback.
  }

  try {
    const osmVenues = await fetchFromOverpass(params)
    if (osmVenues.length > 0) {
      return { venues: osmVenues, source: "osm" }
    }
  } catch {
    // Ignore open-data errors and let local fallback be used.
  }

  return { venues: [], source: "none" }
}
