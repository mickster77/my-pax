// Catan board geometry, generated from hex corner coordinates and deduplicated.
//
// The standard board is 19 hexes in a radius-2 hexagon. Generating the 54 nodes
// (intersections) and 72 edges programmatically — rather than hand-listing them —
// is far less error-prone: we place each hex's 6 corners in the plane, round to a
// stable key, and dedupe. Everything here is static (the same for every game);
// only the resource/number assignment is randomized per game (see engine.ts).

/** Axial coordinates of the 19 hexes: all (q, r) with max(|q|,|r|,|q+r|) <= 2. */
export const HEX_AXIAL: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let q = -2; q <= 2; q += 1) {
    for (let r = -2; r <= 2; r += 1) {
      if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) <= 2) out.push([q, r]);
    }
  }
  return out;
})();

export const HEX_COUNT = HEX_AXIAL.length; // 19

function hexCenter(q: number, r: number): [number, number] {
  return [Math.sqrt(3) * (q + r / 2), 1.5 * r];
}

function hexCorners(q: number, r: number): Array<[number, number]> {
  const [cx, cy] = hexCenter(q, r);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 30); // pointy-top
    pts.push([cx + Math.cos(angle), cy + Math.sin(angle)]);
  }
  return pts;
}

// Corner coordinates are exact half-integers in the (x/√3, y) basis, so key on
// integers (2·x/√3, 2·y) with Math.round snapping away float error. This makes
// dedup exact — toFixed rounding split/merged vertices incorrectly.
const keyOf = (x: number, y: number): string =>
  `${Math.round((2 * x) / Math.sqrt(3))},${Math.round(2 * y)}`;

interface Geometry {
  /** Number of intersection nodes (54). */
  nodeCount: number;
  /** Hex indices touching each node (1-3 hexes). */
  nodeHexes: number[][];
  /** Adjacent node ids for each node (via an edge). */
  nodeAdjacency: number[][];
  /** Edge ids touching each node. */
  nodeEdges: number[][];
  /** Each edge as a pair of node ids (a < b). */
  edges: Array<[number, number]>;
  /** Node ids forming each hex's 6 corners. */
  hexNodes: number[][];
  /** Float (x, y) position of each node, for port ordering / rendering. */
  nodeXY: Array<[number, number]>;
}

const GEOMETRY: Geometry = (() => {
  const nodeKeyToId = new Map<string, number>();
  const nodeHexes: number[][] = [];
  const hexNodes: number[][] = [];
  const nodeXY: Array<[number, number]> = [];

  const nodeId = (x: number, y: number): number => {
    const k = keyOf(x, y);
    let id = nodeKeyToId.get(k);
    if (id === undefined) {
      id = nodeKeyToId.size;
      nodeKeyToId.set(k, id);
      nodeHexes.push([]);
      nodeXY.push([x, y]);
    }
    return id;
  };

  HEX_AXIAL.forEach(([q, r], hi) => {
    const corners = hexCorners(q, r).map(([x, y]) => nodeId(x, y));
    hexNodes.push(corners);
    for (const n of corners) if (!nodeHexes[n].includes(hi)) nodeHexes[n].push(hi);
  });

  const nodeCount = nodeKeyToId.size;

  const edgeKeyToId = new Map<string, number>();
  const edges: Array<[number, number]> = [];
  for (const corners of hexNodes) {
    for (let i = 0; i < 6; i += 1) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const k = `${lo}-${hi}`;
      if (!edgeKeyToId.has(k)) {
        edgeKeyToId.set(k, edges.length);
        edges.push([lo, hi]);
      }
    }
  }

  const nodeAdjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  const nodeEdges: number[][] = Array.from({ length: nodeCount }, () => []);
  edges.forEach(([a, b], ei) => {
    nodeAdjacency[a].push(b);
    nodeAdjacency[b].push(a);
    nodeEdges[a].push(ei);
    nodeEdges[b].push(ei);
  });

  return { nodeCount, nodeHexes, nodeAdjacency, nodeEdges, edges, hexNodes, nodeXY };
})();

export const NODE_COUNT = GEOMETRY.nodeCount; // 54
export const EDGE_COUNT = GEOMETRY.edges.length; // 72
export const NODE_HEXES = GEOMETRY.nodeHexes;
export const NODE_ADJACENCY = GEOMETRY.nodeAdjacency;
export const NODE_EDGES = GEOMETRY.nodeEdges;
export const EDGES = GEOMETRY.edges;
export const HEX_NODES = GEOMETRY.hexNodes;
export const NODE_XY = GEOMETRY.nodeXY;

/** The two node ids of an edge. */
export function edgeNodes(edgeId: number): [number, number] {
  return EDGES[edgeId];
}

/** Find the edge id between two nodes, or -1 if they aren't adjacent. */
export function edgeBetween(a: number, b: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return EDGES.findIndex(([x, y]) => x === lo && y === hi);
}

/** Coastal nodes touch fewer than 3 hexes; ports attach here. */
export const COASTAL_NODES: number[] = NODE_HEXES.map((hexes, id) => (hexes.length < 3 ? id : -1)).filter(
  (id) => id >= 0
);
