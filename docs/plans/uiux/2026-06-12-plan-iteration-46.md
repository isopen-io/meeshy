# Plan — Itération 46 (2026-06-12)

Branche : `claude/blissful-ritchie-8rma6f` (base `main` @ 945a8d74, post-#597/#604).
Analyse : `docs/analyses/uiux/2026-06-12-iteration-46.md`.

## Web
- [ ] `UserPicker.tsx` : 5 strings FR + aria-label EN → clés `agent.userPicker.*` dans
      `admin.json` ×4 locales (en/fr/es/pt)
- [ ] `InfoIcon.tsx` : aria-label sur l'icône d'aide
- [ ] `AgentOverviewTab.tsx` : « Inactifs » → `t()` ; `#94a3b8` → couleur dark-aware
- [ ] `RankingStatsImpl.tsx` : `useI18n('admin')` + 4 strings `ranking.charts.*` ;
      palette amber inline → dark-aware (next-themes `resolvedTheme`)
- [ ] `ConversationSettingsModal.tsx:1049` : « Modifier » → clé conversations
- [ ] `MessageSearch.tsx:92` : locale i18n au lieu de `undefined`
- [ ] Vérif : tsc + jest ciblés, parité des 4 locales sur les nouvelles clés

## iOS
- [ ] `FriendRequestListView.swift` : 8 polices texte → sémantiques (ladder 44b),
      3 tailles d'icônes conservées
- [ ] `CameraView.swift` : 3 `.accessibilityLabel` localisés (xmark/flash/rotate)
- [ ] Palette legacy → tokens `MeeshyColors` (10 fichiers, ~25 occ) :
      AboutView, MessageComposer (mapping brand, pas error), AttachmentPreparationService,
      ConversationAnimatedBackground, MemberManagementSection, UserStatsView,
      MediaDownloadSettingsView, ConversationInfoSheet, BlockedUsersView,
      StoryViewerView+Content
- [ ] Vérif : revue mécanique des substitutions (pas de build macOS disponible — CI)

## Android
- [ ] `SettingsScreen.kt:85` : `role = Role.Button` sur la Row profil
- [ ] `MeeshyPrimaryButton.kt:48` : `role = Role.Button`
- [ ] `MessageBubble.kt:419` (ReactionChip) + `:227,251` (images) : `role = Role.Button`
- [ ] Vérif : pattern aligné sur l'existant du fichier (clickable(role =) vs semantics)

## Clôture
- [ ] Mise à jour `branch-tracking.md` (items fermés : debug.tsx, AgentArchetypesTab,
      BackSoundDetails, PostDetailView, AddParticipantSheet ; nouveaux différés :
      AgentConfigDialog chantier dédié, gros fichiers palette iOS pour 47,
      BubbleStandardLayout:835, App Links https cross-platform)
- [ ] Commit + push + PR vers main, CI verte, merge, footer Status sur l'analyse

## Continuité 47+
1. **AgentConfigDialog** (~40-45 strings ×4 locales) — passe dédiée web
2. **iOS gros fichiers palette** : RootViewComponents (13), FeedView (9),
   FeedView+Attachments (11), WidgetPreviewView (8)
3. Android : parité stories OU réactions par pièce jointe (avec web)
4. Arbitrage App Links/Universal Links `https://meeshy.me` (web + iOS + Android)
