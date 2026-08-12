# Plan — Iteration 208i — `organizationSection` info-token consolidation

**Branch**: `claude/laughing-thompson-n4b0kv` (base `main` HEAD `22465a5`)
**File**: `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`

## Goal
Replace the two raw `"3B82F6"` hex literals in `organizationSection` with the semantic
`MeeshyColors.infoHex` token, so the section header + pin icon match the `MeeshyColors.info` accent
already used by the section's toggle tint, category/tags badges, and pickers.

## Steps
1. [x] Reset working branch to latest `origin/main`.
2. [x] Locate the two `"3B82F6"` occurrences in `organizationSection` (`settingsSection(color:)`
   header + `settingsToggleRow(iconColor:)` pin icon).
3. [x] Swap both to `MeeshyColors.infoHex`.
4. [x] Verify no `"3B82F6"` remains; confirm all 7 section color refs now resolve to `info`.
5. [x] Confirm `MeeshyUI` import present and `MeeshyColors.infoHex` is the canonical info hex string.
6. [x] Confirm no test references the component; no open-PR collision on the file.
7. [x] Write analysis + plan + tracking-doc pointer.
8. [ ] Commit + push; open/update PR. Gate = CI `iOS Tests`.

## Risk
Minimal. Two `String → String` swaps to an existing, widely-used design-system constant. No API
signature, import, logic, layout, i18n, or test change. Only visual delta: header/pin blue
`#3B82F6 → #60A5FA` (deliberate consolidation to the card's own accent).
