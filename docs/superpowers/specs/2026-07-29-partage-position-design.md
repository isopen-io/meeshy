# Partage de position — crash d'autorisation, persistance, et pastille de lieu

Date : 2026-07-29
Statut : design validé, révisé après revue adversariale, prêt pour plan d'implémentation

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
- **Quatre** call sites du picker, pas trois — il y a **deux composers de post
  distincts** :
  - message : `ConversationView+Composer.swift:222`
  - composer feed inline : `FeedView.swift:1499` → `handleFeedLocationSelection`
    (`FeedView+Attachments.swift:110`)
  - `FeedComposerSheet` : `FeedView+Attachments.swift:871` →
    `handleLocationSelection` (`FeedView+Attachments.swift:1168`)
  - commentaire : `FeedCommentsSheet.swift:1140`
- Rendu SDK : `LocationMessageView`, `LocationFullscreenView`, `AdaptiveMap`.
- Modèles SDK : `LocationSharePayload` (avec `placeName`/`address`),
  `LiveLocation*`.
- Gateway : `LocationHandler` (socket `location:share`), avec une suite de
  tests complète.

### Ce qui est cassé

- **Aucune persistance de position n'existe.** `MessageAttachment` (Prisma
  `schema.prisma:726-737`) exige `fileName`, `originalName`, `mimeType`,
  `fileSize`, `filePath`, `fileUrl`, et n'a aucun champ géographique. Les seuls
  `latitude`/`longitude` du schéma appartiennent au modèle de session
  (géo-IP, `:2243-2244`).
- **Le seul chemin serveur est éphémère et mort.** `LocationHandler` est
  documenté « Real-time only — no Prisma persistence », génère un `messageId`
  temporaire, et n'est jamais appelé depuis iOS :
  `ConversationViewModel.shareLocation` (`ConversationViewModel.swift:4418`)
  n'a aucun call site. Chaîne morte complète : `shareLocation` →
  `LocationService.shareLocation` → `MessageSocketManager.emitLocationShare`
  (`MessageSocketManager.swift:1884`) → gateway.
- **Le lieu est systématiquement jeté** par les quatre call sites, dont
  `FeedCommentsSheet` qui écrit littéralement `{ coordinate, _ in }`.
- **La position d'un post ne part jamais, et par deux chemins.**
  `publishPost()` (`FeedView+Attachments.swift:1191-1198`) et
  `publishPostWithAttachments()` (`:190-203`) retournent tous deux
  `createPost(content:)` seul dans la branche « pas de fichier ». Pire : texte
  vide + position seule n'envoie **rien du tout**. Le chemin hors-ligne
  `createOfflineMediaPost` (`:211-239`) filtre en plus par `mediaFiles[$0.id]`.
- **Aucun objet position dans les stories.** `TimelineClipKind`
  (`StoryModels.swift:2590-2601`) couvre video / image / audio / text / sticker.

Personne n'avait remarqué que l'adresse était jetée, parce que rien n'arrivait
jamais à destination.

## Décisions

| Sujet | Décision |
|---|---|
| Trace du crash | Correction à l'aveugle, par revue + instrumentation |
| Périmètre | Position figée avec lieu enrichi (POI MapKit) ; pas de position en direct |
| Persistance | `metadata.location` sur `Message` / `Post` / `PostComment` |
| Architecture iOS | Modèle de valeur partagé `SharedPlace`, transporté par l'attachement existant |
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

### Persistance serveur

Bloc `location` dans le champ `metadata` (`Json?`) de `Message` (`:565`),
`Post` (`:2869`) et `PostComment` (`:3139`). Les trois existent déjà ; le
schéma documente explicitement la « parité avec `Message.metadata` /
`Post.metadata` ». **Aucune migration Prisma.**

Conséquence assumée : pas d'index géographique, donc pas de requête spatiale
ultérieure sans reprise du modèle.

### Contrat d'entrée client → serveur

**Le client n'envoie jamais de `metadata` brut.** `metadata` porte des champs à
autorité serveur (`postReplyTo`, `trackingLinks`, résumés d'appel) ; accepter un
passthrough ouvrirait une injection permettant à un client de les forger.

Les requêtes portent un champ dédié `location`, validé par le serveur, que le
serveur seul écrit dans `metadata.location`.

### Transport serveur → client

Le patron à copier est celui de `metadata.postReplyTo`, et il est **triple** :

1. **écriture** à la création — `MessageProcessor.ts:403-416`
2. **hoist REST** à la lecture — `routes/conversations/messages.ts:1318-1319`,
   via `postReplyToFromMetadata` (`services/posts/postReplySnapshot.ts:79-88`)
3. **hoist socket** au broadcast — `MessageHandler.ts:909-918`

Le champ hissé s'appelle `postReplyTo` (top-level), décodé côté SDK en
`APIPostReplyTarget` (`MessageModels.swift:316`, clé déclarée `:439`).

Pour la position, le hoist doit être répliqué sur **chaque** builder de
payload : messages REST **et** socket, posts (les **deux** chemins
d'enrichissement — précédent `trackingLinks` : `routes/posts/core.ts:23-24` et
`comments.ts:21-22`), commentaires (liste **et** réponse de création).

Rappel projet : tout champ Prisma lu doit figurer dans le `select` du resolver.

### Validation serveur

`_validateCoordinates` (`LocationHandler.ts:263-272`) est extrait en utilitaire
partagé **avant** tout retrait de code : latitude ∈ [-90, 90], longitude ∈
[-180, 180], rejet des non-nombres et de NaN. Ajout d'un bornage de longueur sur
`name`, `address`, `category`.

Appliqué aux trois écritures : création de message, de post, de commentaire.

### Rendu

`LocationMessageView` (MeeshyUI) **est étendu** pour consommer un `SharedPlace`
— il rend déjà carte + nom + adresse. `BubbleAttachmentView` lui délègue déjà
quand les coordonnées existent (`BubbleAttachmentView.swift:112`) ; seul son
fallback sans coordonnées (`:123-140`) diverge, et disparaît une fois la
position réellement transportée.

Pas de vue neuve : créer un `SharedPlaceCard` de zéro dupliquerait un rendu
existant et risquerait d'en perdre les effets visuels.

Tap → `LocationFullscreenView`, déjà écrit.

## 2. Chantier 1 — le crash

Corrigé sans trace, sur décision explicite. Les défauts ci-dessous sont réels et
corrigeables sans risque ; aucun n'est prouvé coupable. **Chaque correctif est
commité séparément**, pour qu'un éventuel re-crash reste attribuable.

### 2.1 Identité d'annotation instable (iOS 16) — compatible avec le timing

`PinItem.id = UUID()` (`AdaptiveMap.swift:197-200`) fabrique une identité neuve
à chaque construction : l'annotation est détruite et recréée en permanence. Sur
iOS 16, `onChange(of: RegionKey(region))` (`:184-186`) tire **en continu**
pendant un pan ou une animation, comportement documenté `:52-55`.

Séquence exacte à l'octroi : premier relevé → `selectedCoordinate` passe de
`nil` à une valeur (l'annotation apparaît) **et** `onReceive($userLocation)`
pose un `mapTarget` (`LocationPickerView.swift:47-54`, chemin iOS 16
uniquement) → animation de recentrage → `onChange` continu →
`updateSelectedLocation` → re-render → identité d'annotation neuve à chaque
frame, pendant une animation de région, sur le `Map(coordinateRegion:)`
déprécié.

Sur iOS 17+, `.onMapCameraChange(frequency: .onEnd)` et `Annotation`
neutralisent ce cycle.

**Correctif** : identité dérivée des coordonnées. Précédent dans le dépôt —
`LocationFullscreenView.swift:233-241` cache déjà ses items pour cette raison.
`LocationAnnotationItem` (`LocationMessageView.swift:196-199`) porte le même
défaut, hors chemin d'octroi, et est corrigé au passage.

### 2.2 Deinit isolée (SE-0466) — défaut certain, timing à réconcilier

`LocationPickerModel` est un `final class ObservableObject` explicitement
`@MainActor`, sans `deinit` écrite, dans un target compilé sous
`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` (`project.yml:28`). Swift 6.2 lui
donne alors une deinit isolée, qui passe par le shim
`swift_task_deinitOnExecutorMainActorBackDeploy` et double-libère le scope
task-local.

**Limite honnête** : une deinit ne tire qu'à la désallocation, donc à la
fermeture du sheet — pas « juste après l'octroi ». Le seul scénario qui
réconcilie les deux : le composer feed est monté sous `if showComposer`
(`FeedView.swift:558`) et le sheet du picker est accroché à `composerOverlay`
(`FeedView.swift:1498`). Si `showComposer` retombe pendant que le picker est
présenté, la vue porteuse est démontée sheet ouvert, et le modèle est
désalloué à un instant que l'utilisateur perçoit comme « pendant l'octroi ».

Note : `apps/ios/CLAUDE.md:74` indique que ce crash de teardown se manifeste
aussi sur les runtimes 18.5+ et 26.x — la borne « iOS < 26 » n'est pas fiable.

**Correctif** : `nonisolated` sur le type **plus `@unchecked Sendable`**.
Le précédent minimal est `ScrollOffsetRelay.swift:37-51` (dépliage des
`@Published` en `willSet { objectWillChange.send() }`), mais il ne suffit pas
ici : `ScrollOffsetRelay` n'a aucune capture cross-isolation, alors que
`LocationPickerModel` en a six (`LocationPickerView.swift:379`, `:392-404`,
`:420-425`, `:434`, `:451`, `:458`). Sous Swift 6 (`project.yml:9`), un type
nonisolated devient non-Sendable et ces captures **ne compilent plus**.

Le patron correct est celui du jumeau structurel NSObject + delegate :
`PiPVideoRenderer.swift:25` — `nonisolated final class X: NSObject, Protocol,
@unchecked Sendable` (voir aussi `VideoFilterPipeline.swift:417`), avec
l'invariant main-thread documenté : `CLLocationManager` créé sur le main donc
callbacks sur le main ; `CLGeocoder` et `MKLocalSearch` rappellent sur le main.

Vérifier au désassemblage que la deinit isolée a bien disparu.

### 2.3 `ClientInfoProvider.enrichWithLocation` — chemin dormant réveillé par l'octroi

`ClientInfoProvider.swift:84-114` : le garde `status == .authorizedWhenInUse`
(`:96`) était **toujours faux** avant l'octroi. Dès l'autorisation accordée, ce
code s'active pour la première fois — et à **chaque requête API** : création
d'un `CLLocationManager` jetable dans un `MainActor.run`, lecture de
`manager.location`, puis un `CLGeocoder` jetable.

C'est le seul code du process que l'octroi réveille globalement, indépendamment
du picker. Toute correction « du chemin d'autorisation » qui ne l'audite pas est
incomplète.

### 2.4 Double `requestLocation()` en vol

Mécanisme réel, mais **pas sur le chemin de l'octroi frais** : là,
`requestPermission()` voit `.notDetermined` et ne demande que l'autorisation ;
seul le callback (`:462`) déclenche le relevé. Le doublon existe quand le picker
s'ouvre déjà autorisé : `requestPermission()` (`:370`) et le callback initial
post-assignation du delegate tirent chacun. CoreLocation annule alors la
première requête et répond `kCLErrorLocationUnknown` — l'UI attend un relevé qui
n'arrive pas.

**Correctif** : garde « une seule requête en vol », remise à zéro dans
`didUpdateLocations` et `didFailWithError`.

### 2.5 `delegate` assigné dans `init()`

CoreLocation délivre le callback initial **asynchroniquement sur la runloop
après** l'assignation (`:352`), pas pendant `init()`, et la mutation passe par
un hop `@MainActor` : au pire un avertissement « Publishing changes from within
view updates », pas un crash. Correctif inoffensif, justification faible —
conservé en dernier, isolé dans son propre commit.

### 2.6 Instrumentation

Breadcrumbs `Logger` (sous-système `me.meeshy.app`, catégorie `location`) aux
cinq étapes : demande d'autorisation, changement de statut, relevé reçu, échec,
sélection confirmée. Objectif : qu'un éventuel re-crash soit diagnosticable au
lieu d'imposer une seconde correction à l'aveugle.

## 3. Chantier 2 — message, commentaire, post

- `LocationPickerView.onSelect` retourne un `SharedPlace` complet au lieu de
  `(CLLocationCoordinate2D, String?)`. La recherche MapKit fournit déjà nom et
  catégorie de POI ; le géocodage inverse couvre le point posé à la main.
- **Les quatre call sites** cessent de jeter le lieu.
- **Les deux fonctions de publication** (`publishPost` et
  `publishPostWithAttachments`) transportent la position indépendamment des
  pièces jointes — y compris le cas « position seule, texte vide », qui
  n'envoie rien aujourd'hui.
- L'envoi sérialise le champ `location` sur les trois chemins : message (socket
  et REST), post (`createPost`), commentaire (`POST /posts/:id/comments`).

### Retrait du chemin statique mort

Vérification faite : le web ne contient aucune occurrence de `location:share` ;
Android n'écoute que `location:live-*`
(`sdk-core/.../MessageSocketManager.kt:124-126`) et n'émet ni n'écoute
`location:share(d)`. Le retrait est donc sûr, mais son périmètre est plus large
que le seul handler :

- gateway : handler statique, enregistrement (`MeeshySocketIOManager.ts:148`,
  `:294-295`), `SOCKET_RATE_LIMITS.LOCATION_SHARE`, types
  (`packages/shared/types/socketio-events.ts`), tests **statiques uniquement**
  du fichier mixte `__tests__/LocationHandler.test.ts`
- SDK : `LocationService.shareLocation`, `emitLocationShare`
  (`MessageSocketManager.swift:1884`), listener `location:shared` (`:2956`),
  `LocationSharePayload`, `LocationSharedEvent`
- app : `ConversationViewModel.shareLocation`, mocks
  (`MeeshyTests/Mocks/MockMessageSocket.swift:36,96,166`)

**Tout le `live-*` est préservé** : Android en dépend, et c'est hors périmètre.

## 4. Chantier 3 — persistance locale (cache-first)

Non négociable : le principe Cache-First du dépôt interdit qu'une position soit
visible en ligne puis évaporée au relaunch. Le pipeline ne stocke pas
l'`APIMessage` brut mais des champs dérivés — c'est ainsi que `postReplyTo`
aplati est retraduit en `replyToJson`
(`MessagePersistenceActor.swift:1539+`).

- messages : décodage `APIMessage`, colonne ou JSON dans `MessageRecord.swift`,
  migration `MessageDatabaseMigrations.swift`, reconstruction
  `MessageRecord+ToMessage.swift`
- feed : `PostRecord.swift`, `CommentRecord.swift`, `FeedPersistenceActor.swift`,
  `FeedDatabaseMigrations.swift`
- outbox / hors-ligne : `OutboxRecord`, `OfflineQueue` et
  `createOfflineMediaPost` doivent sérialiser le `SharedPlace`, sinon la
  position d'un envoi hors-ligne est perdue au flush

Test de recette : position reçue → app tuée → relue depuis le cache.

## 5. Chantier 4 — pastille de lieu en story

- `StoryLocationObject` : les transforms de `StoryTextObject` (`x`, `y`,
  `scale`, `rotation`, `zIndex`, `anchor`) plus un `SharedPlace`.
- Ajout via le même `LocationPickerView`, depuis le chrome du composer de story.
- Persistance sous `locationObjects`, en suivant le Codable custom de
  `StorySlide` (`StoryModels.swift:1462-1490`) : `decodeIfPresent` **plus**
  entrée dans `CodingKeys` **plus** `encode`, sinon perte silencieuse au
  round-trip d'édition.
- `locationObjects` entre dans le `contentHash` du cache canvas, sinon le rendu
  reste figé après édition.
- **Une seule implémentation de dessin** : une branche CALayer dans
  `StoryRenderer.render` (`StoryRenderer.swift`). Le compositor
  (`StoryAVCompositor.swift:237-248`) lui délègue tout le premier plan, comme le
  canvas live (`StoryCanvasUIView+Rendering.swift:154`) et le backdrop
  (`StoryBackdropCapture.swift:172`). Une pastille dessinée là couvre canvas et
  export.
- **Décision timeline** : la pastille est hors timeline — toujours visible sur
  la slide, comme un texte sans clip temporel. `TimelineClipKind` n'est pas
  étendu.
- En lecture, tap sur la pastille → carte plein écran.

Pas de carte MapKit vivante dans le canvas : elle ne serait jamais rendue à
l'export.

## 6. Localisation

Les chaînes du rendu SDK entrent dans
`packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings` avec
`bundle: .module` (patron `LocationMessageView.swift:50-51`) ; celles du chrome
story côté app dans `apps/ios/Meeshy/Localizable.xcstrings` avec
`bundle: .main`. Une clé absente du catalogue rend le `defaultValue` français
muet dans toutes les autres langues d'interface.

## 7. Tests

- **Source-guards** (sur le code, pas les commentaires) : les quatre call sites
  ne jettent plus le lieu ; `LocationPickerModel` est `nonisolated` au niveau
  du type.
- **SDK** : round-trip `SharedPlace` ; hoist et relecture de `metadata.location`.
- **Gateway** : validation des coordonnées et bornage des chaînes sur les trois
  écritures ; rejet des valeurs hors bornes ; refus du `metadata` brut client.
- **Persistance** : position reçue → app tuée → relue du cache.
- **Rendu** : snapshot du rendu de position en clair et en sombre.
- **Story** : round-trip d'un projet portant un `StoryLocationObject` ; présence
  de la pastille dans la frame exportée.

## Risques

- **Crash corrigé sans trace.** Si la cause réelle est ailleurs, les
  breadcrumbs de 2.6 la révéleront au prochain incident. Les correctifs sont
  commités séparément pour rester attribuables.
- **E2EE non résolu.** `Message` porte `encryptedContent`/`isEncrypted`
  (`schema.prisma:661-672`) : une position en `metadata.location` clair reste
  lisible par le serveur, y compris en conversation chiffrée. À trancher
  explicitement avant l'implémentation du volet message.
- **Pas de requête géographique possible** avec `metadata.location` — accepté au
  titre du choix de persistance sans migration.
- **Le web ne rendra rien** : un post géolocalisé vu sur web perdra sa position
  à l'affichage. À assumer ou à tracer.
