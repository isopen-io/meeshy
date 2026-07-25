# Analysis — Iteration-207i — RequestsTab empty-state dedup

**Date:** 2026-07-21 · **Scope:** iOS only · **Status:** ✅ Resolved

## Context

Continuation of the empty-state design-system consolidation thread (178i `ShareLinksView`,
184i `TrackingLinksView`, 204i `VoiceProfileManageView`). Swept the Contacts tab family for
the last remaining custom empty-state reimplementing `EmptyStateView`, skipping components
already covered by open PRs (swarm up to 206i / #2224).

## Finding

The Contacts tabs are inconsistent:

| Tab | Empty state |
|---|---|
| `ContactsListTab` | `EmptyStateView` ✅ |
| `CallsTab` | `EmptyStateView` ✅ |
| `BlockedTab` | `EmptyStateView` ✅ |
| **`RequestsTab`** | **bespoke `VStack`** ❌ |

`RequestsTab.emptyState(icon:text:)` hand-rolled a `VStack { Spacer; Image(.largeTitle,
.light, gray-muted); Text(.callout); Spacer }` — the only Contacts tab not on the shared
primitive. It lacked the spring appear animation and auto-combined VoiceOver element, and used
a one-off gray-muted `.largeTitle` glyph instead of the design-system accent glyph.

## Resolution (completed 207i)

Collapsed the helper body to `EmptyStateView(icon: icon, title: text, subtitle: "")`, keeping
the `emptyState(icon:text:)` signature so both call sites (`received` "person.2.slash" / `sent`
"paperplane") stay identical. Non-compact, subtitle omitted (both states are title-only) — the
exact shape used by `ContactsListTab`.

### Rationale

- **Consistency** — unifies `RequestsTab` with its three sibling tabs.
- **Dedup** — 14 → 3 lines; one shared component.
- **Native polish** — spring animation + combined VoiceOver from the primitive.
- **Reuses existing i18n keys** (`contacts.requests.empty.received` / `.sent`) → 0 new keys.

## Verification status

- 1 file changed; `filterPills` / lists / rows / ViewModel / navigation untouched.
- 0 logic / 0 network / 0 new i18n key / 0 new test. `theme` still referenced (10 sites).
- Gate: CI **iOS Tests** (mirrors sibling-tab `EmptyStateView` adoption).

## ⚠️ Do NOT re-flag

`RequestsTab.emptyState` — native `EmptyStateView` adoption soldered in 207i. All four Contacts
tabs now share the primitive.

## Remaining improvements (future iterations)

- `MemberManagementSection.emptyState` — compact inline `VStack` with a fixed `.system(size:28)`
  glyph (carries an explicit "doctrine 90i fixed" comment; treat cautiously, verify swarm first).
- `RequestsTab` follow-up count-value a11y is N/A (empty states carry no counts).
