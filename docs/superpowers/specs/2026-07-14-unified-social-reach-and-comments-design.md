# Unification des remontées sociales — compteurs (vues / impressions) & commentaires

**Date :** 2026-07-14
**Statut :** Design validé, prêt pour plan d'implémentation
**Périmètre :** iOS (`apps/ios`) + SDK (`packages/MeeshySDK`), vérification gateway (`services/gateway`)

## Contexte & problème

Story, Post, Réel et Mood sont **le même modèle Prisma `Post`**, discriminé par `type`
(`POST` / `REEL` / `STORY` / `STATUS`). Les compteurs vivent donc tous sur ce `Post`
unique et ses tables satellites (`PostView` unique par `(postId,userId)`, `PostImpression`
non-unique, `PostEngagement`). Il n'existe **aucune divergence de données en base**.

Le défaut est un **défaut d'affichage et de câblage client** : chaque surface lit un champ
différent sous le même mot « vues » et n'incrémente pas les mêmes champs.

| Surface | « Vues » affiche | « Impressions » | Écrit à l'ouverture |
|---|---|---|---|
| Viewer Story | `viewCount` (uniques) | — | `viewCount` (`/view`) + engagement. **Jamais `impressionCount`** |
| Détail Post | `postOpenCount` (ouvertures) | `impressionCount` | `postOpenCount` + `impressionCount` + `viewCount` |
| Réel | `postOpenCount` | `impressionCount` | idem détail |
| Mood/Status | *aucun* | *aucun* | *rien* |

**Conséquence observée** : pour une même story, le détail affiche « 1 vue » (`postOpenCount`
= 1 ouverture de détail) et le viewer affiche « 3 vues » (`viewCount` = 3 spectateurs
uniques). Deux champs différents sous le même label.

**Commentaires** : déjà unifiés côté back (un seul `PostComment` sur `postId`, un seul
endpoint `/posts/:id/comments`, mêmes events socket `comment:added`/`comment:deleted`,
compteur unique `Post.commentCount`, cache client `post-<id>`). Mais le viewer story
**recalcule `commentCount` localement** à partir des commentaires chargés, alors que le
détail applique le `commentCount` **autoritatif du serveur** → divergence d'affichage
possible. Les Moods n'ont **aucun** chemin de commentaires (réponse en DM).

## Décisions produit (validées)

1. **Affichage unifié = 2 métriques partout** : **Vues uniques** (`viewCount`) +
   **Impressions** (`impressionCount`). Author-only (inchangé). C'est la sémantique cible
   sur Story, Détail, Réel, Mood.
2. **Impressions Story** : chaque **slide EST une story** (un `Post` STORY distinct). À
   **chaque changement de slide**, on émet **1 impression** via `/impression` pour *ce*
   `postId`. La vue unique (`viewCount`) reste 1/utilisateur. Non-idempotent (monte à
   chaque visionnage), aligné sur le détail.
3. **Périmètre Mood** : aligner les **compteurs uniquement** (view + impression + affichage
   author-only). **Pas** de fil de commentaires public sur les Moods — la réponse en DM est
   conservée.

## Principe directeur

Un `Post` = une source de vérité. Toutes les surfaces **lisent les mêmes champs** via un
formateur central et **écrivent les mêmes champs** via un recorder central. On règle la
cause racine (« chaque surface fait sa sauce »), pas seulement le symptôme « 1 vs 3 ».

## Approche retenue

**Centralisation côté client** (Approche 1). Les champs (`viewCount`, `impressionCount`)
et endpoints (`/view`, `/impression`) existent déjà → **backend quasi inchangé**. L'essentiel
est iOS/SDK : mapping des modèles + un formateur de lecture partagé + un recorder d'écriture
partagé + câblage des surfaces.

Approches écartées :
- **Endpoint serveur unique « record engagement »** : refonte d'endpoints qui marchent →
  risque de régression disproportionné.
- **Patch minimal** : laisse la duplication (4 formateurs, 4 câblages) → re-divergence
  garantie à la prochaine surface. Contredit « restituer les mêmes informations partout ».

## Composants

### C1 — Modèles SDK : porter les 2 compteurs partout
- `StoryItem` (`packages/MeeshySDK/.../Models/StoryModels.swift`) : ajouter
  `impressionCount` (possède déjà `viewCount`, `commentCount`), hydraté depuis
  `post.impressionCount`.
- `StatusEntry` (même fichier) : ajouter `viewCount` + `impressionCount` + `commentCount`,
  aujourd'hui **abandonnés** par `toStatusEntry()`. Les mapper depuis l'`APIPost`.
- `FeedPost` / `APIPost` portent déjà tous les champs — inchangés.

### C2 — Lecture centralisée : un seul formateur de portée
- Promouvoir `PostReachFormatter` (aujourd'hui dans
  `apps/ios/.../Views/PostDetailReachAndVisibility.swift`, réservé au détail) en
  **composant partagé** consommé par : Détail, Réel (feed card + player), Feed post card,
  **Viewer Story**, **Bulle Mood**.
- Sortie unifiée : `viewCount` (icône `eye.fill`, label « vues ») + `impressionCount`
  (icône `chart.bar.fill`, label « impressions »), **author-only** (renvoie `nil` si
  non-auteur).
- **Bascule sémantique** : Détail et Réel migrent de `postOpenCount` → `viewCount` pour le
  label « vues ». `postOpenCount` reste calculé serveur (analytics) mais n'est plus l'étiquette
  publique.
- Supprimer les `compactCount` dupliqués (FeedPostCard, ReelFeedCard, ReelsPlayerView) au
  profit du formateur central.

### C3 — Écriture centralisée : recorder de surface
- Helper app-side (encode une règle produit « quand faire X » → app-side, cf. SDK purity) :
  « à l'ouverture d'un contenu-Post sur surface `S` → `PostService.viewPost(postId)`
  (viewCount, dédoublonné serveur) + `PostService.recordImpression(postId, source: S)`
  (impressionCount, non dédoublonné) ». Les primitives existent déjà dans le SDK.
- Câblage :
  - **Story** : à chaque changement de slide (chaque `Post` STORY affiché) → view +
    impression `source:"story"` pour *ce* `postId`. Aujourd'hui `markCurrentViewed()` ne
    fait que la vue ; on ajoute l'impression. La vue passe par l'outbox coalescé (idempotent) ;
    l'impression est intentionnellement non-coalescée (monte à chaque visionnage).
  - **Détail** / **Réel** : déjà view + impression ; passent par le recorder pour
    cohérence, comportement inchangé.
  - **Mood** : à l'affichage de la bulle → view + impression `source:"status"`. Nouveau.

### C4 — Une seule vérité pour le compteur de vues
- Le bouton « Vues » du viewer story lit `viewCount` dénormalisé (autoritatif, MAJ via
  l'event `story:viewed`).
- La sheet « vu par » (`StoryViewersSheet`) affiche aujourd'hui `viewers.count` (longueur
  de la liste `/interactions`). Son **en-tête bascule sur `viewCount` autoritatif** →
  élimine le « bouton dit 3 / sheet dit 2 ». La liste enrichie reste inchangée.

### C5 — Commentaires : compteur autoritatif partout
- Le viewer story **cesse de recalculer `commentCount` localement**
  (`StoryViewerView+Content.swift`, recalcul depuis top-level + replies). Il **applique le
  `commentCount` autoritatif** du serveur (payload post + events `comment:added`/`deleted`
  qui portent `commentCount`), exactement comme `PostDetailViewModel`.
- Liste, endpoint, cache `post-<id>` et abonnements socket étant déjà partagés → remontée
  identique en temps réel entre viewer story et détail.

### Backend
- Quasi inchangé. Vérifier que `POST /posts/:id/impression` accepte `source:"story"` /
  `source:"status"` (le champ `PostImpression.source` est une string libre
  `@default("feed")`, a priori sans contrainte enum — à confirmer, aucune migration attendue).

## Non-objectifs (YAGNI)
- Pas d'endpoint serveur unifié « record engagement ».
- Pas de commentaires publics sur les Moods (réponse DM conservée).
- Pas de changement de visibilité : compteurs restent author-only partout.
- Pas de refonte de `postOpenCount` / `qualifiedViewCount` / `playCount` en base.

## Stratégie de test (TDD)
- **SDK (Swift Testing / XCTest)** : décodage `StoryItem.impressionCount` ;
  `StatusEntry.viewCount/impressionCount/commentCount` mappés depuis `APIPost`.
- **Formateur central** : `viewCount` + `impressionCount` author-only ; `nil` si non-auteur.
- **Recorder / câblage** : changement de slide story → 1 `viewPost` + 1 `recordImpression`
  sur le bon `postId` ; affichage mood → 1 view + 1 impression `source:"status"`.
- **Commentaires** : viewer story applique le `commentCount` autoritatif (pas de recalcul
  local) sur `comment:added`/`comment:deleted`.
- **Gateway** : `/impression?source=story` incrémente `impressionCount` ; `/view` reste
  dédoublonné (`PostView.@@unique`).
- `./apps/ios/meeshy.sh test` doit passer avant tout commit.

## Fichiers clés (référence)
- `packages/shared/prisma/schema.prisma` — `Post` (viewCount:2893, impressionCount:2894,
  postOpenCount:2899, commentCount:2891), `PostView` (unique:3128), `PostImpression` (3135),
  enum `PostType` (2764).
- `services/gateway/src/routes/posts/interactions.ts` — `/view` (253), `/impression` (331),
  `/impressions/batch` (380).
- `services/gateway/src/services/PostService.ts` — `recordView` (996-1064).
- `packages/MeeshySDK/.../Services/PostService.swift` — `viewPost` (251), `recordImpression`
  (309), `getComments` (186).
- `packages/MeeshySDK/.../Models/StoryModels.swift` — `StoryItem.viewCount` (1692),
  `toStatusEntry` (2003), `StatusEntry` (1864).
- `apps/ios/.../Views/PostDetailReachAndVisibility.swift` — `PostReachFormatter` (7-26).
- `apps/ios/.../Views/StoryViewerView.swift` / `+Sidebar.swift` / `+Content.swift` — bouton
  Vues (Sidebar:324), `StoryViewersSheet` (Content:937), recalcul commentCount (Content:1658).
- `apps/ios/.../ViewModels/PostDetailViewModel.swift` — `registerDetailOpen` (125),
  commentCount autoritatif (753, 803).
- `apps/ios/.../Views/ReelsPlayerView.swift`, `ReelFeedCard.swift` — affichage portée réel.
- `apps/ios/.../Views/Status*` + `StatusViewModel.swift` — surface Mood.

## Livraison
Implémentation en incréments TDD (RED → GREEN → REFACTOR), commits cohérents et distincts
sur `main`, tests iOS verts, puis push (laisser le repo clean). Les fichiers préexistants en
staging (tests iOS + `project.pbxproj`, hors périmètre) ne sont **pas** inclus.
