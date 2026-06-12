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
| Last completed iteration | 44 / 44b — toutes les PRs iter-44 mergées (#589, #590, #591, #592, #593, #594) ; 45w mergée (#596) |
| Last Merged Base (commit) | ccf81eee (merge #596, iter-45w) |
| Current iteration | **45i** — iOS exclusivement : éradication ancienne palette hors composer (ThreadView, ConversationView, StoryViewer/Tray, FriendRequestList, StoryViewModel), épuration 11 structs legacy mortes, Dynamic Type ConversationListHelpers (19 polices), a11y SectionHeader/FilterChip, 3 clés i18n ×5 locales — PR #595 |
| Current branch | `claude/wizardly-rubin-ux84an` (base 09e08439, réintègre main ccf81eee post-#596) |
| Next iteration | **46i** (iOS) / **46w** (web) — repartir de `main` HEAD post-merge 45i |

### Deferred carry-over — web (pour 46w+)
- admin : `debug.tsx` (~15 strings), `AgentArchetypesTab`, tooltips InfoIcon `LlmTab`/`GlobalConfigTab`
- réactions par pièce jointe (wiring gateway, feature commune web+Android)
- audit qualité es/pt (relecture des traductions existantes)
- console.error en français (participants-drawer ×5, links-section ×3) — logs dev, non bloquant
- locale maps intentionnelles NON à migrer : share-affiliate-modal, AudioPostComposer (speech), use-voice-recording (SpeechRecognition lang)

### Deferred carry-over — iOS (pour 46i+, post-45i)
SampleData.swift suppression fichier mort (pbxproj + build local) ; FriendRequestListView 11 polices ; PostDetailView (.textSelection + 21 hex) ; FeedCommentsSheet/FeedPostCard timeAgo dupliqués + i18n ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (31), NewConversationView (7), DataExportView/DataStorageView (8), ChangePasswordView (2) ; reliquats ancienne palette : RootViewComponents (11), FeedView (8), FeedView+Attachments (10), WidgetPreviewView (7), AboutView (5), MessageComposer (4), AttachmentPreparationService (3), ConversationAnimatedBackground (2), divers ×1 (ConversationInfoSheet, MemberManagementSection, BlockedUsersView, UserStatsView, StoryViewerView+Content, MediaDownloadSettingsView) ; ladder pièces jointes arc-en-ciel (à arbitrer charte) ; VoiceProfileWizardView/TrackingLinksView Color(hex:) ; IncomingCallView .white contraste ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer)

### Deferred carry-over — Android (agent Android)
MeeshySpacing 2.dp residuals ; emoji lineHeight token ; parité stories (UI absente, large) ; réactions par pièce jointe (avec web)

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
| 43b | claude/awesome-albattani-xaqlhj | #587 | ✅ |
| 44 | claude/keen-dirac-485vpk | #591 | ✅ |
| 44 | claude/blissful-ritchie-foe2wg | #589 | ✅ |
| 44 | claude/blissful-ritchie-jls4lb | #592 | ✅ |
| 44 | claude/blissful-ritchie-kay6v7 | #594 | ✅ |
| 44b | claude/keen-dirac-a53ki2 | #590 | ✅ |
| 45w | claude/elegant-noether-1pen57 | #596 | ✅ |
| 45i | claude/wizardly-rubin-ux84an | #595 | ⏳ |
