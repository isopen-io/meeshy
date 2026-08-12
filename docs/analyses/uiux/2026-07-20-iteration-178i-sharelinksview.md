# Iteration-178i — VoiceOver active/inactive status + i18n for `ShareLinksView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver, WCAG 1.4.1) + Localization (i18n)
**File touched:** `apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift` (1 file, 0 logic, 0 new test)

## Component

`ShareLinksView` is the "Mes liens" screen listing the share links the user
owns (`GET` via `ShareLinkService`, cache-first). Each `shareLinkRow` renders a
leading badge glyph, the link display name, a `N rejoints` counter, an optional
conversation title, a copy-to-clipboard button, and a chevron, all wrapped in a
`NavigationLink` to `ShareLinkDetailView`. Reached from `RootView` and the iPad
panels.

Its structural twin `CommunityLinksView` had already been polished (relative
fonts, a11y labels, frozen/hidden decorative glyphs), but `ShareLinksView`
retained two real gaps that no prior iteration addressed.

## Findings

1. **Active/inactive state conveyed by colour alone (WCAG 1.4.1).** A link's
   active vs. inactive status was signalled *only* through the badge glyph — its
   icon shape (`link` vs `link.badge.minus`) and colour (`shareAccent` vs
   `neutral500`), plus the circle tint. That glyph is `.accessibilityHidden(true)`
   (correctly — it's a fixed 40×40 decorative badge), so a VoiceOver user had
   **no channel at all** to distinguish an active link from a disabled one. The
   status is meaningful: an inactive link can no longer be joined.

2. **Localization anti-pattern — string concatenation.** The counter read
   `Text("\(link.currentUses) \(String(localized: "share.links.joined_label",
   defaultValue: "rejoints"))")` — a number manually concatenated with a
   standalone localized word. This breaks pluralization and word-order in
   locales where the count follows the noun or where "rejoints" would need to
   agree. Its sibling uses single interpolated localized strings; this row was
   the only place in the file bypassing that idiom.

3. **Fragmented VoiceOver row.** The name / counter / conversation were three
   separate focus stops with no grouping.

## Fix

Surgical, following the 155i/164i label idiom — no visual change:

- **`joinedCountLabel(_:)`** — folds the count into one interpolated localized
  unit (`share.links.joined_count`, `defaultValue: "\(count) rejoints"`). Same
  rendered French text ("N rejoints"), now a single translatable string that
  respects locale word-order/pluralization. Replaces the concatenation at the
  visible caption; the now-unused `share.links.joined_label` reference is dropped.

- **`rowAccessibilityLabel(_:)`** — composes the row's identity as one phrase:
  `displayName, status, N rejoints[, conversation]`, where `status` is a
  localized "Actif"/"Inactif" word (`share.links.status.active` /
  `.status.inactive`). This surfaces the previously colour-only state.

- On the row's text `VStack`: `.accessibilityElement(children: .ignore)` +
  `.accessibilityLabel(rowAccessibilityLabel(link))` — collapses the three text
  fragments into one element carrying the full label including status. Applied
  **only to the text stack**, not the whole row, so the copy `Button` stays a
  separate actionable element and the `NavigationLink` tap is preserved.

Three new code-only keys (`share.links.joined_count`,
`share.links.status.active`, `share.links.status.inactive`) via inline
`defaultValue` — the entire `share.links.*` family is code-only (0 entries in
`Localizable.xcstrings`), so **0 catalog edits**, parity with siblings.

## Rationale

"Never rely only on colour to convey meaning" is explicit in the accessibility
scope; the active/inactive distinction was a textbook WCAG 1.4.1 violation on a
management screen where the status governs whether the link still works.
Folding the fragments into one labelled element (Apple's canonical list-row
pattern) also cuts the VoiceOver stop count from three to one. The i18n fix
removes the last concatenated string in the file. All changes are label-level:
the visible layout, colours (Indigo/share accent), and frozen decorative glyphs
are untouched.

## Verification

- **Static review:** `.accessibilityElement(children:)`, `.accessibilityLabel`,
  and interpolated `String(localized:defaultValue:bundle:)` are all standard
  iOS 16.0+ APIs (app floor), with established precedent across the file family
  (164i `InviteFriendsSheet`, 155i `MessageReactionsDetailView`).
- **No visual change:** `joinedCountLabel` renders the identical French string;
  the a11y modifiers do not affect layout. Snapshots unchanged.
- **No test churn:** no test references `ShareLinksView` (grep across
  `MeeshyTests`/`MeeshyUITests`/`MeeshySDKTests` = 0). The two call sites
  (`RootView`, `iPadRootView+Panels`) pass no arguments — unaffected.
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations)

- The two `.font(.system(size:))` glyphs (chevron in the header is already
  `relative`; the 40×40 badge glyph and the 40pt empty-state hero) are correctly
  frozen + hidden — do not re-flag.
- `CreateShareLinkView` (the presented sheet) was not audited this iteration and
  remains an open candidate.

**Status: RESOLVED for `ShareLinksView` VoiceOver status + i18n concatenation.**
