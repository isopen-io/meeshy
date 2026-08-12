# Itération 136i — Analyse UI/UX iOS : `MessageListView` (swipeIndicator)

**Date** : 2026-07-04
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift`
**Base** : `main` HEAD (`6b2a335f`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

`MessageListView` héberge le `swipeIndicator` : le retour visuel transitoire affiché pendant un swipe
horizontal sur une bulle — sous le seuil, un tampon jour+heure donne le contexte ; passé le seuil, une
flèche répondre/transférer **remplace** le tampon dans le même emplacement (crossfade). Surface
**fraîche** : 3 `.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`. **1 PR ouverte au démarrage
(#1440, calls — touche `WebRTCVideoView`/`CallsTab`)** → **ne touche PAS `MessageListView`** → **0
contention**. Numéro **136i** (135i = `SyncPill` mergé #1439).

## Constat (avant 136i)

**3 `.font(.system(size:))`** dans le `swipeIndicator`, contenu d'un `ZStack` à **largeur fixe seulement**
(`.frame(width: 64)`, hauteur libre) :
- flèche répondre/transférer (22 semibold) — affordance d'action de swipe ;
- tampon jour `swipeStampDay` (11 medium) — vrai texte ;
- tampon heure `swipeStampTime` (12 semibold) — vrai texte.

## Corrections appliquées (1 fichier, 0 logique)

- **3/3 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (mêmes tailles/poids) : flèche
  (`relative(22, weight: .semibold)`), tampon jour (`relative(11, weight: .medium)`), tampon heure
  (`relative(12, weight: .semibold)`) → tous **scalent sous Dynamic Type**. La flèche et les tampons
  s'échangent dans le **même emplacement** (crossfade) : les migrer ensemble garde le swap cohérent en
  taille.

Aucun gel : le `ZStack` n'est contraint qu'en **largeur** (`.frame(width: 64)`, pas une vignette de
dimension fixe carrée/circulaire), la hauteur reste libre — le scaler ne rogne ni ne déborde à des tailles
raisonnables. → **`relative`, pas figé**.

Accessibilité : le `swipeIndicator` est un **retour visuel transitoire de geste** (affiché uniquement
pendant un drag horizontal actif), non exposé au rotor VoiceOver — pas de `.accessibilityLabel`/`Hidden`
à ajouter ici. Palette (`MeeshyColors.brandPrimary`, `.secondary`) déjà conforme → non touchée.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI`
  déjà présent. La logique de geste (`dragGesture`, seuils, résistance) n'est **pas** touchée.
- Les 2 tests référençant `MessageListView` (`ConversationViewModelTests` comportemental,
  `MessageListPerformanceTests` de perf) **n'inspectent pas** les polices → aucune régression.

## Statut

**TERMINÉE** — `MessageListView` (swipeIndicator) Dynamic Type soldé (3/3 → `relative`). Ne plus
re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MessageListView` (`swipeIndicator`) — 3/3 (flèche répondre/transférer, tampons jour+heure) →
  `MeeshyFont.relative` ; aucun gel (ZStack à largeur fixe seulement) ; affordance de geste transitoire
  (non exposée au rotor). **SOLDÉ 136i.**
