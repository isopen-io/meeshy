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
| Last completed iteration | 44 (web : date-format + MessageTimestamp locale-aware, i18n admin debug/archétypes/cache-hit, reconnaissance vocale Prisme ; iOS : Dynamic Type surface liens détail/create + i18n picker/expiration ; Android : expéditeur système i18n, deep links conversations) |
| Last merged PR | #588 (feat/uiux-iter33) ; iter-44 (PR #589) en cours de merge |
| Last Merged Base (commit) | 813b7fe (post #588) |
| Next iteration | **45** |
| Next branch to create from | `main` (HEAD post-merge iter-44) |
| Deferred carry-over for 45 | web : user-settings.tsx 17 toasts fr, participants-drawer (5) + links-section (3), 14 fichiers 'fr-FR' restants à migrer vers date-format, FriendRequestCard formateur local dupliqué, vérif aria-label SwipeableRow ; iOS : ConversationInfoSheet (52 fonts), ConversationDashboardView (43), TwoFactorSetupView (42, texte seulement), CallView (34), InviteFriendsSheet (33), ProfileView (32), GlobalSearchView (32), SettingsView (31), VoiceProfileManageView (29), FeedView+Attachments (29), DataExportView (17), NewConversationView (15), ChangePasswordView (14) ; Android : parité stories (UI absente, large) ; réactions par pièce jointe web+Android (wiring gateway) ; audit qualité es/pt web |
| Last completed iteration | 44 (iOS exclusif : ThemedConversationRow — i18n 21 clés ×5 locales, Dynamic Type 26 polices, tokens MeeshyColors.text*(isDark:), ShortRelativeTime partagé+testé) |
| Last merged PR | #588 (iter-33) ; iter-44 en cours de merge |
| Last Merged Base (commit) | 813b7fe3 (main post-#588) |
| Next iteration | **45** |
| Next branch to create from | `main` (HEAD post-merge iter-44) |
| Deferred carry-over for 45 (iOS only, directive routine) | ConversationListHelpers (19 polices, 28 hex) ; PostDetailView (.textSelection + 21 hex) ; FeedCommentsSheet/FeedPostCard timeAgo dupliqués + i18n ; ConversationInfoSheet (52 polices), ConversationDashboardView (43), TwoFactorSetupView (42, héros intentionnels), CallView (34), InviteFriendsSheet (33), ProfileView/GlobalSearchView (32), SettingsView (31) ; UniversalComposerBar(+Recording) hex ; AvatarContextMenuItem → LocalizedStringKey (API SDK à évaluer) |

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
| 44 | claude/blissful-ritchie-foe2wg | (en cours) | ⏳ |
| 44 | claude/keen-dirac-485vpk | (en cours) | ⏳ |
