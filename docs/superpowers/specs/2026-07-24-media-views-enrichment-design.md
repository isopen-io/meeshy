# Vues enrichies des attachements — design

Date : 2026-07-24
Périmètre : messages / conversations uniquement (stories, posts et réels hors lot)

> **Lot 2 de 2.** Dépend de `2026-07-24-read-exactness-design.md`, qui corrige la
> sur-déclaration de lecture. Livrer ce lot en premier produirait une feuille
> « vues » précise mais fausse : des participants y apparaîtraient comme ayant vu
> un message jamais affiché.

> **Révisé en cours d'implémentation (2026-07-25).** Trois décisions ont changé
> par rapport à la rédaction initiale, chacune parce que la version d'origine
> aurait perdu de l'information :
>
> 1. Ce qui est stocké n'est plus une liste de segments fusionnés mais une
>    **trace chronologique et motivée** — voir §1 et §2.
> 2. La capture n'échantillonne plus : elle est **pilotée par les événements** du
>    lecteur — voir §2 bis.
> 3. La langue déclarée est celle **réellement affichée**, résolue par message,
>    et non la préférence du lecteur — voir §3 bis.

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
/// Trace chronologique et motivée : [{startMs, endMs, endedBy}]
listenSegments Json?

// ===== VIDEO-SPECIFIC =====
/// Idem pour le visionnage
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

### Ce que la trace stocke, et pourquoi pas des segments

Une liste de segments fusionnés répond à « quelles portions », jamais à
« comment ». Or la frontière qui met fin à une écoute EST une information :
s'arrêter en pause, sauter ailleurs, couper le son ou laisser le média finir ne
racontent pas la même chose sur l'intérêt porté au contenu.

Ce qui est persisté est donc la suite des écoutes réellement CONTINUES, dans
l'ordre où elles ont eu lieu, chacune avec son motif de fin (`pause`, `seek`,
`muted`, `completed`, `dismissed`, `superseded`). Ni tri par position, ni fusion :
écouter la fin puis revenir au début doit rester lisible dans cet ordre.

**Trois lectures en découlent, sans champ supplémentaire :**

| Lecture | Dérivation |
| --- | --- |
| Nombre d'écoutes ininterrompues | cardinal de la trace |
| Couverture unique (quelles portions) | fusion des chevauchements |
| Passages revus | écart entre la couverture et `totalListenDurationMs`, qui compte les replays |

« 45 s uniques sur 90 s, pour 120 s d'écoute » se lit donc « a revu des
passages » — et la trace dit en plus s'il a abandonné ou est allé au bout.

**Plafond.** Au-delà de 50 entrées, ce sont les écoutes les plus COURTES qui
tombent. Une trace saturée sous-estime donc ce qui a été écouté ; elle n'invente
jamais une écoute qui n'a pas eu lieu. C'est la direction sûre pour une feuille
« vues ».

**Rejeu.** Une écoute strictement identique — mêmes bornes, même motif — n'est
comptée qu'une fois. Une file d'attente hors-ligne peut re-poster son rapport ;
sans cette garde, « trois écoutes » deviendrait « six » à la reprise du réseau.

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

La fusion sert UNIQUEMENT à dériver la couverture au moment de la lecture ; elle
ne touche jamais ce qui est stocké. Deux corrections par rapport à la rédaction
initiale de l'étape 2 :

- seuls les segments qui se **chevauchent** fusionnent, jamais ceux qui se
  touchent. L'adjacence en temps média ne dit rien du temps réel : écouter la
  première moitié, s'interrompre dix minutes, puis reprendre produit deux
  segments jointifs qu'il serait faux de présenter comme une écoute d'une traite ;
- le plafond de la fusion vaut celui de la trace, si bien qu'il n'est jamais
  atteint en pratique — donc jamais la sur-estimation qu'il introduirait.

Implémentation : `services/gateway/src/utils/playback-segments.ts` (fusion) et
`playback-trace.ts` (accumulation, plafond, rejeu, dérivation).

## 2 bis. Capture — événements, pas échantillons

Relever la position toutes les N secondes perd structurellement du contenu : un
média d'une seconde n'est jamais relevé, une écoute de 500 ms non plus, et même
sur du contenu long la portion écoutée entre le dernier relevé et la pause
disparaît. Réduire l'intervalle ne corrige rien — ça déplace le seuil de perte et
multiplie les réveils.

Le lecteur, lui, connaît les frontières exactes. `PlaybackStretchTracker` les
enregistre : `begin`, `pause`, `seek`, `muted`, `completed`, `dismissed`, plus un
`observe` qui ne fait que retenir la dernière position connue pour pouvoir clore
proprement une écoute interrompue net.

Miroirs stricts, mêmes cas de test des deux côtés :

- TS : `apps/web/utils/playback-stretch-tracker.ts`
- Swift : `packages/MeeshySDK/Sources/MeeshySDK/Models/PlaybackStretchTracker.swift`

**Deux gardes d'intégration** valent d'être écrites, parce que les oublier perd
des données sans rien casser de visible :

1. La trace est vidée AVANT le seuil anti-bavardage réseau, jamais après. Un
   retour anticipé la laisserait dans le traqueur, qui l'attribuerait ensuite au
   média SUIVANT.
2. Le démontage clôt puis envoie avant toute remise à zéro. Quitter l'écran en
   pleine lecture ne doit pas perdre le dernier passage.

Déplacer le curseur d'un média EN PAUSE n'ouvre aucune écoute : parcourir la
barre de progression à l'arrêt fabriquerait une consommation qui n'a pas eu lieu.

## 3. Contrat API

### `POST /attachments/:attachmentId/status`

Le schéma Zod est `.strict()` (`validation/messages-schemas.ts:86`) : tout champ
non déclaré provoque un 400. Deux ajouts :

```ts
stretches: z
  .array(z.object({
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
    endedBy: z.enum(['pause','seek','muted','completed','dismissed','superseded'])
  }))
  .max(50)
  .optional(),

language: wireLanguageCode.optional(),
```

L'objet interne n'est PAS `.strict()`, à la différence du corps qui le contient :
un client d'une version ultérieure peut enrichir son rapport, et Zod écarte alors
le champ inconnu plutôt que de rejeter l'écoute entière.

`wireLanguageCode` est plus permissif que `languageCodeSchema` de shared sur un
point : le séparateur `_`. iOS envoie `Locale.current.identifier`, donc `fr_FR` ;
refuser cette forme ferait échouer tout le rapport pour un séparateur. La
validation reste FORMELLE — le sens est tranché par `normalizeLanguageCode`.

`language` est **singulier** en écriture : le client déclare la langue en cours de
consommation, le gateway l'unionne dans le set `viewedLanguages`. Envoyer le set
complet depuis le client exposerait à des écrasements concurrents entre appareils.

La trace transite telle quelle ; l'accumulation, le dédoublonnage et le plafond
sont faits côté serveur, qui reste seul maître de l'état stocké.

### 3 bis. La langue déclarée est celle AFFICHÉE, pas celle préférée

La rédaction initiale supposait qu'un lecteur consomme dans sa langue préférée.
C'est faux dès qu'aucune traduction n'existe : c'est alors l'ORIGINAL qui
s'affiche. Déclarer le message « lu en anglais » mentirait précisément là où
l'auteur veut savoir s'il a été lu dans sa langue ou traduit.

`ConsumedLanguageResolver` (Swift) et `resolveConsumedLanguage` (TS) suivent donc
exactement la règle qui choisit le TEXTE : même ordre de préférences, même repli
sur l'original, même interdit de se rabattre sur une traduction tierce. Une
bascule manuelle prime — le lecteur a explicitement ouvert cette version-là.
Toute divergence entre les deux résolutions produirait une statistique fausse,
d'où les deux implémentations testées sur les mêmes cas.

Conséquence sur le corps de `mark-read` : une seule langue ne suffit pas. Le
client envoie la **dominante** plus une table d'**exceptions** par message
(`messageLanguages`), et n'énumère que ce qui diffère — sur une conversation lue
d'une traite, cette table est vide. Les exceptions sont restreintes aux
identifiants effectivement envoyés : le schéma n'accepte que des messages du lot,
et une clé écartée par le plafond de 200 ferait rejeter le corps ENTIER.

Côté serveur, les mises à jour sont regroupées par langue : un lot homogène ne
coûte qu'un seul `updateMany`, et le chemin courant — le lecteur ne change pas de
langue entre deux lots — n'écrit rien du tout.

### Écritures — `MessageReadStatusService`

- `markAudioAsListened` : accumule dans `listenSegments`, unionne `language`.
- `markVideoAsWatched` : accumule dans `watchSegments`, unionne `language`.
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

> **Corrigé à l'implémentation.** Le raisonnement ci-dessous — « la langue de
> rendu est une propriété du couple (lecteur, conversation), donc identique pour
> tout le lot » — est FAUX. Elle dépend aussi du message : sans traduction
> disponible, c'est l'original qui s'affiche, quelle que soit la préférence. Voir
> §3 bis : le lot porte une dominante ET une table d'exceptions.

C'était l'argument initial : la langue de rendu ne serait pas une propriété du
message mais du couple (lecteur, conversation), découlant de `preferredLanguages`,
identique pour tous les messages affichés au même instant. Seul l'**override
manuel** serait per-message. D'où deux chemins :

**Chemin de masse — `POST /conversations/:id/mark-read`**
Le lot 1 (`2026-07-24-read-exactness-design.md`) dote déjà cette route d'un
`MarkReadBodySchema` portant `messageIds`. Il suffit d'y ajouter un champ :

```ts
export const MarkReadBodySchema = z.object({
  messageIds: z.array(CommonSchemas.mongoId).max(200).optional(), // lot 1
  language: z.string().min(2).max(16).optional(),                 // lot 2
}).strict();
```

**Ce qui a été livré diffère sur deux points.** Le lot n'est PAS homogène (§3 bis)
et porte donc `messageLanguages` en plus de `language`. Et la langue n'est pas
write-once : un lecteur qui bascule a réellement consulté les DEUX versions, elles
doivent donc s'unionner sur les entrées existantes aussi. Le coût est contenu par
le regroupement par langue, et nul sur le chemin courant — quand la langue ne
change pas, aucune écriture n'a lieu.

**Chemin d'override — `POST /messages/:messageId/status`**
La route existe (`routes/messages.ts:501`), son body est déjà validé par
`MessageStatusBodySchema` (`.strict()`, `{ status, timestamp? }`). Elle reçoit
`language?`. Étant per-message, elle fait une vraie union dédupliquée dans
`viewedLanguages`. iOS l'appelle depuis `setActiveTranslation(for:translation:)`
(`ConversationViewModel.swift:4024`), c'est-à-dire au tap sur un drapeau — une
action délibérée et rare, donc sans coût de volume.

Le set final est l'union de la langue de masse et des overrides explicites, ce qui
restitue exactement « a lu en français, puis a basculé ce message-ci en anglais ».

**Dette résorbée depuis** : `OutboxDispatcher.dispatchMarkAsRead` poste désormais
un corps complet — identifiants rapportés, langue dominante, exceptions.

Note historique conservée : `OutboxDispatcher.dispatchMarkAsRead`
(`OutboxDispatcher.swift:265`) postait `body: nil` et abandonnait
`upToMessageId` et `clientMutationId`, qui ne quittaient jamais l'appareil. Ce lot
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

### Source de la trace

> **Abandonné.** Le plan initial réutilisait les `WatchSample` d'engagement, qui
> échantillonnent une horloge toutes les ~10 s. Ils perdent structurellement les
> médias courts et les écoutes brèves, et surtout ils ne peuvent pas dire POURQUOI
> une écoute s'est arrêtée. Voir §2 bis.

Chaque moteur tient son propre `PlaybackStretchTracker`, alimenté par ses
frontières réelles. Les `WatchSample` restent en place pour l'engagement : les deux
mesures coexistent sans se gêner, l'une échantillonne une durée, l'autre restitue
une interaction.

### Langue déclarée

- Texte, chemin de masse : `ConversationViewModel.splitConsumedLanguages(for:)`
  résout message par message via `ConsumedLanguageResolver`, puis n'envoie que la
  dominante et ses exceptions. Résolu au moment de la LECTURE, pas de l'envoi : la
  file d'attente peut partir longtemps après, et une traduction arrivée entre-temps
  ne change pas ce que le lecteur avait sous les yeux.
- Texte, chemin d'override : `POST /messages/:id/status` porte `language`, traité
  par `recordMessageLanguageView` — qui n'écrit QUE sur une entrée existante. Créer
  ici reviendrait à déclarer lu un message sur la seule foi d'un choix de langue.
- Audio : la vue publie `selectedAudioLanguage` au moteur via
  `consumedLanguageProvider`. Le moteur ne lit aucun singleton — pureté SDK.
- Vidéo : le point d'accroche existe (`SharedAVPlayerManager
  .consumedLanguageProvider`) mais reste non branché, faute de sélection de
  sous-titres côté produit. Déclarer une langue ici serait l'inventer.

Quand la langue résolue est l'originale, la valeur déclarée est le code de la
langue d'origine du contenu, jamais un marqueur `"orig"` : le set doit rester
comparable entre participants.

## 6. iOS — présentation

Livré dans `MessageInfoSheet` plutôt que dans une nouvelle vue SDK : la barre de
progression par participant y existait déjà (`ParticipantMediaProgressRow`), et
l'étendre coûtait moins qu'un composant de plus à maintenir.

- La barre dessine les portions parcourues plutôt qu'un remplissage continu — un
  trou dit ce que le point d'arrêt tait : ce passage n'a jamais été écouté. Repli
  sur le remplissage continu quand aucune trace n'existe (écoute antérieure à la
  mesure).
- Une image n'affiche plus de barre du tout mais son nombre d'ouvertures : une
  barre vide y suggérerait à tort une consommation partielle.
- `LanguageBadges` par lecteur et `LanguageBreakdownRow` par média. Le code de
  langue est toujours écrit ; le drapeau n'est qu'un repère — plusieurs langues
  partagent un drapeau, et une langue en a parfois plusieurs.
Fluidité : aucun appel réseau supplémentaire — les champs voyagent dans des
réponses déjà récupérées, et la couverture est dérivée côté serveur. Les lignes
participants restent `Equatable`.

## 7. Tests

TDD strict, chaque incrément laissant l'arbre vert.

**TypeScript**
- `playback-segments.test.ts` — fusion : chevauchement, adjacence NON fusionnée,
  segments inversés, plafonnement.
- `playback-trace.test.ts` — accumulation : ordre chronologique préservé, rejeu
  non recompté, plafond sacrifiant les plus courtes, relecture défensive d'un
  `Json?` corrompu.
- `viewed-languages.test.ts` — union, normalisation, plafond, répartition.
- `consumed-language.test.ts` — miroir strict du résolveur Swift.
- `MessageReadStatusService.test.ts` — extension : incrément `viewCount`, trace
  accumulée à l'upsert, union des langues sans doublon, langue par message
  respectant les exceptions, regroupement des mises à jour par langue.
- Filtre de confidentialité — demandeur opt-out, participant opt-out, ligne propre
  toujours visible, chargement groupé des préférences.
- Routes — nouveaux champs acceptés, segment inversé rejeté en 400, champ inconnu
  toujours rejeté (`.strict()` préservé), `mark-read` sans body toujours accepté
  (non-régression du `body: nil` actuel).

**Swift**
- `PlaybackStretchTrackerTests` — 18 cas, miroir strict de la version TS.
- `ConsumedLanguageResolverTests` — 18 cas, miroir strict de la version TS.
- `OutboxDispatcherMarkAsReadEncodingTests` — la langue et les exceptions
  survivent au round-trip, une table vide disparaît, les exceptions sont
  restreintes au lot, aucune clé superflue n'atteint un schéma `.strict()`.

Les tests existants de `MessageReadStatusService.test.ts` doivent rester verts.

## 8. Ordre de livraison

Chaque lot est commité séparément, vert.

1. ✅ Fonctions pures TS (`playback-segments`, `playback-trace`,
   `viewed-languages`) + tests.
2. ✅ Schéma Prisma + `prisma generate`.
3. ✅ Écritures gateway — compteur image, trace, langue d'attachement, langue par
   message (dominante + exceptions) + tests.
4. ⏸ Filtre de confidentialité dédié aux médias : le filtrage `showReadReceipts`
   du lot 1 couvre déjà `readBy` et, par conséquent, `languageBreakdown` du
   message. La réciprocité sur `attachmentConsumption` reste à faire.
5. ✅ Exposition en lecture (`status-details`, `read-status`) + tests.
6. ✅ Miroirs Swift (`PlaybackStretchTracker`, `ConsumedLanguageResolver`) + tests.
7. ⏳ Entonnoir unique d'écriture : les moteurs audio et vidéo produisent la trace
   et transmettent la langue, mais les cinq sites de POST n'ont pas encore été
   fondus en un reporter unique, et `attachmentStatus` n'est pas encore un
   `OutboxKind` — une consommation média hors-ligne reste perdue.
8. ✅ UI iOS : couverture trouée, compteur d'ouvertures, drapeaux, répartition.
9. ⏸ UI web équivalente : non commencée.

## Hors périmètre

- Stories (`storyViews` Json embarqué sur `Post`), posts et réels
  (`PostView` / `PostImpression` / `PostEngagement`) : systèmes distincts, à traiter
  dans un lot dédié si le besoin se confirme.
- Documents (`pagesViewed`) : non demandé.
- Historique horodaté des changements de langue : le set suffit au besoin exprimé.
- Nouvelle préférence dédiée aux vues média : `showReadReceipts` couvre le besoin.
