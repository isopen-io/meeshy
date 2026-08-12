# Iteration-181i — VoiceOver: split the Keypad result row's two interactive controls

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — People-hub Keypad tab search-result row
**File touched:** `apps/ios/Meeshy/Features/Contacts/KeypadTab.swift` (1 file, 0 logic, 0 test, 0 catalog edit)

## Component

`KeypadTab` is the **Keypad** tab of the People hub (`ContactsHubView`): a dial
pad that finds a person by phone number or name. Each search result is rendered
by `resultRow(_:)`, an `HStack` that contains **two independent interactive
controls**:

1. A `Button` (avatar + name + `@username`) → opens the person's profile.
2. A trailing `dialMenu` — a SwiftUI `Menu` (phone glyph, label « Appeler »)
   → offers « Appel vocal » / « Appel vidéo ».

## Finding

The row wrapped **both** controls in one `HStack` and then applied
`.accessibilityElement(children: .combine)` + `.accessibilityLabel(name)` to
the **whole HStack**:

```swift
HStack {
    Button { openProfile(user) } label: { … }   // opens profile
    dialMenu(for: user, …)                       // "Appeler" menu
}
.accessibilityElement(children: .combine)        // ← flattens BOTH controls
.accessibilityLabel(name)                        // ← announces only the name
```

`.combine` merges an element's entire descendant subtree into **one**
accessibility element. With two *actionable* children that is an anti-pattern:
VoiceOver collapses the profile `Button` and the call `Menu` into a single stop
announced as just "`{name}`". The explicit label override drops the menu's
« Appeler » announcement, the default double-tap action becomes ambiguous, and
the **call action loses its own discoverable, directly-activatable target** —
placing a call from the keypad becomes hard or impossible to reach under
VoiceOver. This is the same "combine over interactive children" hazard that
177i (`ReportMessageSheet`) called out: `.combine` belongs on a container of
*static* text, not on a row that holds two separate buttons.

Contrast the sibling `ContactsListTab.resultRow` (175i, merged): there
`.accessibilityElement(children: .combine)` is **correct** because the entire
row is a *single* `Button` with only a decorative trailing chevron — one tap
target, so combining its text children is exactly right. The Keypad row differs
by having a genuine second control.

## Fix

Scope the combine to the profile `Button` (a single tap target) and let the
`dialMenu` stand as its own element, matching how iOS Contacts/Phone present a
name row with a trailing action as two distinct elements:

- Moved `.accessibilityElement(children: .combine)` + `.accessibilityLabel(name)`
  from the outer `HStack` **onto the profile `Button`** — mirrors the shipped
  `ContactsListTab` pattern (175i), so the two Contacts result rows now expose
  VoiceOver identically for the profile-open target.
- Removed the outer combine/label so `dialMenu` (already
  `.accessibilityLabel("Appeler")`) remains a **separate, directly-activatable**
  VoiceOver element.
- Added `.accessibilityHint("Ouvre le profil")` to the profile `Button`. The
  hint is justified here (and absent in `ContactsListTab`) precisely because two
  adjacent controls now sit in the row — the hint disambiguates the profile-open
  target from the neighbouring « Appeler » call target.

Result: VoiceOver now reads **two** clean stops per row —
"`{name}`, button" (hint: "Ouvre le profil") and "Appeler, button" — instead of
one merged element that swallowed the call action.

## Rationale

Finding a contact then calling them is the Keypad tab's entire purpose; the call
action must be a first-class, reachable VoiceOver target. The visible layout,
haptics, tap targets, and Indigo identity are untouched — the change is purely
the accessibility tree restructure plus one disambiguating hint.

## Verification

- **Static review:** `.accessibilityElement(children:)`, `.accessibilityLabel`,
  `.accessibilityHint` are standard SwiftUI iOS 16.0+ APIs (app floor iOS 16.0 —
  no availability guard). The profile-Button combine pattern is copied verbatim
  from the merged `ContactsListTab` (175i).
- **No visual/logic change:** only accessibility modifiers moved/added; the row
  layout, `openProfile`, `dialMenu`, call flow, and haptics are unchanged.
- **No new catalog entry:** the hint uses inline
  `String(localized:defaultValue:)`, consistent with every other string in this
  file (0 `.xcstrings` edits).
- **No test churn:** the only repo reference to `KeypadTab` outside the view is a
  comment in `CallStarterTests.swift:37` — no test asserts on this view.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green on the PR
  before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `KeypadTab.inputBar` — the delete `Button` clears the whole field via a
  `LongPressGesture` (`.simultaneousGesture`), an action **unreachable** under
  VoiceOver (no `.accessibilityAction`). Candidate: expose "Tout effacer" as a
  VoiceOver custom action / adjust the hint.
- `KeypadTab.keyButton` — each dial key is labeled with its digit only; the
  associated letters (`ABC`, `DEF`…) are dropped. Acceptable (keys append the
  digit, not letters) but worth a deliberate decision if T9 name entry is ever
  added.

**Status: RESOLVED for `KeypadTab` result-row VoiceOver interactive-control separation.**
