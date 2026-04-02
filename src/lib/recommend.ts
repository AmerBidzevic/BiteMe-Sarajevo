import { PlaceType, Venue } from "@/data/venues"

export type RecommendationPreferences = {
  kind: PlaceType | null
  style: string
  budget: "low" | "mid" | "high"
  maxDistanceKm: number
  amountAvailable: number
  currentLocation?: {
    latitude: number
    longitude: number
  } | null
}

export type RankedVenue = Venue & {
  score: number
  reasons: string[]
}

const budgetScore: Record<Venue["priceLevel"], number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 4
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

function budgetMatches(level: Venue["priceLevel"], budget: RecommendationPreferences["budget"]) {
  if (budget === "low") {
    return level <= 2
  }

  if (budget === "mid") {
    return level === 2 || level === 3
  }

  return level >= 3
}

function styleMatches(venue: Venue, style: string) {
  const normalized = style.toLowerCase()
  const searchSpace = [venue.cuisine, venue.area, ...venue.tags].join(" ").toLowerCase()
  return normalized.length > 0 && searchSpace.includes(normalized)
}

function isAnyStyle(style: string) {
  return style.trim().toLowerCase() === "any"
}

function diversifyByAreaAndCuisine(sortedVenues: RankedVenue[]) {
  const remaining = [...sortedVenues]
  const picked: RankedVenue[] = []
  const areaCounts: Record<string, number> = {}
  const cuisineCounts: Record<string, number> = {}

  while (remaining.length > 0) {
    let bestIndex = 0
    let bestAdjustedScore = -Infinity

    for (let index = 0; index < remaining.length; index += 1) {
      const venue = remaining[index]
      const areaKey = venue.area.toLowerCase()
      const cuisineKey = venue.cuisine.toLowerCase()

      const areaPenalty = (areaCounts[areaKey] ?? 0) * 6
      const cuisinePenalty = (cuisineCounts[cuisineKey] ?? 0) * 5
      const adjustedScore = venue.score - areaPenalty - cuisinePenalty

      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore
        bestIndex = index
      }
    }

    const [selected] = remaining.splice(bestIndex, 1)
    picked.push(selected)

    const selectedArea = selected.area.toLowerCase()
    const selectedCuisine = selected.cuisine.toLowerCase()
    areaCounts[selectedArea] = (areaCounts[selectedArea] ?? 0) + 1
    cuisineCounts[selectedCuisine] = (cuisineCounts[selectedCuisine] ?? 0) + 1
  }

  return picked
}

export function recommendVenues(venues: Venue[], preferences: RecommendationPreferences): RankedVenue[] {
  const scored = venues
    .map(venue => {
      let score = 0
      const reasons: string[] = []
      const liveDistanceKm = preferences.currentLocation ? distanceBetweenKm(preferences.currentLocation, { latitude: venue.latitude, longitude: venue.longitude }) : venue.distanceKm

      if (!preferences.kind || venue.type === preferences.kind) {
        score += 40
        reasons.push("Matches the coffee/food choice")
      }

      if (!isAnyStyle(preferences.style) && styleMatches(venue, preferences.style)) {
        score += 20
        reasons.push("Fits the style or cuisine you asked for")
      }

      if (budgetMatches(venue.priceLevel, preferences.budget)) {
        score += 15
        reasons.push("Within your budget range")
      }

      const estimatedSpend = venue.priceLevel * 5
      if (preferences.amountAvailable >= estimatedSpend) {
        score += 10
        reasons.push("Affordable with the money you entered")
      } else {
        score -= 20
        reasons.push("May be above the amount you entered")
      }

      if (liveDistanceKm <= preferences.maxDistanceKm) {
        score += 10
        reasons.push("Inside your distance limit")
      } else {
        score -= 15
        reasons.push("Farther away than your distance limit")
      }

      score += Math.max(0, 8 - budgetScore[venue.priceLevel])
      score += venue.rating

      return {
        ...venue,
        distanceKm: liveDistanceKm,
        score,
        reasons
      }
    })
    .sort((firstVenue, secondVenue) => secondVenue.score - firstVenue.score)

  return diversifyByAreaAndCuisine(scored)
}
