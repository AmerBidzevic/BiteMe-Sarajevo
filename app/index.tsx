import { useEffect, useMemo, useState } from "react"
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native"
import * as Location from "expo-location"

import { PlaceType, Venue, venues as localVenues } from "@/data/venues"
import { fetchLiveVenues } from "@/lib/liveVenues"
import { RankedVenue, recommendVenues } from "@/lib/recommend"

type TravelMode = "walk" | "tram" | "drive"
type Budget = "low" | "mid" | "high"

const coffeeOptions = ["Specialty coffee", "Turkish coffee", "Desserts", "Quiet study spot"]
const foodOptions = ["Any", "Bosnian", "Cevapi", "Brunch", "Burger / fast casual"]

const searchSynonyms: Record<string, string[]> = {
  sushi: ["japanese", "japan", "asian", "nigiri", "sashimi", "ramen"],
  japanese: ["sushi", "ramen", "asian"],
  burger: ["hamburger", "fast food", "fast_food"],
  cevapi: ["balkan", "bosnian", "grill", "meat"],
  bosnian: ["balkan", "traditional", "cevapi"],
  brunch: ["breakfast", "bakery", "pastries"],
  pizza: ["pizzeria", "italian"],
  coffee: ["cafe", "espresso", "specialty", "turkish"]
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function tokenMatchesSearchSpace(token: string, searchSpace: string) {
  const variants = [token, ...(searchSynonyms[token] ?? [])]
  return variants.some(variant => searchSpace.includes(variant) || includesFuzzyWord(searchSpace, variant))
}

function editDistanceAtMostOne(a: string, b: string) {
  if (a === b) {
    return true
  }

  const aLength = a.length
  const bLength = b.length

  if (Math.abs(aLength - bLength) > 1) {
    return false
  }

  let i = 0
  let j = 0
  let edits = 0

  while (i < aLength && j < bLength) {
    if (a[i] === b[j]) {
      i += 1
      j += 1
      continue
    }

    edits += 1
    if (edits > 1) {
      return false
    }

    if (aLength > bLength) {
      i += 1
    } else if (bLength > aLength) {
      j += 1
    } else {
      i += 1
      j += 1
    }
  }

  if (i < aLength || j < bLength) {
    edits += 1
  }

  return edits <= 1
}

function includesFuzzyWord(searchSpace: string, token: string) {
  if (token.length < 4) {
    return false
  }

  const words = searchSpace.split(/\s+/).filter(Boolean)
  return words.some(word => editDistanceAtMostOne(word, token))
}

function levenshteinDistance(first: string, second: string) {
  const rows = first.length + 1
  const cols = second.length + 1
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0))

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = first[row - 1] === second[col - 1] ? 0 : 1
      matrix[row][col] = Math.min(matrix[row - 1][col] + 1, matrix[row][col - 1] + 1, matrix[row - 1][col - 1] + cost)
    }
  }

  return matrix[first.length][second.length]
}

function findClosestToken(token: string, candidates: string[]) {
  if (token.length < 4) {
    return null
  }

  let bestCandidate: string | null = null
  let bestDistance = Infinity

  for (const candidate of candidates) {
    if (candidate === token || Math.abs(candidate.length - token.length) > 2) {
      continue
    }

    const distance = levenshteinDistance(token, candidate)
    if (distance < bestDistance) {
      bestDistance = distance
      bestCandidate = candidate
    }
  }

  if (bestDistance <= 2) {
    return bestCandidate
  }

  return null
}

function matchesSmartSearch(venue: RankedVenue, query: string) {
  const normalizedQuery = normalizeSearchText(query).trim()
  if (!normalizedQuery) {
    return true
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return true
  }

  const searchSpace = normalizeSearchText([venue.name, venue.area, venue.cuisine, ...venue.tags].join(" "))
  return tokens.every(token => tokenMatchesSearchSpace(token, searchSpace))
}

function OptionChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }: { pressed: boolean }) => [styles.chip, active && styles.chipActive, pressed && styles.chipPressed]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  )
}

function ResultCard({ name, area, cuisine, distanceKm, rating, score, priceNote, reasons, googlePlaceId }: { name: string; area: string; cuisine: string; distanceKm: number; rating: number; score: number; priceNote: string; reasons: string[]; googlePlaceId?: string }) {
  return (
    <View style={styles.resultCard}>
      <View style={styles.resultHeader}>
        <View>
          <Text style={styles.resultTitle}>{name}</Text>
          <Text style={styles.resultSubtitle}>
            {cuisine} - {area}
          </Text>
        </View>
        <View style={styles.scorePill}>
          <Text style={styles.scoreText}>{Math.round(score)}</Text>
        </View>
      </View>

      <View style={styles.resultStats}>
        <Text style={styles.resultStat}>Rating {rating.toFixed(1)}</Text>
        <Text style={styles.resultStat}>{distanceKm.toFixed(1)} km away</Text>
      </View>

      <Text style={styles.resultNote}>{priceNote}</Text>
      <View style={styles.reasonWrap}>
        {reasons.slice(0, 3).map(reason => (
          <View key={reason} style={styles.reasonBadge}>
            <Text style={styles.reasonText}>{reason}</Text>
          </View>
        ))}
      </View>

      <Pressable
        onPress={() => {
          const query = encodeURIComponent(`${name}, ${area}, Sarajevo`)
          if (googlePlaceId) {
            void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}&query_place_id=${encodeURIComponent(googlePlaceId)}`)
            return
          }

          void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`)
        }}
        style={({ pressed }: { pressed: boolean }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
      >
        <Text style={styles.secondaryButtonText}>Open in Maps</Text>
      </Pressable>
    </View>
  )
}

export default function HomeScreen() {
  const [kind, setKind] = useState<PlaceType | null>("coffee")
  const [style, setStyle] = useState("Specialty coffee")
  const [budget, setBudget] = useState<Budget>("mid")
  const [travelMode, setTravelMode] = useState<TravelMode>("walk")
  const [maxDistanceText, setMaxDistanceText] = useState("2")
  const [moneyText, setMoneyText] = useState("15")
  const [submitted, setSubmitted] = useState(false)
  const [resultLimit, setResultLimit] = useState<5 | 10 | 20>(10)
  const [visibleCount, setVisibleCount] = useState(10)
  const [searchText, setSearchText] = useState("")
  const [openNowOnly, setOpenNowOnly] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState("Location disabled")
  const [venuePool, setVenuePool] = useState<Venue[]>(localVenues)
  const [isLoadingVenues, setIsLoadingVenues] = useState(false)
  const [dataSourceStatus, setDataSourceStatus] = useState("Using local sample places")

  useEffect(() => {
    let isMounted = true

    async function loadLocation() {
      const permissionResult = await Location.requestForegroundPermissionsAsync()

      if (!isMounted) {
        return
      }

      if (permissionResult.status !== "granted") {
        setLocationStatus("Using manual distance only")
        return
      }

      const position = await Location.getCurrentPositionAsync({})

      if (!isMounted) {
        return
      }

      setCurrentLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      })
      setLocationStatus("Using your device location")
    }

    void loadLocation()

    return () => {
      isMounted = false
    }
  }, [])

  const maxDistanceKm = Number(maxDistanceText.replace(",", ".")) || 0
  const amountAvailable = Number(moneyText.replace(",", ".")) || 0

  useEffect(() => {
    setVisibleCount(resultLimit)
  }, [amountAvailable, budget, currentLocation, kind, maxDistanceKm, openNowOnly, resultLimit, searchText, style, submitted, venuePool])

  const rankedVenues = useMemo<RankedVenue[]>(() => {
    if (!submitted) {
      return []
    }

    return recommendVenues(venuePool, {
      kind,
      style,
      budget,
      maxDistanceKm,
      amountAvailable,
      currentLocation
    })
  }, [amountAvailable, budget, currentLocation, kind, maxDistanceKm, style, submitted, venuePool])

  const searchMatchedVenues = useMemo(() => rankedVenues.filter(venue => matchesSmartSearch(venue, searchText)), [rankedVenues, searchText])

  const suggestionVocabulary = useMemo(() => {
    const set = new Set<string>()

    for (const [key, values] of Object.entries(searchSynonyms)) {
      set.add(key)
      for (const value of values) {
        set.add(value)
      }
    }

    for (const venue of venuePool) {
      const words = normalizeSearchText([venue.name, venue.area, venue.cuisine, ...venue.tags].join(" "))
        .split(/\s+/)
        .filter(word => word.length >= 4)
      for (const word of words) {
        set.add(word)
      }
    }

    return Array.from(set)
  }, [venuePool])

  const didYouMeanText = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchText).trim()
    if (!normalizedQuery) {
      return ""
    }

    const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean)
    if (queryTokens.length === 0) {
      return ""
    }

    const searchSpaceHasExactQuery = rankedVenues.some(venue => {
      const space = normalizeSearchText([venue.name, venue.area, venue.cuisine, ...venue.tags].join(" "))
      return space.includes(normalizedQuery)
    })

    if (searchSpaceHasExactQuery) {
      return ""
    }

    const improvedTokens = queryTokens.map(token => findClosestToken(token, suggestionVocabulary) ?? token)
    const improvedQuery = improvedTokens.join(" ")

    if (improvedQuery === normalizedQuery) {
      return ""
    }

    return improvedQuery
  }, [rankedVenues, searchText, suggestionVocabulary])

  const openNowMissingCount = useMemo(() => searchMatchedVenues.filter(venue => venue.isOpenNow === undefined).length, [searchMatchedVenues])

  const filteredVenues = useMemo(() => searchMatchedVenues.filter(venue => !openNowOnly || venue.isOpenNow === true), [openNowOnly, searchMatchedVenues])

  const totalAfterFilters = filteredVenues.length
  const visibleVenues = useMemo(() => filteredVenues.slice(0, visibleCount), [filteredVenues, visibleCount])
  const canLoadMore = visibleVenues.length < totalAfterFilters

  const loadMoreResults = () => {
    setVisibleCount(previous => Math.min(previous + resultLimit, totalAfterFilters))
  }

  const styleOptions = kind === "coffee" ? coffeeOptions : foodOptions
  const travelHint = travelMode === "walk" ? "Walking friendly" : travelMode === "tram" ? "Tram friendly" : "Driving friendly"

  const setSuggestedDistance = (mode: TravelMode) => {
    setTravelMode(mode)
    setMaxDistanceText(mode === "walk" ? "2" : mode === "tram" ? "4" : "6")
  }

  const findPlaces = async () => {
    setSubmitted(true)
    setIsLoadingVenues(true)

    const live = await fetchLiveVenues({
      kind,
      currentLocation,
      maxDistanceKm
    })

    if (live.venues.length > 0) {
      setVenuePool(live.venues)
      setDataSourceStatus(live.source === "backend" ? "Using live places API" : "Using live open map data")
      setIsLoadingVenues(false)
      return
    }

    setVenuePool(localVenues)
    setDataSourceStatus("Using local sample places")
    setIsLoadingVenues(false)
  }

  return (
    <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
      <View style={styles.glowOne} />
      <View style={styles.glowTwo} />

      <View style={styles.heroCard}>
        <Text style={styles.kicker}>BiteMe Sarajevo</Text>
        <Text style={styles.title}>Tell the app what you want, and it picks a place to eat or drink.</Text>
        <Text style={styles.subtitle}>Choose coffee or food, pick a style, set your budget, distance, and money amount, then get ranked places in Sarajevo.</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>1. Coffee or food</Text>
        <View style={styles.row}>
          <OptionChip
            label="Coffee"
            active={kind === "coffee"}
            onPress={() => {
              setKind("coffee")
              setStyle(coffeeOptions[0])
            }}
          />
          <OptionChip
            label="Food"
            active={kind === "food"}
            onPress={() => {
              setKind("food")
              setStyle("Any")
            }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>2. What kind?</Text>
        <View style={styles.chipGrid}>
          {styleOptions.map(option => (
            <OptionChip key={option} label={option} active={style === option} onPress={() => setStyle(option)} />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>3. Budget and distance</Text>
        <View style={styles.row}>
          <OptionChip label="Low" active={budget === "low"} onPress={() => setBudget("low")} />
          <OptionChip label="Mid" active={budget === "mid"} onPress={() => setBudget("mid")} />
          <OptionChip label="High" active={budget === "high"} onPress={() => setBudget("high")} />
        </View>

        <View style={styles.row}>
          <OptionChip label="Walk" active={travelMode === "walk"} onPress={() => setSuggestedDistance("walk")} />
          <OptionChip label="Tram" active={travelMode === "tram"} onPress={() => setSuggestedDistance("tram")} />
          <OptionChip label="Drive" active={travelMode === "drive"} onPress={() => setSuggestedDistance("drive")} />
        </View>

        <View style={styles.inputGrid}>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Max distance in km</Text>
            <TextInput value={maxDistanceText} onChangeText={setMaxDistanceText} keyboardType="decimal-pad" placeholder="2" placeholderTextColor="#64748B" style={styles.input} />
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Money available</Text>
            <TextInput value={moneyText} onChangeText={setMoneyText} keyboardType="decimal-pad" placeholder="15" placeholderTextColor="#64748B" style={styles.input} />
          </View>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <MetricCard label="Travel" value={travelHint} />
        <MetricCard label="Budget" value={budget.toUpperCase()} />
        <MetricCard label="Money" value={`${amountAvailable.toFixed(0)} BAM`} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>4. How many results?</Text>
        <View style={styles.row}>
          <OptionChip label="5" active={resultLimit === 5} onPress={() => setResultLimit(5)} />
          <OptionChip label="10" active={resultLimit === 10} onPress={() => setResultLimit(10)} />
          <OptionChip label="20" active={resultLimit === 20} onPress={() => setResultLimit(20)} />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>5. Search and availability</Text>
        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>Search by name, area, or cuisine</Text>
          <TextInput value={searchText} onChangeText={setSearchText} placeholder="Try: Bascarsija, cevapi, or sushi" placeholderTextColor="#64748B" style={styles.input} />
          {didYouMeanText ? (
            <Text style={styles.searchHint} onPress={() => setSearchText(didYouMeanText)}>
              {`Did you mean: ${didYouMeanText}?`}
            </Text>
          ) : null}
        </View>

        <View style={styles.row}>
          <OptionChip label="All hours" active={!openNowOnly} onPress={() => setOpenNowOnly(false)} />
          <OptionChip label="Open now" active={openNowOnly} onPress={() => setOpenNowOnly(true)} />
        </View>
      </View>

      <View style={styles.locationCard}>
        <Text style={styles.locationLabel}>Live location</Text>
        <Text style={styles.locationValue}>{locationStatus}</Text>
        <Text style={styles.locationNote}>{currentLocation ? "The app is ranking venues from your current position in Sarajevo." : "If permission is denied, distance is estimated from the built-in Sarajevo venue data."}</Text>
        <Text style={styles.locationNote}>{dataSourceStatus}</Text>
      </View>

      <Pressable onPress={() => void findPlaces()} style={({ pressed }: { pressed: boolean }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
        <Text style={styles.primaryButtonText}>{isLoadingVenues ? "Finding places..." : "Find the best places in Sarajevo"}</Text>
      </Pressable>

      {submitted ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top recommendations</Text>
          <Text style={styles.sectionSubtitle}>{isLoadingVenues ? "Loading live Sarajevo places..." : "Ranked by your choice, budget, distance, and available money."}</Text>
          <Text style={styles.sectionSubtitle}>{`Showing ${visibleVenues.length} of ${totalAfterFilters} places.${openNowOnly && openNowMissingCount > 0 ? ` Open now data limited: ${openNowMissingCount} places have no hours info.` : ""}`}</Text>
          <View style={styles.resultsList}>
            {visibleVenues.map((venue: RankedVenue) => (
              <ResultCard key={venue.id} name={venue.name} area={venue.area} cuisine={venue.cuisine} distanceKm={venue.distanceKm} rating={venue.rating} score={venue.score} priceNote={venue.priceNote} reasons={venue.reasons} googlePlaceId={venue.googlePlaceId} />
            ))}
          </View>
          {canLoadMore && !isLoadingVenues ? (
            <Pressable onPress={loadMoreResults} style={({ pressed }: { pressed: boolean }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
              <Text style={styles.secondaryButtonText}>{`Load more (${Math.min(resultLimit, totalAfterFilters - visibleVenues.length)} more)`}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What happens next</Text>
          <Text style={styles.sectionSubtitle}>Tap the button above and the app will show the best Sarajevo places for your exact mood and budget.</Text>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: "#081120",
    padding: 20,
    gap: 16
  },
  glowOne: {
    position: "absolute",
    top: -70,
    right: -30,
    width: 180,
    height: 180,
    borderRadius: 180,
    backgroundColor: "rgba(248, 180, 82, 0.16)"
  },
  glowTwo: {
    position: "absolute",
    top: 220,
    left: -80,
    width: 220,
    height: 220,
    borderRadius: 220,
    backgroundColor: "rgba(52, 211, 153, 0.12)"
  },
  heroCard: {
    borderRadius: 28,
    backgroundColor: "#0F172A",
    padding: 22,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.16)",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3
  },
  kicker: {
    textTransform: "uppercase",
    letterSpacing: 1.6,
    color: "#F59E0B",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 10
  },
  title: {
    color: "#F8FAFC",
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "800"
  },
  subtitle: {
    color: "#CBD5E1",
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12
  },
  section: {
    gap: 12,
    borderRadius: 24,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.12)"
  },
  sectionTitle: {
    color: "#E2E8F0",
    fontSize: 17,
    fontWeight: "700"
  },
  sectionSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    lineHeight: 19
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.22)",
    backgroundColor: "rgba(30, 41, 59, 0.82)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexGrow: 1,
    alignItems: "center"
  },
  chipActive: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B"
  },
  chipPressed: {
    opacity: 0.85
  },
  chipText: {
    color: "#E2E8F0",
    fontSize: 14,
    fontWeight: "600"
  },
  chipTextActive: {
    color: "#111827"
  },
  inputGrid: {
    gap: 12
  },
  inputBlock: {
    gap: 8
  },
  inputLabel: {
    color: "#CBD5E1",
    fontSize: 13,
    fontWeight: "600"
  },
  input: {
    borderRadius: 16,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    color: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16
  },
  searchHint: {
    color: "#93C5FD",
    fontSize: 12,
    fontStyle: "italic"
  },
  metricsRow: {
    flexDirection: "row",
    gap: 10
  },
  metricCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.12)",
    gap: 6
  },
  metricLabel: {
    color: "#94A3B8",
    fontSize: 12
  },
  metricValue: {
    color: "#F8FAFC",
    fontSize: 14,
    fontWeight: "700"
  },
  primaryButton: {
    borderRadius: 20,
    backgroundColor: "#F59E0B",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 }
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.9
  },
  primaryButtonText: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800"
  },
  resultsList: {
    gap: 12
  },
  resultCard: {
    borderRadius: 22,
    backgroundColor: "#0B1324",
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.14)",
    gap: 10
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  resultTitle: {
    color: "#F8FAFC",
    fontSize: 18,
    fontWeight: "800"
  },
  resultSubtitle: {
    color: "#94A3B8",
    marginTop: 3,
    fontSize: 13
  },
  scorePill: {
    minWidth: 48,
    borderRadius: 999,
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  scoreText: {
    color: "#FBBF24",
    fontWeight: "800"
  },
  resultStats: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap"
  },
  resultStat: {
    color: "#CBD5E1",
    fontSize: 12,
    borderRadius: 999,
    backgroundColor: "rgba(30, 41, 59, 0.9)",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  resultNote: {
    color: "#E2E8F0",
    fontSize: 14,
    lineHeight: 20
  },
  reasonWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  reasonBadge: {
    borderRadius: 999,
    backgroundColor: "rgba(59, 130, 246, 0.16)",
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  reasonText: {
    color: "#BFDBFE",
    fontSize: 12,
    fontWeight: "600"
  },
  secondaryButton: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(248, 180, 82, 0.34)",
    backgroundColor: "rgba(248, 180, 82, 0.1)",
    paddingVertical: 12,
    alignItems: "center"
  },
  secondaryButtonPressed: {
    opacity: 0.85
  },
  secondaryButtonText: {
    color: "#FCD34D",
    fontWeight: "700"
  },
  locationCard: {
    borderRadius: 18,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.12)",
    padding: 14,
    gap: 6
  },
  locationLabel: {
    color: "#94A3B8",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 1.2
  },
  locationValue: {
    color: "#F8FAFC",
    fontSize: 15,
    fontWeight: "700"
  },
  locationNote: {
    color: "#CBD5E1",
    fontSize: 13,
    lineHeight: 18
  }
})
