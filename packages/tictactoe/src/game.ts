import type { GameDefinition, GameResult, PlayerId } from "@lab/core";

// The canonical minimal example of a platform game — the template to copy when
// adding a new game. Tic-tac-toe: two players, no randomness, no hidden info,
// fully observable. It implements the whole GameDefinition contract in ~80 lines
// and passes the conformance suite. See docs/ADDING_A_GAME.md.

export type Mark = 0 | 1;

export interface TicTacToeState {
  playerIds: [string, string];
  cells: Array<Mark | null>; // 9 cells, row-major
  current: Mark; // index into playerIds of the player to move
  winner: Mark | null;
  finished: boolean;
  moves: number;
}

export type TicTacToeAction = { type: "place"; playerId: string; cell: number };
export type TicTacToeObservation = TicTacToeState;

const WIN_LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6], // diagonals
];

function clone(state: TicTacToeState): TicTacToeState {
  const sc = (globalThis as { structuredClone?: <T>(v: T) => T }).structuredClone;
  return sc ? sc(state) : (JSON.parse(JSON.stringify(state)) as TicTacToeState);
}

function winnerOf(cells: Array<Mark | null>): Mark | null {
  for (const [a, b, c] of WIN_LINES) {
    if (cells[a] !== null && cells[a] === cells[b] && cells[b] === cells[c]) return cells[a];
  }
  return null;
}

export const ticTacToeGame: GameDefinition<TicTacToeState, TicTacToeAction, TicTacToeObservation> = {
  id: "tictactoe",
  meta: { name: "Tic-Tac-Toe", minPlayers: 2, maxPlayers: 2 },

  createInitialState(playerIds) {
    return {
      playerIds: [playerIds[0], playerIds[1]],
      cells: Array<Mark | null>(9).fill(null),
      current: 0,
      winner: null,
      finished: false,
      moves: 0,
    };
  },

  currentPlayer: (state) => (state.finished ? null : state.playerIds[state.current]),

  isTerminal: (state) => state.finished,

  getLegalActions(state, playerId) {
    if (state.finished || state.playerIds[state.current] !== playerId) return [];
    const actions: TicTacToeAction[] = [];
    for (let cell = 0; cell < 9; cell += 1) {
      if (state.cells[cell] === null) actions.push({ type: "place", playerId, cell });
    }
    return actions;
  },

  applyAction(state, action) {
    const next = clone(state);
    if (next.playerIds[next.current] !== action.playerId) throw new Error("Not your turn");
    if (next.cells[action.cell] !== null) throw new Error("Cell taken");
    next.cells[action.cell] = next.current;
    next.moves += 1;
    const w = winnerOf(next.cells);
    if (w !== null) {
      next.winner = w;
      next.finished = true;
    } else if (next.moves === 9) {
      next.finished = true; // draw
    } else {
      next.current = next.current === 0 ? 1 : 0;
    }
    return next;
  },

  observe: (state) => clone(state),

  result(state): GameResult {
    const scores: Record<PlayerId, number> = {
      [state.playerIds[0]]: 0,
      [state.playerIds[1]]: 0,
    };
    if (state.winner !== null) scores[state.playerIds[state.winner]] = 1;
    return {
      winnerIds: state.winner !== null ? [state.playerIds[state.winner]] : [],
      scores,
      turns: state.moves,
      endReason: !state.finished ? "unfinished" : state.winner !== null ? "victory" : "draw",
    };
  },

  describeAction: (_state, action) => `place ${action.cell}`,
};
