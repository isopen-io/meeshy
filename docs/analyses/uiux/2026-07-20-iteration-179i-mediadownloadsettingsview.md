# Iteration-179i — Brand-color consolidation + VoiceOver headers for `MediaDownloadSettingsView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Design system (brand-color tokenization) + Accessibility (VoiceOver section headers)
**File touched:** `apps/ios/Meeshy/Features/Main/Views/MediaDownloadSettingsView.swift` (1 file, 0 logic, 0 new i18n key, 0 new test)

## Component

`MediaDownloadSettingsView` is the settings screen (Settings → « Téléchargement
auto ») that lets the user pick an `AutoDownloadPolicy`
(always / wifi+good-cellular / wifi-only / never) **per media type** — Images,
Audio, Traductions audio, Video. Each media type renders a titled section with
a colored SF-Symbol chip and four selectable policy rows; an info section at the
top explains the feature.

The screen was already **100 % localized** (17 `String(localized:defaultValue:)`
call sites) and uses **only Dynamic-Type fonts** (`MeeshyFont.relative(...)`
throughout). The policy rows already carried `.accessibilityLabel` +
`.isSelected`, and the back button + header were already sound. i18n, Dynamic
Type, and row-level VoiceOver were therefore **not** the gap.

## Findings

### 1. Off-brand hardcoded palette (systemic — primary finding)

The Meeshy brand is Indigo (`#6366F1` → `#4338CA`); `apps/ios/CLAUDE.md` is
explicit: *"New code MUST use the Indigo scale or semantic names."* This screen
was **internally inconsistent** — two of its four media chips already used brand
tokens, the other two hardcoded raw "Flat-UI" hex, and the screen accent was an
off-brand carrot orange:

| Site | Before | Nature |
|------|--------|--------|
| `accentColor` (back button, info-icon, checkmarks) | `"E67E22"` | off-brand carrot orange |
| Images chip (line 74) | `MeeshyColors.brandPrimaryHex` | ✅ already on-brand |
| Audio chip (line 78) | `MeeshyColors.indigo600Hex` | ✅ already on-brand |
| Traductions audio chip (line 82) | `"F39C12"` | off-brand orange |
| Video chip (line 86) | `"E74C3C"` | off-brand red |
| Info header + background tint (×2) | `"6B7280"` | raw literal == `neutral500Hex` |

The screen accent (orange) also diverged from every other settings screen in the
app, which use Indigo for the back button and selection checkmarks.

### 2. Section headers not exposed as VoiceOver headers

`sectionHeader(title:icon:color:)` (rendered 5×: Information + the 4 media
types) was a plain `HStack` with no `.isHeader` trait. A VoiceOver user could
not jump between sections with the rotor's "Headings" mode, and the decorative
leading SF-Symbol was an unlabelled extra stop. The visually-uppercased title
(`title.uppercased()`) also risked being read letter-by-letter.

## Fixes applied

**Color tokenization — coherent Indigo scale ladder + semantic neutral:**

- `accentColor "E67E22"` → `MeeshyColors.brandPrimaryHex` (indigo500) — the
  standard app-wide settings-screen accent; unifies the back button, info-icon,
  and policy-row checkmarks with the rest of Settings.
- Traductions-audio chip `"F39C12"` → `MeeshyColors.indigo400Hex`.
- Video chip `"E74C3C"` → `MeeshyColors.indigo300Hex`.
- Both `"6B7280"` grays → `MeeshyColors.neutral500Hex` (**exact same hex →
  zero visual change**, pure tokenization).

Result: the four media chips form an on-brand Indigo ladder
(**images 500 · audio 600 · traductions 400 · video 300**) — still visibly
differentiated per type, no raw off-brand hex remaining, and no semantic misuse
(warning/error tokens were deliberately *not* used for decorative category
chips).

**VoiceOver headers** (additive, `sectionHeader`):

- `.accessibilityElement(children: .combine)` + `.accessibilityLabel(title)`
  (natural case, not the uppercased visual) + `.accessibilityAddTraits(.isHeader)`
  → each of the 5 sections is now a rotor "Heading" and reads its title cleanly.
- `.accessibilityHidden(true)` on the decorative leading icon → one clean stop
  instead of an unlabelled glyph.

## Scope & risk

1 file. **Zero logic change** — every edit swaps a hex `String` literal for an
existing `MeeshyColors` hex `String` constant (type-identical, all four tokens
verified present in `MeeshyUI/Theme/MeeshyColors.swift`), plus three additive
accessibility modifiers. No public API, no binding, no store change. No test
references the view. New code path count unchanged.

Gate = CI `iOS Tests`.

## Remaining / follow-up (out of scope this iteration)

The same off-brand legacy palette lives in sibling screens flagged during the
survey — migrate in later iterations (each is a self-contained constant swap):

- `AffiliateCreateView` + `AffiliateView` — `accentColor = "2ECC71"` (emerald);
  migrate the **pair together** to avoid intra-feature inconsistency.
- `DataStorageView` — `accentColor = "E67E22"` + a raw `"EF4444"` trash icon
  that contradicts its own adjacent `MeeshyColors.error` label.
- `TermsOfServiceView` — `accentColor = "45B7D1"` (cyan).
