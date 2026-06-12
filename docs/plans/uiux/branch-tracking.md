# Branch Tracking — UI/UX Iterations

## Purpose
Trace the base branch for each new UI/UX iteration, to avoid divergence.

## Protocol
1. At the start of each iteration: create the working branch from the **Last Merged Base** below (or sync the assigned branch with `main`)
2. Develop, commit, push on the working branch
3. Once CI passes: merge into main via PR
4. After merge: update this file with the new base
5. Delete the feature branch after merge

---

## Current State

| Field | Value |
|-------|-------|
| Current iteration | **45i** — iOS exclusivement : éradication ancienne palette hors composer (ThreadView, ConversationView, StoryViewer/Tray, FriendRequestList, StoryViewModel), épuration 11 structs legacy mortes, Dynamic Type ConversationListHelpers (19 polices), a11y SectionHeader/FilterChip, 3 clés i18n ×5 locales |
| Current branch | `claude/wizardly-rubin-ux84an` (ff depuis main 09e08439, post-merge PR #594 iter-44) |
| Last Merged Base (commit) | 09e08439 (merge #594) |
| Next iteration | **46i** — repartir de `main` HEAD post-merge 45i |
| Deferred carry-over for 46i (iOS only, directive routine) | SampleData.swift suppression fichier mort (pbxproj + build local) ; FriendRequestListView 11 polices ; PostDetailView (.textSelection + 21 hex) ; FeedCommentsSheet/FeedPostCard timeAgo dupliqués + i18n ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (31), NewConversationView (7), DataExportView/DataStorageView (8), ChangePasswordView (2) ; reliquats ancienne palette : RootViewComponents (11), FeedView (8), FeedView+Attachments (10), WidgetPreviewView (7), AboutView (5), MessageComposer (4), AttachmentPreparationService (3), ConversationAnimatedBackground (2), divers ×1 ; ladder pièces jointes arc-en-ciel (à arbitrer charte) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) |

---

## History

| Iteration | Branch | PR | Merged |
|-----------|--------|----|--------|
| 1 | feat/uiux-iter1 | (early) | ✅ |
| 2–12 | feat/uiux-iter{N} | various | ✅ |
| 13 | feat/uiux-iter13 | #407 | ✅ |
| 14 | feat/uiux-iter14 | #410 | ✅ |
| 14b | claude/dazzling-hawking-* | #412, #416 | ✅ |
| 15 | feat/uiux-iter15 | #419 | ✅ |
| 16–17 | (inline in main) | — | ✅ |
| 18–23 | feat/uiux-iter{N} | — | ✅ |
| 24 | claude/wizardly-hamilton-fpmwqf | #543 | ✅ |
| 25–29 | (inline iter-25…29) | — | ✅ |
| 30 | claude/dazzling-hawking-b4tdnk | #507 | ✅ |
| 31 | claude/iter31-type-safety | #509 | ✅ |
| 32 | feat/uiux-iter32 | #539 | ✅ |
| 33 | feat/uiux-iter33 | #588 | ✅ |
| 33–39 | (inline admin-i18n passes, commit-message numbering) | #544, #545, … | ✅ |
| 40 | claude/friendly-brown-xuzpju | #575 | ✅ |
| 41 | claude/blissful-ritchie-9vesx9 | #577 | ✅ |
| 41b | claude/blissful-ritchie-68j2oq | #580 | ✅ |
| 42 | claude/blissful-ritchie-fst8wf | #582 | ✅ |
| 42b | claude/blissful-ritchie-e672ur | #579 | ✅ |
| 43 | claude/blissful-ritchie-6709o7 | #576 | ✅ |
| 44 | claude/blissful-ritchie-kay6v7 | #594 | ✅ |
| 44 | claude/blissful-ritchie-jls4lb | #592 | ✅ |
| 43b | claude/awesome-albattani-xaqlhj | #587 | ✅ |
| 44 | claude/keen-dirac-485vpk | #591 | ✅ |
| 44b | claude/keen-dirac-a53ki2 | #590 | ✅ |
| 44 | claude/blissful-ritchie-foe2wg | #589 | ✅ |
| 45i | claude/wizardly-rubin-ux84an | (cette PR) | ⏳ |
