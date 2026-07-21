# Iteration 208i — `LoginView` saved-account row VoiceOver cleanup + action hint

**Track**: iOS UI/UX (suffix `i`)
**Date**: 2026-07-21
**Branch**: `claude/laughing-thompson-i88vi9`
**Base**: `main` HEAD `22465a5`
**File**: `apps/ios/Meeshy/Features/Main/Views/LoginView.swift` (+ 1 new i18n key)

## Surface
`savedAccountRow(_:)` — the tappable saved-account picker rows shown on the login
screen to **returning users** (`savedAccountsList` → `ForEach(authManager.savedAccounts)`).
This is the **primary login action** for anyone who has signed in before. Each row is a
`Button` whose label visually renders: a `MeeshyAvatar` (44pt), the account display name
(`account.shortName`), the `@username`, and a trailing decorative `chevron.right`.

## Defect (WCAG 1.3.1 / 4.1.2 Name, Role, Value)
The row is a `Button` (so SwiftUI auto-combines its label subviews into one element and
adds the `.isButton` trait), but it carried **no explicit accessibility treatment**, which
produced two VoiceOver problems for the app's primary returning-user action:

1. **Duplicated name.** `MeeshyAvatar` sets its own `.accessibilityLabel(name)`
   (`MeeshyUI/Primitives/MeeshyAvatar.swift:378/381`), and the avatar is constructed with
   `name: account.shortName`. Because the display name is *also* rendered as a sibling
   `Text(account.shortName)`, the combined button label read the name **twice** —
   e.g. "Jean Dupont, Jean Dupont, @jdupont".
2. **Decorative chevron announced.** The trailing `chevron.right` is a pure affordance
   glyph, but without `.accessibilityHidden(true)` it is merged into the combined label
   (VoiceOver appends the symbol as trailing noise).

The row also gave **no hint** about what activating it does. Unlike the sibling
"create account" button (`auth.login.create_account.hint`), tapping a saved-account row
does not sign in directly — it selects the account and advances to the password step. A
sighted user infers this from the chevron; a VoiceOver user had no such cue.

## Fix (VoiceOver layer only — 0 visual change, 0 logic/network change)
1. `.accessibilityHidden(true)` on `accountAvatar(account, size: 44)` — the name is already
   carried by the visible `Text`, so the avatar's duplicate label is redundant noise
   (precedent: decorative avatars/glyphs hidden throughout, e.g. `sectionHeader` icons).
2. `.accessibilityHidden(true)` on the trailing `chevron.right` — decorative affordance.
   → Combined button label collapses to exactly **"shortName, @username"**.
3. `.accessibilityHint("auth.login.saved_account.hint")` on the `Button` — tells VoiceOver
   the row opens password entry for that account.

## i18n
Adds **one** new key `auth.login.saved_account.hint`, fully translated across all 5 catalog
locales (fr source + de/en/es/pt-BR), mirroring the structure of the sibling
`auth.login.create_account.hint`. Inserted textually to keep the `Localizable.xcstrings`
diff minimal (35 insertions, no reformatting of existing entries).

## Verification
- iOS build/tests gate = CI `iOS Tests` (macOS runners; not reproducible on this Linux
  host). Change is additive VoiceOver-layer + one localized string; no compile-affecting
  logic.
- No source-level guard test added: the change is pure view-modifier a11y (hidden
  decoratives + hint) with no composable helper to assert against — consistent with the
  modifier-only precedent of 204i/205i (0 new test).

## Status
✅ Resolved. **Do not re-flag** `LoginView.savedAccountRow` VoiceOver: the combined label
now reads exactly the visible identity (name + username), decoratives are hidden, and the
two-step action carries a hint.

### Remaining / adjacent (defer, 1/iteration, collision-check first)
- `LoginView.environmentSelector` segmented picker conveys the active environment by
  **color + font-weight only** (missing `.isSelected` trait, doctrine 149i→207i). Deferred
  intentionally: it is **simulator-only** (`if Self.isSimulator`) → no production a11y
  impact, low priority.
- `MeeshyShareExtension/ShareViewController.swift` `ContactRow` (l. 519-527): selection
  state is color-only (blue checkmark + tint) with no `.isSelected` trait / combine. Real
  defect, but the extension is a **separate target not reachable by `MeeshyTests`** (no unit
  test possible) and was already listed as a swarm next-path (collision risk) — verify open
  PRs before taking it.
