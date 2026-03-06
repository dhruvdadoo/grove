export type SourceType = "google" | "reddit" | "nea" | "blog";

export interface Restaurant {
  id: string;
  name: string;
  location: string;
  cuisine: string;
  priceRange: 1 | 2 | 3;
  isOpen: boolean;
  closingTime: string;
  /** Dietary + special tags (Halal, Vegetarian, Hawker Centre, Reddit gem, etc.) */
  tags: string[];
  distance: string;
  distanceM: number;
  matchReason: string;
  phone?: string;
  rating?: number;
  placeId?: string;
  /** Which data sources contributed to this result */
  sources?: SourceType[];
  /** Names of blog sources that mentioned this place */
  blogSources?: string[];
  /** Number of Reddit posts/comments that mentioned this place */
  redditMentions?: number;
  /** True if this came from NEA hawker data, not a full Maps result */
  isHawkerCentre?: boolean;
  /** True if sourced from Reddit but NOT found on Google Maps */
  isRedditGem?: boolean;
  /** URL to the source (Reddit thread, blog post) */
  sourceUrl?: string;
  /** Full formatted address (before stripping city name) */
  fullAddress?: string;
}

export const mockRestaurants: Restaurant[] = [
  {
    id: "1",
    name: "Zam Zam Restaurant",
    location: "Arab Street",
    cuisine: "Indian Muslim",
    priceRange: 2,
    isOpen: true,
    closingTime: "11pm",
    tags: ["Halal"],
    distance: "1.2km",
    distanceM: 1200,
    matchReason:
      "Halal certified, open until 11pm, authentic North Indian Muslim cuisine loved by locals since 1908.",
    phone: "+6562981011",
  },
  {
    id: "2",
    name: "Maxwell Food Centre",
    location: "Stall 10, Tanjong Pagar",
    cuisine: "Hainanese Chicken Rice",
    priceRange: 1,
    isOpen: true,
    closingTime: "8pm",
    tags: [],
    distance: "2.1km",
    distanceM: 2100,
    matchReason:
      "Singapore's most iconic chicken rice stall — silky poached chicken, rich rice, under $6 a plate.",
    phone: "+6562251852",
  },
  {
    id: "3",
    name: "Leno Eating House",
    location: "Toa Payoh",
    cuisine: "Zi Char",
    priceRange: 2,
    isOpen: true,
    closingTime: "10pm",
    tags: ["No Pork"],
    distance: "800m",
    distanceM: 800,
    matchReason:
      "No pork used throughout, great for groups, hearty zi char dishes at wallet-friendly prices just 800m away.",
    phone: "+6562534986",
  },
  {
    id: "4",
    name: "Burnt Ends",
    location: "Teck Lim Road, Keong Saik",
    cuisine: "Modern BBQ",
    priceRange: 3,
    isOpen: true,
    closingTime: "11pm",
    tags: [],
    distance: "1.5km",
    distanceM: 1500,
    matchReason:
      "World-class open-fire BBQ, Michelin one-star, perfect for a special occasion dinner tonight.",
    phone: "+6562241334",
  },
  {
    id: "5",
    name: "Hjh Maimunah",
    location: "Jalan Pisang, Kampong Glam",
    cuisine: "Malay",
    priceRange: 1,
    isOpen: false,
    closingTime: "3pm",
    tags: ["Halal"],
    distance: "900m",
    distanceM: 900,
    matchReason:
      "Halal certified, legendary nasi padang with 40+ dishes, authentic Malay flavours 900m from you.",
    phone: "+6562979294",
  },
];
