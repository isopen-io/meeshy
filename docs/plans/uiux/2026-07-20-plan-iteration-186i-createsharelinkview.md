# Plan — Iteration-186i — `CreateShareLinkView` VoiceOver header traits

**Base:** `main` HEAD (resync after 179i merge, #2125)
**Working branch:** `claude/laughing-thompson-9z9lzu`
**Scope:** iOS only — accessibility, 1 file, 0 logic

## Goal

Make the five `formSection` group titles of the create-share-link sheet
reachable via the VoiceOver "Headings" rotor, announced in natural case, with
the decorative accent glyph hidden — mirroring the six already-polished sibling
screens.

## Steps

1. [x] Sync branch to `main` HEAD; confirm swarm collision-free (185i highest in
   flight, `CreateShareLinkView` untouched, `list_pull_requests`).
2. [x] Confirm view is unaudited (tracking pointer) and test-free (`grep`).
3. [x] Edit `formSection` helper: `.accessibilityHidden(true)` on icon,
   `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(title)` +
   `.accessibilityAddTraits(.isHeader)` on the header `HStack`.
4. [x] Write analysis `docs/analyses/uiux/2026-07-20-iteration-186i-createsharelinkview.md`.
5. [ ] Commit + push branch.
6. [ ] Update `branch-tracking.md` pointer to 186i.

## Risk

Minimal. One helper, applies to all five sections, `0` visual change, `0`
call-site edits, `0` new i18n key, `0` new test. Gate = CI `iOS Tests`.
# Plan — Iteration-186i — VoiceOver structure for CreateShareLinkView

**Date:** 2026-07-20
**Scope:** iOS only — `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift`
**Base:** `main` HEAD `5c55a06`
**Branch:** `claude/laughing-thompson-u5ule2`

## Goal

Add a complete VoiceOver structure to the share-link creation form (previously
0 accessibility annotations), without any visual, logic, or localization change.

## Steps

1. **Conversation picker button** (`conversationSection`) — stateful
   `.accessibilityLabel` (selected `"{name}, {type}"` / empty
   `choose_group`) + `.accessibilityHint`; hide the trailing chevron.
2. **`iconBadge` helper** — `.accessibilityHidden(true)` (covers all rule
   toggles, both limit rows, the conversation type icon).
3. **`formSection` header** — hide decorative icon, add `.isHeader` to title.
4. **`formTextField`** — hide the visible label from VoiceOver, set
   `.accessibilityLabel(label)` on the `TextField` (stop placeholder-as-name).
5. **`ConversationPickerSheet` rows** — `.combine` + `.isSelected` trait, hide
   the decorative checkmark glyph.

## Constraints

- No `.xcstrings` edit — 1 new key inline as `defaultValue`
  (`share.link.create.conversation.a11yHint`); all others reuse existing keys.
- No logic/visual change; reuse existing `displayLabel` for the selected label.
- Idioms copied from shipped `NewConversationView` (`.isSelected` rows),
  `EmailVerificationView` (`.isHeader`), `ContactsListTab` (combine).

## Validation

- CI `iOS Tests` (macOS) is the gate — Linux container cannot build iOS.
- No test references the view (grep verified); 0 open-PR contention.
