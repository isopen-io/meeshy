# Plan — Itération 167i : `BookmarksView` (Dynamic Type + VoiceOver de l'état vide)

**Date** : 2026-07-19 · **Piste** : iOS (`i`) · **Gate** : CI `iOS Tests`
**Base** : `main` HEAD (`efedb69e4`) · **Branche** : `claude/laughing-thompson-i3yqn2`
**Surface** : `apps/ios/Meeshy/Features/Main/Views/BookmarksView.swift` (état vide `emptyState`)

## Objectif
Solder Dynamic Type + VoiceOver de l'écran Favoris. Le corps de liste délègue à
`FeedPostCard` (composant déjà soldé, 128i) ; le seul reliquat propre à cet écran est l'état
vide, dont l'icône héro était figée en `.system(size: 48)`.

## Constat (avant 167i)
- **1 `.font(.system(size: 48))`** — icône `bookmark` héro de l'état vide, dans un slot
  vertical très généreux (`VStack(spacing: 16)` + `.padding(.top, 80)`, pas de conteneur à
  hauteur fixe). Précédent net : les icônes héro d'état vide de même gabarit scalent déjà via
  `MeeshyFont.relative(48)` (`ConversationListView:1151`, `AudioPostComposerView:167`,
  `TwoFactorSetupView`). → **doit scaler**.
- **VoiceOver** : titre + sous-titre de l'état vide sont deux éléments distincts (2 swipes),
  l'icône est déjà `.accessibilityHidden(true)`. Regroupables en un seul élément.

## Changements (1 fichier)
1. `import MeeshyUI` (accès à `MeeshyFont`, comme `ConversationListView`).
2. Icône `bookmark` : `.system(size: 48)` → `MeeshyFont.relative(48)` (scale Dynamic Type,
   slot vertical généreux → aucun clip).
3. `emptyState` : `.accessibilityElement(children: .combine)` → titre + sous-titre lus en un
   seul élément VoiceOver (icône déjà masquée).

## Périmètre / non-régression
- 1 fichier, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve.
- Corps de liste (`FeedPostCard`), `refreshable`, pagination, `fullScreenCover` story : non touchés.
- Palette (`theme.textMuted/textSecondary`) intacte.

## Statut : à valider (compile `iOS Tests`).
