# Vues enrichies des attachements — design

Date : 2026-07-24
Périmètre : messages / conversations uniquement (stories, posts et réels hors lot)

> **Lot 2 de 2.** Dépend de `2026-07-24-read-exactness-design.md`, qui corrige la
> sur-déclaration de lecture. Livrer ce lot en premier produirait une feuille
> « vues » précise mais fausse : des participants y apparaîtraient comme ayant vu
> un message jamais affiché.

## Problème

La feuille « vues » d'un attachement (`MessageViewsDetailView`) affiche aujourd'hui,
par participant, une date et une position de lecture unique. Trois questions
produit restent sans réponse :

1. **Vidéo** — quelles portions ont réellement été regardées ? `lastWatchPositionMs`
   donne la dernière position, pas la couverture. Un participant qui saute au
   générique est indistinguable d'un participant qui a tout vu.
2. **Image** — combien de fois a-t-elle été ouverte ? `markImageAsViewed` écrase
   `viewedAt` sans rien incrémenter.
3. **Langue** — dans quelle version linguistique le contenu a-t-il été consommé ?
   Aucune persistance : la résolution est calculée à la volée côté client et perdue.

Trois défauts structurels aggravent le tableau :

4. **Local-first cassé** — les cinq sites d'écriture sont des `try?` POST inline
   sans file d'attente : toute consommation hors-ligne est définitivement perdue.
5. **Duplication** — la même logique seuil + POST est copiée cinq fois.
6. **Préférences ignorées** — `showReadReceipts` gouverne `markAsRead` mais pas
   les statuts média, alors que les deux exposent la même information.

## Principes retenus

- Étendre les modèles existants (`AttachmentStatusEntry`, `MessageStatusEntry`).
  Aucun nouveau modèle Prisma, aucun nouvel écran.
- Suivre la séparation audio/vidéo déjà en place dans le schéma
  (`listen*` / `watch*`) plutôt qu'un champ générique.
- Le gateway est l'autorité sur la confidentialité. Le gate client reste un
  confort d'UX, jamais une garantie.
- Toute logique non triviale est extraite en fonction pure testable.

## 1. Modèle de données

### `AttachmentStatusEntry` (schema.prisma:983)

```prisma
// ===== AUDIO-SPECIFIC =====
/// Portions réellement écoutées, fusionnées : [{startMs, endMs}]
listenSegments Json?

// ===== VIDEO-SPECIFIC =====
/// Portions réellement regardées, fusionnées : [{startMs, endMs}]
watchSegments Json?

// ===== IMAGE-SPECIFIC =====
/// Nombre d'ouvertures de l'image
viewCount Int @default(0)

// ===== LANGUAGE =====
/// Codes des versions linguistiques consommées (set, ordre non significatif)
viewedLanguages String[] @default([])
```

`listenSegments` et `watchSegments` sont séparés par cohérence avec la structure
existante du modèle, qui isole déjà chaque famille de média.

### `MessageStatusEntry` (schema.prisma:935)

```prisma
// ===== LANGUAGE =====
/// Codes des versions linguistiques dans lesquelles le message a été lu
viewedLanguages String[] @default([])
```

### Métrique dérivée

La somme des segments fusionnés donne la **couverture unique**, distincte de
`totalListenDurationMs` / `totalWatchDurationMs` qui comptabilisent les replays.
On peut donc afficher « 45 s uniques sur 90 s (50 %), 120 s de lecture totale »,
c'est-à-dire « a revu des passages ». Aucun champ supplémentaire n'est nécessaire :
la valeur se calcule à la lecture.

## 2. Fusion de segments — fonction pure

```
mergePlaybackSegments(existing, incoming, { maxSegments = 50 }) -> Segment[]
```

Comportement :

1. Concatène, rejette les segments vides ou inversés, trie par `startMs`.
2. Fusionne les intervalles qui se chevauchent ou se touchent.
3. Si le résultat dépasse `maxSegments`, fusionne itérativement la paire de
   voisins séparée par le plus petit écart, jusqu'à revenir sous le plafond.

L'étape 3 borne la croissance du document — un utilisateur qui scrube
frénétiquement ne peut pas faire enfler la ligne indéfiniment. Le prix est une
légère **sur-estimation** de la couverture : les écarts comblés sont comptés comme
vus. C'est un compromis assumé ; à 50 segments la granularité reste très
supérieure au besoin d'affichage.

Implémentations miroir, mêmes cas de test des deux côtés :

- TS : `packages/shared/utils/playback-segments.ts` (gateway)
- Swift : `packages/MeeshySDK/Sources/MeeshySDK/Models/PlaybackSegments.swift`
  (fusion locale pour l'affichage optimiste)

Ce doublement suit le précédent établi par `resolveUserLanguage()`.

## 3. Contrat API

### `POST /attachments/:attachmentId/status`

Le schéma Zod est `.strict()` (`validation/messages-schemas.ts:86`) : tout champ
non déclaré provoque un 400. Deux ajouts :

```ts
segments: z
  .array(z.object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  }).refine(s => s.endMs >= s.startMs))
  .max(200)
  .optional(),

language: z.string().min(2).max(16).optional(),
```

`language` est **singulier** en écriture : le client déclare la langue en cours de
consommation, le gateway l'unionne dans le set `viewedLanguages`. Envoyer le set
complet depuis le client exposerait à des écrasements concurrents entre appareils.

Les segments transitent bruts (max 200 par requête) ; la fusion et le plafonnement
à 50 sont faits côté serveur, qui reste seul maître de l'état stocké.

### Écritures — `MessageReadStatusService`

- `markAudioAsListened` : fusionne dans `listenSegments`, unionne `language`.
- `markVideoAsWatched` : fusionne dans `watchSegments`, unionne `language`.
- `markImageAsViewed` : `viewCount: { increment: 1 }` à l'update, `viewCount: 1`
  à la création — strict miroir de `listenCount` / `watchCount`.

La fusion impose un read-modify-write. Il est déjà encapsulé dans le
`$transaction` + `withRetry` existant de chaque méthode ; aucune structure
nouvelle n'est requise.

### Langue de lecture d'un message — deux chemins distincts

`markMessagesAsRead` (`MessageReadStatusService.ts:577`) est un **traitement par
lot fondé sur une fenêtre temporelle** : `freezeMessageStatus` (:759) sélectionne
tous les messages de l'intervalle `(readAt précédent, maintenant]` et leur écrit le
même horodatage via `createMany` / `updateMany`, en write-once. Il n'existe aucun
point d'attache par message. Y greffer une langue par message imposerait de
transporter une table `messageId → langue` et de casser le lot.

C'est inutile, parce que la langue de rendu n'est pas une propriété du message mais
du couple (lecteur, conversation) : elle découle de `preferredLanguages`, identique
pour tous les messages affichés au même instant. Seul l'**override manuel** est
per-message. D'où deux chemins :

**Chemin de masse — `POST /conversations/:id/mark-read`**
Le lot 1 (`2026-07-24-read-exactness-design.md`) dote déjà cette route d'un
`MarkReadBodySchema` portant `messageIds`. Il suffit d'y ajouter un champ :

```ts
export const MarkReadBodySchema = z.object({
  messageIds: z.array(CommonSchemas.mongoId).max(200).optional(), // lot 1
  language: z.string().min(2).max(16).optional(),                 // lot 2
}).strict();
```

Le lot est cohérent par construction : tous les messages d'un même envoi ont été
affichés au même instant, donc dans la **même** langue résolue. Un seul code
langue pour tout le lot est donc exact, et non une approximation.

La langue n'est écrite **qu'à la création** des entrées (`createMany`) : les
entrées préexistantes conservent la langue de leur première lecture. Cela évite un
read-modify-write sur un lot et respecte la sémantique write-once déjà en place.

**Chemin d'override — `POST /messages/:messageId/status`**
La route existe (`routes/messages.ts:501`), son body est déjà validé par
`MessageStatusBodySchema` (`.strict()`, `{ status, timestamp? }`). Elle reçoit
`language?`. Étant per-message, elle fait une vraie union dédupliquée dans
`viewedLanguages`. iOS l'appelle depuis `setActiveTranslation(for:translation:)`
(`ConversationViewModel.swift:4024`), c'est-à-dire au tap sur un drapeau — une
action délibérée et rare, donc sans coût de volume.

Le set final est l'union de la langue de masse et des overrides explicites, ce qui
restitue exactement « a lu en français, puis a basculé ce message-ci en anglais ».

**Dette observée, hors périmètre** : `OutboxDispatcher.dispatchMarkAsRead`
(`OutboxDispatcher.swift:265`) poste aujourd'hui `body: nil` et abandonne
`upToMessageId` et `clientMutationId`, qui ne quittent jamais l'appareil. Ce lot
introduit un body à cet endroit pour y porter `language`, mais **ne corrige pas**
la perte d'`upToMessageId` : c'est un défaut distinct, à traiter séparément pour
ne pas mélanger deux changements de comportement dans le même diff.

### Lectures

`GET /attachments/:attachmentId/status-details` et le bloc
`attachmentConsumption` de `GET /messages/:messageId/read-status` exposent en plus,
par participant : `viewCount`, `listenSegments`, `watchSegments`, `viewedLanguages`.
Les statuts message exposent `viewedLanguages`.

Types partagés à étendre : `MessageAttachmentConsumptionParticipant`
(`packages/shared/types/message-types.ts:94`) et le type de statut message.

## 4. Confidentialité — réciprocité `showReadReceipts`

`showReadReceipts` vit dans le blob `UserPreferences.privacy` (Json,
schema.prisma:1385 ; schéma typé `packages/shared/types/preferences/privacy.ts`).

Règle unique, appliquée au gateway :

- Si le **demandeur** a `showReadReceipts: false`, il ne reçoit aucun détail de
  consommation d'autrui — réciprocité.
- Sinon, les participants ayant `showReadReceipts: false` sont **retirés** de la
  réponse.
- Sa propre ligne reste toujours visible.

Les écritures continuent d'être enregistrées quelle que soit la préférence : seule
l'**exposition** est filtrée. Un utilisateur qui réactive l'option retrouve donc un
historique complet, et le comportement est réversible sans perte.

Implémentation : un helper unique
`filterByReadReceiptPreference({ viewerUserId, entries })`, appliqué aux deux
chemins de lecture. Les préférences des participants sont chargées en **une seule
requête groupée** puis mises en cache (`CacheStore`), pour ne pas transformer une
liste de N participants en N requêtes.

`AttachmentStatusEntry.participantId` référence un `Participant`, pas un `User` :
les chemins de lecture incluent déjà la relation participant → user pour le nom et
l'avatar, le `userId` nécessaire à la lecture des préférences est donc disponible
sans jointure supplémentaire.

**Changement de comportement assumé** : aujourd'hui tout participant de la
conversation voit tous les détails. C'est la convention attendue des réseaux
sociaux, et l'incohérence actuelle avec `markAsRead` disparaît.

## 5. iOS — local-first

### Entonnoir unique d'écriture

Les cinq sites actuels — `AudioPlayerView:356`, `SharedAVPlayerManager:280`,
`MeeshyVideoPlayer+Renderers:770`, `ImageViewerView:344`,
`MediaSaveCoordinator:287` — postent chacun en direct via `APIClient`, en `try?`,
sans persistance. Ils sont remplacés par un appel unique à :

```swift
protocol AttachmentStatusReporting {
    func report(_ event: AttachmentStatusEvent) async
}
```

`AttachmentStatusReporter` (SDK) enchaîne, dans cet ordre :

1. **Garde de seuil** — reprend les seuils existants (≥ 3 s lecture, ≥ 500 ms image).
2. **Fusion locale** dans `MediaConsumptionStore` → l'UI reflète la consommation
   immédiatement, sans attendre le réseau.
3. **Enqueue Outbox** → l'écriture survit au hors-ligne.
4. **POST réseau**.

Il reste dans le SDK : il ne prend que des paramètres opaques et n'encode aucune
règle produit, conformément à la règle de pureté SDK. Les seuils lui sont passés
en paramètres plutôt que codés en dur.

### Outbox

`OutboxKind` (`Persistence/OutboxRecord.swift:18`) gagne un cas
`attachmentStatus`, aligné sur les cas `markAsRead` / `markStoryViewed`
existants. Le flush FIFO au retour de connectivité est déjà en place et n'est pas
modifié.

### Source des segments

`SharedAVPlayerManager.emitWatchSample()` (:337) produit déjà un échantillon toutes
les ~10 s, bufferisé dans `sessionWatchSamples` et drainé par `drainWatchSamples()`
pour `EngagementTracker`. Le même flux alimente le reporter : **aucun timer
supplémentaire**, aucun coût de rendu ajouté.

Pour l'audio, le `Timer` de `AudioPlayerView` (:451) ne sert aujourd'hui qu'à l'UI.
Il est étendu pour accumuler des échantillons selon la même cadence, sans changer
sa périodicité.

### Langue déclarée

- Texte, chemin de masse : la langue résolue de la conversation
  (`ConversationLanguagePreferences.resolved`, premier élément de
  `preferredLanguages`) accompagne l'appel `mark-read`.
- Texte, chemin d'override : `setActiveTranslation(for:translation:)` (:4024)
  déclare la langue de la traduction choisie pour ce message précis.
- Audio : `resolvedPreferredTranscriptionLanguage`
  (`ConversationMediaViews.swift:660`) et l'override `activeAudioLanguageOverrides`
  jouent le même rôle.

Quand la langue résolue est l'originale, la valeur déclarée est le code de la
langue d'origine du contenu, jamais un marqueur `"orig"` : le set doit rester
comparable entre participants.

## 6. iOS — présentation

- **`PlaybackCoverageBar`** (SDK MeeshyUI) : nouvelle vue présentationnelle pure,
  segments + durée en entrée, rendu en capsules sur une piste. Agnostique, donc SDK.
- **`MessageViewsDetailView.mediaConsumptionCard`** (:713) : la barre remplace le
  marqueur de position ; badge `3×` pour les images ; drapeaux de langue par ligne.
- **`ParticipantMediaProgressRow`** (`MessageInfoSheet.swift:795`) : même barre,
  label enrichi de la couverture unique.
- **`ViewsFilter`** (:8) : le cas `viewed` apparaît quand l'attachement est une image,
  selon le même conditionnement que `listened` / `watched`.

Fluidité : aucun appel réseau supplémentaire — les champs voyagent dans des
réponses déjà récupérées. La fusion est en O(n log n) sur ≤ 50 éléments. Les lignes
participants restent `Equatable` avec `.equatable()`.

## 7. Tests

TDD strict, chaque incrément laissant l'arbre vert.

**TypeScript**
- `playback-segments.test.ts` — fonction pure : chevauchement, adjacence, segments
  inversés, plafonnement, idempotence d'une fusion répétée.
- `MessageReadStatusService.test.ts` — extension : incrément `viewCount`, fusion des
  segments à l'upsert, union des langues sans doublon, langue de masse écrite à la
  création seulement et non sur une entrée préexistante.
- Filtre de confidentialité — demandeur opt-out, participant opt-out, ligne propre
  toujours visible, chargement groupé des préférences.
- Routes — nouveaux champs acceptés, segment inversé rejeté en 400, champ inconnu
  toujours rejeté (`.strict()` préservé), `mark-read` sans body toujours accepté
  (non-régression du `body: nil` actuel).

**Swift**
- `PlaybackSegmentsTests` — mêmes cas que la version TS.
- `AttachmentStatusReporterTests` — seuils respectés, écriture locale avant réseau,
  enqueue Outbox en cas d'échec réseau, un seul POST par événement.
- `MediaConsumptionStoreTests` — fusion locale, plafond d'entrées préservé.

Les 165 tests existants de `MessageReadStatusService.test.ts` doivent rester verts.

## 8. Ordre de livraison

Chaque lot est commité séparément, vert.

1. Fonction pure TS + tests.
2. Schéma Prisma + types partagés (`prisma generate`, `bun run build` dans `shared`).
3. Écritures gateway — compteur image, segments, langue d'attachement, puis les
   deux chemins de langue message (`mark-read` de masse, `/status` per-message)
   + tests.
4. Filtre de confidentialité + tests.
5. Exposition en lecture (`status-details`, `read-status`) + tests.
6. Miroir Swift de la fonction pure + tests.
7. `AttachmentStatusReporter` + Outbox, migration des 5 appelants + tests.
8. UI : `PlaybackCoverageBar`, cartes de consommation, drapeaux, filtre image.

## Hors périmètre

- Stories (`storyViews` Json embarqué sur `Post`), posts et réels
  (`PostView` / `PostImpression` / `PostEngagement`) : systèmes distincts, à traiter
  dans un lot dédié si le besoin se confirme.
- Documents (`pagesViewed`) : non demandé.
- Historique horodaté des changements de langue : le set suffit au besoin exprimé.
- Nouvelle préférence dédiée aux vues média : `showReadReceipts` couvre le besoin.
