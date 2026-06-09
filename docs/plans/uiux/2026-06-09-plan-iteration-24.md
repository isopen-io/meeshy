# UI/UX Plan — Iteration 24 (2026-06-09)

## Objective
Fix 54 issues across Web (19), iOS (18), Android (17). Android receives its first UI/UX pass.
Implement in priority order: compile errors → accessibility nulls → Dynamic Type (bubble views) → i18n toasts → layout/UX.

## Phase 1 — Android (compile errors + critical)

### 1.1 Fix compile errors
- `feature/feed/FeedScreen.kt`: `MeeshySkeleton` → `MeeshySkeletonBox` (import + call site)
- `feature/profile/ProfileScreen.kt`: `displayName =` → `name =`; remove unused `background` import; add `containerColor`
- `feature/notifications/NotificationsScreen.kt`: `displayName =` → `name =`; add `containerColor`

### 1.2 Navigation + accessibility
- `app/navigation/MeeshyApp.kt`:
  - Fix `startDestination` to be stable (remember)
  - Replace all 4 `Icon(…, null)` with `Icon(…, tab.label)` in bottom nav
  - Fix `popUpTo(Routes.CONVERSATIONS)` → `popUpTo(navController.graph.startDestinationId)`
  - Add `containerColor` to FeedScreen/NotificationsScreen/ProfileScreen Scaffolds

### 1.3 SDK fixes
- `sdk-ui/MeeshyPrimaryButton.kt`: disabled color (`Indigo200` → `backgroundTertiary`) + typography (`labelLarge`)
- `sdk-ui/MeeshyAvatar.kt` + `BrandLogo.kt`: fix font scale computation
- `sdk-ui/component/bubble/MessageBubble.kt`: verify existing spacing token usage

### 1.4 i18n bootstrap
- Create `app/src/main/res/values/strings.xml` with all app strings
- Create `app/src/main/res/values-fr/strings.xml` with French translations
- Replace ALL hardcoded string literals with `stringResource(R.string.xxx)` across:
  - `MeeshyApp.kt` (4 tab labels)
  - `LoginScreen.kt` (8 strings)
  - `ChatScreen.kt` (4 strings)
  - `ConversationListScreen.kt` (4 strings)
  - `NotificationsScreen.kt` (4 strings)
  - `FeedScreen.kt` (6 strings)
  - `ProfileScreen.kt` (8 strings)

### 1.5 Remaining MEDIUM
- `FeedScreen.kt`: avatar `contentDescription`, like button contentDescription, radius token
- `ConversationListScreen.kt`: Row semantics role
- `FeedScreen.kt` + `NotificationsScreen.kt`: add `containerColor`
- Raw dp → MeeshySpacing tokens in all feature screens
- Add deep link for chat route

## Phase 2 — iOS (highest-frequency views first)

### 2.1 Message bubble views (renders on every message)
- `BubbleFooter.swift`: 11 fixed fonts → semantic styles
- `BubbleQuotedReply.swift`: 14 fixed fonts (min size 6!) → semantic styles  
- `BubbleSecondaryContent.swift`: 5 fixed fonts → semantic styles
- `MessageDaySeparator.swift`: 1 fixed font → `.caption.weight(.semibold)`

### 2.2 Auth flow
- `EmailVerificationView.swift`: OTP + success icon → semantic fonts

### 2.3 Hardcoded French strings
- `ShareLinkDetailView.swift`: confirmationDialog + action labels → `String(localized:)`
- `CommunityLinkDetailView.swift`: action labels + font fix

### 2.4 SecurityView
- Systematic Dynamic Type pass (61 occurrences)
- Add `.accessibilityLabel()` to all icon-only buttons

### 2.5 Remaining MEDIUM/LOW
- `FloatingCallPillView.swift`: touch targets 36→44pt + 5 fixed fonts
- `RequestsTab.swift`: touch targets 36→44pt
- `BubbleAttachmentView.swift`: fixed frame → adaptive
- `StatusBarView.swift`: 8 fixed fonts
- `ReportUserView.swift`: 11 fixed fonts
- `PrivacyPolicyView.swift`: 7 fixed fonts
- `BubbleCallNoticeView.swift`: 9 fixed fonts
- `FeedPostCard.swift` + `FeedView.swift`: systematic pass

## Phase 3 — Web (HIGH → MEDIUM → LOW)

### 3.1 Locale files first
- `conversations.json` (en/fr/es/pt): add `participants.*` keys (roleUpdated, invited, added, roles.*, promote, demote, refreshStatuses), `links.*` keys (noDescription, loading, empty), `composer.*` keys (replyTo, cancelReply, messageInput, attachFiles), `inviteModal.noUsersFound`
- `common.json` (en/fr/es/pt): add `clearSearch`, `backToList`, `backToConversations`, `back`, `breadcrumb`, `home`, `anonymous`, `user`, `reactWith`
- `settings.json` (en/fr/es/pt): add `v2settings.*`, `v2me.*`, `chats.*`, `consentDialog.*` (fr/es/pt missing), `emailChange.*` (fr/es/pt missing)
- `admin.json` (en/fr/es/pt): add `userDetail.*` keys (contactUpdated, contactUpdateError, personalInfoUpdated, personalInfoUpdateError)
- `storyComposer.json` or `common.json`: add `limitReached`, `filesAdded` template literals

### 3.2 Component fixes
- `conversation-participants-drawer.tsx`: all 8 issues (toasts + role map + aria-labels)
- `app/v2/(protected)/settings/page.tsx`: import useI18n, wire all 9 strings
- `app/v2/(protected)/me/page.tsx`: import useI18n, wire all 5 strings
- `app/v2/(protected)/chats/page.tsx`: wire 3 strings
- `components/common/Breadcrumb.tsx`: build label map from t(), fix 2 aria-labels
- `admin/user-detail/UserContactInfoSection.tsx`: import useI18n, fix 2 toasts
- `admin/user-detail/UserPersonalInfoSection.tsx`: import useI18n, fix 2 toasts
- `components/common/message-composer/index.tsx`: fix 4 strings
- `components/conversations/conversation-links-section.tsx`: import useI18n, fix 3 strings
- `components/v2/layout/SplitViewLayout.tsx`: fix 1 aria-label
- `components/v2/layout/PageHeader.tsx`: fix 1 aria-label
- `components/v2/layout/RightPanelHeader.tsx`: fix 1 aria-label
- `components/conversations/conversation-item/ConversationItem.tsx`: keyboard accessibility + French fallback
- `components/v2/StoryComposer.tsx`: 2 toast template literals + getCategoryLabel()
- `components/v2/StoryViewer.tsx`: 1 aria-label slip
- `invite-user-modal.tsx` L207: 1 empty state
- `message-composer/ToolbarButtons.tsx`: 2 English aria-labels
- `MessageActionsBar.tsx` L398: 1 reaction aria-label
- `ConversationItemActions.tsx` L63: 1 aria-label
- `PushPermissionBanner.tsx` L75: 1 aria-label
- `user-selector.tsx` + `DeliveryQueuePanel.tsx` + `trending-section.tsx`: 3 French loading/empty states
