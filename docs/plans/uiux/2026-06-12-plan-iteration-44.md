# UI/UX Plan — Iteration 44 (2026-06-12)

## Objective
1. Make the web date-formatting infrastructure locale-aware (single source of truth fix) and internationalize MessageTimestamp (web)
2. Close the three admin i18n leftovers deferred since iteration 43 (web)
3. Speech recognition language follows the Prisme resolution instead of browser locale (web)
4. Complete the links-surface Dynamic Type pass: ShareLinkDetailView, TrackingLinkDetailView, CreateShareLinkView, CreateTrackingLinkView + icon-button a11y labels (iOS)
5. Localize the "System" notification sender fallback; wire the `meeshy://conversations` deep link in the NavHost (Android)

## Web Actions
1. `utils/date-format.ts` — add `locale?: string` to `DateFormatOptions` (fallback `'fr'` preserves legacy behavior); thread through all `toLocale*` calls; `formatFullDate(date, locale?)` uses locale-aware formatting instead of manual French `à` concatenation; update `__tests__/utils/date-format.test.ts`
2. Callers pass locale from `useI18n`/language store: `BubbleMessage.tsx`, `bubble-message/MessageNameDate.tsx`, `dashboard/ConversationsWidget.tsx`, `dashboard/CommunitiesWidget.tsx`, `hooks/use-message-interactions.ts`
3. `components/v2/MessageTimestamp.tsx` — `useI18n('conversations')`; new `timestamp.*` keys (today/yesterday/todayAt/yesterdayAt/dayAt) in `locales/{en,fr,es,pt}/conversations.json`; locale-aware `toLocale*`; localized aria-label
4. `app/admin/debug.tsx` — new `debug.*` section in admin.json (4 locales), wire via `useI18n('admin')`
5. `components/admin/agent/AgentArchetypesTab.tsx` — new `agent.archetypes.*` keys in admin.json (4 locales), including emoji-usage labels keyed by enum value
6. `components/translation/translation-monitor.tsx:233` — `t('translationMonitor.cacheHit')` + key in admin.json (4 locales)
7. `components/v2/AudioPostComposer.tsx` — `recognition.lang` from `resolveUserPreferredLanguage(user)` (auth store) with `navigator.language` fallback

## iOS Actions (text → semantic fonts; decorative/hero icons stay fixed per iter-32 precedent)
8. `ShareLinkDetailView.swift` — convert 13 text fonts (20→`.title3.weight(.bold)`, 13→`.footnote`, 12→`.caption`, 10→`.caption2`, 22→`.title2`); `.accessibilityLabel` on icon-only action buttons
9. `TrackingLinkDetailView.swift` — convert ~25 text fonts with same size→semantic mapping
10. `CreateShareLinkView.swift` — convert ~24 text fonts
11. `CreateTrackingLinkView.swift` — convert 6 text fonts

## Android Actions
12. `feature/notifications` strings.xml (en/fr/es/pt) — add `notifications_system_sender`; wire in `NotificationsScreen.kt:133`
13. `MeeshyApp.kt` / `Routes` — add `meeshy://conversations` deep link on the conversations route (manifest already declares it)

## Verification
- Web: jest `date-format` + related suites, `tsc --noEmit` if runnable; JSON locale validity check
- iOS: size→semantic mapping consistent with iterations 42-43 (`.caption2`≤11, `.caption`=12, `.footnote`=13, `.subheadline`=14-15, `.callout`=16, `.body`=17, `.headline`=18, `.title3`=20, `.title2`=22, `.title`=28); CI ios-tests on PR
- Android: no local toolchain — review + CI
- CI green → merge PR into main; update branch-tracking.md

## Continuity
- Base: main @ aa5dfa6 (merge PR #586)
- Branch: claude/blissful-ritchie-foe2wg
- Next iteration candidates: web user-settings.tsx toasts (17) + participants-drawer/links-section toasts; migrate remaining 14 `'fr-FR'` files to locale-aware date-format helpers; converge FriendRequestCard local formatter; iOS ConversationInfoSheet (52) + ConversationDashboardView (43) + TwoFactorSetupView (42, text only) font passes; Android stories parity (large)
