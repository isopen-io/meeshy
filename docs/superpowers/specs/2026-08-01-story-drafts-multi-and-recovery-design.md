# Brouillons de story multiples et récupération d'une publication échouée

Date : 2026-08-01
Portée : `packages/MeeshySDK/Sources/MeeshySDK/Store/`, `packages/MeeshySDK/Sources/MeeshyUI/Story/`, `apps/ios/Meeshy/Features/Main/`

## Problème

Une story dont la publication échoue en boucle met le travail en danger, et
l'interface ne laisse aucun moyen propre de le récupérer.

### 1. Un seul brouillon à la fois

`StoryDraftStore` est mono-brouillon par construction : `save(slides:visibility:)`
ouvre par un `DELETE FROM story_draft_slide`, `saveMedia` vide la table ET le
répertoire médias, et aucune des trois tables ne porte d'identifiant de
brouillon. Commencer une deuxième story écrase silencieusement la première.

### 2. Un échec de publication n'est pas ré-éditable

`StoryPublishQueue` fait ce qu'il faut côté transport : retry exponentiel
(30 s / 2 min / 10 min / 1 h / 2 h), 5 tentatives, puis l'item bascule dans
`failedItems` — **avec ses médias locaux conservés**, plafonné à 20 entrées.
`MyStoriesView` liste déjà ces échecs.

Mais `FailedStoryRow` n'offre que « réessayer » et « supprimer ». Republier à
l'identique ce qui vient d'échouer cinq fois est rarement la bonne action : il
faut pouvoir **rouvrir la story dans le composer**, corriger, puis republier.
C'est la demande centrale.

### 3. Le badge d'échec masque l'accès à la liste

`StoryUploadOverlay` se pose sur l'avatar « Moi » du tray et porte
`.allowsHitTesting(isFailed)`. En état `.failed` il capture donc le tap destiné
à l'avatar, dont le geste ouvre « Mes stories » (`onManageStories`). Le `/!`
rend la liste des stories inatteignable — exactement au moment où l'utilisateur
en a besoin.

## Décisions

| Question | Décision |
|---|---|
| Création d'un brouillon | Automatique à la sortie du composer, **si la story a du contenu** |
| Story ayant épuisé ses tentatives | Reste dans « Échecs de publication » — section distincte des brouillons |
| Retry automatique | Inchangé (30 s → 2 h, 5 tentatives) puis bascule en échec |

**Tension tranchée.** « Deux sections distinctes » et « puis bascule en
brouillon » se contredisent si la bascule est automatique. Retenu : l'échec
**reste** un échec dans sa propre section, et ne devient un brouillon éditable
qu'au moment où l'utilisateur appuie sur « Reprendre ». La conversion est une
action, pas un effet de bord.

Le garde de contenu existe déjà : `composerHasContent`
(`StoryComposerView+Publication.swift`), posé au commit `4451c3afd` — « un
composer vierge ne piège plus la sortie ni ne sème de brouillon fantôme ».

## Conception

### Increment 1 — le badge d'échec cesse de bloquer

`StoryUploadOverlay.allowsHitTesting(false)` **inconditionnellement**. Le badge
redevient purement informatif ; tap et appui long tombent sur l'avatar, qui
ouvre « Mes stories » où vivent déjà retry, suppression et — après l'incrément
5 — la reprise.

Le menu contextuel retry/annuler porté par l'overlay disparaît : ses deux
actions existent à l'identique dans `MyStoriesView`, sur une ligne qui montre en
plus le motif de l'échec. Un geste caché sur une pastille de 50 pt n'était pas
une surface d'action défendable.

### Increment 2 — `StoryDraftStore` devient multi-brouillon

Nouvelle table et clé de partition sur les trois existantes :

```sql
CREATE TABLE story_draft (
  id          TEXT PRIMARY KEY,
  visibility  TEXT   NOT NULL,
  created_at  DOUBLE NOT NULL,
  updated_at  DOUBLE NOT NULL,
  cover_file  TEXT               -- vignette de la première slide
)
story_draft_slide : + draft_id, clé primaire (draft_id, id)
story_draft_meta  : + draft_id, clé primaire (draft_id, key)
story_draft_media : + draft_id, clé primaire (draft_id, element_id)
```

Les médias passent de `meeshy_draft_media/` à
`meeshy_draft_media/<draft_id>/` — sans quoi deux brouillons qui portent le
même `element_id` (un id de slide recyclé) écraseraient leurs fichiers.

**Migration.** Le schéma est créé par `createSchema()` avec `ifNotExists`, donc
une base existante ne bougerait pas. On ajoute une migration explicite : si
`story_draft_slide` existe sans colonne `draft_id`, on génère un id, on
l'affecte à toutes les lignes, et on déplace les fichiers de
`meeshy_draft_media/` vers `meeshy_draft_media/<id>/`. Un brouillon en cours ne
doit pas être perdu par la mise à jour — c'est précisément le grief qu'on traite.

API : chaque méthode prend un `draftId`. S'ajoutent

```swift
public func listDrafts() -> [StoryDraftSummary]   // triés par updatedAt décroissant
public func delete(draftId: String)
```

`StoryDraftSummary` (SDK) : `id`, `updatedAt`, `slideCount`, `coverURL`,
`title` — le titre étant dérivé du premier `StoryTextObject` non vide, ou `nil`.

Les anciennes signatures sans `draftId` sont **supprimées**, pas doublées : deux
portes vers le même store est le défaut qui a produit l'écrasement silencieux.

### Increment 3 — le composer porte une identité de brouillon

`StoryComposerViewModel` reçoit un `draftId` à la construction : un UUID neuf
pour une story vierge, celui du brouillon repris sinon. Tout l'autosave
(`save`, `saveMedia`, `saveCommandHistoryBlob`) écrit sous cet id.

- Sortie sans publier **et** `composerHasContent` → le brouillon reste.
- Sortie sans publier et composer vierge → `delete(draftId:)`.
- Publication réussie → `delete(draftId:)`.

### Increment 4 — section « Brouillons » dans `MyStoriesView`

Une section listant `listDrafts()`, au-dessus de « Échecs de publication » (le
travail jamais tenté précède le travail à réparer) :

- ligne : vignette, titre ou « N diapositives », date relative ;
- tap → ouvre le composer sur ce brouillon ;
- balayage → supprime, avec la même confirmation que les stories publiées.

`MyStoriesEmptyStateResolver` prend un paramètre `hasDrafts` : la vue ne doit
plus afficher « Aucune story envoyée » alors que des brouillons existent.

### Increment 5 — reprendre un échec

`FailedStoryRow` gagne une action « Reprendre » qui :

1. décode `slidesPayload` et résout `mediaReferences` ;
2. écrit un brouillon neuf via `StoryDraftStore` (les fichiers médias sont
   copiés dans `meeshy_draft_media/<nouvel id>/` — l'item de file peut être
   supprimé ensuite sans emporter les médias) ;
3. `discardFailedItem` sur l'item de file ;
4. ouvre le composer sur ce brouillon.

L'ordre compte : la copie des médias précède la suppression de l'item, sinon un
échec au milieu laisse un brouillon aux médias manquants ET plus d'item de file
— le travail serait perdu par l'action censée le sauver.

Cette orchestration lit des singletons nommés Meeshy et encode une décision
produit : elle vit **app-side** (`StoryViewModel`), pas dans le SDK, conformément
à la règle de pureté du SDK.

## Fichiers

| Incrément | Fichiers |
|---|---|
| 1 | `StoryTrayView.swift` |
| 2 | `StoryDraftStore.swift`, `StoryDraftSummary.swift` (nouveau, SDK) |
| 3 | `StoryComposerViewModel.swift`, `+Lifecycle`, `+SyncRestore`, `StoryComposerView+Publication.swift` |
| 4 | `MyStoriesView.swift`, `MyStoriesEmptyStateResolver.swift` |
| 5 | `MyStoriesView.swift`, `StoryViewModel.swift` |

## Tests

TDD, RED d'abord, un incrément à la fois.

**Incrément 1** — garde de source sur `StoryTrayView` : l'overlay d'upload ne
doit porter aucun `allowsHitTesting` conditionnel. Ancré sur le comportement
(le tap atteint l'avatar), pas sur la chaîne exacte.

**Incrément 2** — `StoryDraftStoreTests`, sur une base temporaire via
`init(dbPath:mediaDirectory:)` :
- deux brouillons coexistent, chacun relit ses propres slides ;
- écrire le brouillon B ne touche ni les slides ni les médias de A (le défaut
  d'origine) ;
- `listDrafts()` trie par `updatedAt` décroissant et compte les slides ;
- `delete(draftId:)` n'emporte que son brouillon ET son sous-répertoire médias ;
- migration : une base au schéma mono, peuplée, est relue comme un brouillon
  unique après ouverture, médias compris.

**Incrément 3** — sortie avec contenu → le brouillon existe ; sortie vierge →
`listDrafts()` est vide ; publication réussie → le brouillon a disparu.

**Incrément 4** — `MyStoriesEmptyStateResolver` : des brouillons seuls
suffisent à écarter l'état vide.

**Incrément 5** — la reprise écrit le brouillon AVANT de retirer l'item de
file ; un échec de copie des médias laisse l'item de file intact (le travail
n'est jamais perdu entre deux états).

## Hors périmètre

- Le format d'échange des brouillons entre appareils (les brouillons restent
  locaux — aucune synchronisation serveur).
- La politique de retry de `StoryPublishQueue`, inchangée.
- Le pipeline d'upload lui-même (`runStoryUpload`).
