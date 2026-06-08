# Plan UI/UX — Itération 3 (2026-06-08)

Deux passes parallèles, chacune fusionnée dans main séparément.

---

## Passe A — Viewers web + iOS MeeshyColors

✅ **COMPLÉTÉE — PR #350 mergée dans main**

### Objectifs
1. Migrer les strings des viewers (PDF/PPTX/Markdown) vers le namespace i18n `viewers`
2. Continuer la migration iOS MeeshyColors pour les hex brand-identity restants

### Changements effectués
- Créé `apps/web/locales/{en,fr,es,pt}/viewers.json` avec clés `pdf.*`, `pptx.*`, `markdown.*`
- Enregistré le namespace dans tous les `index.ts`
- `PDFViewerWrapper.tsx`, `PDFLightboxSimple.tsx` : `useI18n('viewers')` + remplacement strings
- `PPTXViewer.tsx` : idem
- `MarkdownLightbox.tsx` : idem
- iOS `LanguagePickerSheet.swift` : `Color(hex: "6366F1")` → `MeeshyColors.indigo500`
- iOS `MiniAudioPlayerBar.swift` : gradient `[6366F1, 4338CA]` → `[indigo500, indigo700]`
- iOS `ConversationView.swift` : `Color(hex: "4ECDC4")` → `MeeshyColors.indigo400`

---

## Passe B — Video-calls i18n + Accessibilité iOS + Dark mode

✅ **COMPLÉTÉE — PR #354 mergée dans main**

### Objectifs
1. i18n complet des composants video-calls web
2. i18n MermaidDiagramImpl + MarkdownViewer
3. Accessibilité iOS systémique (accessibilityLabel non localisés)
4. Couleurs legacy iOS (accentColor teal/cyan → MeeshyColors.indigo)
5. Dark mode AdminLayout + not-found-page

### Changements effectués

**Web locales :**
- `{en,fr,es,pt}/calls.json` — 5 nouvelles sections (status, permissions, controls, stream, toasts)
- `{en,fr,es,pt}/mermaid.json` — nouveau namespace erreurs Mermaid
- `{en,fr,es,pt}/markdown.json` — nouveau namespace MarkdownViewer
- `{en,fr,es,pt}/pages.json` — section `notFound`

**Web composants :**
- `CallStatusIndicator.tsx` : `useI18n('calls')` + `t('calls.status.*')`
- `PermissionRequest.tsx` : `useI18n('calls')` + `t('calls.permissions.*')`
- `CallControls.tsx` : `useI18n('calls')` + `t('calls.controls.*')` sur tous aria-labels/titles
- `VideoStream.tsx` : `useI18n('calls')` + `t('calls.stream.*')`
- `DraggableParticipantOverlay.tsx` : fullscreen + drag text → i18n
- `VideoCallInterface.tsx` : 4 toasts → i18n
- `MermaidDiagramImpl.tsx` : extraction `MermaidCriticalErrorFallback` + `useI18n('mermaid')`
- `MarkdownViewer.tsx` : 4 title attrs → `useI18n('markdown')`
- `AdminLayout.tsx` : header `dark:bg-gray-900 dark:border-gray-800 dark:text-gray-100/400`
- `not-found-page.tsx` : `useI18n('pages')` + `bg-background` + `text-foreground`

**iOS accessibilité (15 fichiers) :**
- Tous `.accessibilityLabel("French literal")` → `String(localized:defaultValue:bundle:)`
- `BubbleFooter`, `BubbleExpandableText`, `BubbleReactionsOverlay`, `BubbleStandardLayout`
- `MessageContextOverlay`, `StoryViewerView+Canvas`, `SharePickerView`
- `UniversalComposerBar+Recording`, `MessageOverlayMenu`, `EmojiPickerSheet`
- `ConversationView+Header`, `ContactsHubView`, `MentionSuggestionPanel`
- `StoryRepostEmbedCell`, `AchievementBadgeView`
- `BubbleFooter` : `Color(hex: "4ECDC4")` → `MeeshyColors.indigo400`

**iOS couleurs legacy (9 vues) :**
- `PrivacySettingsView`, `NotificationSettingsView`, `SettingsView`, `ChangePasswordView`, `ShareLinksView`
- `UserStatsView`, `LicensesView`, `PrivacyPolicyView`
- `StatusBarView` : `indigo400` + `indigo500`

---

## Déferré → Itération 4

- **W-A1** : Admin Agent panel i18n complet (6 composants, grand effort)
- **iOS Dynamic Type** : `StatusBarView` fonts fixes (`.system(size:)` → sémantique)
- **iOS `color: "45B7D1"`** restants dans `PrivacySettingsView` sections secondaires
