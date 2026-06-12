# UI/UX Plan — Iteration 44 (2026-06-12)

Base: main @ 813b7fe3 (post-merge #576 iter-43, #579 iter-42b, #588 iter-33). No open PRs at start.

## Goals
1. Web — kill the remaining user-facing locale freezes on product surfaces (v2 thread timestamps, notification preferences, conversation modals, translation widgets)
2. iOS — close the link-surfaces Dynamic Type carry-over (CreateShareLinkView, TrackingLinkDetailView) + ProfileView hex/a11y
3. Android — restore es/pt parity broken by parallel iterations 40-42 and make the conversation preview sender prefix localizable

## Checklist

### Android
- [x] es/pt strings: auth (1), chat (4), conversations (9), sdk-ui (1) — 14 keys × 2 locales
- [x] `conversations_preview_sender_format` key (4 locales) + `LastMessagePreviewLabels.senderFormat` + wiring + test
- [x] `SettingsScreen.kt:88` → MeeshySpacing.lg/md
- [x] Parity script green (values vs values-fr/es/pt, all modules)

### Web
- [x] `MessageTimestamp.tsx` → useI18n('conversations') + `messageTimestamp.*` keys (4 locales), locale-aware dates, localized aria-label
- [x] `app/notifications/preferences/page.tsx` → existing `notifPrefs.*` keys + 14 new keys (4 locales)
- [x] `quick-link-config-modal` / `link-summary-modal` / `translation-stats` / `translation-monitor` → hook locale, `settings.translationStats` + `admin.translationMonitor.cacheHit` keys
- [x] `ConversationLayout` loader → `authGuard.checking`; `create-conversation-modal` → `preview.title`; `FriendRequestCard` locale prop
- [x] Locale parity check on touched namespaces (en/fr/es/pt)
- [x] Jest: pre-existing ConversationLayout failures confirmed identical on clean tree (env mock gap, not introduced)

### iOS
- [x] `CreateShareLinkView` 24 fonts → semantic; ExpirationOption + picker sections localized
- [x] `TrackingLinkDetailView` 18 text fonts → semantic (icons kept fixed)
- [x] `PrivacySettingsView` accent literal → `MeeshyColors.brandPrimaryHex`
- [x] `ProfileView` hex sweep (11 literals → tokens) + avatar-edit `.accessibilityLabel`

### Process
- [x] Analysis + plan docs written, anti-repetition check vs iterations 32-43
- [ ] Commit + push branch `claude/blissful-ritchie-kay6v7`
- [ ] PR → main, CI green (ios-tests, android tests, web jest/build)
- [ ] Merge to main, update branch-tracking

## Carry-over for iteration 45
- Web admin i18n batch: debug.tsx, AgentArchetypesTab, AgentConfigDialog, AgentConversationsTab, UserPicker + 9 admin 'fr-FR' date sites
- Web chart dark-mode theming (RankingStatsImpl, MermaidDiagramImpl, AgentOverviewTab)
- Web BackSoundDetails (4 FR strings); no-locale dates: ConnectionQualityBadge, ConversationEncryptionSection, LinkTypeStep; share-affiliate-modal locale map
- iOS big-font surfaces by priority: GlobalSearchView (32), FeedCommentsSheet (27, + textSelection), remaining ProfileView text fonts, CallView (34)
- iOS AudioPostComposerView gradient hex (design decision needed on the 2 dark washes), ThemedConversationRow text colors
- Android: stories UI parity (large feature, tracked in feature-parity.md); SettingsScreen 14.dp rhythm (needs token decision)
- Accepted, do not re-flag: ChatScreen.kt:442 emoji 22.sp; iOS hero icons 50-80pt; sdk-ui bubble layout dp
