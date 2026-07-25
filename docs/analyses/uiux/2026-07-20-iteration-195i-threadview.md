# Iteration-195i — VoiceOver structure for `ThreadView`

**Date:** 2026-07-20
**Scope:** iOS only
**Area:** Accessibility (VoiceOver) — message thread / discussion screen
**File touched:** `apps/ios/Meeshy/Features/Main/Views/ThreadView.swift` (1 file, 0 logic, 0 new i18n key, 0 SDK change, 0 new test)

## Component

`ThreadView` is the message-thread screen (« Discussion ») presented from a
message to read + post replies. It renders a `header` (back button + title +
replies count), a scroll (`parentMessageView` + `repliesDivider` + `repliesList`
of `replyRow`s) and a `composerBar` (send-error line + reply `TextField` + send
`Button`).

Fonts already used the semantic Dynamic-Type ramp (`.body`, `.subheadline`,
`.caption`, `.caption2`, `.callout`) — **no Dynamic Type gap** — and every
visible string was localized. The screen had only **3** accessibility modifiers
(back-button label + send-error label/value); the deficit was VoiceOver
structure, most critically an **unlabeled primary action**.

## Findings

1. **Send button has no accessibility label (WCAG 2.1.1 / 4.1.2).** The composer
   send `Button` (l.213-229) renders a bare `paperplane.fill` `Image` (or a
   `ProgressView` while sending) with **no `.accessibilityLabel`**. VoiceOver
   announced it as an unlabeled image button — the screen's **primary action**
   (post a reply) was effectively unusable, and the in-flight sending state was
   conveyed only by the spinner.
2. **No heading structure.** The « Discussion » title and the « N réponses »
   section divider carried no `.isHeader` trait, so VoiceOver heading navigation
   had no landmarks on the screen.
3. **Message rows read as scattered elements.** Both the parent message and each
   reply row exposed sender name, relative time, and body as separate VoiceOver
   stops instead of one coherent element per message.

## Fix

VoiceOver-only additions, reusing already-localized keys (**0 new key**):

- **Send button** → `.accessibilityLabel` = `composer.send.label`
  (« Envoyer le message ») when idle, `bubble.delivery.sending`
  (« Envoi en cours ») while sending; `.accessibilityHint` = `composer.send.hint`
  (« Envoie le texte saisi ») when idle (empty while sending). These three keys
  already ship inline elsewhere (`UniversalComposerBar`, `BubbleDeliveryCheck`).
  The existing `.disabled(...)` still makes VoiceOver announce the empty/in-flight
  button as dimmed.
- **Header title** → `.accessibilityAddTraits(.isHeader)`.
- **Replies divider** → `.accessibilityElement(children: .combine)` +
  `.accessibilityAddTraits(.isHeader)` — the two decorative rules collapse and the
  « N réponses » count becomes a navigable section heading.
- **Parent message** sender+time `VStack` → `.accessibilityElement(children:
  .combine)`.
- **Reply row** name+time+content `VStack` → `.accessibilityElement(children:
  .combine)` — each reply now reads as one element « {sender}, {time}, {content} ».

The message avatars (`MeeshyAvatar`, which own an interactive `onMoodTap`) are
left as their own elements — the `.combine` was scoped to the sibling text
`VStack`s so the mood-tap affordance is **not** swallowed.

## Constraints honoured

- **0 visual change** — only `.accessibilityLabel/Hint/AddTraits(.isHeader)` and
  `.accessibilityElement(children: .combine)` on text containers; no layout,
  color, font, gesture, animation, or hit-testing change.
- **0 logic / 0 product behaviour** change.
- **0 new i18n key** — reuses `composer.send.label`, `composer.send.hint`,
  `bubble.delivery.sending`.
- **0 SDK change**, **1 file**.

## Verification status

- Author runs in a Linux container → the macOS **`iOS Tests`** CI job is the build
  authority. All APIs (`.accessibilityLabel/Hint/AddTraits`, `.accessibilityElement`)
  are iOS 14/16+, below the app's iOS 16 floor — no availability guard needed.
- No test references `ThreadView` (grep across `MeeshyTests` / `MeeshyUITests` /
  SDK = 0).

## Remaining improvements (deferred, one surface/iteration, verify contention first)

- `CommentMediaView` (217 l, 4 a11y mods, no header traits).
- `EditPostSheet` (357 l): one genuine `.system(size: 22)` Dynamic-Type gap at
  l.318 (the `size: 18` sibling is frozen by a doctrine comment) + zero header
  traits.
