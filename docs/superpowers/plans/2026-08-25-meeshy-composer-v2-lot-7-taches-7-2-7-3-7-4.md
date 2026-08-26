# Lot 7 — tâches 7.2 / 7.3 / 7.4 — Implementation Plan (re-planifié)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Steps use checkbox (`- [ ]`) syntax.

**Goal.** Un enregistrement vocal composé sans réseau cesse d'être DÉTRUIT ; un média
publié hors ligne cesse d'arriver SANS SON MÉDIA ; un mood republié hors ligne
retrouve sa source et sa voix. Trois pertes de contenu mesurées, vivantes en
production le 2026-08-25, et pas une n'est théorique.

**Ce plan REMPLACE les §7.2, §7.3 et §7.4 du plan du 2026-08-24**
(`2026-08-24-meeshy-composer-v2-lot-7.md`), écrit à `fb7afd471`, périmé deux fois
depuis. Il ne touche ni 7.1/7.5 (livrées, `17f6182b3e`), ni 7.6/7.7/7.8 (hors
périmètre, listées en §H).

**Mesuré le 2026-08-25 sur `/Users/smpceo/Documents/v2_meeshy-composer`, branche `main`, `e91b3d196b`.**
Toute ligne du §A a été relue à la source ; aucun test, aucun build n'a été lancé
(lecture seule imposée) — voir §I pour ce qui n'a PAS été vérifié.

---

## A. Ce que la mesure a trouvé, et ce qu'elle a démenti

### A.0 — Deux affirmations de la mesure reçue sont FAUSSES, et l'une aurait fait livrer un correctif destructeur

> **« `DocumentComposerDoor` est un site de production réel qui envoie déjà. »** — **FAUX.**
> `grep -rn "DocumentComposerDoor(" apps/ios/Meeshy` rend **zéro**. La porte est
> DÉCLARÉE une fois (`ComposerDocumentSurface.swift:1181`) et MONTÉE nulle part, et
> c'est une garde qui l'exige :
> `test_laPorteDuDocument_nEstMonteeParAucunSiteDeProduction_etCEstLaRangeeQuiLaRetient`
> (`ComposerDocumentSurfaceTests.swift:2311-2390`) assère `montages == 0` et
> nomme ses DEUX conditions de levée (la rangée d'outils, la langue). Il n'y a donc
> pas de « 9ᵉ chemin de publication » : il y a une porte prête, retenue par une garde,
> exactement comme le lot 4 l'a écrit.

> **« Les deux mondes sont en contradiction frontale : le lot 4 a retourné la garde
> dans le sens opposé à 7.3. »** — **FAUX sur le contrat, VRAI sur un seul Step.**
> Le lot 4 a écrit le contrat de territoire DANS SON PROPRE CODE, et il dit
> exactement ce que le §Global Constraints du lot 7 dit : `MeeshyComposerHost.swift:246-249`
> — « **Ce canal appartient au lot 4 et y RESTE.** Il n'est pas confié à un lot
> ultérieur : le plan du lot 7 déclare le dossier Composer interdit et fait naître son
> `PublishIntent` sous `Services/`. Écrire ici qu'il sera absorbé fabriquerait un
> travail que chacun croirait chez l'autre. » — et la même phrase, mot pour mot,
> en `ComposerDocumentSurface.swift:774-778`. Les deux côtés sont d'accord.
>
> Ce qui est réellement inexécutable est **le Step 3 de 7.3** — « `ComposerDocumentSendRouting`
> est **absorbé** par `PublishRouting` […] la garde est réécrite pour exiger que
> `ComposerDocumentSendRouting` n'existe plus ». Ce Step contredit le §Global
> Constraints du plan LUI-MÊME (« `PublishRouting` (7.3) et `onPublishDocument` (4.5)
> peuvent coexister »). **C'est le plan qui se contredit, pas les deux lots.** §D
> tranche.

**Leçon opérationnelle, à retenir avant d'exécuter quoi que ce soit :** la mesure
reçue avait le bon SYMPTÔME (7.3 n'est pas exécutable telle quelle) et la mauvaise
PREUVE (un site de production imaginaire). Un correctif bâti sur cette preuve —
« recâbler la porte », « re-retourner la garde » — aurait touché deux fichiers
interdits pour réparer un défaut inexistant.

### A.1 — LE DÉFAUT LE PLUS GRAVE, et il n'est dans AUCUN plan : la file durable téléverse dans la MAUVAISE TABLE

Chaîne mesurée maillon par maillon :

| # | Site | Constat |
|---|---|---|
| 1 | `OutboxDispatcher.swift:452-467` | `uploader.uploadFile(fileURL:mimeType:credential:)` — **AUCUN `uploadContext:`** |
| 2 | `TusUploadManager.swift:117`, `:461` | `uploadContext: String? = nil` ; la métadonnée `uploadcontext` n'est posée que `if let context` |
| 3 | `tus-handler.ts:342-346` | `isPostMediaUploadContext(upload.metadata?.uploadcontext)` — faux ⇒ branche `else` |
| 4 | `tus-handler.ts:428-467` | branche `else` ⇒ `prisma.messageAttachment.create(...)`, **201 avec un id valide** |
| 5 | `PostService.ts:303-321` | `prisma.postMedia.updateMany({ where: { id: { in: mediaIds }, …claimableMediaWhere } })` ⇒ `claimed.count === 0` |
| 6 | `PostService.ts:313-320` | `describeClaimShortfall` ⇒ un `logger.warn` serveur, **et rien d'autre** |

**Conséquence : un post média composé HORS LIGNE arrive publié et VIDE.** Le post
existe, la réconciliation optimiste passe (le cmid est échoué), et le média
n'apparaît jamais. Aucune erreur côté client. Les deux appelants sont vivants :
`FeedView+Attachments.swift:334` et `:1738`.

**C'est le défaut EXACT que `17f6182b3e` §II vient de corriger côté web** — « un post
publie depuis le web naissait SANS AUCUN media » — et il est resté vivant sur le
chemin durable iOS. Les TROIS chemins iOS EN LIGNE passent bien `uploadContext: "post"`
(`FeedView+Attachments.swift:374`, `:384`, `:457`, `:1777`, `:1822`), les stories
`"story"`, les commentaires `"comment"`. **Seule la file durable ne le passe pas.**

**Aucun test ne l'attrape** : `grep -rn "uploadContext" apps/ios/MeeshyTests` rend **zéro**.

**L'inventaire complet des 19 sites `uploadFile(` de `apps/ios/Meeshy`, recompté**, parce
qu'une garde « tout téléversement porte un contexte » serait FAUSSE — une pièce jointe
de MESSAGE n'en porte légitimement aucun :

| destination | sites | contexte |
|---|---|---|
| story | `StoryViewModel.swift` × 9 (`:2161…:2668`) | `"story"` ✔ |
| commentaire | `CommentComposerMedia.swift:53` | `"comment"` ✔ |
| post (en ligne) | `FeedView+Attachments.swift:373, 383, 457, 1777, 1822` | `"post"` ✔ |
| **message** (aucun contexte, et c'est JUSTE) | `ConversationView+AttachmentHandlers.swift:453`, `OutboxDispatcher.swift:842` (audio de message), `:934` (média de message) | — ✔ |
| **post (file durable)** | **`OutboxDispatcher.swift:463`** | **AUCUN — le seul site fautif** |

> **C'est une PRÉCONDITION BLOQUANTE de 7.4.** Router l'audio hors ligne vers la file
> durable sans corriger ce maillon transformerait « l'enregistrement est détruit, avec
> un toast d'erreur » en « le post est publié, MUET, sans un mot ». Une perte BRUYANTE
> deviendrait une perte SILENCIEUSE : strictement pire. C'est la livraison destructrice
> que ce plan existe pour empêcher. → **tâche 7.4a, en tête d'ordre.**

### A.2 — Ce que la charge durable ampute (7.2) — inchangé, et mesuré champ par champ

`CreatePostPayload` (`MutationPayloads.swift:324-427`) porte **quatorze** champs :
`clientMutationId, content, attachmentIds, visibility, originalLanguage,
localMediaPaths, type, moodEmoji, audioUrl, audioDuration, visibilityUserIds,
location, mentions, discoverabilityPrecision`.

Il **ne porte pas** : `repostOfId`, `mobileTranscription`, `storyEffects`,
`allowSoundExtraction`, `mediaAlt`. `CreatePostBody` (`OutboxDispatcher.swift:1348-1409`)
reflète le même trou.

**Le défaut vivant** : `StatusViewModel.setStatus` (`:208`), branche hors ligne
(`:215-233`), construit sa charge **sans `repostOfId`, sans `audioUrl`, sans
`audioDuration`** — alors que sa branche EN LIGNE (`:237`) passe les trois.
Republier un mood sans réseau publie un mood ORIGINAL ; un mood VOCAL part MUET.

**Le mécanisme qui l'a rendu possible, et qu'il faut nommer :** `CreatePostPayload.init`
(`:396-411`) pose un **défaut sur les dix champs qui suivent `visibility`**. Un site
d'appel peut donc en omettre dix sans qu'une seule ligne cesse de compiler. C'est
littéralement la discipline du dépôt prise en défaut dans son propre magasin :
*« une fabrique de charge ne pose PAS de valeur par défaut ».* `CreatePostBody`, LUI,
a un init memberwise **sans défaut** — d'où le fait que son trou, à lui, est
compile-checked.

### A.3 — Les trois champs que 7.2 ne doit PAS ajouter, mesurés

Le plan du 2026-08-24 demandait **quatre** ajouts. Trois sont à **couper**, et pour la
raison exacte que ce plan écrit lui-même à propos de `viaUsername` (§A.2 : « l'ajouter
à un magasin PERSISTÉ aurait gravé un format on-disk qu'il aurait fallu migrer pour le
défaire ») :

| champ | producteurs iOS mesurés | porteur durable qui EXISTE déjà | verdict |
|---|---|---|---|
| `allowSoundExtraction` | `StoryViewModel` (11 sites), `ConversationMediaComposerDoor:264`, `StoryTrayView:62`, `StoryTrayActions:209`, `StoryViewerView:935` — **tous story** ; `FeedViewModel:593` le passe `nil` en dur | `StoryPublishQueueItem.allowSoundExtractionPayload` (`StoryViewModel:1796`) | **COUPÉ** |
| `mediaAlt` | mêmes sites, tous story ; `FeedViewModel:594` le passe `nil` en dur | `StoryPublishQueueItem.mediaAltPayload` (`StoryViewModel:1795`) | **COUPÉ** |
| `storyEffects` | `createBorrowedSoundPost` (`FeedViewModel:625-632`, chemin DIRECT non durable) et les stories | `story_publish_queue.json` | **COUPÉ** |

Et 7.6, qui possède les stories, **n'en aura pas besoin non plus** : son test 4 fige
`PublishStoryPayload` à `{ clientMutationId, offlineQueueItemId }` — un pointeur pur.
Les ajouter serait graver trois clés on-disk pour **zéro appelant, dans ce lot comme
dans le suivant**.

**Un champ manquant, absent des cinq du plan, et celui-là a un appelant dans CE lot :
`mobileTranscription`.** `enqueuePostMedia` (`OfflineQueue.swift:470-494`, protocole ;
`:1855`, implémentation) ne le porte pas ; `dispatchCreatePost` ne le compose donc
pas. Le gateway le lit (`types.ts:258`, `PostService.ts:329-340` : il le persiste dans
le premier `PostMedia` audio et **évite la re-transcription Whisper**). Router l'audio
vers la file durable sans lui ferait perdre la transcription EMBARQUÉE — c'est ce que
la discipline appelle *« un lot qui fait CONVERGER une chaîne laisse derrière tout ce
qui la QUALIFIE »*.

**Coût mesuré de cet ajout :** `MobileTranscriptionPayload` (`ServiceModels.swift:51`)
et `MobileTranscriptionSegment` (`:35`) sont **`Encodable` seulement**. Pour vivre dans
un `CreatePostPayload: Codable, Equatable`, les deux doivent gagner `Decodable` et
`Equatable`. Leurs `CodingKeys` sont déjà là (`duration_ms`, `speaker_id`) et
correspondent au `MobileTranscriptionSchema` du gateway (`types.ts:19-30`) — c'est une
conformance à ajouter, pas un contrat à inventer.

### A.4 — L'audio hors ligne (7.4) — les deux jumeaux, mesurés côte à côte

| | `publishAudioPost` (`FeedView+Attachments.swift:449-497`) | `publishAudioFromSheet` (`:1816-1855`) |
|---|---|---|
| gate réseau | **aucun** | **aucun** |
| montée | `TusUploadManager.uploadFile(… uploadContext: "post")` inconditionnelle | idem |
| échec (⇒ systématique hors ligne) | `catch` fait `try? FileManager.default.removeItem(at: audioURL)` — **l'enregistrement est DÉTRUIT** | le `catch` n'efface pas — le fichier reste **ORPHELIN**, que personne ne relit ni ne rejoue |
| langue | `originalLanguage ?? transcription?.language` ; l'unique appelant (`FeedView.swift:1371`) passe `transcription?.language` ⇒ **`transcription?.language`, sinon RIEN** | `transcription?.language ?? composerLanguage` ⇒ **la langue du COMPOSER quand il n'y a pas de transcription** |
| type | `ReelComposition.defaultType(…, forcePlainPost: composerForcePlainPost)` | idem, `forcePlainPost: forcePlainPost` |
| mentions | `feedDeclaredReferences` | `declaredReferences` |
| progression | ne pose JAMAIS `uploadProgress` (seul `isUploading`) | idem |

Deux pertes distinctes pour un même geste, et **une divergence de LANGUE** : sans
transcription, le jumeau de la feuille étiquette l'enregistrement avec la langue du
sélecteur de TEXTE du composer. Un enregistrement en wolof composé dans un composer
réglé sur « fr » part déclaré français — et le Prisme le sert au rang 0 sous une
étiquette fausse, exactement le mode d'échec que `StatusViewModel:288-291` consigne
(« sa langue serait re-DÉTECTÉE […] ce qui mal-étiquette le Prisme au rang 0 »).
Le jumeau de `FeedView` a RAISON : la langue d'un vocal est celle qu'on PARLE, que le
composer de texte ne connaît pas.

La branche hors ligne des médias VISUELS s'exclut explicitement de l'audio :
`FeedView+Attachments.swift:314` — `if NetworkMonitor.shared.isOffline, audioURL == nil`,
commentaire à l'appui (« Audio posts keep the existing path (audio offline durability =
future) »). `publishAudioFromSheet` est un point d'entrée SÉPARÉ (`:1212`) qui ne
traverse même pas la branche hors ligne de `publishPost` (`:1724`).

### A.5 — Ce que `17f6182b3e` a réellement livré (vérifié, pas cru sur parole)

- `broadcastStoryCreated` / `broadcastStatusCreated` prennent `clientMutationId?: string`
  (`SocialEventsHandler.ts:368`, `:431`) ; `StoryCreatedEventData.clientMutationId`
  (`packages/shared/types/post.ts:301`) et `StatusCreatedEventData.clientMutationId` (`:376`) existent. **7.1a : FAIT.**
- `POST /posts/:postId/repost` passe par `withMutationLog({ kind: 'repostPost', … })`
  (`interactions.ts:1051`), 409 en vol, 410 disparu. **7.1b : FAIT.**
- `OutboxKind.repostPost` (`OutboxRecord.swift:55`), `RepostPostPayload`
  (`MutationPayloads.swift:277-311`, `targetType` **obligatoire**), `dispatchRepostPost`
  (`OutboxDispatcher.swift:533-571`), 410 dans `isPermanentServerRejection`
  (`OutboxFlusher.swift:345-353`, SDK). **Fondation de 7.5 : FAITE, ZÉRO appelant.**
- **`grep -rn "enqueue(.repostPost" apps/ios` rend zéro** — les 8 sites appellent
  toujours `PostService.repost` en direct. **7.5 : NON FAITE**, hors périmètre de ce
  plan (§H).

**Conséquence directe pour 7.2** : le commentaire `StatusViewModel.swift:211-214`
(« the gateway does not echo the clientMutationId on `status:created` ») est
**désormais FAUX**. C'est le piège D.9 du plan, arrivé à échéance : il se corrige dans
le commit de 7.2, pas plus tard.

---

## B. Où naît `PublishIntent` : **dans l'APP**, sous `Services/`. Quatre preuves.

La question posée est : *un verbe de publication est-il une brique ou une orchestration ?*

**Preuve 1 — le test du grain, appliqué (`packages/MeeshySDK/CLAUDE.md`, § « Test du
grain »).** Point 2 : *« Le composant lit/appelle des shared singletons Meeshy + encode
des règles "quand faire X" ? → APP. »* Publier lit `NetworkMonitor.shared`, écrit dans
`OfflineQueue` (ou `StoryPublishQueue`), insère un post optimiste dans un ViewModel et
observe `OutboxOutcome`. Point 4 : *« applique une cascade de fallbacks UX ? → APP. »*
C'est la définition même du geste. **Verdict : APP.**

**Preuve 2 — la ligne que le dépôt a DÉJÀ tracée dans cette machinerie exacte.**
Mesuré : `OutboxRecord`, `OutboxKind`, `MutationPayloads`, `OutboxFlusher`, `OfflineQueue`
vivent tous dans **le SDK** ; `OutboxDispatcher` — le seul qui décide *quel endpoint
reçoit quoi* — vit dans **l'app** (`apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift`).
La règle implicite est déjà écrite par les fichiers : **la charge et la mécanique de
file sont SDK ; la décision de ce qui part où est APP.** `PublishIntent` est du second
côté d'une frontière que personne n'a besoin de redessiner.

**Preuve 3 — le contre-argument, examiné puis rejeté sur mesure.** Le tableau de
placement dit aussi : *« Rule engines stateless (pures functions) → SDK »*, et deux
règles pures de publication vivent effectivement dans le SDK :
`ReelComposition.defaultType` (`Models/FeedModels.swift`) et
`MediaDownloadPolicyEngine.shouldAutoDownload` (`Networking/`). Elles ont un point
commun mesurable : **leur vocabulaire est celui du CONTENU** — des mime-types, des
durées, un compte, un booléen. Elles ne nomment aucun magasin Meeshy et aucune surface.
Une règle de publication, elle, nomme `OfflineQueue` contre `StoryPublishQueue`, et
prend `ComposerFormat` — **le vocabulaire de la PLOMBERIE Meeshy**. La distinction
opposable : *une règle dont le vocabulaire est le CONTENU est SDK ; une règle dont le
vocabulaire est la plomberie de Meeshy est APP.*

**Preuve 4 — la contrainte dure, qui rendrait le SDK impossible même si les trois
autres échouaient.** L'interface gelée du plan porte `format: ComposerFormat`.
`ComposerFormat` est déclaré en **`apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift:61`** —
cible **app**, répertoire **interdit à ce lot**. Le SDK ne peut pas importer l'app. Le
faire naître dans le SDK exigerait soit un enum de format DUPLIQUÉ (deux sources de
vérité pour un même concept — interdit par § Single Source of Truth), soit déplacer
`ComposerFormat` dans le SDK, c'est-à-dire éditer un fichier interdit. **Ce n'est pas
une préférence, c'est une impossibilité de compilation.**

> **Naissance : `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift`.** Le
> lot 4 l'a déjà écrit dans son propre code, deux fois, comme le contrat qu'il attend
> (`MeeshyComposerHost.swift:247`, `ComposerDocumentSurface.swift:776`). Ce plan
> l'honore mot pour mot.

---

## C. Sa règle de routage : jugée à sec — mais **`PublishRouting` est COUPÉ**, et voici pourquoi

Le plan du 2026-08-24 gelait :

```swift
nonisolated enum PublishPath: Equatable { case durableOutbox, storyPublishQueue, direct }
nonisolated enum PublishRouting {
    static func path(format: ComposerFormat, carriesCanvas: Bool, hasLocalMedia: Bool) -> PublishPath
}
```

**Trois raisons mesurées de le couper, et chacune suffirait.**

**1. Ce serait la SECONDE table à répondre à la même question, avec la réponse
INVERSE.** `ComposerDocumentSendRouting.path(isQuote:hasLocalMedia:isOffline:)`
(`ComposerDocumentSurface.swift:517-535`) existe, est appelée exactement une fois
(`:639`), et rend pour `hasLocalMedia && !isOffline` ⇒ **`.upload`** (non durable,
`isDurable` `:488-493`). Le test 2 de 7.3 exige de `PublishRouting`, sur les mêmes
entrées, ⇒ **`.durableOutbox`**. Deux tables qui se **contredisent** sur un même geste
sont pires qu'une table mal placée : elles ne divergeront pas un jour, elles divergent
à la naissance.

**2. La garde de la première nomme ce résultat comme la chose qu'elle existe pour
empêcher.** `test_leRoutageDEnvoi_nAQuUnSeulAppelant_etCEstLeMeuble`
(`ComposerDocumentSurfaceTests.swift:2392-2430`) : `appels == 1` et
`fichiersAppelants == ["ComposerDocumentSurface.swift"]`, message d'échec —
« **Deux : un second chemin d'envoi est né.** » Et le doc-comment de la table
(`:496-515`) : « Un second interrogateur serait le second chemin d'envoi que la
doctrine, C2 et le lot 7 interdisent tous les trois. » La faire naître, c'est faire
rougir la garde qui protège précisément l'objectif du lot 7.

**3. Elle ne referme AUCUN défaut mesuré — et le plan lui-même ordonne de couper ce
cas.** §B du plan du 2026-08-24 : « Si une tâche de ce plan ne referme aucun défaut
mesuré, elle est de l'hygiène et doit être coupée. » La perte d'audio est refermée par
7.4a (le contexte), 7.2 (la charge) et un CONSTANT (« un enregistrement local part par
la file durable »). Une table à une seule entrée et une seule sortie n'est pas un
contrôle : c'est une constante déguisée — **LOI 4**.

**Et l'absorption (`ComposerDocumentSendRouting` supprimée) est coupée elle aussi** :
elle exige d'éditer `ComposerDocumentSurface.swift`, fichier INTERDIT, et de
re-retourner une garde que le lot 4 vient de retourner **légitimement** (la table a
gagné un appelant réel — elle n'est plus la mesure inerte qu'elle était).

### Ce qui reste, et qui SE JUGE À SEC

La règle que ce lot doit juger n'est pas *« par où »* — elle est *« avec quoi »*. Le
défaut mesuré au §A.2 est une **fabrique à valeurs par défaut** ; le défaut mesuré au
§A.4 est **deux compositions divergentes du même geste**. La chose à figer et à juger
à sec est donc la **FABRIQUE**, pas la table :

```swift
// apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift  (cible Meeshy)
nonisolated struct PublishIntent: Equatable {
    let clientMutationId: String
    let type: String                          // "POST" | "REEL" — le type SERVEUR
    let localMediaURLs: [URL]
    let content: String?
    let visibility: String
    let visibilityUserIds: [String]?
    let originalLanguage: String?
    let mentions: [PostMentionInput]?
    let location: SharedPlace?
    let discoverabilityPrecision: DiscoverabilityPrecision?
    let mobileTranscription: MobileTranscriptionPayload?

    private init(…)                            // PRIVÉ : aucune entrée hors d'un geste NOMMÉ

    /// Le geste « j'ai enregistré ma voix ». AUCUN paramètre n'a de défaut.
    static func audioRecording(
        fileURL: URL, mimeType: String, durationMs: Int,
        transcription: MobileTranscriptionPayload?,
        forcePlainPost: Bool,
        content: String?, visibility: String, visibilityUserIds: [String]?,
        mentions: [PostMentionInput]?, location: SharedPlace?,
        discoverabilityPrecision: DiscoverabilityPrecision?
    ) -> PublishIntent
}
```

**Trois écarts assumés par rapport à l'interface gelée du 2026-08-24, chacun avec sa
raison :**

- `format: ComposerFormat` → **`type: String`**. `ComposerFormat` vit dans le
  répertoire interdit (§B, preuve 4), et ce qui voyage sur le fil est
  `"POST"`/`"REEL"`, élu par `ReelComposition.defaultType(…).rawValue`. Faire dépendre
  la charge durable du vocabulaire d'une surface d'UI la ferait bouger à chaque
  refonte du meuble.
- `payload: CreatePostPayload` → **champs plats**. `CreatePostPayload.init` porte un
  défaut sur ses dix derniers champs (`MutationPayloads.swift:396-411`) : l'imbriquer
  importerait dans le type NEUF le mécanisme exact du défaut qu'il existe pour fermer.
  `PublishIntent` est la porte d'entrée SANS défaut ; `CreatePostPayload` reste le
  format ON-DISK, construit en aval par `OfflineQueue`.
- `PublishPath` / `PublishRouting` → **coupés** (§C, trois raisons).

---

## D. L'ORDRE — et pourquoi il n'est pas celui du plan

```
7.4a  le contexte d'upload           ── P0, livrable SEULE, PRÉCONDITION DURE de 7.4b
  │
7.2   la charge cesse d'amputer      ── livrable seule, défaut visible aujourd'hui
  │
7.3   PublishIntent naît, à sec      ── témoin « zéro appelant » posé, condition de levée nommée
  │
7.4b  les deux jumeaux audio         ── PREMIER APPELANT, retourne le témoin de 7.3
```

**Trois invariants, dans cet ordre exact.**

1. **La charge cesse d'amputer AVANT que le verbe naisse.** `PublishIntent` porte
   `mobileTranscription` ; le figer avant que `CreatePostPayload`/`enqueuePostMedia`
   sachent le transporter graverait l'amputation dans une interface (raison identique à
   celle du plan du 2026-08-24, §C.2 — elle reste juste).
2. **Le canal cesse de mentir AVANT que quoi que ce soit y entre.** Nouveau, et c'est
   le point que la mesure a rendu : le §A.1 fait que le chemin durable **perd les
   médias**. Y router l'audio d'abord, ce serait échanger une perte bruyante contre
   une perte muette.
3. **Le verbe naît AVANT son premier appelant — mais il naît DÉCLARÉ SANS APPELANT,
   jamais en silence.** 7.3 pose
   `test_lIntentionDePublication_nAAucunAppelantDeProduction_etCEstLaConditionDeLevee`,
   calqué sur l'idiome que le dépôt a déjà écrit deux fois
   (`test_laPorteDuDocument_nEstMonteeParAucunSiteDeProduction…`,
   `test_leRoutageDEnvoi_nEstMonteNullePart`). 7.4b le RETOURNE à `appels == 2`.
   Un verbe sans appelant **et sans témoin** serait du code mort testé vert ; un verbe
   sans appelant **et avec son témoin** est une naissance déclarée, qui rougit le jour
   où quelqu'un l'oublie ou l'appelle depuis un troisième site.

**Les deux commits 7.3 et 7.4b partent dans le MÊME merge.** 7.3 seule laisserait sur
`main` un verbe sans appelant ; le témoin le dit, mais le dire ne suffit pas.

---

## E. Les tâches

### Task 7.4a — La file durable téléverse enfin dans la bonne table

> **P0. Livrable seule, sans un seul changement des trois autres tâches.**
> Un média publié hors ligne arrive aujourd'hui SANS SON MÉDIA (§A.1).

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` (`dispatchCreatePost:433`, l'appel `uploadFile` `:463-467`)
- Test: `apps/ios/MeeshyTests/Unit/Services/OutboxUploadContextGuardTests.swift` **(NEUF — greffe pbxproj)**

- [ ] **Step 1 — Tests ROUGES.**
  1. **Le défaut, nommé.** Garde de source sur le CORPS de `dispatchCreatePost` (via
     `AppSourceGuard.stripComments` + un extracteur de corps de déclaration, patron
     `corpsDeDeclaration(commencantPar:dans:)`, `ComposerDocumentSurfaceTests.swift:2349`) :
     le corps contient `uploadContext:`. **ROUGE aujourd'hui.**
  2. **La garde qui a de la PORTÉE** — un INVENTAIRE, pas une exigence universelle :
     énumérer les 19 `uploadFile(` de `apps/ios/Meeshy` et partitionner en deux listes
     (avec / sans `uploadContext:`). **Exiger que la liste SANS contexte soit
     exactement les trois sites de MESSAGE** — `ConversationView+AttachmentHandlers.swift`,
     et les deux du corps de `dispatchSendMessage` — identifiés par nom de fichier +
     déclaration englobante, jamais par numéro de ligne. Aujourd'hui elle en contient
     **quatre** ⇒ **ROUGE**, et le message nomme l'intrus.
     > **Ne PAS écrire « tout `uploadFile` porte un contexte »** : une pièce jointe de
     > MESSAGE n'en porte légitimement aucun (elle crée un `MessageAttachment`, ce qui
     > est exactement ce qu'elle veut). Une garde universelle serait fausse, et la
     > session suivante la « corrigerait » en ajoutant `uploadContext: "post"` à un
     > envoi de message — qui créerait alors un `PostMedia` orphelin qu'aucun message
     > ne réclamerait.
     Message d'échec à écrire en toutes lettres : « un téléversement sans contexte crée
     un `MessageAttachment` ; si ce site alimente le `mediaIds` d'un post, le post
     naîtra VIDE (`PostService.ts:303-321` ne réclame que des `PostMedia`). »
- [ ] **Step 2 — Voir le rouge.** (compte attendu : 4 sites sans contexte, dont 1 intrus nommé)
- [ ] **Step 3 — Implémenter.** `uploadContext: "post"` sur `OutboxDispatcher.swift:463-467`.
      **Rien d'autre** : ni renommage, ni constante partagée (voir la dette D-3 §H).
- [ ] **Step 4 — Vert. Step 5 — Commit.**

**MUTATION qui prouve que la garde mord :** retirer `uploadContext: "post"` de
`FeedView+Attachments.swift:457` ⇒ ce site rejoint la liste SANS contexte, qui cesse
d'être les trois sites de message ⇒ la garde 2 doit rougir **en nommant ce fichier**.
Si elle reste verte, elle ne lit pas ce qu'elle croit lire (vérifier que
`AppSourceGuard.stripComments` précède la lecture — les trois sites de message sont
documentés par des commentaires qui contiennent le mot).

**DoD :** `xcodegen generate` (fichier de test NEUF) puis `./apps/ios/meeshy.sh test`.
Le commit dit le geste réparé : « un média publié sans réseau cesse d'arriver sans son
média ».

---

### Task 7.2 — La charge durable cesse d'amputer

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/MutationPayloads.swift` (`CreatePostPayload:324-427`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` (`MobileTranscriptionSegment:35`, `MobileTranscriptionPayload:51` → `Codable, Equatable`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` (protocole `:470-494` + implémentation `:1855` — `mobileTranscription:`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` (`CreatePostBody:1348-1409` : champs, `encode(to:)`, `CodingKeys` ; composition `:484-497`)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift` (`:211-233`)
- Modify: `apps/ios/MeeshyTests/Mocks/MockEditProfileDoubles.swift` (`EnqueuePostMediaCall` + la signature du mock)
- Test **(NEUF, SPM — pas de pbxproj)** : `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/CreatePostPayloadFidelityTests.swift`
- Test (existants, étendus) : `apps/ios/MeeshyTests/Unit/Services/OutboxDispatcherCreatePostEncodingTests.swift`, `apps/ios/MeeshyTests/Unit/ViewModels/StatusViewModelTests.swift`

**Périmètre EXACT — deux champs, pas cinq :** `repostOfId` et `mobileTranscription`.
`storyEffects`, `allowSoundExtraction`, `mediaAlt` sont **coupés** (§A.3 : leur porteur
durable existe déjà, et ils n'ont zéro appelant ici comme en 7.6).

- [ ] **Step 1 — Tests ROUGES.**
  1. **Le défaut utilisateur, nommé** (`StatusViewModelTests`, mock existant
     `MockOfflineQueue.enqueueCalls`, patron `:829-837`) : `isOffline: { true }`,
     `setStatus(emoji:"🎤", content:nil, audioUrl:"https://…/a.m4a", repostOfId:"p1")`
     ⇒ la charge enfilée porte `repostOfId == "p1"` **et** `audioUrl` **et**
     `audioDuration`. **ROUGE** : le premier n'existe pas dans le type, les deux
     autres ne sont pas transmis. *Le test n'assère RIEN sur `viaUsername`* — le
     serveur ne le lit pas (`grep -rn viaUsername services/gateway packages/shared` ⇒ 0).
  2. **Rétro-compatibilité on-disk** (SDK) : un JSON de `CreatePostPayload` écrit AVANT
     ce lot (sans les deux clés) décode, les deux à `nil`. Les raw values sont des
     identifiants persistés (`OutboxRecord.swift:6-8`) ; on n'ajoute que des optionnels.
  3. **Omission à l'encodage** (`OutboxDispatcherCreatePostEncodingTests`, patron
     `:55-75`) : `repostOfId` nil ⇒ la clé est **ABSENTE**, jamais `"repostOfId": null`.
  4. **La transcription voyage dans la GRAPHIE du serveur** : round-trip
     `MobileTranscriptionPayload` → JSON → `MobileTranscriptionPayload`, et l'encodage
     porte `duration_ms` / `speaker_id` (miroir de `MobileTranscriptionSchema`,
     `types.ts:19-30`). ROUGE : le type n'est pas `Decodable`.
  5. **Le commentaire périmé** (piège D.9) : garde de source — le corps de
     `StatusViewModel.swift` ne contient plus la phrase « does not echo the
     clientMutationId ». `broadcastStatusCreated` échoue le cmid depuis `17f6182b3e`
     (`SocialEventsHandler.ts:431`), et un commentaire faux est la loi que lira la
     session suivante.
- [ ] **Step 2 — Voir le rouge.** En Swift, l'ajout d'un champ rend le rouge sous forme
      d'échec de COMPILATION du bundle de test : c'est le rouge attendu, et il doit être
      VU avant d'écrire la production.
- [ ] **Step 3 — Implémenter.** Deux optionnels sur `CreatePostPayload` et leurs jumeaux
      sur `CreatePostBody`, **un commentaire par champ disant pourquoi il ne vit nulle
      part ailleurs** (patron `StoryPublishQueue.swift:54-63`). Dans le commentaire de
      `repostOfId` : **écrire que l'attribution passe par LUI et par rien d'autre**,
      sans quoi la session suivante rouvrira `viaUsername`. `StatusViewModel` transmet
      `audioUrl`, `audioDuration`, `repostOfId` dans sa branche hors ligne — trois
      arguments, zéro changement de format pour deux d'entre eux — et son commentaire
      `:211-214` est corrigé dans **le même commit**.
- [ ] **Step 4 — Vert. Step 5 — Commit.**

**MUTATION qui prouve que la garde mord :** retirer `repostOfId:` de la branche hors
ligne de `setStatus` ⇒ test 1 rouge. Remplacer le `if let repostOfId` de
`CreatePostBody.encode` par un `encode` inconditionnel ⇒ test 3 rouge.

**DoD :** scheme `MeeshySDK-Package` (DerivedData privée) + `./apps/ios/meeshy.sh test`.
Le commit dit le geste : « republier un mood sans réseau cesse d'en couper la source —
et un mood vocal cesse de partir muet ».

**Piège :** `CreatePostBody` a un init memberwise **sans défaut** ⇒ ajouter un champ
casse `makeBody` (`OutboxDispatcherCreatePostEncodingTests.swift:20-38`) à la
compilation. C'est le filet ; le réparer, pas le contourner en posant un défaut.

---

### Task 7.3 — `PublishIntent` naît : une fabrique SANS DÉFAUT, jugée à sec

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift` **(NEUF, cible Meeshy — greffe pbxproj)**
- Test: `apps/ios/MeeshyTests/Unit/Services/PublishIntentTests.swift` **(NEUF, cible MeeshyTests — greffe pbxproj)**

**Ce que 7.3 ne fait PAS**, et c'est écrit ici pour être opposable : elle ne crée
**aucun** `PublishRouting`, ne touche **aucun** fichier de `Composer/**`, ne retourne
**aucune** garde du meuble, et n'ajoute **aucune clé de catalogue** (§C ; §G).

- [ ] **Step 1 — Tests ROUGES (à sec : aucune vue montée, aucun réseau, aucun singleton lu).**
  1. **Le type suit la règle de composition, au même endroit qu'aujourd'hui** :
     `audioRecording(mimeType:"audio/mp4", durationMs: 4000, forcePlainPost:false)` ⇒
     `type == "REEL"` ; `forcePlainPost: true` ⇒ `"POST"` ; `durationMs: 1200` ⇒
     `"POST"`. Non-régression exacte de `ReelComposition.defaultType`
     (`packages/MeeshySDK/Sources/MeeshySDK/Models/FeedModels.swift`).
  2. **La langue d'un vocal est celle qu'on PARLE** : avec transcription ⇒
     `originalLanguage == transcription.language` ; **sans** transcription ⇒
     `originalLanguage == nil` (le gateway détecte). La fabrique ne prend **pas** de
     `composerLanguage` : c'est la divergence mesurée du §A.4, et la retenir en
     paramètre serait garder l'occasion de la refaire.
  3. **Un cmid est un jeton d'envoi, jamais une empreinte de contenu** : deux intents
     construits depuis la MÊME matière portent deux `clientMutationId` DIFFÉRENTS, tous
     deux conformes à `ClientMutationId.regexPattern` (`Utils/ClientMutationId.swift:29`).
  4. **La fabrique n'a AUCUN défaut** — garde de source sur la déclaration de
     `static func audioRecording(` : sa liste de paramètres ne contient aucun `= `.
     C'est la discipline du dépôt rendue exécutable : *un défaut fait disparaître un
     champ d'un site d'appel sans casser la moindre compilation* — le mécanisme exact
     du §A.2.
  5. **Le verbe est déclaré SANS appelant, et sa condition de levée est nommée** :
     `test_lIntentionDePublication_nAAucunAppelantDeProduction_etCEstLaConditionDeLevee`
     — `declarations == 1`, `appels == 0` sur `PublishIntent.audioRecording(` dans
     `apps/ios/Meeshy/**`, message d'échec : « **Retourner ce test, ne pas le supprimer.**
     Sa condition de levée est la tâche 7.4b : les deux jumeaux audio l'adoptent. »
     Idiome repris mot pour mot de `ComposerDocumentSurfaceTests.swift:2331-2338`.
- [ ] **Step 2 — Voir le rouge. Step 3 — Implémenter. Step 4 — Vert. Step 5 — Commit.**

**MUTATIONS qui prouvent que les gardes mordent :**
- test 4 : ajouter `content: String? = nil` à la fabrique ⇒ ROUGE. Si la garde reste
  verte, elle lit un commentaire au lieu du code (`AppSourceGuard.stripComments` doit
  précéder toute lecture).
- test 5 : appeler `PublishIntent.audioRecording(` depuis un troisième site ⇒ ROUGE.
- test 1 : coder `"REEL"` en dur ⇒ ROUGE sur les deux cas `POST`.

**Contraintes de compilation à respecter — le bundle de test est compilé `nonisolated` :**
`PublishIntent` naît **`nonisolated`** (isolation MainActor par défaut, Swift 6.2 ;
patron `CreatePostBody`, `OutboxDispatcher.swift:1345-1348` : « une conformance
`Encodable` isolée ne peut pas servir depuis le dispatch »). Les cinq tests sont
synchrones et ne touchent aucun symbole `@MainActor` ⇒ **aucun `@MainActor` sur les
méthodes de test**. Vérifier à la source la signature de `ReelComposition.defaultType`
(ORDRE, LIBELLÉS, optionalité) avant de l'appeler : ce lot ne peut pas compiler.

**DoD :** `xcodegen generate` puis `./apps/ios/meeshy.sh test`. **Les DEUX fichiers
neufs doivent apparaître dans le delta `project.pbxproj` AVANT le run** — les cibles
`Meeshy` et `MeeshyTests` sont globées par répertoire (`apps/ios/project.yml:146-149`,
`:290-292`), donc un fichier absent du pbxproj ne s'exécute pas et la suite passe verte
en ne mesurant rien.

---

### Task 7.4b — Le PREMIER APPELANT : l'audio composé hors ligne cesse d'être perdu

**Pourquoi celui-là, et pas un autre.** Trois raisons mesurées : (1) c'est le seul
geste du lot dont l'échec **DÉTRUIT** le contenu de l'utilisateur
(`FeedView+Attachments.swift:491`) ; (2) il a deux sites JUMEAUX qui divergent
aujourd'hui sur la perte, la langue et les mentions (§A.4) — la fabrique de 7.3 les
rend prouvablement identiques ; (3) il n'exige **aucun** changement gateway : la
réconciliation optimiste est déjà acquise pour POST **et RÉEL** (branche `else` de
`core.ts`, cf. §A.4 du plan du 2026-08-24), et le repost, lui, en exigerait une
(c'est 7.5).

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift` (déjà ouvert par 7.2)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift`
  (`createOfflineMediaPost:770` gagne `mobileTranscription:` **sans défaut** ;
  nouveau `func publish(_ intent: PublishIntent) async`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift`
  (`publishAudioPost:449-497`, `publishAudioFromSheet:1816-1855`)
- Modify: `apps/ios/MeeshyTests/Unit/Services/PublishIntentTests.swift` (**retournement** du test 5 de 7.3)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelAudioPublishTests.swift` **(NEUF — greffe pbxproj)**

**La décision est un CONSTANT, pas une table** (§C) : *un enregistrement local part par
la file durable, en ligne comme hors ligne.* Ce qu'on y perd est mesuré et nul : ni
l'un ni l'autre jumeau n'écrit `uploadProgress` (seul `isUploading`), donc aucune
progression n'existe à perdre. Ce qu'on y gagne : le post apparaît optimiste
instantanément, et il survit à un kill.

- [ ] **Step 1 — Tests ROUGES** (comportementaux, via `MockOfflineQueue` — le geste
      est déplacé dans le ViewModel précisément pour qu'il soit testable autrement que
      par une garde de source) :
  1. **La perte, nommée** : `publish(.audioRecording(fileURL: f, …))` enfile UNE ligne
     durable, **n'appelle jamais `TusUploadManager`**, et le fichier `f` **existe
     encore** après le retour.
  2. **Un seul chemin, deux conditions réseau** : le même intent produit le même appel
     à `enqueuePostMedia` que `NetworkMonitor` réponde en ligne ou hors ligne.
  3. **Ce qui QUALIFIE la chaîne voyage avec elle** :
     `enqueuePostMediaCalls.first?.mobileTranscription` est non-nil et porte le texte
     transcrit. Sans lui, le serveur re-transcrit (`PostService.ts:329-340`) et la
     transcription faite sur l'appareil est jetée en silence.
  4. **Le type suit `ReelComposition.defaultType` au même endroit qu'avant** : un audio
     ≥ 3 s reste un RÉEL, `forcePlainPost` reste honoré (non-régression).
  5. **Gardes de source, sur les DEUX jumeaux** : leur corps ne contient plus
     `TusUploadManager`, ni `removeItem(at: audioURL)`.
  6. **Retournement du témoin de 7.3** : `appels == 2` sur
     `PublishIntent.audioRecording(`, et `fichiersAppelants == ["FeedView+Attachments.swift"]`.
     Le test est **réécrit, jamais supprimé** — sa formulation neuve dit ce qu'un
     troisième appelant signifierait.
- [ ] **Step 2 — Voir le rouge. Step 3 — Implémenter. Step 4 — Vert. Step 5 — Commit.**

**MUTATIONS qui prouvent que les gardes mordent :** réintroduire
`try? FileManager.default.removeItem(at: audioURL)` dans un des deux jumeaux ⇒ tests 1
et 5 rouges. Retirer `mobileTranscription:` du passage `createOfflineMediaPost` →
`enqueuePostMedia` ⇒ test 3 rouge. Ajouter un troisième appelant ⇒ test 6 rouge.

**DoD :** `xcodegen generate` puis `./apps/ios/meeshy.sh test` + scheme
`MeeshySDK-Package`. **7.4b NE PART PAS avant que 7.4a soit vert** (§D, invariant 2).
Le commit dit le geste : « un vocal enregistré sans réseau cesse d'être détruit ».

**Piège :** `createOfflineMediaPost` gagne un paramètre **sans défaut** ⇒ ses deux
appelants existants (`FeedView+Attachments.swift:334`, `:1738`) cessent de compiler.
C'est voulu : le filet compile-time que `CreatePostPayload.init` n'a pas. Leur passer
`mobileTranscription: nil` **explicitement** — un média visuel n'en a pas.

---

## F. Fichiers NEUFS — par cible, et lesquels exigent la greffe `project.pbxproj`

| fichier | cible | greffe pbxproj ? |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift` | **Meeshy** (app) | **OUI** |
| `apps/ios/MeeshyTests/Unit/Services/OutboxUploadContextGuardTests.swift` | **MeeshyTests** | **OUI** |
| `apps/ios/MeeshyTests/Unit/Services/PublishIntentTests.swift` | **MeeshyTests** | **OUI** |
| `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelAudioPublishTests.swift` | **MeeshyTests** | **OUI** |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/CreatePostPayloadFidelityTests.swift` | **SPM** (`MeeshySDKTests`) | **NON** |

**Pourquoi la greffe est obligatoire et pourquoi elle est dangereuse.** Les cibles
`Meeshy` et `MeeshyTests` sont déclarées par RÉPERTOIRE dans `apps/ios/project.yml`
(`:146-149` et `:290-292`) : sans `xcodegen generate`, un fichier neuf **n'existe pas
pour `xcodebuild`** et la suite passe verte en ne l'exécutant jamais. Et un pbxproj
RÉGÉNÉRÉ EN ENTIER emporte le WIP des sessions voisines : **diffier contre
`origin/main` et greffer le DELTA**, jamais committer le fichier régénéré.

**Fichiers MODIFIÉS** (aucun n'est neuf) : `MutationPayloads.swift`,
`ServiceModels.swift`, `OfflineQueue.swift` (SDK) · `OutboxDispatcher.swift`,
`StatusViewModel.swift`, `FeedViewModel.swift`, `FeedView+Attachments.swift` (app) ·
`MockEditProfileDoubles.swift`, `OutboxDispatcherCreatePostEncodingTests.swift`,
`StatusViewModelTests.swift` (tests existants).

---

## G. Ce que ce lot NE fait PAS — opposable

- **Aucun `PublishRouting`, aucun `PublishPath`.** §C, trois raisons mesurées.
- **Aucune ligne sous `apps/ios/Meeshy/Features/Main/Composer/**`** ni sous
  `apps/ios/MeeshyTests/Unit/Composer/**`. `ComposerDocumentSendRouting`,
  `ComposerDocumentSendPlan`, `ComposerDocumentSendOutcome`, `DocumentComposerDoor` et
  leurs gardes appartiennent au lot 4 et **y restent** — les deux côtés l'ont écrit.
- **Aucune ligne sous `apps/web/**` ni `services/gateway/**`** (lot client). Les deux
  dettes serveur qui en découlent sont nommées en §H (D-1, D-2).
- **Aucune clé de catalogue neuve.** Les libellés existants suffisent :
  `feed.post.toast.pendingOffline`, `feed.post.toast.audioPublishError`,
  `status.queuedOffline`, `feed.post.publish.error` — tous déjà présents dans les sept
  langues (`ar, de, en, es, fr, it, pt-BR`).
- **Aucun changement de vue, aucun `@ViewBuilder`, aucun `if #available`** — 7.4b ne
  fait que remplacer le CORPS de deux fonctions d'envoi, jamais un arbre de vues
  (débordement de pile par profondeur de type : 1 008 Ko sur device contre 8 Mo au
  simulateur).
- **Aucun `schema.response` Fastify introduit.** Sans objet ici, écrit pour que la
  tentation ne renaisse pas : `POST /posts` n'en a pas, et en ajouter un tronquerait en
  silence les champs non listés.

---

## H. Suites et dettes NOMMÉES — à ne pas commencer

**Hors périmètre par consigne :**
- **7.5** — le repost a un écrivain unique. Sa fondation est livrée (`OutboxKind.repostPost`,
  `RepostPostPayload`, `dispatchRepostPost`) et **n'a ZÉRO appelant** : les 8 sites
  appellent toujours `PostService.repost` en direct (`FeedViewModel.swift:918`,
  `ReelsViewModel.swift:434`, `PostDetailView.swift:313`, `ProfileUserPostsList.swift:975`,
  `RootViewComponents.swift:341`, `FeedView.swift:490`, `StoryViewerView.swift:872`,
  `:1280`). C'est du code mort testé vert **aujourd'hui** — le nommer, ne pas le
  recâbler ici.
- **7.6** — un seul pilote pour les deux magasins. `OutboxDispatcher.swift:87-99` rejette
  toujours `.publishStory`/`.repostStory` par un `NSError` 501, inchangé.
- **7.7** — `buildUpdatePayload` cesse d'être mort. Indépendante.
- **7.8** — parité avant retrait d'`EditPostSheet.swift`. **Après le lot 4**, et
  l'inventaire de parité doit être REMESURÉ sur l'arbre du lot 4, jamais recopié.

**Dettes trouvées par CETTE mesure, hors zone de ce lot :**
- **D-1 (gateway, `services/gateway/**` — interdit ici).** Aucun test ne couvre le
  scénario du §A.1 côté serveur : un `mediaIds` pointant vers des `MessageAttachment`
  crée un post VIDE avec un simple `logger.warn` (`PostService.ts:313-320`). Un test
  d'intégration « des ids non réclamables ⇒ le client doit pouvoir le savoir » n'existe
  pas. Site : `services/gateway/src/services/PostService.ts:303-321`.
- **D-2 (gateway).** Le shortfall n'est PAS remonté au client : la réponse 201 est
  identique qu'un média ait été rattaché ou non. Le client ne peut pas distinguer
  « publié » de « publié vide ». Même site.
- **D-3 (SDK, `TusUploadManager`).** `uploadContext` est une `String?` libre, écrite en
  littéral sur 15 des 19 sites iOS. Le vocabulaire partagé EXISTE côté TS
  (`PostMediaUploadContext = 'post'|'story'|'status'|'comment'`,
  `packages/shared/types/attachment.ts:453-459`) et n'a **aucun miroir Swift**. 7.4a
  corrige le site fautif et pose une garde négative ; le typage du paramètre est une
  tâche à écrire (elle touche 13 sites et 4 ViewModels).
- **D-4 (app).** `FeedViewModel.createBorrowedSoundPost` (`:625-632`) encode toujours
  son propre `CreatePostRequest` sur `api.request(endpoint: "/posts")` brut, hors
  `PostService` — le 6ᵉ constructeur de corps. Le rendre durable exigerait `storyEffects`
  dans `CreatePostPayload` (§A.3) : les deux vont ensemble, dans une tâche qui les
  possède tous les deux. Ne pas ajouter le champ sans l'appelant.
- **D-5 (app).** `StatusViewModel.setStatus` ne rend rien : son `catch` avale l'échec
  réseau dans un toast, et `MoodComposerDoor.publishMood` rend donc toujours `true` —
  un 500 referme le composer et perd emoji, phrase, audience et mentions. Dette déjà
  NOMMÉE par le lot 4 (`MeeshyComposerHost.swift:234-244`) ; elle n'est pas de ce lot,
  mais 7.2 ouvre ce fichier — **ne pas la refermer en passant**, elle change une
  signature publique lue par deux portes.

---

## I. Ce qui n'a PAS été vérifié pour écrire ce plan

Écrit ici parce qu'une affirmation non vérifiée présentée comme mesurée est un défaut,
pas une approximation.

- **Aucun test, aucun build, aucun simulateur n'a été lancé** (lecture seule imposée par
  la consigne : le gate est tenu par l'orchestrateur). Toute phrase « cette garde
  rougirait » est une lecture de source, jamais une exécution.
- **La chaîne du §A.1 a été vérifiée maillon par maillon dans le CODE, jamais en
  production.** Les six maillons sont cités avec leur fichier et leur ligne ; le
  comportement composé est une déduction de lecture. Le premier geste de 7.4a devrait,
  si l'orchestrateur en a les moyens, être une observation réelle (publier un média
  hors ligne, reconnecter, regarder le post).
- **`apps/web` et `apps/android` n'ont pas été ouverts.** Le §II de `17f6182b3e` affirme
  que le web est corrigé ; ce plan le cite sans l'avoir relu.
- **`StoryPublishQueue.swift` (823 l.) n'a pas été lu** — sans objet ici, 7.6 est hors
  périmètre.
- **`MeeshyUI` n'a pas été ouvert.** Sans objet : aucune tâche de ce plan n'y touche.
- **Le compte de 19 `uploadFile(` vient d'un `grep`, pas d'un parseur** : un appel
  écrit sur plusieurs lignes ou via un alias échapperait au motif. La garde 2 de 7.4a
  doit donc assérer une **LISTE NOMMÉE** (les trois sites de message), jamais un
  nombre : un compte figé devient un chiffre à maintenir, et il passe au vert dès qu'on
  ajoute et retire un site dans le même lot.
- **La partition « message / publication » a été établie en lisant les commentaires et
  le corps de chaque site**, pas en suivant l'id téléversé jusqu'à son consommateur.
  Les trois sites de message se déclarent tels (`« Rejeu d'une pièce jointe de
  MESSAGE »`, `message:send-with-attachments`) ; c'est solide mais ce n'est pas une
  trace d'exécution.
- **La conformance `Decodable` de `MobileTranscriptionPayload` n'a pas été essayée** :
  ses `CodingKeys` sont déclarées et symétriques, mais rien n'a compilé.

---

## J. CORRECTIONS APPORTÉES AU PLAN PENDANT L'EXÉCUTION (2026-08-25)

Écrites ici parce qu'un plan qu'on exécute sans le corriger devient la mesure
que lira la session suivante.

### J.1 — §A.2 et le test 1 de 7.2 : `audioDuration` n'existe PAS sur ce chemin

Le §A.2 affirme que la branche hors ligne de `setStatus` part « sans `repostOfId`,
sans `audioUrl`, sans `audioDuration` — alors que sa branche EN LIGNE passe les
trois ». **Les deux premiers sont exacts ; le troisième est faux, et il l'est aux
QUATRE étages du chemin :**

| étage | site | `audioDuration` ? |
|---|---|---|
| modèle | `StatusViewModel.setStatus` | **absent de la signature** |
| protocole | `StatusServiceProviding.create` | **absent** |
| service | `StatusService.create` → `CreatePostRequest(...)` | **jamais passé** |
| appelants | `ComposerMoodSurface.publishMood`, `StatusComposerView` | **aucun n'en a** |

La branche EN LIGNE ne le passe donc pas davantage : il n'y a pas d'asymétrie à
refermer, il y a un champ qui n'existe nulle part. Exiger `audioDuration` dans le
témoin aurait obligé à **inventer un paramètre sans aucun producteur** — un champ
sans écrivain, testé vert : la faute exacte que ce plan dénonce ailleurs (§A.3,
`viaUsername`). La durée d'un mood vocal REPARTAGÉ vit sur sa source, que le
serveur relit par `repostOfId`.

**Le témoin livré assère `repostOfId` et `audioUrl`, et son doc-comment dit
pourquoi il n'assère pas le troisième.** Le périmètre de 7.2 — « deux optionnels
NEUFS : `repostOfId` et `mobileTranscription` » — est inchangé : `audioUrl`
existait déjà sur `CreatePostPayload`, il n'était simplement pas TRANSMIS.

### J.2 — 7.4b : `publish(_:)` ne pouvait pas déléguer à `createOfflineMediaPost`

`PublishIntent` porte son propre `clientMutationId` (test 3 de 7.3 l'exige), et
`createOfflineMediaPost` en FABRIQUE un. Déléguer aurait rendu le jeton de
l'intention **mort** — un champ que rien ne lit —, et le post optimiste aurait été
clé par un identifiant que l'écho du gateway ne porte pas : le vocal serait
apparu **en double** au flush.

Le corps a donc été extrait dans `enqueueDurableMediaPost(clientMutationId:…)`,
privé, que les deux entrées partagent. `createOfflineMediaPost` y passe un jeton
frais ; `publish(_:)` y passe celui de l'intention.

### J.3 — Une DETTE créée par ce lot, nommée pour n'être pas refermée en passant

**D-6 (app).** Les deux jumeaux audio publient toujours en `visibility: "PUBLIC"`,
en ignorant l'audience choisie dans le composer (`postVisibility`) — comme avant
ce lot : `viewModel.createPost(...)` était appelé sans `visibility`, donc sur son
défaut. La convergence rend le défaut VISIBLE (il est désormais écrit en toutes
lettres dans les deux fabriques) sans le corriger, délibérément : aucun témoin de
ce lot ne mesure ce comportement, et un changement d'AUDIENCE glissé dans un lot
de convergence est exactement le genre de modification qu'on ne relit pas.
Sites : `FeedView+Attachments.swift`, `publishAudioPost` et `publishAudioFromSheet`.

### J.4 — Ce qui n'a PAS été exécuté

Aucun `xcodebuild`, aucun `xcodegen`, aucun simulateur (le gate appartient à
l'orchestrateur). Toutes les gardes de source ont été vérifiées par un **portage
Python fidèle** de `AppSourceGuard.stripComments` + de l'appariement de
parenthèses/accolades, exécuté sur l'arbre réel ; c'est une preuve de la LECTURE
que chaque garde fera, jamais une preuve de COMPILATION.

---

## K. Passe de REVUE (2026-08-25) — ce que trois lentilles ont trouvé, vérifié une par une

Trois revues adversariales (amputation · loi 4 / code mort · compilation &
persistance) ont produit dix-sept constats, dont plusieurs doublons. Chacun a été
REMESURÉ à la source avant d'être corrigé ou réfuté. **Un constat réfuté se dit ;
il ne se corrige pas.**

### K.1 — CORRIGÉS

**K.1.a — [HAUTE] Le lot rendait ATTEIGNABLE un chemin qui DÉTRUIT le vocal.**
Trouvé par deux lentilles indépendamment. Chaîne remesurée maillon par maillon :
`publish(_:)` enfile désormais un vocal sous le type `"REEL"` (ou `"POST"`) →
`FeedViewModel.recoverUnsentPost()` interroge exactement `["POST","REEL"]` au-delà
de 60 s → `FeedView.swift:631` l'appelle à l'ouverture du composer →
`restoreRecoveredMedia` fait `case .audio: break` (le composer ne sait pas rouvrir
un enregistrement), donc le brouillon « restauré » est **VIDE** tout en posant
`recoveredPostCmid` → la publication suivante, quelle qu'elle soit, appelle
`supersedeRecoveredPost` → `OfflineQueue.cancelCreatePost`, qui **efface le
fichier relocalisé ET la ligne**. La phase C d'`enqueuePostMedia` ayant déjà
supprimé la source temporaire, il ne reste plus aucune copie sur le disque.

Le trou est né du lot : avant lui, aucune ligne `.createPost` ne portait d'audio,
et le commentaire du `break` (« audio offline posts aren't queued through this
composer path yet ») disait vrai. **Un lot qui fait CONVERGER une chaîne doit
énumérer les CONSOMMATEURS de la ligne qu'il crée, pas seulement ses
producteurs.**

Correctif : `recoverUnsentPost()` refuse une ligne dont un média est de l'audio,
et le `break` devient un SECOND verrou documenté comme tel. Prix assumé et écrit :
tant qu'un vocal est bloqué en file, aucun brouillon plus ancien n'est offert —
une affordance de reprise retardée n'est pas comparable à un enregistrement
détruit. Témoins : trois, dont un de non-régression (un brouillon VISUEL reste
offert) sans lequel « ne rien proposer jamais » satisferait la garde.

**K.1.b — [MOYENNE] Le MIME DÉCLARÉ était reçu puis JETÉ.**
`PublishIntent.audioRecording` prenait `mimeType:` et ne le stockait pas : il ne
servait qu'à élire le type. Le dispatcher re-dérivait ensuite un MIME depuis
l'EXTENSION du fichier relocalisé. Or `MimeTypeResolver` ne connaissait ni `caf`,
ni `aiff`, ni `opus`, ni `amr` ⇒ `application/octet-stream` ; le TUS grave la
valeur déclarée sans la vérifier (`tus-handler.ts:237`) ; et `PostService.createPost`
ne trouve le média audio qu'à `mimeType: { startsWith: 'audio/' }`. Un vocal
importé depuis Fichiers en `.caf` partait donc **sans transcription embarquée
persistée ET sans Whisper** — et sa carte optimiste s'affichait comme une IMAGE
(`optimisticFeedMedia` faisait la même dérivation). Régression NEUVE : avant
7.4b, le MIME déclaré montait droit sur TUS.

Correctif en trois points : `CreatePostPayload.localMediaMimeTypes` (optionnel,
aligné par INDEX, avec `declaredMimeType(at:)` comme unique lecteur borné) ;
`enqueuePostMedia(sourceMediaMimeTypes:)` **sur la REQUIREMENT et sans défaut** ;
le dispatcher et la projection optimiste PRÉFÈRENT le déclaré, l'extension
n'étant plus que le repli des lignes écrites avant ce champ. La table de
`MimeTypeResolver` gagne les conteneurs Apple, ce qui répare aussi ce repli.

**K.1.c — [MOYENNE-HAUTE] L'audience choisie n'avait aucun EFFET sur un vocal.**
`postVisibility` / `postVisibilityUserIds` sont dans la portée immédiate des deux
hôtes et lus par leurs cinq autres chemins de publication ; les deux jumeaux
publiaient `visibility: "PUBLIC"`. Comportement identique à avant le lot (par le
DÉFAUT de `createPost`) — et c'est précisément ce qui rend le littéral pire que
l'oubli : un défaut est un trou, un littéral est une décision apparente que
personne n'a prise. Loi 4. **La dette D-6 de §J.3 est SOLDÉE.** Garde de source
sur les deux corps, mutation jouée. Résidu nommé dans le code : une audience
INCOMPLÈTE (`ONLY`/`EXCEPT` sans destinataire) n'est pas retenue sur ce chemin —
le gateway la refuse alors, bruyamment. C'est l'inverse exact du défaut d'hier,
qui publiait PUBLIC en silence.

**K.1.d — [MOYEN] Le témoin phare affirmait ce que la VRAIE file contredit.**
« L'enregistrement EXISTE ENCORE après le retour » n'est vrai que parce que le
double ne touche pas le disque : `enqueuePostMedia` COPIE puis EFFACE la source
(phases B et C). Le fichier est RELOCALISÉ, jamais « préservé sur place ». Doc et
message d'assertion réécrits pour dire ce qui est réellement mesuré — que le VIEW
MODEL ne détruit rien.

**K.1.e — [MOYEN] Deux commentaires devenus FAUX, dans des fichiers que ce lot
ouvre.** (1) `FeedViewModel` citait « only type == "POST" can be reconciled » —
faux : `core.ts` ne bifurque qu'entre STORY, STATUS et TOUT LE RESTE, et
`postCreated` réconcilie par cmid SEUL ; le lot enfile désormais un vocal en
`"REEL"` et en dépend directement. (2) `StatusViewModel` avait remplacé une phrase
fausse par une autre : « une insertion optimiste est donc RÉCONCILIABLE » est vrai
SERVEUR et faux CLIENT — `SocketStatusCreatedData` (SDK) ne déclare pas
`clientMutationId` et `statusCreated` n'émet qu'un `APIPost`.
`packages/shared/types/post.ts` nommait déjà cette dette. Les deux phrases sont
corrigées et RETENUES par des gardes lues sur la source BRUTE.

**K.1.f — [FAIBLE] `FeedViewModel.createPost(mobileTranscription:)` n'avait plus
aucun appelant** depuis que les deux jumeaux publient par `publish(_:)`. Retiré :
c'était la porte par laquelle un troisième chemin vocal pouvait renaître EN DEHORS
de `PublishIntent`, sans faire rougir la garde qui compte les appelants de la
fabrique.

**K.1.g — [FAIBLE] Le repli « aucun média » de `createOfflineMediaPost` perdait la
liste NOMMÉE de l'audience** (`enqueueDurableTextPost` porte un défaut `nil`). Un
post `ONLY`/`EXCEPT` qui retombait là était refusé par le gateway, et le rejet
étant PERMANENT, le post était perdu. C'est le mécanisme même que ce lot documente
partout ailleurs, trois lignes sous le paramètre qu'il venait de rendre
non-défaillant.

### K.2 — RÉFUTÉ

**« Le repli sans média appelle `enqueueDurableTextPost` sans `visibilityUserIds`,
et `createPost` fait de même. »** La seconde moitié est FAUSSE : `createPost`
passe bien `visibilityUserIds` à `enqueueDurableTextPost` (site unique, vérifié).
Seul le repli de `createOfflineMediaPost` était concerné — corrigé en K.1.g.

### K.3 — CONSTATS RÉELS, NON CORRIGÉS ICI (avec la raison)

- **`ComposerDocumentSurface.swift:459-460` et `:524-529`** affirment que
  `publishAudioFromSheet` « monte droit sur tus » et qu'un enregistrement composé
  hors ligne y est « perdu ». Les deux sont devenus FAUX par ce lot, et le second
  documente la prémisse de `ComposerDocumentSendRouting`. **`Composer/**` est un
  répertoire INTERDIT à ce lot** (possédé par le lot 4) : la correction lui
  revient, sous peine d'un conflit sur le fichier le plus disputé du chantier.
- **`RecoveredOfflinePost` n'emporte ni `repostOfId` ni `mobileTranscription`**, et
  les deux portes de reprise d'un mood jettent `draft.audioUrl` qu'elles ont
  pourtant sous la main (`ComposerMoodSeed` le déclare). Reprendre un mood vocal
  REPARTAGÉ le republie donc ORIGINAL et MUET, puis supprime la ligne source.
  Défaut PRÉ-EXISTANT, et sa moitié corrective vit dans `Composer/**`.
- **Course écriture-anticipée / flush** : `mutationEnqueued` est émis en phase A,
  avant la copie des octets (phase B) ; le flusher se réveille après 250 ms de
  débounce. Jusqu'ici la voie média durable était gardée par `isOffline` ; elle
  est désormais empruntée EN LIGNE. Conséquence bornée : une tentative brûlée et
  un backoff, jamais une perte.
- **La carte optimiste d'un vocal n'a ni durée ni transcription** (`FeedMedia` les
  porte). Avant 7.4b, le chemin en ligne insérait le post SERVEUR, donc les deux
  s'affichaient tout de suite. Le TYPE de média est corrigé par K.1.b ; la durée
  exige de porter `durationMs` dans l'intention et de convertir vers
  `MessageTranscription` — une tâche à part.
- **`AudioPostComposerView` duplique la table MIME** (`default: return "audio/mp4"`),
  ce qui contredit le doc-comment de `MimeTypeResolver` (« single source of
  truth »). Inoffensif depuis K.1.b — le MIME déclaré voyage —, mais c'est la
  divergence qui a rendu K.1.b invisible pendant tout le lot.
- **Gateway (INTERDIT à ce lot)** : `PostService.ts:303-321` ne remonte pas le
  *shortfall* de réclamation au client (201 identique), ce qui rend les deux
  faces de K.1.b silencieuses.
