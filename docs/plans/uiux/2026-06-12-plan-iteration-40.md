# UI/UX Plan — Iteration 40 (2026-06-12)

Branch: `claude/friendly-brown-xuzpju` (from main @ d96afa17) → merge into main once CI passes.

## Objective
Close the iteration-24 leftovers still open, fix i18n/a11y/token regressions introduced by the
recent iOS stories/reactions and Android chat work, keep the three frontends coherent.

## Android (feature/chat + sdk-ui)
1. Create `sdk-ui/src/main/res/values/strings.xml` + `values-fr/strings.xml`:
   `bubble_message_deleted`, `bubble_edited`, `bubble_translated`, `bubble_status_{pending,sent,delivered,read,failed}`
2. `MessageBubble.kt` — wire stringResource for deleted/edited/status descriptions; Read tint → `MeeshyTheme.tokens.info`
3. `BubbleContent` + `BubbleContentBuilder` — add `replyToDeleted: Boolean`, stop baking "Message deleted" into the builder (test first in `BubbleContentBuilderTest`); `MessageBubble` renders the localized text
4. `ChatScreen.kt` — typing indicator → `chat_typing_one/two/many` (en+fr); SheetAction Row `Role.Button` semantics; quick-reaction 44→48dp; editing banner Indigo400 → `accentColor`

## iOS (string/font-only, no structural changes)
5. `BubbleFooter.swift` — localize "Voir la story"/"Voir le profil"; 9 fixed fonts → `.caption`/`.subheadline` semantics
6. `BubbleReactionsOverlay.swift` — localize accessibility hint L127; fonts L138/160/163 → `.caption2`/`.caption`
7. `StatusBarView.swift` — 7 fixed fonts → semantic (keep the size-36 emoji glyph)
8. `CommunityLinkDetailView.swift` — localize Actif/Inactif/INFORMATIONS/Identifiant/Lien complet/Créé le

## Web
9. `Breadcrumb.tsx` — label map from `t('breadcrumb.labels.*')` (common.json en/fr/es/pt)
10. `StoryComposer.tsx` — title/publish/upload/placeholder/aria-delete → t()
11. `StoryViewer.tsx` L885 — reply placeholder → t()
12. `invite-user-modal.tsx` — 6 strings → t()
13. `user-selector.tsx` — online/offline/system/region/selected/login → t()
14. `UserContactInfoSection.tsx` + `UserPersonalInfoSection.tsx` — card titles + edit/cancel/saving → t()
15. `conversation-links-section.tsx` — status badges + labels → t()
16. `DeliveryQueuePanel.tsx` — 2 toasts + retry → t()
17. `AdminLayout.tsx` — sidebar menu aria-labels → t()
18. Locale files: add keys to en/fr/es/pt for common, stories (or v2 namespace used), conversations, admin

## Deferred (tracked, do NOT re-analyze)
- iOS hex-color token refactor: TrackingLinksView (11), ShareLinkDetailView (12), CommunityLinkDetailView (8) — needs a MeeshyColors token-mapping decision
- iOS FeedPostCard/FeedView fixed fonts (30+) — large untouched surface
- Web + Android per-attachment reactions parity — feature work (socket `attachment:reaction-*` wiring), not a UI/UX pass

## Verification
- Android: `BubbleContentBuilderTest` green (gradle if env allows, else CI)
- Web: tsc/eslint on touched files; locale JSON validity (all 4 languages keys aligned)
- iOS: string/font-only edits — CI build validates
- Merge: PR → CI green → merge into main → update branch-tracking.md → delete branch
