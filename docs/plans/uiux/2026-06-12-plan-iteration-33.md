# UI/UX Plan — Iteration 33 (2026-06-12)

## Objective
1. Internationalize the web search page (new `search` namespace, 4 locales) + fix hardcoded fr-FR date locale + a11y labels (web)
2. Fix chats v2 empty-state hardcoded string via existing conversations key (web)
3. Convert frozen `.font(.system(size:))` to semantic Dynamic Type fonts in BookmarksView, PostTranslationSheet, LinksHubView + add missing accessibility labels (iOS)
4. Internationalize Android Settings, Contacts, MessageBubble, TypingIndicator; localize delivery-status contentDescriptions (Android)

## Web Actions
1. Create `locales/{en,fr,es,pt}/search.json` — hero, form, tabs, results, empty states, user/conversation/community cards, toasts (~40 keys)
2. Register `search` in `locales/*/index.ts` (if registration is required — verify; useI18n imports JSON dynamically by namespace so file presence suffices)
3. `app/search/SearchPageContent.tsx` — import `useI18n('search')`, wire all strings, `toLocaleDateString(currentLanguage)`, add `aria-label` on search input + MoreVertical trigger
4. `app/search/page.tsx` — replace text fallback with neutral spinner (server component, no hook)
5. `app/v2/(protected)/chats/page.tsx` — `EmptyConversation` uses `useI18n('conversations')` → `conversationLayout.selectConversation`

## iOS Actions (text → semantic fonts; hero icons stay fixed per iter-32 precedent)
6. `BookmarksView.swift` — title → `.body.weight(.semibold)`, subtitle → `.subheadline`; hero icon `.accessibilityHidden(true)`
7. `PostTranslationSheet.swift` — 16 conversions (14→`.subheadline`, 15→`.subheadline`, 12→`.caption`, 11→`.caption2`, 10→`.caption2`, 16→`.callout`, 20→`.title3`); `.accessibilityLabel` on xmark close button
8. `LinksHubView.swift` — 28→`.title.weight(.bold)`, 18→`.headline`, 13→`.footnote`, 20→`.title3`, 15→`.subheadline`, 12→`.caption`, 22→`.title2`; `.accessibilityLabel` on plus create button

## Android Actions
9. Create `feature/settings/src/main/res/{values,values-fr}/strings.xml` (~23 keys, `settings_` prefix); wire SettingsScreen.kt via `stringResource`
10. Create `feature/contacts/src/main/res/{values,values-fr}/strings.xml` (~7 keys incl. per-tab labels); wire ContactsScreen.kt, map `ContactsTab` → string resources
11. Create `sdk-ui/src/main/res/{values,values-fr}/strings.xml` (`bubble_message_deleted`, `bubble_translated`, `bubble_edited`, `bubble_status_{pending,sent,delivered,read,failed}`); wire MessageBubble.kt
12. `BubbleContent.kt` — add `replyToIsDeleted: Boolean = false`; `BubbleContentBuilder.kt` stops baking "Message deleted" into `replyToText` (sets flag instead); `MessageBubble.kt` ReplyPreview renders localized placeholder when flag set; update `BubbleContentBuilderTest`
13. `feature/chat` strings.xml — add `chat_typing_one/two/many` (en+fr); `ChatScreen.kt` TypingIndicator uses `stringResource` with args

## Verification
- Web: `pnpm` type-check + jest web tests locally if runnable; JSON locale files valid
- Android: gradle unit tests if toolchain available locally, else rely on review (no Android CI gate)
- iOS: ios-tests.yml CI on PR (cannot build locally on linux)
- CI green → merge PR into main; update branch-tracking.md

## Continuity
- Base: main @ 7ab236f (merge PR #574)
- Branch: claude/blissful-ritchie-6709o7
- Next iteration candidates (from analysis deferred lists): iOS SettingsView/NewConversationView fonts + PostDetailView textSelection; web admin debug + AgentArchetypesTab i18n; Android es/pt locale files
