# Plan — Iteration 223i : cibles tactiles de `FriendRequestListView`

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-223i-friendrequest-touch-targets.md`
**Base** : `main` HEAD `2450cdb82`
**Branche** : `claude/quirky-curie-16693v` (recréée depuis `origin/main` après merge de 217i / PR #2344)

## Objectif

Porter les **trois** commandes de `FriendRequestListView` au plancher HIG de
44 × 44 pt — retour (~17 pt, **aucun `frame`**, seule sortie de l'écran), refuser
(36 pt) et accepter (36 pt) — **sans changer la taille d'une seule pastille ni
l'écart entre elles**.

## Étapes

1. **RED** — `MeeshyTests/Unit/Views/FriendRequestListTouchTargetTests.swift`
   (5 tests / 12 assertions).
2. **GREEN** — 3 corrections dans un seul fichier de production :
   - retour : `.frame(width: 44, height: 44, alignment: .leading)` +
     `.contentShape(Rectangle())` ;
   - contrepoids d'en-tête : `Color.clear.frame(width: 24)` → `44` ;
   - refuser / accepter : `.frame(width: 44, height: 44)` +
     `.contentShape(Circle())` **après** le `.background(Circle())`, et
     `HStack(spacing: 8)` → `spacing: 0`.
3. **Vérifier** — pas de toolchain Swift sous Linux : correspondance de chaînes,
   RED recalculé sur `git show origin/main:…`, équilibre accolades / parenthèses /
   crochets au tokenizer. Gate réel = CI `iOS Tests`.
4. Mettre à jour `docs/plans/uiux/branch-tracking.md`.

## Invariants

- **Les pastilles restent à 36 pt.** Le test compte `frame(width: 36, height: 36)`
  == 2 : une correction qui aurait grossi les cercles échoue.
- **L'écart visible reste 8 pt** grâce à `spacing: 0` (4 pt de retrait de chaque
  côté d'une pastille de 36 centrée dans 44).
- **Les 3 `.accessibilityLabel` sont préservés** (compte == 3) : la passe motrice
  ne doit pas coûter la passe lecteur d'écran déjà faite.
- 0 clé i18n, 0 couleur, 0 logique, 0 réseau, 0 `import`.
- 0 fichier de production neuf ⇒ **0 édition de `project.pbxproj`**.

## Changement visuel assumé

Le titre d'en-tête était centré entre un contrôle de ~17 pt et un contrepoids de
24 pt ⇒ **décentré d'environ 3 pt**. Avec 44 des deux côtés il devient réellement
centré. C'est une correction, mais c'est un changement — signalé au review.

## Hors périmètre

`MessageOverlayMenu.videoControls` (la pire cible de l'inventaire 221i, 14 × 14) :
écartée **après lecture**. Ses 3 commandes de transport partagent leur rangée avec
5 autres éléments dans une largeur bornée par la bulle de message ⇒ ~+71 pt,
risque de troncature non vérifiable sans simulateur. L'issue propre passe par la
suppression du compteur `%` redondant (déjà `accessibilityHidden`) — arbitrage de
design, pas correctif de surface. Reporté en 224i.

## Suites (224i+)

1. `MessageOverlayMenu.videoControls` (avec simulateur).
2. Reste de l'inventaire 221i au cas par cas : `CommentMediaView:33`,
   `ConversationListHelpers:375`, `MyStoriesView:162`, `StoryViewerContainer:175`,
   `WidgetPreviewView:475`, `ConversationListView+Overlays:994/1005`.
3. Modificateur partagé `.meeshyHitTarget(_:shape:)` — **après** 2-3 applications
   du patron, pour que l'abstraction soit tirée par des cas réels.
