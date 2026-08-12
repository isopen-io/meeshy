# Iteration 208i — `ConversationPreferencesTab.organizationSection` info-token consolidation

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Scope**: 1 file, 2 lines. 0 logic / 0 network / 0 new i18n key / 0 new test / 0 layout change.
**Defect class**: raw hex literal vs semantic token — *internal* color incoherence within a single section.

## Context

`ConversationPreferencesTab` is the "Préférences" tab of `ConversationInfoSheet`. Its
`organizationSection` (Pin / Category / Tags) is a self-contained settings card. The card is built
almost entirely on the semantic `MeeshyColors.info` token:

| Element | Color source (before) |
|---|---|
| Section header (icon + label + surface gradient + border) | **`"3B82F6"`** (raw hex, Tailwind blue-500) |
| Pin toggle icon badge | **`"3B82F6"`** (raw hex) |
| Pin toggle tint | `MeeshyColors.info` |
| Category badge icon + fill | `MeeshyColors.info` |
| `CategoryPickerField` accent | `MeeshyColors.info` |
| Tags badge icon + fill | `MeeshyColors.info` |
| `TagInputField` accent | `MeeshyColors.info` |

Two of the seven color references — the **section header** (driven through `settingsSection(color:)`,
which feeds the header glyph/label, the card `surfaceGradient(tint:)` and `border(tint:)`) and the
**pin icon badge** (`settingsToggleRow(iconColor:)`) — hardcoded the raw hex `"3B82F6"`
(`#3B82F6`, Tailwind blue-500), while every other element in the *same* card already uses
`MeeshyColors.info` (`#60A5FA`, blue-400). Two visibly different blues shared one card.

This is a **double defect**:
1. **Brand**: raw hex bypasses the design-system token layer (project rule: prefer semantic tokens).
2. **Internal incoherence**: the header/pin accent (`#3B82F6`) does not match the card's own
   toggle/picker accent (`#60A5FA`). The section header should be the *same* blue as the content it
   frames.

Explicitly listed as remaining work in the 199i pointer:
> `organizationSection` `3B82F6` (incohérence interne — les toggles utilisent déjà `MeeshyColors.info`)

## Fix

Two type-identical `String → String` swaps, both feeding `Color(hex:)` /
`ThemeManager.surfaceGradient(tint:)` / `border(tint:)`:

- `settingsSection(..., color: "3B82F6")` → `color: MeeshyColors.infoHex`
- `settingsToggleRow(icon: "pin.fill", iconColor: "3B82F6", ...)` → `iconColor: MeeshyColors.infoHex`

`MeeshyColors.infoHex = "60A5FA"` is the canonical hex-string form of the `info` token, already the
established argument to this exact `settingsSection(color:)` / `settingsRow(color:)` builder family
across the app (`SettingsView`, `NotificationSettingsView`, `PrivacySettingsView`, `SupportView`,
`AboutView`, `ReportUserView`). `MeeshyColors` is already imported (`import MeeshyUI`, line 3;
`.info` already referenced within this same section).

After the fix the entire `organizationSection` resolves to one token (`info`): header, pin icon, pin
tint, category badge, tags badge, and both pickers. Full internal coherence, semantic token in place
of a raw literal.

### Assumed visual change
`#3B82F6` → `#60A5FA` on the header + pin icon only: a slightly lighter blue, aligning them to the
card's existing accent. This is a deliberate brand consolidation (removes the two-blues clash),
consistent with the token-consolidation doctrine of siblings 175i (`DataStorageView`) / 182i.

## Non-goals (remaining, 1 per iteration — distinct design judgment each)
- `notificationsSection` header `"FF6B6B"` (coral legacy) — its toggle tints are `MeeshyColors.error`.
- `actionsSection` header `"6B7280"` (neutral gray; the row icons `F59E0B`/`F97316`/`F87171` are
  semantic warning/error — a separate judgment call).
- `displaySection` "My display" already solved 199i (adopts conversation `accentColor`).

## Verification
- Grep confirms zero `"3B82F6"` remains in the file; all seven `organizationSection` color refs now
  resolve to `info`.
- No test references `ConversationPreferencesTab` (grep `*Tests*` = 0).
- `ConversationPreferencesTab.swift` is a modified file in **zero** open PRs (the PRs citing it —
  #2199/#2224 — reference it as sibling prior-art only; #2199 touched `displaySection`, not
  `organizationSection`).
- iOS build not runnable under Linux (no Xcode/Swift toolchain) → gate = CI `iOS Tests`
  (compile Xcode 26.1.1 / Swift 6.2, run sim iOS 18.2).
