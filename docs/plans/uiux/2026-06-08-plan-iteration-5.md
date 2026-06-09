# UI/UX Plan — Iteration 5 (2026-06-08)

Three parallel sessions contributed. Plans are combined below.

---

## Session A — iOS MeeshyColors + Dynamic Type Contacts + Web Security + AudioControls i18n

### Goals

1. iOS: MeeshyColors migration — 12 files (ChangePasswordView, SettingsView, ConversationView+MessageRow, ProfileView, BubbleQuotedReply, BubbleStandardLayout, BubbleStandardLayout+Media, FeedView, FeedView+Attachments, ConversationListHelpers, AffiliateView, RequestsTab)
2. iOS: Dynamic Type in Contacts folder (5 files)
3. Web: `rel="noopener noreferrer"` on `target="_blank"` links (3 files)
4. Web: i18n AudioControls aria-labels (audioEffects.json + AudioControls.tsx + AudioTranscriptionPanel.tsx)

### A · iOS — MeeshyColors Migration

**ChangePasswordView.swift**: L191/195/248 `4ADE80` → `MeeshyColors.success` · L208 `EF4444` → `MeeshyColors.error` · L260 `4ADE80` stroke → `MeeshyColors.success`

**SettingsView.swift**: L622/627/630 `EF4444` → `MeeshyColors.error` (destructive logout)

**ConversationView+MessageRow.swift**: L504/509 `FF6B6B` → `MeeshyColors.error`

**ProfileView.swift**: L716 verified badge `4ADE80` → `MeeshyColors.success` · unverified `F59E0B` → `MeeshyColors.warning`

**BubbleQuotedReply.swift / BubbleStandardLayout.swift**: `818CF8` → `MeeshyColors.indigo400`

**BubbleStandardLayout+Media.swift**: L373 `FF6B6B` → `MeeshyColors.error`

**FeedView.swift**: L1076 `FF6B6B` → `MeeshyColors.error` · L1094 `2ECC71` → `MeeshyColors.success`

**FeedView+Attachments.swift**: L365 gradient `[2ECC71, 27AE60]` → `[MeeshyColors.success, MeeshyColors.success.opacity(0.7)]` · L668/683 → error/success

**ConversationListHelpers.swift**: L152 dark `818CF8` → `MeeshyColors.indigo400` · light `6366F1` → `MeeshyColors.indigo500` · L167/171 `2ECC71` → `MeeshyColors.success`

**AffiliateView.swift**: L212/241 `2ECC71` → `MeeshyColors.success` · L249 `EF4444` → `MeeshyColors.error`

**RequestsTab.swift**: L164 gradient → `[MeeshyColors.success, MeeshyColors.success.opacity(0.7)]`

### B · iOS — Dynamic Type : Dossier Contacts

Mapping: 10–11pt → `.caption2` · 12pt → `.caption` · 13–14pt → `.subheadline` · 15–16pt → `.callout` · 17pt → `.body` · 18pt+ → `.headline` · 32–48pt décoratifs → conservés avec `.minimumScaleFactor(0.5)`

Files: `ContactsListTab.swift`, `DiscoverTab.swift`, `BlockedTab.swift`, `RequestsTab.swift`, `ContactsHubView.swift`

### C · Web — Sécurité : rel="noopener noreferrer"

Add `rel="noopener noreferrer"` to all `target="_blank"` links in:
1. `components/landing/LandingContent.tsx`
2. `components/layout/Footer.tsx`
3. `components/chat/message-with-links.tsx`

### D · Web — i18n : AudioControls

Add `audioEffects.controls.*` keys (fr/en/es/pt) for speed slider + transcription labels.
Update `AudioControls.tsx` + `AudioTranscriptionPanel.tsx` with `useI18n('audioEffects')`.

---

## Session B — Admin Agent i18n + AdminLayout dark mode + iOS a11y/colors/DT

### Goals

1. **W-A1** Admin Agent panel i18n — créer namespace `admin`, migrer 6 composants agent
2. **Web** AdminLayout dark mode — 2 `text-gray-900` → `dark:text-gray-100`
3. **iOS** FeedPostCard+Media.swift — accessibilityLabel sur toutes les cellules de grille
4. **iOS** PrivacySettingsView + NotificationSettingsView — couleurs `45B7D1` / `4ECDC4` migrées
5. **iOS** StatusBarView Dynamic Type — fontes fixes → `.caption`/`.caption2`/`.subheadline`

### Step 1 — Créer admin.json + migrer 6 composants

Namespace `admin` avec `agent.overview.*`, `agent.toasts.*`.
Components: AgentOverviewTab, AgentGlobalConfigTab, AgentLlmTab, AgentRolesSection, TriggerSchedulingModal, DeliveryQueuePanel.

### Step 2 — AdminLayout dark mode

`text-gray-900` → `text-gray-900 dark:text-gray-100` on Administration header and user display name.

### Step 3 — iOS FeedPostCard+Media a11y

`.accessibilityLabel` (positional "Media N of M") + `.accessibilityHint` + `.accessibilityAddTraits(.isButton)` on all media grid cells (2/3/4/5+ layouts).

### Step 4 — iOS PrivacySettings + NotificationSettings colors

`"45B7D1"` → `"60A5FA"` (×11) · `"4ECDC4"` → `"6366F1"` (×7 in NotificationSettingsView)

### Step 5 — iOS StatusBarView Dynamic Type

Error indicator: `.caption2.weight(.medium)` · Popover: `.subheadline`, `.footnote`, `.caption2`

---

## Commit & CI

Session A: `uiux(iter-5): MeeshyColors contacts+feed+bubble + Dynamic Type contacts + web security + audio i18n`
Session B: `uiux(iter-5): admin i18n + iOS media a11y + Dynamic Type + legacy colors`
Push → CI → merge to main → start iteration 6.
