// Standard US Monopoly board (40 spaces). Rent tuples are
// [base, 1 house, 2 houses, 3 houses, 4 houses, hotel]. The "base" is the
// no-house rent; a full color group with no houses charges double base
// (handled in the engine, not the table).

export type Color =
  | "brown"
  | "lightblue"
  | "pink"
  | "orange"
  | "red"
  | "yellow"
  | "green"
  | "darkblue";

export type SpaceType =
  | "go"
  | "property"
  | "railroad"
  | "utility"
  | "tax"
  | "chance"
  | "chest"
  | "jail"
  | "gotojail"
  | "freeparking";

export interface PropertySpace {
  index: number;
  name: string;
  type: "property";
  color: Color;
  price: number;
  rent: readonly [number, number, number, number, number, number];
  houseCost: number;
}
export interface RailroadSpace {
  index: number;
  name: string;
  type: "railroad";
  price: number;
}
export interface UtilitySpace {
  index: number;
  name: string;
  type: "utility";
  price: number;
}
export interface TaxSpace {
  index: number;
  name: string;
  type: "tax";
  amount: number;
}
export interface PlainSpace {
  index: number;
  name: string;
  type: "go" | "chance" | "chest" | "jail" | "gotojail" | "freeparking";
}

export type Space = PropertySpace | RailroadSpace | UtilitySpace | TaxSpace | PlainSpace;

const prop = (
  index: number,
  name: string,
  color: Color,
  price: number,
  rent: PropertySpace["rent"],
  houseCost: number
): PropertySpace => ({ index, name, type: "property", color, price, rent, houseCost });

export const BOARD: readonly Space[] = [
  { index: 0, name: "Go", type: "go" },
  prop(1, "Mediterranean Avenue", "brown", 60, [2, 10, 30, 90, 160, 250], 50),
  { index: 2, name: "Community Chest", type: "chest" },
  prop(3, "Baltic Avenue", "brown", 60, [4, 20, 60, 180, 320, 450], 50),
  { index: 4, name: "Income Tax", type: "tax", amount: 200 },
  { index: 5, name: "Reading Railroad", type: "railroad", price: 200 },
  prop(6, "Oriental Avenue", "lightblue", 100, [6, 30, 90, 270, 400, 550], 50),
  { index: 7, name: "Chance", type: "chance" },
  prop(8, "Vermont Avenue", "lightblue", 100, [6, 30, 90, 270, 400, 550], 50),
  prop(9, "Connecticut Avenue", "lightblue", 120, [8, 40, 100, 300, 450, 600], 50),
  { index: 10, name: "Jail / Just Visiting", type: "jail" },
  prop(11, "St. Charles Place", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
  { index: 12, name: "Electric Company", type: "utility", price: 150 },
  prop(13, "States Avenue", "pink", 140, [10, 50, 150, 450, 625, 750], 100),
  prop(14, "Virginia Avenue", "pink", 160, [12, 60, 180, 500, 700, 900], 100),
  { index: 15, name: "Pennsylvania Railroad", type: "railroad", price: 200 },
  prop(16, "St. James Place", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
  { index: 17, name: "Community Chest", type: "chest" },
  prop(18, "Tennessee Avenue", "orange", 180, [14, 70, 200, 550, 750, 950], 100),
  prop(19, "New York Avenue", "orange", 200, [16, 80, 220, 600, 800, 1000], 100),
  { index: 20, name: "Free Parking", type: "freeparking" },
  prop(21, "Kentucky Avenue", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
  { index: 22, name: "Chance", type: "chance" },
  prop(23, "Indiana Avenue", "red", 220, [18, 90, 250, 700, 875, 1050], 150),
  prop(24, "Illinois Avenue", "red", 240, [20, 100, 300, 750, 925, 1100], 150),
  { index: 25, name: "B&O Railroad", type: "railroad", price: 200 },
  prop(26, "Atlantic Avenue", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
  prop(27, "Ventnor Avenue", "yellow", 260, [22, 110, 330, 800, 975, 1150], 150),
  { index: 28, name: "Water Works", type: "utility", price: 150 },
  prop(29, "Marvin Gardens", "yellow", 280, [24, 120, 360, 850, 1025, 1200], 150),
  { index: 30, name: "Go To Jail", type: "gotojail" },
  prop(31, "Pacific Avenue", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
  prop(32, "North Carolina Avenue", "green", 300, [26, 130, 390, 900, 1100, 1275], 200),
  { index: 33, name: "Community Chest", type: "chest" },
  prop(34, "Pennsylvania Avenue", "green", 320, [28, 150, 450, 1000, 1200, 1400], 200),
  { index: 35, name: "Short Line Railroad", type: "railroad", price: 200 },
  { index: 36, name: "Chance", type: "chance" },
  prop(37, "Park Place", "darkblue", 350, [35, 175, 500, 1100, 1300, 1500], 200),
  { index: 38, name: "Luxury Tax", type: "tax", amount: 100 },
  prop(39, "Boardwalk", "darkblue", 400, [50, 200, 600, 1400, 1700, 2000], 200),
];

export const JAIL_INDEX = 10;
export const GO_SALARY = 200;
export const BAIL = 50;
export const TOTAL_HOUSES = 32;
export const TOTAL_HOTELS = 12;

export function isOwnable(space: Space): space is PropertySpace | RailroadSpace | UtilitySpace {
  return space.type === "property" || space.type === "railroad" || space.type === "utility";
}

/** Space indices in each color group, derived from the board. */
export const COLOR_GROUPS: Record<Color, number[]> = (() => {
  const groups = {} as Record<Color, number[]>;
  for (const s of BOARD) {
    if (s.type === "property") {
      (groups[s.color] ??= []).push(s.index);
    }
  }
  return groups;
})();

export const RAILROAD_INDICES = BOARD.filter((s) => s.type === "railroad").map((s) => s.index);
export const UTILITY_INDICES = BOARD.filter((s) => s.type === "utility").map((s) => s.index);
