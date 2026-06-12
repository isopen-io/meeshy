# UI/UX Plan — Iteration 44 (2026-06-12)

Branch: `claude/blissful-ritchie-jls4lb` (from main `7358047`, post #587/#588)
Analysis: `docs/analyses/uiux/2026-06-12-iteration-44.md`

## Part 1 — Web (apps/web)
- [ ] video-calls i18n: `LocalVideoTile` "You", `VideoStream` "Unknown", `CarouselNavigation` aria-labels, `EffectCard` ON/OFF → keys in `calls.json` / `audioEffects.json` (en/fr/es/pt)
- [ ] `BackSoundDetails` French strings → `audioEffects.json`
- [ ] `ConnectionQualityBadge:95` + `translation-monitor:307` → `toLocaleTimeString(locale)` ; `translation-stats:67` → `toLocaleDateString(locale)`
- [ ] `groups/ConversationsList:92,99` → t() keys + `toLocaleDateString(locale)`
- [ ] `conversation-image-upload-dialog:135` error toast → i18n key
- [ ] Dark mode: `DeleteConfirmationView:347`, `ReactionSelectionMessageView:273,302,407` → add `dark:` variants
- [ ] Cohérence : nouvelles clés présentes dans les 4 locales, mêmes namespaces que l'existant

## Part 2 — iOS (apps/ios)
- [ ] `ConversationView+MessageRow:243` "Hier" → `String(localized:defaultValue:)` (vérifier libellés frères Aujourd'hui/etc.)
- [ ] `ProfileView:65` → semantic font (.footnote)
- [ ] `TwoFactorSetupView` text fonts → semantic (hero icons fixes conservés)
- [ ] `CallView:35` / `IncomingCallView:35` caller name → `.title` semantic
- [ ] `PrivacySettingsView` hex → MeeshyColors tokens
- [ ] Cohérence : pattern identique aux migrations 32/42/43, xcstrings à jour

## Part 3 — Android (apps/android)
- [ ] sdk-ui strings.xml (en/fr/es/pt) : `bubble_file_size_*` units, `image_viewer_close`, `bubble_image_description`, `bubble_attachment_file_fallback`
- [ ] `MessageBubble.formatFileSize` → stringResource ; contentDescriptions localisées
- [ ] `MeeshyImageViewer` "Fermer"/"Image" → stringResource
- [ ] `BubbleContentBuilder:57` fallback "Fichier" → sortir du value model, résoudre au rendu (pattern replyToDeleted iter-43) ; adapter `BubbleContentBuilderTest`
- [ ] `feature/conversations` values-es/pt : +9 clés preview/banner ; `feature/chat` values-es/pt : +3 clés date
- [ ] `ChatScreen:533,564` cancel icons → touch target 48dp (`minimumInteractiveComponentSize`)
- [ ] Cohérence : libellés preview alignés sur iOS/web (📷 Photo / 🎬 Vídeo / etc.)

## Deferred to iteration 45+
- Web admin: debug.tsx, AgentArchetypesTab, InfoIcon tooltips LlmTab/GlobalConfigTab, ranking/monitoring/anonymous-users 'fr-FR'
- iOS: famille composer Color(hex:) (ComposerModels/UniversalComposerBar/AudioPostComposer/VoiceProfileWizard) — design pass identité couleurs requis ; AudioFullscreenView .white audit ; FeedPostCard pluriels
- Android: MeeshySpacing 2.dp residuals, emoji lineHeight token ; parité stories (UI absente) ; réactions par pièce jointe web+Android (wiring gateway)

## Exit criteria
- CI verte sur la PR ; merge dans main ; branch-tracking mis à jour (iteration 45 next)
