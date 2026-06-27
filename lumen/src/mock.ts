// src/mock.ts
import type { Hub, Item } from "./plex";

function mk(title: string, year: number, extra: Partial<Item> = {}): Item {
  return {
    ratingKey: title.replace(/\s/g, ""),
    type: "movie",
    title,
    year,
    ...extra,
  };
}

export const mockHubs: Hub[] = [
  {
    title: "Continue Watching",
    hubIdentifier: "home.continue",
    Metadata: [
      mk("Nightfall Protocol", 2023, { duration: 6000, viewOffset: 2400, type: "movie" }),
      mk("The Quiet Coast", 2024, { duration: 3000, viewOffset: 2100, type: "episode", grandparentTitle: "The Quiet Coast" }),
      mk("Saturn Bloom", 2022, { duration: 5400, viewOffset: 900, type: "movie" }),
      mk("Halcyon", 2021, { duration: 7200, viewOffset: 5400, type: "movie" }),
    ],
  },
  {
    title: "Recently Added — Movies",
    hubIdentifier: "movie.recent",
    Metadata: [
      mk("Cobalt Hour", 2024), mk("Paper Lantern", 2023), mk("Drift", 2024),
      mk("The Long Field", 2022), mk("Ember & Ash", 2023), mk("Northwind", 2021),
      mk("Slow Tide", 2024), mk("Vellum", 2022),
    ],
  },
  {
    title: "Series",
    hubIdentifier: "show.recent",
    Metadata: [
      mk("Greywater", 2023, { type: "show" }), mk("The Archivist", 2024, { type: "show" }),
      mk("Lantern Bay", 2022, { type: "show" }), mk("Static Garden", 2023, { type: "show" }),
      mk("Foxglove", 2021, { type: "show" }), mk("Meridian", 2024, { type: "show" }),
    ],
  },
  {
    title: "Albums",
    hubIdentifier: "music.recent",
    Metadata: [
      mk("Low Country", 2023, { type: "album" }), mk("Held Light", 2024, { type: "album" }),
      mk("Room Tone", 2022, { type: "album" }), mk("Coral", 2023, { type: "album" }),
      mk("After Hours, Pt. 2", 2021, { type: "album" }), mk("Field Notes", 2024, { type: "album" }),
    ],
  },
];

export const mockHero: Item = mk("Nightfall Protocol", 2023, {
  duration: 6000,
  viewOffset: 2400,
  contentRating: "TV-MA",
  Genre: [{ tag: "Thriller" }, { tag: "Mystery" }],
});
