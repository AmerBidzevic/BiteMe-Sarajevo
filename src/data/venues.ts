export type PlaceType = "coffee" | "food"

export type Venue = {
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

export const venues: Venue[] = [
  {
    id: "avlija",
    name: "Avlija",
    type: "food",
    cuisine: "Bosnian",
    area: "Old Town",
    latitude: 43.8596,
    longitude: 18.4294,
    priceLevel: 2,
    distanceKm: 1.1,
    rating: 4.8,
    isOpenNow: true,
    tags: ["traditional", "group dinner", "iconic"],
    priceNote: "Good value for a proper Sarajevo meal"
  },
  {
    id: "coffee-me",
    name: "Coffee Me",
    type: "coffee",
    cuisine: "Specialty coffee",
    area: "City Center",
    latitude: 43.8581,
    longitude: 18.4133,
    priceLevel: 2,
    distanceKm: 0.8,
    rating: 4.7,
    isOpenNow: true,
    tags: ["quiet", "laptop friendly", "espresso"],
    priceNote: "Comfortable for a budget-friendly coffee stop"
  },
  {
    id: "mrvica",
    name: "Mrvica",
    type: "food",
    cuisine: "Bakery / brunch",
    area: "Marijin Dvor",
    latitude: 43.8559,
    longitude: 18.4097,
    priceLevel: 2,
    distanceKm: 2.4,
    rating: 4.6,
    isOpenNow: false,
    tags: ["breakfast", "pastries", "casual"],
    priceNote: "Light meals and pastries at a moderate price"
  },
  {
    id: "caffe-kuca",
    name: "Caffe Kuca",
    type: "coffee",
    cuisine: "Cafe and desserts",
    area: "Bascarsija",
    latitude: 43.8599,
    longitude: 18.4301,
    priceLevel: 1,
    distanceKm: 0.5,
    rating: 4.5,
    isOpenNow: true,
    tags: ["sweet", "tea", "fast stop"],
    priceNote: "Great if you want to spend very little"
  },
  {
    id: "klopa",
    name: "Klopa",
    type: "food",
    cuisine: "Burger / fast casual",
    area: "City Center",
    latitude: 43.8572,
    longitude: 18.4122,
    priceLevel: 2,
    distanceKm: 1.6,
    rating: 4.4,
    isOpenNow: true,
    tags: ["quick", "filling", "casual"],
    priceNote: "Solid for a simple lunch without overspending"
  },
  {
    id: "eldin",
    name: "Eldin Coffee House",
    type: "coffee",
    cuisine: "Turkish coffee",
    area: "Bascarsija",
    latitude: 43.8602,
    longitude: 18.4299,
    priceLevel: 1,
    distanceKm: 0.4,
    rating: 4.6,
    isOpenNow: true,
    tags: ["traditional", "local", "slow coffee"],
    priceNote: "Very affordable if you want the classic Sarajevo vibe"
  },
  {
    id: "petica",
    name: "Petica Cevabzinica",
    type: "food",
    cuisine: "Cevapi",
    area: "Old Town",
    latitude: 43.8606,
    longitude: 18.429,
    priceLevel: 2,
    distanceKm: 0.9,
    rating: 4.9,
    isOpenNow: false,
    tags: ["classic", "meat", "popular"],
    priceNote: "One of the best bets for a classic local meal"
  },
  {
    id: "the-brew",
    name: "The Brew Lab",
    type: "coffee",
    cuisine: "Specialty coffee",
    area: "Skenderija",
    latitude: 43.8547,
    longitude: 18.4067,
    priceLevel: 3,
    distanceKm: 3.2,
    rating: 4.5,
    isOpenNow: true,
    tags: ["new wave", "filter coffee", "work"],
    priceNote: "Worth it when you want a nicer coffee experience"
  }
]
