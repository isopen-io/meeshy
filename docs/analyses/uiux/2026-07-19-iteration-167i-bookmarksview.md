# Itération 167i — Analyse UI/UX iOS : `BookmarksView` (état vide)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` (`emptyState`)
**Base** : `main` HEAD (`efedb69e4`)
**Branche** : `claude/laughing-thompson-i3yqn2`
**Gate** : CI `iOS Tests`

## Contexte
`BookmarksView` est l'écran Favoris : `ScrollView` + `LazyVStack` de `FeedPostCard` (composant
déjà soldé en 128i), avec pagination, `refreshable`, et un `fullScreenCover` de story auteur.
La surface est mince (103 lignes) et déjà mûre côté produit : titre localisé, toast succès via
`FeedbackToastManager` (conforme aux deux étages de toasts), `import MeeshyUI` absent. Le seul
reliquat spécifique à cet écran (le corps délègue tout à `FeedPostCard`) est l'**état vide**.

Iteration **167i** — 166i = `MessageTranscriptionDetailView` (PR #2030), 165i =
`StatsTimelineChart` (PR #2028). `BookmarksView` figurait explicitement dans le différé 164i+
(« `BookmarksView` (1 `.system`) ») → cible fraîche, **0 PR iOS ouverte ne la touche** (vérifié
via `list_pull_requests` : les 7 PR iOS ouvertes visent TranscriptionDetail, StatsTimelineChart,
FeedView toasts, BubbleExpandableText, EditProfileView, DeleteAccountView, MessageViewsDetail).

## Constat (avant 167i)
- **1 `.font(.system(size: 48))`** (ligne 90) — icône `bookmark` héro de l'état vide. Slot
  vertical **très généreux** : `VStack(spacing: 16)` sans hauteur fixe + `.padding(.top, 80)`.
  Précédent net et cohérent : les icônes héro d'état vide de même gabarit **scalent déjà** via
  `MeeshyFont.relative(48)` — `ConversationListView:1151` (`link.badge.plus`),
  `AudioPostComposerView:167`, `TwoFactorSetupView` (`relative(50)`). Rien ne justifie de la
  figer ici → **doit scaler**.
- **VoiceOver** : le titre (`bookmarks.empty.title`) et le sous-titre
  (`bookmarks.empty.subtitle`) sont deux éléments VoiceOver distincts (2 swipes pour une seule
  information « aucun favori »). L'icône est déjà `.accessibilityHidden(true)` → regroupables.

## Corrections appliquées (1 fichier, 0 logique)
- **`import MeeshyUI`** ajouté (accès à `MeeshyFont`, comme `ConversationListView`).
- **Icône `bookmark` 48 → `MeeshyFont.relative(48)`** : l'icône héro scale sous Dynamic Type
  (slot vertical généreux, aucun clip).
- **`emptyState` → `.accessibilityElement(children: .combine)`** : titre + sous-titre lus en un
  seul élément VoiceOver (icône déjà masquée) → 1 swipe au lieu de 2.

## Périmètre / non-régression
- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve.
- Corps de liste (`FeedPostCard` équatable), `refreshable`, pagination `onAppear`,
  `fullScreenCover` story auteur (trio `environmentObject`) : **non touchés**.
- Toast succès `FeedbackToastManager.shared.showSuccess` : conforme aux deux étages, intact.
- Palette (`theme.textMuted`, `theme.textSecondary`) : conforme, non touchée.
- Aucun test ne référence `BookmarksView` → aucune régression de test.

## Statut
**TERMINÉE** — état vide de `BookmarksView` soldé (icône héro → `relative(48)` ; titre +
sous-titre regroupés VoiceOver). Le corps délègue à `FeedPostCard` (déjà soldé 128i). Ne plus
re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `BookmarksView` (état vide) — icône héro `bookmark` 48 `.system` → `MeeshyFont.relative(48)`
  (slot vertical généreux, précédent `ConversationListView`/`AudioPostComposer`/`TwoFactorSetup`) ;
  `emptyState` regroupé `.accessibilityElement(children: .combine)` (icône déjà masquée) ;
  `import MeeshyUI` ajouté. Corps = `FeedPostCard` (soldé 128i). **SOLDÉ 167i.**
