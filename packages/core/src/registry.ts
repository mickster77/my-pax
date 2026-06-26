import type { GameDefinition } from "./types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGame = GameDefinition<any, any, any>;

/**
 * Maps a game id to its definition. The lab/viewer look games up here by id, so
 * adding a game to the platform is: implement GameDefinition, then register it.
 */
export class GameRegistry {
  private readonly games = new Map<string, AnyGame>();

  register(def: AnyGame): this {
    if (this.games.has(def.id)) throw new Error(`Game "${def.id}" is already registered`);
    this.games.set(def.id, def);
    return this;
  }

  has(id: string): boolean {
    return this.games.has(id);
  }

  get(id: string): AnyGame {
    const def = this.games.get(id);
    if (!def) throw new Error(`Unknown game "${id}". Registered: ${this.ids().join(", ") || "(none)"}`);
    return def;
  }

  ids(): string[] {
    return [...this.games.keys()];
  }

  list(): AnyGame[] {
    return [...this.games.values()];
  }
}
