# TODOs

The platform roadmap (Phases 0–6) lives in `STATUS.md`. This file tracks the
**Pax rules-completion** parallel track — the engine's rules are still partial,
which makes Pax win-rate numbers noisy until addressed. These are independent of
the multi-game platform work.

> Note: this is now a standalone repo (github.com/mickster77/my-pax), not a
> contribution to the upstream djfracking/pax. The former "communicate with repo
> owner before PR2" item no longer applies and has been removed.

## Piece Pool Limits
**What:** Add finite piece pool tracking (12 armies, 6 roads per coalition per PP2e) and enforce limits on build_army/build_road.
**Why:** Battle balance depends on scarcity. Without limits, building has no strategic cost and battle outcomes don't matter as much.
**Context:** The current engine allows infinite pieces. Fix requires adding pool counts to GameState and checking in getLegalActionChoices + applyAction.
**Depends on:** Nothing. Independent change.

## Court Card Limits
**What:** Enforce court card limits based on player influence level.
**Why:** Court size is a key resource constraint in PP2e. Without it, players can hoard unlimited cards, breaking play_card and betray balance.
**Context:** PP2e ties court size to influence track. Betray (removing opponent cards) frees slots, making it strategically meaningful.
**Depends on:** Influence system.

## Card Special Effects
**What:** Implement the ~30 court-card special abilities. The `effects: [{hook, ruleText}]` schema in cards.ts is currently inert data — wire a hook→handler dispatch table fired at the right timing windows (on_play, on_battle, dominance_check, etc.).
**Why:** Special abilities are the most game-defining content; without them Pax strategy is incomplete and any win-rate analysis is unrepresentative.
**Depends on:** Nothing structural; the schema already exists.

## Turn Structure Audit
**What:** Audit and correct the turn/action-point model against PP2e rules. PP2e distinguishes "card actions" (using court card icons) from other types, and some actions (like take_rupee) may not be standard actions.
**Why:** Wrong turn structure means every action's legality generation is subtly wrong. The current engine treats all actions as "1 AP" uniformly.
**Depends on:** Rulebook verification.
