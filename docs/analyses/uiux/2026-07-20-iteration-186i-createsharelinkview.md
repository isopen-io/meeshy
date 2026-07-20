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
