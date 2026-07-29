# Partage de position — crash d'autorisation, persistance, et pastille de lieu

Date : 2026-07-29
Statut : design validé, prêt pour plan d'implémentation

## Problème

Deux symptômes rapportés, une même racine : le partage de position n'a jamais
été terminé.

1. **L'app plante juste après l'octroi de l'autorisation de localisation** —
   avant même que l'utilisateur ait pu choisir un point sur la carte.
2. **Envoyer une position ne produit rien de durable.** L'utilisateur demande à
   pouvoir partager sa position en message, en commentaire, en post, et comme
   objet de story — avec une carte et le nom du lieu.

### Ce qui existe

- `LocationPickerView` (app) : carte, recherche MapKit, géocodage inverse,
  bouton « Ma position », bandeau de refus.
- Trois points d'entrée déjà câblés : message
  (`ConversationView+Composer`), post (`FeedView`), commentaire
  (`FeedCommentsSheet`).
- Rendu SDK : `LocationMessageView`, `LocationFullscreenView`, `AdaptiveMap`.
- Modèles SDK : `LocationSharePayload` (avec `placeName`/`address`),
  `LiveLocation*`.
- Gateway : `LocationHandler` (socket `location:share`), avec une suite de
  tests complète.

### Ce qui est cassé

- **Aucune persistance de position n'existe.** `MessageAttachment` (Prisma)
  exige `fileName`, `originalName`, `mimeType`, `fileSize`, `filePath`,
  `fileUrl`, et ne possède aucun champ géographique. Un attachement position
  n'a pas de fichier : il ne peut pas être stocké. Les seuls
  `latitude`/`longitude` du schéma appartiennent au modèle de session (géo-IP).
- **Le seul chemin serveur est éphémère et mort.** `LocationHandler` est
  documenté « Real-time only — no Prisma persistence », génère un `messageId`
  temporaire, et n'est jamais appelé depuis iOS :
  `ConversationViewModel.n(...)` n'a aucun call site. Code mort des deux côtés.
- **Le lieu est systématiquement jeté.** `handleLocationSelection(coordinate:address:)`
  ignore son paramètre `address` ; `FeedCommentsSheet` écrit `{ coordinate, _ in }`.
  L'attachement local ne porte que lat/lng.
- **La position d'un post ne part jamais.** `publishPost()` retourne
  `createPost(content:)` seul dans la branche « pas de fichier » ; un
  attachement position, qui n'a aucun fichier, est silencieusement perdu.
- **Aucun objet position dans les stories.** `TimelineClipKind` couvre
  video / image / audio / text / sticker.

Personne n'avait remarqué que `address` était jeté, parce que rien n'arrivait
jamais à destination.

## Décisions

| Sujet | Décision |
|---|---|
| Trace du crash | Correction à l'aveugle, par revue + instrumentation |
| Périmètre | Position figée avec lieu enrichi (POI MapKit) ; pas de position en direct |
| Persistance | `metadata.location` sur `Message` / `Post` / `PostComment` |
| Architecture iOS | Modèle de valeur partagé `SharedPlace` + rendu unique, transporté par l'attachement existant |
| Objet story | Pastille de lieu (badge déplaçable), pas de carte vivante |

## 1. Fondations — un modèle, un rendu

### `SharedPlace`

Unique représentation d'un lieu dans le produit. `Codable`, `Sendable`, dans
`MeeshySDK` :

- `latitude: Double`
- `longitude: Double`
- `name: String?` — nom du POI ou du lieu
- `address: String?`
- `category: String?` — catégorie MapKit du POI

### Persistance

Bloc `location` dans le champ `metadata` (`Json?`) de `Message`, `Post` et
`PostComment`. Les trois existent déjà ; le schéma documente explicitement la
« parité avec `Message.metadata` / `Post.metadata` ». **Aucune migration
Prisma.**

Conséquence assumée : pas d'index géographique, donc pas de requête spatiale
ultérieure sans reprise du modèle.

### Transport

Le gateway aplatit `metadata.location` en un champ de premier niveau dans les
charges API et socket ; le SDK le décode en `SharedPlace`.

C'est exactement le patron déjà en place pour `metadata.postReplyTo`, aplati en
champ `n` et décodé en `APIPostReplyTarget`. Le SDK ne décode pas `metadata`
brut, et ce design ne l'y oblige pas.

Rappel projet : tout champ Prisma lu doit figurer dans le `select` du resolver.

### Validation serveur

`_validateCoordinates` (aujourd'hui privé à `LocationHandler`) est extrait en
utilitaire partagé **avant** tout retrait de code au chantier 2 : latitude ∈
[-90, 90], longitude ∈ [-180, 180], rejet des non-nombres. Ajout d'un bornage
de longueur sur `name`, `address`, `category`.

Il est appliqué aux trois écritures qui acceptent désormais une position :
création de message, création de post, création de commentaire.

### Rendu

Une seule vue `SharedPlaceCard` (MeeshyUI) : vignette de carte + nom + adresse.
Elle remplace `LocationMessageView` et la branche location de
`BubbleAttachmentView`, qui affichent aujourd'hui chacune leur version
divergente d'une position. Tap → `LocationFullscreenView`, déjà écrit.

## 2. Chantier 1 — le crash

Corrigé sans trace, sur décision explicite. Les quatre défauts ci-dessous sont
réels et corrigeables sans risque ; aucun n'est prouvé coupable. Ordre de
suspicion décroissante.

### 2.1 Deinit isolée (SE-0466) — suspect principal

`LocationPickerModel` est un `final class ObservableObject` explicitement
`@MainActor`, **sans `deinit` écrite**, dans un target compilé sous
`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`. Swift 6.2 lui donne alors une
deinit isolée, qui sur iOS < 26 passe par le shim
`swift_task_deinitOnExecutorMainActorBackDeploy` — lequel double-libère le
scope task-local et tue le processus.

Signature identique au crash `ScrollOffsetRelay` déjà rencontré sur ce projet.
Le picker étant présenté en sheet, ce chemin est exercé à chaque fermeture.

**Correctif** : `nonisolated` sur le type. Comme `nonisolated` est incompatible
avec les property wrappers, les `@Published` sont dépliés en :

```swift
public var selectedCoordinate: CLLocationCoordinate2D? {
    willSet { objectWillChange.send() }
}
```

Les consommateurs `@ObservedObject`/`@StateObject` s'abonnent à
`objectWillChange` : comportement identique. Les mutations continuent de passer
par les hops `Task { @MainActor }` déjà en place.

### 2.2 Double `requestLocation()` en vol

`requestPermission()` (branche autorisée) et
`locationManagerDidChangeAuthorization` peuvent tous deux déclencher un relevé.
Deux requêtes concurrentes font annuler la première par CoreLocation, qui
répond `kCLErrorLocationUnknown` — l'UI reste alors en attente d'un relevé qui
n'arrive pas.

**Correctif** : garde « une seule requête en vol », remise à zéro dans
`didUpdateLocations` et `didFailWithError`.

### 2.3 `delegate` assigné dans `init()`

iOS appelle `locationManagerDidChangeAuthorization` dès l'assignation du
delegate — donc pendant `init()`, avant que le `@StateObject` ne soit installé
par SwiftUI.

**Correctif** : assignation déplacée dans `requestPermission()`, rendu
idempotent.

### 2.4 Identité d'annotation instable

`PinItem` (`AdaptiveMap`) et `LocationAnnotationItem` (`LocationMessageView`)
construisent `let id = UUID()`, donc une identité neuve à chaque rendu :
l'annotation est détruite et recréée en permanence. Sur iOS 16, combiné à
`onRegionChange → updateSelectedLocation → rerender`, cela entretient un cycle
de rendu.

**Correctif** : identité dérivée des coordonnées.

### 2.5 Instrumentation

Breadcrumbs `Logger` (sous-système `me.meeshy.app`, catégorie `location`) aux
cinq étapes : demande d'autorisation, changement de statut, relevé reçu, échec,
sélection confirmée. Objectif : qu'un éventuel re-crash soit diagnosticable
au lieu d'imposer une seconde correction à l'aveugle.

## 3. Chantier 2 — message, commentaire, post

- `LocationPickerView.onSelect` retourne un `SharedPlace` complet au lieu de
  `(CLLocationCoordinate2D, String?)`. La recherche MapKit fournit déjà nom et
  catégorie de POI ; le géocodage inverse couvre le point posé à la main.
- Les trois call sites cessent de jeter le lieu, dont `FeedCommentsSheet`.
- L'envoi sérialise `metadata.location` sur les trois chemins : message
  (socket et REST), post (`createPost`), commentaire
  (`POST /posts/:id/comments`).
- **Trou d'envoi de post corrigé** : la position voyage indépendamment des
  pièces jointes, donc un post sans média conserve sa position.
- Le chemin socket **statique** `location:share` et son pendant iOS
  `ConversationViewModel.n(...)`, morts des deux côtés, sont supprimés — y
  compris les tests gateway qui couvrent ce seul chemin. Les handlers de
  position en direct (`handleLiveLocationStart/Update/Stop`) et leurs tests
  **restent en place** : hors périmètre, et leur retrait fermerait une capacité
  déjà modélisée côté SDK.
- Rendu par `SharedPlaceCard` dans la bulle de message, la carte de post et la
  ligne de commentaire.

## 4. Chantier 3 — pastille de lieu en story

- `StoryLocationObject` : les transforms de `StoryTextObject` (`x`, `y`,
  `scale`, `rotation`, `zIndex`, `anchor`) plus un `SharedPlace`.
- Ajout via le même `LocationPickerView`, depuis le chrome du composer de
  story.
- Persistance dans le JSON de story sous `locationObjects`, à côté de
  `textObjects` et `stickerObjects`.
- Rendu dans le canvas **et** dessin explicite dans le compositor d'export : le
  compositor custom dessine chaque frame lui-même, donc un objet non pris en
  charge sort invisible de la vidéo exportée.
- En lecture, tap sur la pastille → carte plein écran.

Pas de carte MapKit vivante dans le canvas : elle ne serait jamais rendue à
l'export.

## 5. Tests

- **Source-guards** (patron du projet, sur le code et non les commentaires) :
  le picker ne jette plus le lieu ; `LocationPickerModel` est `nonisolated` au
  niveau du type.
- **SDK** : round-trip `SharedPlace`, aplatissement et relecture de
  `metadata.location`.
- **Gateway** : validation des coordonnées et bornage des chaînes sur les trois
  écritures (message, post, commentaire) ; rejet des valeurs hors bornes.
- **Rendu** : snapshot de `SharedPlaceCard` en clair et en sombre.
- **Story** : round-trip d'un projet portant un `StoryLocationObject` ; présence
  de la pastille dans la frame exportée.

## Risques

- **Crash corrigé sans trace.** Si la cause réelle est ailleurs, les
  breadcrumbs de 2.5 la révéleront au prochain incident.
- **Pas de requête géographique possible** avec `metadata.location` — accepté au
  titre du choix de persistance sans migration.
- **Suppression de code mort** (`location:share`) : à confirmer qu'aucun client
  web ou Android ne l'émet avant retrait.
