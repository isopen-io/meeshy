# Iteration-186i — VoiceOver header traits for `CreateShareLinkView` form sections

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver rotor "Headings", decorative-glyph hygiene)
**File touched:** `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift` (1 file, 0 logic, 0 network, 0 new i18n key, 0 new test)

## Component

`CreateShareLinkView` is the sheet presented from `ShareLinksView` (the "Mes
liens" screen) to create a new share link. It is a single scrolling form built
from five `formSection(title:icon:subtitle:)` groups — **Conversation**,
**Identité du lien**, **Accès invités**, **Permissions**, **Limites** — each
rendered by the private `formSection` helper as an uppercased caption header
(accent SF Symbol + `Text`) above a rounded card of rows.

The tracking pointer explicitly flagged this view as **"non audité"** and a
`179i+`/`176i+` forward candidate; no prior iteration touched it. It is not
referenced by any test (`grep` in `MeeshyTests` = 0) and is untouched by any
open swarm PR (checked via `list_pull_requests`, highest in flight = 185i).

## Findings

1. **Section headers unreachable via the VoiceOver rotor "Headings" (single
   real deficit).** The five `formSection` group titles are the primary
   navigation landmarks of a long, dense form, yet the header `HStack` carried
   no `.accessibilityAddTraits(.isHeader)`. A VoiceOver user could not jump
   section-to-section with the Headings rotor and had to swipe linearly through
   every field. Every structural sibling already sets the trait on its screen
   header (`ShareLinksView` l.73/133, `CommunityLinksView` l.57/105,
   `TrackingLinksView`, `AffiliateView`, `UserStatsView`, `SupportView`) — this
   sheet was the outlier.

2. **Uppercased title read to VoiceOver as display glyphs.** The header text is
   `title.uppercased()` purely for visual style. Left as the accessibility
   value, VoiceOver can announce all-caps strings letter-by-letter or with the
   wrong prosody. The natural-case `title` ("Conversation", "Identité du lien",
   …) is the correct spoken form.

3. **Decorative accent glyph in the a11y tree.** The leading section icon
   (`bubble.left.and.bubble.right.fill`, `tag.fill`, …) is purely decorative —
   it duplicates the meaning already in the title text — but was not hidden from
   VoiceOver, adding a redundant unlabelled focus fragment inside the header.

## Fix

Single, self-contained change inside the `formSection` helper (fixes all five
sections at once, `0` call-site edits, `0` visual change):

- `.accessibilityHidden(true)` on the decorative leading icon.
- `.accessibilityElement(children: .ignore)` + `.accessibilityLabel(title)` on
  the header `HStack` so VoiceOver announces the **natural-case** title as one
  element.
- `.accessibilityAddTraits(.isHeader)` so each section becomes a rotor
  "Headings" stop, matching the six sibling screens.

Net `+3` lines, `1` file. No logic, no network, no new i18n keys (the existing
`title` argument is already localized at every call site), no new test. Build
gate = CI `iOS Tests` (iOS build is not runnable on the Linux worker).

## Non-goals / deferred (187i+)

- The `share.link.create.max_uses` label bakes an inline `"s"` plural via a
  Swift ternary (`"\(maxUsesValue) utilisation\(maxUsesValue > 1 ? "s" : "")…"`)
  inside `String(localized:defaultValue:)`. This is a real pluralization
  anti-pattern (breaks non-French locales / stringsdict agreement) but is a
  distinct i18n concern — deferred to keep this iteration single-purpose.
- The rule/permission `iconBadge` glyphs inside toggles are decorative but are
  already effectively silent (SwiftUI reads the `Toggle` label text); no change.

## Verification

- `grep` post-edit: `accessibilityAddTraits(.isHeader)` present once in the
  helper; the five section titles route through that single helper.
- No test references `CreateShareLinkView`; two call sites unchanged.
- Pattern is byte-identical in intent to sibling screens already merged.
# Iteration-186i — VoiceOver structure for CreateShareLinkView

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — share-link creation form
**File touched:** `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift` (1 file, 0 logic, 0 test, 0 catalog edit)

## Component

`CreateShareLinkView` is the full-screen sheet for creating a share link
(invite link) to a group/community/channel. It is a long scrolling form with
five sections (Conversation, Identity, Access, Permissions, Limits) plus a
`ConversationPickerSheet`. The screen is **already 100 % localized** (59
`String(localized:)` sites, semantic fonts throughout — `.subheadline`,
`.caption`, `.headline`, `.title`) → **0 i18n migration, 0 Dynamic Type
migration** was required.

## Finding

The screen carried **zero** accessibility annotations (`grep accessibility` =
0). Five distinct VoiceOver deficits, from most to least severe:

1. **Conversation picker button — the primary action gate.** You cannot create
   a link until a conversation is selected (the Create button is `.disabled`
   until then), yet the custom `Button` (icon + name + type + chevron, or the
   empty-state "Choisir un groupe…") had no explicit label. VoiceOver announced
   a raw concatenation of the decorative plus/chevron glyphs and text, and the
   empty vs selected state was not cleanly conveyed. This is the single most
   important control on the screen.

2. **Decorative `iconBadge` glyphs read aloud.** The `iconBadge` helper (a
   colored SF Symbol tile) is used for every rule toggle, the two limit rows,
   and the selected-conversation type icon. Each sat as a **sibling** of its
   `Toggle`/`Text` in the row `HStack`, so VoiceOver surfaced it as its own
   element (SF-Symbol name), adding noise before every toggle.

3. **Section headers not exposed as headings.** Each `formSection` renders an
   uppercased title (`CONVERSATION`, `PERMISSIONS`, …) preceded by a decorative
   accent icon. Neither the `.isHeader` trait (VoiceOver rotor "Headings"
   navigation) nor hiding of the icon was present.

4. **Text fields announced by their placeholder.** `formTextField` renders the
   field label (`Nom du lien`, `Description (optionnel)`, `Slug URL`) as a
   separate `Text` **above** the `TextField`. With no `.accessibilityLabel`,
   VoiceOver names the field by its **placeholder** (`ex: Partage Twitter`) —
   confusing and unstable (the placeholder disappears once the user types).

5. **Picker-sheet selection invisible to VoiceOver.** In `ConversationPickerSheet`,
   the currently-selected conversation is marked only by a trailing
   `checkmark.circle.fill` glyph — a purely visual cue with no `.isSelected`
   trait, so a VoiceOver user cannot tell which conversation is chosen.

## Fix

1. **Conversation picker button:** added a stateful `.accessibilityLabel`
   (selected → `"{name}, {type}"` via the existing `displayLabel`; empty →
   the existing `share.link.create.choose_group` string) + `.accessibilityHint`
   ("Choisit la conversation à partager"). The explicit label replaces the
   children announcement, so the decorative plus/chevron are no longer read; the
   trailing chevron is additionally `.accessibilityHidden(true)`.

2. **`iconBadge` helper:** added `.accessibilityHidden(true)` on the badge
   `ZStack` — one edit removes noise from **all** rule toggles, both limit rows,
   and the conversation type icon.

3. **`formSection` header:** decorative accent icon → `.accessibilityHidden(true)`;
   title `Text` → `.accessibilityAddTraits(.isHeader)`, matching the shipped
   `EmailVerificationView` (178i) / `ReportUserView` heading idiom.

4. **`formTextField`:** the visible label `Text` → `.accessibilityHidden(true)`
   (kept for sighted users), and the `TextField` → `.accessibilityLabel(label)`.
   VoiceOver now reads one clean stop per field ("Nom du lien, text field")
   instead of naming it by a placeholder that vanishes on input.

5. **`ConversationPickerSheet` rows:** `.accessibilityElement(children: .combine)`
   + `.accessibilityAddTraits(selected?.id == conv.id ? .isSelected : [])`, and
   the checkmark glyph → `.accessibilityHidden(true)`. This mirrors verbatim the
   shipped `NewConversationView` selection-row pattern (glyph decorative, state
   via `.isSelected`).

## Rationale

Creating a share link is a first-class product action; its gating control (the
conversation picker) must be a properly-labeled, discoverable VoiceOver target,
and the picker sheet must expose which conversation is chosen. The visible
layout, colors (share-accent / Indigo identity), haptics, tap targets, toggles,
stepper, and create flow are untouched — the change is purely the accessibility
tree (labels, hint, `.isHeader`/`.isSelected` traits, decorative-glyph hiding).

## Verification

- **Static review:** every API used — `.accessibilityLabel`, `.accessibilityHint`,
  `.accessibilityHidden`, `.accessibilityAddTraits`, `.accessibilityElement(children:)` —
  is standard SwiftUI iOS 16.0+ (app floor iOS 16.0 → no availability guard).
  The `.isSelected` ternary form (`… ? .isSelected : []`) is copied from shipped
  `SettingsView`/`NewConversationView`; the `.isHeader` idiom from `EmailVerificationView`.
- **No visual/logic change:** only accessibility modifiers were added; row
  layouts, `create()`, `ShareLinkService`, toggles, stepper, picker, and haptics
  are unchanged. The picker `.combine` reads `conv.name` only (checkmark hidden).
- **`displayLabel` reuse:** the selected-state label reuses the existing
  `MeeshyConversation.ConversationType.displayLabel` already rendered visibly at
  `CreateShareLinkView.swift:105` — no new mapping.
- **1 new i18n key** in inline `defaultValue`
  (`share.link.create.conversation.a11yHint`) — **0 `.xcstrings` edits**,
  consistent with every other string in this file; all other labels reuse
  existing keys.
- **No test churn:** no test references `CreateShareLinkView` (grep verified).
- **0 contention:** no open iOS PR touches this file (PR list #2100–#2140 checked).
- **CI gate:** `iOS Tests` (macOS runner) — this is a Linux container, so the
  build/VoiceOver run happens in CI. Confirm `iOS Tests` is green before merge.

## Remaining improvements (future iterations, surfaced during scan)

- `createButton` — when `isCreating`, it shows a spinner + the localized
  "Création en cours…" text, so it is *not* an anonymous button (acceptable).
  A `.accessibilityValue`/busy hint could still make the in-flight state
  explicit; deferred (low value, text already present).
- `formTextField` slug field — the live `meeshy.me/join/{slug}` preview `Text`
  is read verbatim; acceptable (it *is* informative) but a `.accessibilityLabel`
  could prefix it with "Aperçu de l'URL" if it ever reads ambiguously.
- The `maxUsesValue` `Stepper` custom label centers the number; native `Stepper`
  already announces value/increment — no change needed, noted for completeness.

**Status: RESOLVED for `CreateShareLinkView` VoiceOver structure (picker button,
decorative glyphs, section headings, field labels, picker-sheet selection).**
