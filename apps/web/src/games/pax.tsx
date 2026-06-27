import {
  CARD_LIBRARY,
  EVENT_CARDS,
  getAdjacentRegions,
  type GameState,
  type Region,
  type RegionState,
  type BorderState,
  type PlayerState,
  type CardDefinition,
} from "@pax/engine";

// Custom Pax Pamir board renderer for the replay inspector. Ported from the
// original live spectator UI, but it now renders a single replay frame's snapshot
// (a full GameState) instead of a live WebSocket feed — no server, no controls.

const CARD_BY_ID = new Map(CARD_LIBRARY.map((c) => [c.id, c]));
const EVENT_BY_ID = new Map(EVENT_CARDS.map((c) => [c.id, c]));

const COALITION_COLORS: Record<string, { text: string; accent: string }> = {
  afghan: { text: "#a8e6a1", accent: "#4caf50" },
  british: { text: "#e6a1a1", accent: "#ef5350" },
  russian: { text: "#e6dda1", accent: "#fdd835" },
  none: { text: "#999", accent: "#666" },
};
const SUIT_COLORS: Record<string, string> = {
  political: "#a78bfa", intelligence: "#60a5fa", economic: "#fbbf24", military: "#f87171",
};
const IMPACT_LABELS: Record<string, string> = {
  spy: "Spy", army: "Army", road: "Road", tribe: "Tribe", leverage: "+2R",
  suit_political: "Fav:Pol", suit_intelligence: "Fav:Int", suit_economic: "Fav:Eco", suit_military: "Fav:Mil",
};
const ACTION_LABELS: Record<string, string> = {
  tax: "Tax", gift: "Gift", build: "Bld", move: "Mov", battle: "Btl", betray: "Bty", spy: "Spy",
};
const COALITIONS = ["afghan", "british", "russian"] as const;
const REGION_ORDER: string[] = ["transcaspia", "kabul", "punjab", "persia", "herat", "kandahar"];

function PassiveIndicator({ effects }: { effects: CardDefinition["effects"] }) {
  if (!effects || effects.length === 0) return null;
  return (
    <span title={effects.map((e) => e.ruleText).join("\n")} style={{ display: "inline-block", background: "#7c3aed", color: "#fff", borderRadius: 3, padding: "0 4px", fontSize: 8, fontWeight: 700, cursor: "help" }}>P</span>
  );
}

function RupeeBadge({ count }: { count: number }) {
  return (
    <div style={{ position: "absolute", top: -6, right: -6, background: "#fbbf24", color: "#000", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, border: "2px solid #1e293b" }} title={`${count} rupee${count > 1 ? "s" : ""}`}>{count}</div>
  );
}

function RegionCard({ region, borders }: { region: RegionState; borders: BorderState[] }) {
  const adjacent = getAdjacentRegions(region.id as Region);
  const totalArmies = region.armies.afghan + region.armies.british + region.armies.russian;
  const regionBorders = borders.filter((b) => b.regions[0] === region.id || b.regions[1] === region.id);
  return (
    <div style={{ background: "#16213e", border: "1px solid #334155", borderRadius: 8, padding: "10px 12px", minHeight: 100 }}>
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#94a3b8", marginBottom: 6 }}>{region.id}</div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6, alignItems: "center" }}>
        <span style={{ fontSize: 9, color: "#475569", width: 36 }}>Armies</span>
        {COALITIONS.map((c) => Array.from({ length: region.armies[c] }, (_, i) => (
          <span key={`a-${c}-${i}`} style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: COALITION_COLORS[c].accent, border: "1px solid rgba(255,255,255,0.2)" }} title={`${c} army`} />
        )))}
        {totalArmies === 0 && <span style={{ fontSize: 10, color: "#475569" }}>none</span>}
      </div>
      <div style={{ marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: "#475569" }}>Roads</span>
        {regionBorders.map((border) => {
          const other = border.regions[0] === region.id ? border.regions[1] : border.regions[0];
          const total = border.roads.afghan + border.roads.british + border.roads.russian;
          if (total === 0) return null;
          return (
            <div key={border.id} style={{ display: "flex", gap: 3, alignItems: "center", marginTop: 2, marginLeft: 4 }}>
              <span style={{ fontSize: 8, color: "#475569", minWidth: 55 }}>to {other}</span>
              {COALITIONS.map((c) => Array.from({ length: border.roads[c] }, (_, i) => (
                <span key={`r-${c}-${i}`} style={{ display: "inline-block", width: 14, height: 4, borderRadius: 2, background: COALITION_COLORS[c].accent }} title={`${c} road`} />
              )))}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: "#475569" }}>Borders: {adjacent.join(", ")}</div>
    </div>
  );
}

function MarketCard({ cardId, cost, rupeesOn }: { cardId: string; cost: number; rupeesOn: number }) {
  const courtCard = CARD_BY_ID.get(cardId);
  const eventCard = EVENT_BY_ID.get(cardId);
  if (eventCard) {
    const isDom = eventCard.type === "dominance_check";
    return (
      <div style={{ background: isDom ? "#4a1525" : "#1a3545", border: `1px solid ${isDom ? "#ef535080" : "#42a5f580"}`, borderLeft: `3px solid ${isDom ? "#ef5350" : "#42a5f5"}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, minWidth: 130, flex: 1, position: "relative" }}>
        {rupeesOn > 0 && <RupeeBadge count={rupeesOn} />}
        <div style={{ fontWeight: 600, fontSize: 12, color: isDom ? "#fca5a5" : "#93c5fd", marginBottom: 3 }}>{eventCard.name}</div>
        <div style={{ fontSize: 9, color: "#94a3b8" }}>EVENT</div>
        <div style={{ color: "#64748b", fontSize: 10, marginTop: 3 }}>Cost: {cost}</div>
      </div>
    );
  }
  if (!courtCard) return <div style={{ background: "#222", borderRadius: 6, padding: 8, flex: 1, minWidth: 130 }}>?</div>;
  const colors = COALITION_COLORS[courtCard.coalition];
  return (
    <div style={{ background: "#1e293b", border: `1px solid ${colors.accent}40`, borderLeft: `3px solid ${colors.accent}`, borderRadius: 6, padding: "8px 10px", fontSize: 12, minWidth: 130, flex: 1, position: "relative" }}>
      {rupeesOn > 0 && <RupeeBadge count={rupeesOn} />}
      <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3, color: "#e2e8f0" }}>{courtCard.name}</div>
      <div style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 2 }}>
        <span style={{ background: SUIT_COLORS[courtCard.suit] + "33", color: SUIT_COLORS[courtCard.suit], borderRadius: 3, padding: "0 5px", fontSize: 9, fontWeight: 700 }}>{courtCard.suit.slice(0, 3).toUpperCase()}</span>
        {courtCard.coalition !== "none" && <span style={{ color: colors.accent, fontSize: 10 }}>{courtCard.coalition}</span>}
        <span style={{ color: "#94a3b8", fontSize: 10 }}>R{courtCard.rank}</span>
        {courtCard.stars > 0 && <span style={{ color: "#fbbf24", fontSize: 10 }}>{"*".repeat(courtCard.stars)}</span>}
        <PassiveIndicator effects={courtCard.effects} />
      </div>
      {courtCard.impactIcons.length > 0 && (
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", marginBottom: 2 }}>
          <span style={{ fontSize: 8, color: "#475569" }}>Impact:</span>
          {courtCard.impactIcons.map((icon, i) => (
            <span key={`${icon}-${i}`} style={{ background: "#334155", borderRadius: 2, padding: "0 3px", fontSize: 8, color: "#94a3b8" }}>{IMPACT_LABELS[icon] ?? icon}</span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
        {courtCard.actionIcons.map((icon) => (
          <span key={icon} style={{ background: "#0f172a", border: "1px solid #475569", borderRadius: 3, padding: "0 4px", fontSize: 8, color: "#cbd5e1" }}>{ACTION_LABELS[icon] ?? icon}</span>
        ))}
      </div>
      <div style={{ color: "#64748b", fontSize: 10, marginTop: 3 }}>Cost: {cost}</div>
    </div>
  );
}

function CourtCardMini({ cardId, spies }: { cardId: string; spies: Record<string, number> }) {
  const card = CARD_BY_ID.get(cardId);
  if (!card) return null;
  const colors = COALITION_COLORS[card.coalition];
  const totalSpies = Object.values(spies).reduce((a, b) => a + b, 0);
  return (
    <div style={{ background: "#1e293b", border: `1px solid ${colors.accent}55`, borderLeft: `2px solid ${colors.accent}`, borderRadius: 4, padding: "3px 6px", fontSize: 10, lineHeight: 1.3, position: "relative" }}>
      <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
        <span style={{ fontWeight: 600, color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 90 }}>{card.name}</span>
        <span style={{ color: "#94a3b8", fontSize: 8 }}>R{card.rank}</span>
      </div>
      <div style={{ display: "flex", gap: 3, marginTop: 1 }}>
        <span style={{ color: SUIT_COLORS[card.suit], fontSize: 8, fontWeight: 700 }}>{card.suit.slice(0, 3).toUpperCase()}</span>
        {card.actionIcons.slice(0, 4).map((icon) => (<span key={icon} style={{ fontSize: 7, color: "#64748b" }}>{ACTION_LABELS[icon]}</span>))}
      </div>
      {totalSpies > 0 && (
        <div style={{ position: "absolute", top: -4, right: -4, background: "#7c3aed", color: "#fff", borderRadius: "50%", width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }} title={Object.entries(spies).map(([p, c]) => `${p}: ${c}`).join(", ")}>{totalSpies}</div>
      )}
    </div>
  );
}

function PlayerStrip({ player, isCurrent }: { player: PlayerState; isCurrent: boolean }) {
  const colors = COALITION_COLORS[player.coalition];
  return (
    <div style={{ background: isCurrent ? `${colors.accent}22` : "#0f172a", border: `1px solid ${isCurrent ? colors.accent : "#334155"}`, borderRadius: 8, padding: "8px 12px", flex: 1, minWidth: 200 }}>
      {player.court.length > 0 ? (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
          {player.court.map((cardId) => (<CourtCardMini key={cardId} cardId={cardId} spies={player.courtCardSpies[cardId] ?? {}} />))}
        </div>
      ) : <div style={{ fontSize: 10, color: "#475569", marginBottom: 6 }}>No court cards</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.accent, display: "inline-block" }} />
        <span style={{ fontWeight: 700, fontSize: 13, color: isCurrent ? colors.text : "#94a3b8" }}>{player.id}</span>
        <span style={{ fontSize: 10, color: colors.accent }}>{player.coalition !== "none" ? player.coalition : ""}</span>
        {isCurrent && <span style={{ fontSize: 9, color: colors.accent, fontWeight: 700, marginLeft: "auto" }}>ACTIVE</span>}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
        <span style={{ color: "#fbbf24" }}>{player.rupees} rupees</span>
        {" | "}<span style={{ color: "#a78bfa" }}>{player.victoryPoints} VP</span>
        {" | "}Loyalty: {player.loyalty}
        {" | "}Gifts: {player.giftsCylinders}
      </div>
      {player.hand.length > 0 && (
        <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #1e293b" }}>
          <span style={{ fontSize: 9, color: "#475569" }}>Hand:</span>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 2 }}>
            {player.hand.map((cardId) => {
              const card = CARD_BY_ID.get(cardId);
              return <div key={cardId} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 4, padding: "2px 5px", fontSize: 9, color: "#64748b", fontStyle: "italic" }}>{card?.name ?? cardId}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function PaxBoard({ snapshot }: { snapshot: unknown }) {
  const s = snapshot as GameState;
  const rupeesOn = s.rupeesOnMarketCards ?? {};
  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 11, color: "#94a3b8", flexWrap: "wrap", alignItems: "center" }}>
        <span>Phase: <strong style={{ color: "#e2e8f0" }}>{s.phase}</strong></span>
        <span>Turn: <strong style={{ color: "#e2e8f0" }}>{s.turn}</strong></span>
        <span>Actions: <strong style={{ color: "#fbbf24" }}>{s.actionPointsRemaining}</strong></span>
        <span>Deck: <strong style={{ color: "#e2e8f0" }}>{s.deckCount}</strong></span>
        <span>Dom checks: <strong style={{ color: "#e2e8f0" }}>{s.dominanceChecksRemaining}</strong></span>
        <span>Favored: <strong style={{ color: SUIT_COLORS[s.favoredSuit] ?? "#94a3b8" }}>{s.favoredSuit}</strong></span>
        {s.isFinished && <span style={{ color: "#4caf50", fontWeight: 700 }}>GAME OVER{s.winnerPlayerId ? ` — ${s.winnerPlayerId} wins` : ""}</span>}
      </div>

      <div style={{ fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Regions</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
        {REGION_ORDER.map((rid) => {
          const region = s.board.find((r) => r.id === rid);
          return region ? <RegionCard key={rid} region={region} borders={s.borders} /> : null;
        })}
      </div>

      <div style={{ fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Market</div>
      <div style={{ marginBottom: 12 }}>
        {s.marketRows.map((row, rowIdx) => (
          <div key={`row-${rowIdx}`} style={{ display: "flex", gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: "#475569", minWidth: 14, paddingTop: 8 }}>{rowIdx + 1}</span>
            {row.map((cardId, colIdx) => (
              <MarketCard key={`${rowIdx}-${colIdx}-${cardId}`} cardId={cardId} cost={colIdx} rupeesOn={rupeesOn[cardId] ?? 0} />
            ))}
            {row.length === 0 && <span style={{ fontSize: 10, color: "#475569", paddingTop: 8 }}>(empty)</span>}
          </div>
        ))}
      </div>

      <div style={{ fontWeight: 700, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Players</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {s.players.map((player) => (<PlayerStrip key={player.id} player={player} isCurrent={player.id === s.currentPlayerId} />))}
      </div>
    </div>
  );
}
