# UI/UX Plan — Iteration 47 (2026-06-12)

Base : `main` 61d0122 — branche `claude/blissful-ritchie-9jc6xs`.
Analyse source : `docs/analyses/uiux/2026-06-12-iteration-47.md`.

## Partie 1 — Web
- [x] AgentConfigDialog : i18n complet (~88 strings) sous
      `agentConfig.{sections,fields,help,options,actions}.*` ×4 locales (fr/en/es/pt),
      + tooltips InfoIcon AgentLlmTab / AgentGlobalConfigTab — parité de clés vérifiée
      par script, JSON validé, type-check.
- [x] Page chats v2 : 11 strings FR → `conversations.v2chat.*` ×4 locales
      (typing, online, participants {count}, tooltips, placeholders, fallbacks fichier).
- [x] MermaidDiagramImpl : thème mermaid dark/light via next-themes, ré-init sur
      changement de thème, re-render des diagrammes (dépendance isDark).

## Partie 2 — iOS
- [x] Passe palette legacy (46 occ / 13 fichiers) : MessageComposer, RootViewComponents,
      FeedView, FeedView+Attachments, WidgetPreviewView, AboutView,
      AttachmentPreparationService (+import MeeshyUI), ConversationAnimatedBackground,
      StoryViewerView+Content, BlockedUsersView, UserStatsView, MediaDownloadSettingsView,
      ConversationInfoSheet, MemberManagementSection — tokens MeeshyColors
      (brandPrimary/Hex, error, success, indigo400) selon précédents 45i.
      Exclusions : ladders catégorielles, DynamicColorGenerator, SampleData.
- [x] FriendRequestListView : 11 polices figées → polices sémantiques (mapping iter-32/42),
      héro 48pt conservé.

## Partie 3 — Android
- [x] MessageBubble : sémantique TalkBack du compteur « +N » images masquées
      (`clearAndSetSemantics` + `bubble_hidden_images` ×4 locales).
- [x] FeedScreen : `SelectionContainer` sur le contenu des posts (parité sélection/copie
      iOS/web).

## Cohérence cross-frontend (directive routine)
- Sélection/copie désormais alignée sur les 3 fronts : bulles web sélectionnables (vérifié),
  `.textSelection` iOS PostDetailView (vérifié), SelectionContainer Android feed (ajouté),
  copie chat Android via long-press (existant).
- Dark mode : Mermaid (web) rejoint le comportement theme-aware déjà en place sur iOS
  (ThemeManager) et Android (MeeshyTheme).
- i18n : les surfaces corrigées (chats v2 web, admin agent) rejoignent la parité 4 locales
  déjà effective sur Android et le système xcstrings iOS.

## Livraison
- [ ] Commit + push `claude/blissful-ritchie-9jc6xs`
- [ ] PR vers main, CI verte
- [ ] Merge dans main + mise à jour branch-tracking.md

## Review
(complété après CI)
