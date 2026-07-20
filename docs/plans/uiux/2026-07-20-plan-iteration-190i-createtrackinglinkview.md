# Plan Iteration-190i — CreateTrackingLinkView (a11y VoiceOver + HIG)

**Date**: 2026-07-20
**Scope**: iOS-only
**Target**: `apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift` (166 lignes)
**Type**: Accessibility (VoiceOver) + HIG feedback

## Contexte

Sheet `NavigationStack` de création d'un lien de tracking (6 champs, section UTM
repliable, bouton créer async). Fichier **sans aucun** modificateur d'accessibilité.
Déjà localisé (`String(localized:)`) et fonts sémantiques → Dynamic Type OK : la
passe est **VoiceOver + HIG uniquement**. Aucune PR ouverte ne touche ce fichier
(distinct de `TrackingLinksView` #2138 et `TrackingLinkDetailView` #2122). 0 test.

## Déficits (avant)

1. `formField` — `Text` label + `TextField` = 2 éléments séparés ; le `TextField`
   n'a qu'un placeholder visuel, pas de label VoiceOver. Champ URL requis (`*`) lu
   « étoile » sans notion d'obligation.
2. Bouton repli UTM — chevron décoratif vocalisé ; aucun état développé/réduit
   annoncé.
3. Bouton créer — bascule `ProgressView` ↔ label selon `isCreating` sans annonce
   de chargement ; état désactivé purement visuel (`.opacity`).
4. `errorMessage` — rendu visuellement mais jamais annoncé à VoiceOver.

## Décisions

- **formField** : `Text` label → `.accessibilityHidden(true)` ; `TextField` reçoit
  `.accessibilityLabel` + `.accessibilityHint` (params optionnels rétro-compatibles,
  défauts `nil`). Champ URL : label a11y propre (sans `*`) + hint « Champ obligatoire ».
- **Bouton UTM** : chevron `.accessibilityHidden(true)` ; `.accessibilityValue`
  développé/réduit (**réutilise** `accessibility.section_expanded/collapsed`) + hint.
- **Bouton créer** : `.accessibilityLabel` explicite (survit au `ProgressView`) +
  `.accessibilityValue` « Création en cours » quand `isCreating` + hint quand invalide.
- **Erreur** : `AccessibilityNotification.Announcement(...).post()` dans le `catch`
  (déterministe, pas d'`onChange` version-dépendant, SwiftUI iOS 15+).

## i18n

5 clés neuves × 5 locales (de/en/es/fr/pt-BR), insérées sans reformater le xcstrings :
`tracking.link.create.field.url.a11y`, `a11y.tracking.field.required`,
`a11y.tracking.utm.hint`, `a11y.tracking.create.in-progress`,
`a11y.tracking.create.disabled.hint`. Réutilise `accessibility.section_expanded/collapsed`.

## Gate

CI « iOS Tests ». Pas de logique/couleur/police modifiée. Signature `formField`
rétro-compatible (défauts `nil`) → les 5 appels existants compilent inchangés.
