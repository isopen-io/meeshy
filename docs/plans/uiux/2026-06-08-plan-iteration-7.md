# Plan UI/UX — Itération 7 (2026-06-08)

## Objectifs

1. **iOS i18n toast strings** — Localiser ~32 strings hardcodées dans 6 ViewModels (`FeedViewModel`, `PostDetailViewModel`, `StoryViewModel`, `BookmarksViewModel`, `StatusViewModel`, `ConversationView`)
2. **iOS Color(hex:) migration** — Migrer les hex legacy vers MeeshyColors dans 3 composants (`ConversationInfoSheet`, `ConversationDashboardView`, `ConversationPreferencesTab`)

---

## Changements effectués

### iOS — Toast strings localisés (pattern: `String(localized: "key", defaultValue: "English", bundle: .main)`)

**FeedViewModel.swift** (15 strings):
- `likePost` observeOutcome toast → `feed.like.error`
- `bookmarkPost` success/error → `feed.bookmark.success`, `feed.bookmark.error`
- `sendComment` observeOutcome + catch → `feed.comment.sendError` (×2)
- `likeComment` catch → `feed.like.error`
- `repostPost` catch → `feed.repost.error`
- `sharePost` catch → `feed.share.error`
- `deletePost` success/error → `feed.post.deleted`, `feed.post.deleteError`
- `reportPost` success/error → `feed.post.reported`, `feed.post.reportError`
- `updatePost` success/error (wrong pattern fixed) → `feed.post.edited`, `feed.post.editError`
- `pinPost` success/error → `feed.post.pinned`, `feed.post.pinError`

**PostDetailViewModel.swift** (6 strings):
- `fetchCommentsFromNetwork` error → `feed.comment.loadError`
- `likePost` observeOutcome + catch → `feed.like.error` (×2)
- `sendComment` observeOutcome + catch → `feed.comment.sendError` (×2)
- `sendReply` catch → `feed.comment.replyError`

**StoryViewModel.swift** (4 strings):
- `publishStory` success (×2) → `story.published`
- `publishStory` error (×2) → `story.publishError`

**BookmarksViewModel.swift** (2 strings):
- `load` error → `feed.bookmark.loadError`
- `removeBookmark` error → `feed.bookmark.removeError`

**StatusViewModel.swift** (3 strings):
- `publishStatus` error → `status.publishError`
- `clearStatus` error → `status.deleteError`
- `reactToStatus` error → `status.reactError`

**ConversationView.swift** (2 strings):
- `accessRevoked` fallback → `conversation.accessRevoked`
- Message deep-link notFound → `conversation.messageNotFound`

### iOS — Color(hex:) → MeeshyColors migration

**ConversationInfoSheet.swift** (5 occurrences):
- `Color(hex: "4ECDC4")` (encryption lock icon) → `MeeshyColors.indigo400`
- `Color(hex: "EF4444")` (block button ×4) → `MeeshyColors.error`

**ConversationDashboardView.swift** (9 occurrences):
- `Color(hex: "34D399")` (positive sentiment ×3) → `MeeshyColors.success`
- `Color(hex: "FBBF24")` (neutral sentiment ×3) → `MeeshyColors.warning`
- `Color(hex: "F87171")` (negative sentiment ×3) → `MeeshyColors.error`

**ConversationPreferencesTab.swift** (11 occurrences):
- `Color(hex: "F87171")` (error text) → `MeeshyColors.error`
- `Color(hex: "3B82F6")` (organization section ×7) → `MeeshyColors.info`
- `Color(hex: "FF6B6B")` (notification toggles ×2) → `MeeshyColors.error`
- `Color(hex: "F59E0B")` (archive) → `MeeshyColors.warning`
- `Color(hex: "F97316")` (leave group) → `MeeshyColors.warning`
- `Color(hex: "F87171")` (delete for me) → `MeeshyColors.error`

---

## Déferré → Itération 8

- Full a11y review of MessageSearch + PinnedMessageBanner (components post-iter-5)
- iOS Dynamic Type: `PostDetailView` (48×), `ThreadView` (13×), `ReplyThreadOverlay` (15×) — from iter-6 analysis
- iOS OnboardingStepViews + MagicLinkView accessibility labels (from iter-6 analysis)
- Web i18n: `AnonymousForm`, `groups-layout-responsive`, `AgentLiveTab`, `RankingFilters`, `UserLanguageSection`, `translation-monitor`, `language-select` (from iter-6 analysis)
- Web a11y: 8 icon-only buttons needing aria-labels (from iter-6 analysis)
