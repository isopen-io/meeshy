# Lot 7 — File de publication unique (`PublishIntent`, S2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publier cesse d'être HUIT chemins dont quatre perdent ce qu'ils portent. Une charge durable qui n'ampute plus (un mood republié hors ligne garde son attribution), un écho de `clientMutationId` pour les quatre formats, un repost idempotent et à un seul écrivain, deux magasins persistés qui n'ont plus qu'UN pilote, et un corps d'édition construit à un seul endroit. Le RETRAIT d'`EditPostSheet.swift` n'est PAS dans ce lot : la mesure ci-dessous montre qu'aucune surface ne tient ses sept capacités — il est séquencé derrière une tâche de parité opposable, avec son STOP nommé.

**Architecture:** Ce lot ne touche PAS le meuble. Le gain mesurable de S2 n'est pas le verbe unique — les planches l'ont déscopé pour cette raison exacte, rév. 2 C11 : « le verbe unique était de l'hygiène, pas un gain ». Le gain est la **DURABILITÉ** et l'**ORDRE** : ce qui part survit à un hors-ligne suivi d'un kill, dans une seule file FIFO, avec un seul témoin. Les tâches vont donc du serveur (les deux dettes qui bloquent tout) vers le SDK (la charge), puis vers l'app (les appelants) — et jamais vers les vues du composer, que les lots 2/3/4 possèdent en ce moment même.

**Tech Stack:** TypeScript strict + Jest (gateway, `bun run test`), Swift 6.2 + Swift Testing/XCTest (SDK, scheme `MeeshySDK-Package`), SwiftUI + XCTest (app, `./apps/ios/meeshy.sh test`), GRDB (outbox), JSON sur disque (`StoryPublishQueue`).

**Spec:** `docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md` (§A ligne promue « file de publication UNIQUE (`PublishIntent`, S2) » → lot 7 ; §B lois 1 et 3 ; §E lot 7) · `docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (§F « Hors v1 » opposable) · `docs/product/planche-meeshy-composer.html` (doctrine souveraine, S2 déscopé rév. 2 C11 — ce lot le REPREND en changeant sa justification, voir ci-dessous).

---

## A. L'état des lieux — mesuré le 2026-08-24 sur `main-local` @ `fb7afd471`

> **Arbre de travail SALE au moment de la mesure — PÉRIMÉ.** La rédaction initiale
> décrivait 15 fichiers non committés par les lots 3 et 0 bis. **Audit du
> 2026-08-24 : les deux ont MERGÉ** — lot 3 = `96b707da6`, lot 0 bis =
> `d4a40f600` (27 fichiers) — et `git status` ne montre plus que des `.md` sous
> `docs/`. Les préconditions de merge de ce lot (§Global Constraints, « après le
> lot 3 et le lot 0 bis ») sont **levées** ; seule reste celle du **lot 4** pour
> la tâche 7.8. Trois ancres à remesurer avant d'écrire, elles ont bougé deux
> fois : `MeeshyComposerHost.swift` fait **578 l.** (`chromeOwner` **`:269`**,
> le `if !chromeOwner.assembles(.publish)` **`:278`**, `servedDocumentTools`
> **`:413`**, `ComposerFormatFan` **`:437`**, les deux conditions de levée
> **`:534-542`**) ; `ComposerIntent.swift` fait **372 l.** ; et dans
> `packages/shared/types/post.ts`, `PostCreatedEventData` est en **`:229`**
> (son `clientMutationId` en `:237`), `StoryCreatedEventData` en **`:282`**,
> `StatusCreatedEventData` en **`:344`** — et non 218 / 271 / 333.
> **Le fond est intact** : les deux seules déclarations de `clientMutationId` du
> fichier sont celles de `PostCreatedEventData` et de `CommentAddedEventData`
> (`:385`). Story et status ne l'ont toujours pas.

### A.1 — Huit chemins de publication, quatre durables

| # | Chemin | Corps construit par | Durable ? |
|---|---|---|---|
| 1 | `FeedViewModel.createPost` texte seul → `enqueueDurableTextPost` (`FeedViewModel.swift:567`, :652) | `CreatePostPayload` → `CreatePostBody` | ✅ outbox GRDB |
| 2 | `FeedViewModel.createPost` média/audio EN LIGNE → `postService.create` (`:572`) | `CreatePostRequest` | ❌ |
| 3 | `FeedViewModel.createOfflineMediaPost` (`:751`) → `offlineQueue.enqueuePostMedia` | `CreatePostPayload` + `localMediaPaths` | ✅ outbox GRDB |
| 4 | `FeedViewModel.createBorrowedSoundPost` (`:615`) — `api.request` BRUT, hors `PostService` | `CreatePostRequest` (6ᵉ constructeur) | ❌ |
| 5 | `StatusViewModel.setStatus` (`:204`) — DOUBLE VOIE : hors ligne outbox (:211-229), en ligne `statusService.create` (:233) | `CreatePostPayload` / `CreatePostRequest` | ✅ / ❌ |
| 6 | `StoryViewModel.publishStoryInBackground` (`:1396`) → `persistPublishIntentToQueue` (`:1686`) → `postService.createCanvasPost` (`:2404`) | `CreateStoryRequest` | ✅ **autre magasin** (JSON) |
| 7 | `PostService.repost` — **HUIT** sites de production | `RepostRequest` | ❌ |
| 8 | `ForwardPickerSheet.performPublish` (`:442`) → `publishAttachment` | `PublishAttachmentRequest` | ❌ |

Les huit sites de `repost` (`grep '\.repost(' `, hors déclarations) :
`FeedViewModel.swift:892`, `ReelsViewModel.swift:434`, `PostDetailView.swift:305`,
`ProfileUserPostsList.swift:975`, `RootViewComponents.swift:336`, `FeedView.swift:475`,
`StoryViewerView.swift:872`, `StoryViewerView.swift:1280`.

**Un endpoint, SIX constructeurs de corps** — et non cinq : `PostService.swift:368`
et `:382` (deux surcharges `CreatePostRequest`), `PostService.swift:656`
(`CreateStoryRequest`, « le SEUL constructeur du corps de création par canevas »),
`StatusService.swift:40`, `OutboxDispatcher.swift:1303` (`CreatePostBody`), et
`FeedViewModel.swift:619` — ce dernier encode un `CreatePostRequest` et le pose
directement sur `api.request(endpoint: "/posts")`, **sans passer par `PostService`**.

### A.2 — Ce que la file durable AMPUTE, et le défaut vivant qui en découle

`CreatePostPayload` (`MutationPayloads.swift:274`) porte treize champs — vérifié
un par un à l'audit du 2026-08-24. Il n'en porte **PAS quatre** que le chemin
direct porte : `repostOfId`, `storyEffects`, `allowSoundExtraction`, `mediaAlt`.
`CreatePostBody` (`OutboxDispatcher.swift:1303`) reflète le même trou.

> **Correction d'audit (2026-08-24) — `viaUsername` a été RETIRÉ de cette liste,
> et il ne doit pas y revenir.** La rédaction initiale en comptait **cinq**, dont
> `viaUsername`. Mesure : `grep -rn viaUsername services/gateway packages/shared`
> rend **0** — `schema.prisma` compris. `CreatePostSchema`
> (`routes/posts/types.ts`) ne le déclare pas, et un `z.object()` **écarte
> silencieusement** les clés inconnues : le champ voyage depuis trois versions
> sans jamais rien porter. Le SDK le dit lui-même — `StoryModels.swift:2580-2583`,
> « pas de colonne `viaUsername` », `via = viaUsername ?? repostOf?.author.username`.
> **C'est `repostOfId` qui porte l'attribution.** L'ajouter à un magasin PERSISTÉ
> aurait gravé un format on-disk qu'il aurait fallu migrer pour le défaire — le
> coût exact que `OutboxRecord.swift:6-8` interdit de payer par inadvertance. Le
> lot 4 (tâche 4.2) le retire du fil dans le même chantier ; **si les deux lots
> devaient être exécutés dans le désordre, l'ordre sûr est 4.2 d'abord.**

Conséquence **mesurée, en production aujourd'hui** : `StatusViewModel.setStatus`
(`:211-224`) construit sa charge hors ligne SANS `repostOfId` — alors que la voie
en ligne (`:233`) le passe. **Republier le mood de quelqu'un sans réseau publie un
mood ORIGINAL, sans lien vers sa source.** Ce n'est pas une dette théorique : c'est
le geste que les six déclencheurs de `StatusComposerView` (lot 4) exercent.

**Second défaut du même appelant, relevé par l'audit du 2026-08-24 et ABSENT de la
rédaction initiale — il n'est pas dans la charge, il est dans le SITE.**
`CreatePostPayload` porte **déjà** `audioUrl` et `audioDuration` (`:302`, `:304`),
et `StatusViewModel.setStatus` **ne les passe pas** dans sa branche hors ligne
(`:211-224`), alors que sa branche en ligne passe `audioUrl` (`:233`). Un mood
VOCAL composé sans réseau part donc muet. La distinction compte pour la tâche 7.2 :
ici il n'y a **rien à ajouter au format persisté**, seulement deux arguments à
transmettre — c'est le correctif le moins cher du lot, et le seul qui ne touche
aucun contrat on-disk.

Corollaire de la même amputation : la file outbox ne PEUT pas transporter un
canevas (`storyEffects` absent) ni un repost (`repostOfId` absent). C'est la
raison mécanique du second magasin — pas un choix d'architecture.

### A.3 — Deux magasins persistés, deux technologies, deux pilotes

| | outbox | `StoryPublishQueue` |
|---|---|---|
| Support | table GRDB `outbox` (`OutboxRecord.swift:99`) | `story_publish_queue.json` + `story_publish_failed_queue.json` dans `Documents/` (`StoryPublishQueue.swift:290`, `:296`, `:715`) |
| Pilote | `OutboxFlusher` / `OutboxDispatcher` | `StoryPublishService` (app) + `StoryPublishExecutor` monté par `RootView.swift:789` / `iPadRootView.swift:278` |
| Témoin | pastille outbox | `StoryPublishService.pendingCount` (`MyStoriesView.swift:50`, `RootView.swift:2421`, `StoryTrayView.swift:511`) |

Les kinds `.publishStory` et `.repostStory` existent (`OutboxRecord.swift:44-45`)
et **sont MORTS** : `OutboxDispatcher.swift:87-99` les rejette par un `NSError`
501 (« handled by StoryOfflineQueue, not OutboxDispatcher »), et aucun site de
production ne les enfile (`grep 'enqueue(.publishStory'` → 0). `OutboxUIItem.mapStory`
(`:92`) est donc du code mort testé vert.

Le pont est **déjà conçu** : `PublishStoryPayload` (`MutationPayloads.swift:245`)
= `{ clientMutationId, offlineQueueItemId }`, avec son commentaire — « When the
queues merge (Tier C), this shrinks to a pure pointer ».

### A.4 — L'écho du `clientMutationId` n'existe que pour POST et RÉEL

`core.ts:453-460` bifurque à trois branches. **Seule** la branche `else`
(POST et RÉEL) passe `request.clientMutationId` à `broadcastPostCreated`
(`SocialEventsHandler.ts:285`). `broadcastStoryCreated` (`:368`) et
`broadcastStatusCreated` (`:429`) ne prennent PAS ce paramètre, et
`StoryCreatedEventData` / `StatusCreatedEventData` (`packages/shared/types/post.ts:271`,
`:333`) ne le déclarent pas — seul `PostCreatedEventData` (`:218`) le porte.

`StatusViewModel.swift:205-210` le dit mot pour mot : « We do NOT insert an
optimistic entry — unlike posts, the gateway does not echo the clientMutationId
on `status:created` ». **Vérifié à la source : c'est exact.**

Nuance qui corrige le commentaire de `FeedViewModel.swift:552-555` (« only
type == "POST" can be reconciled ») : un **RÉEL** passe aussi par la branche
`else`, donc son cmid EST échoué. Le commentaire énonce plus étroit que le code —
motif inverse mais même famille que « un commentaire qui énonce un invariant plus
large que son correctif ».

### A.5 — Le repost n'est PAS idempotent

`POST /posts/:postId/repost` (`interactions.ts:930-932`) déclare
`{ preValidation: [requiredAuth] }` et **rien d'autre** : aucun `withMutationLog`,
contrairement à `POST /posts` (`core.ts:322`, kind `createPost`) et à
`toggleLikePost` (`interactions.ts:220`). Rejouer un repost après une réponse
perdue **crée un second repost**. C'est le verrou dur qui interdit de mettre le
repost en file avant de l'avoir levé.

### A.6 — Six chemins d'édition, quatre copies du même geste

`postService.update` a six appelants de production :
`FeedViewModel.swift:1021`, `ReelsViewModel.swift:536` (déclaré « Miroir de
FeedViewModel.updatePost mais sur `reels` », `:503-505`),
`PostDetailViewModel.swift:664`, `ProfileUserPostsList.swift:1051`,
`StoryViewModel.swift:1261` (audience seule) et `StoryViewModel.swift:2726`
(édition de story, **le seul site du dépôt qui applique déjà la loi 3** sur un
vrai champ : `declaredMentions = declaredReferencesAreKnown ? … : nil`, `:2719-2721`).

Côté fil, le tri-état est **déjà tenu des deux côtés** : `UpdatePostRequest`
(`ServiceModels.swift:182-227`) omet ses optionnels `nil` par l'`Encodable`
synthétisé, et `updatePost` du gateway (`PostService.ts:1050-1058`) laisse
Prisma lire `undefined` comme « ne touche pas ». `UpdatePostSchema`
(`routes/posts/types.ts:334-375`) a tous ses champs `optional()` et n'autorise
que `type: z.enum(['POST','REEL'])` — **la contrainte serveur de la §C du design
est VÉRIFIÉE dans le code**.

Ce qui manque n'est donc pas le tri-état : c'est la **déclaration de ce qu'on
sait**. `buildUpdatePayload` (`packages/shared/utils/composer-contract.ts:167`)
la porte, avec 7 tests dédiés (`packages/shared/__tests__/composer-contract.test.ts:145-188`,
dont les trois pièges : `[]` déclaré connu est ÉCRIT, `null` déclaré connu est
ÉCRIT, `undefined` ne l'est JAMAIS). Elle est **morte** : aucun consommateur de
production (`grep 'buildUpdatePayload' apps services packages/MeeshySDK` → une
seule ligne, un commentaire de test), aucun miroir Swift, et
`packages/shared/utils/index.ts` ne la ré-exporte pas (elle n'est atteignable
que par le chemin profond `@meeshy/shared/utils/composer-contract`, autorisé par
l'entrée `"./utils/*"` du `package.json:39`).

> **Correction d'audit (2026-08-24) sur la formulation, pas sur le fond.** Le test 4
> de la tâche 7.7 écrivait « aujourd'hui `utils/index.ts` ne porte que
> `reel-composition.js`, `:27` ». **C'est faux** : le fichier ré-exporte une douzaine
> de modules (`participant-helpers`, `member-visibility`, `reaction-limit`,
> `time-range`, `reel-composition`, `anonymous-username`, `join-notice`,
> `conversation-join-error`, `sender-identity`, `attachment-message-type`,
> `client-message-id`, et **`repost-target.js` ajouté par le lot 0 bis le
> 2026-08-24**). L'énoncé vrai — et le seul dont 7.7 a besoin — est : **`index.ts`
> ne ré-exporte pas `composer-contract`.** Corollaire opérationnel : le ré-export de
> 7.7 s'AJOUTE à une liste vivante, il ne remplace rien ; écraser ce fichier
> emporterait `repost-target.js`, donc la loi 5 du web.

### A.7 — Pourquoi le RETRAIT d'`EditPostSheet.swift` n'est pas dans ce lot

Le §E du design annonce « **Retrait** : `EditPostSheet.swift` (498 l.), dernier
legacy ». Deux corrections mesurées.

**Le compte.** Le fichier fait **658** lignes (`wc -l`). `git show 690e575f7^`
en rend 498 : le commit `690e575f7` du 2026-08-23 (« l audience d une
publication se change apres coup ») l'a agrandi **le jour même** où la spec a été
écrite. Les quatre spans que la §D cite (`120-122`, `297-308`, `478-479`, `490`)
désignaient les bons mécanismes DANS CETTE VERSION-LÀ ; aujourd'hui ce sont
`173-175`, `455-468`, `636-638` et `648`.

**La parité.** La feuille tient **sept** capacités, chacune vérifiée à la source :

| Capacité | Où | Le meuble la tient-il ? |
|---|---|---|
| champ contenu + validité | `:195-197`, `:296` | non mesurée — `ComposerDocumentSurface` prend `text:` |
| langue source (relance du Prisme) | `:180`, `:647` | **non** |
| éventail POST/RÉEL gaté | `:173-175`, `:455-468` | l'éventail existe (`ComposerFormatFan`), mais monté SOUS la scène uniquement (`MeeshyComposerHost.swift:424-427`) |
| repli automatique du RÉEL | `:636-638` **et** `:328-330` (à l'ouverture, corpus hérité) | **non** |
| retrait de médias | `:620-641` | **non** — `servedDocumentTools` rend `[]` (`MeeshyComposerHost.swift:403`) |
| position tri-état | `:17-19`, `:650` | **non** |
| audience + liste nommée | `:42-48`, `:150-152`, `:651-652` | **non** — `chromeOwner = .atelier` (`MeeshyComposerHost.swift:246`), donc `socle`, `audienceChip` et `publishButton` **ne sont pas peints** (`:239`) |

Les deux conditions de levée de `chromeOwner: .host` sont écrites
(`MeeshyComposerHost.swift:534-542` à `d4a40f600`, et non `:518-534`), et **toutes
deux vivent dans `MeeshyUI`**, hors d'atteinte de la cible app : un gate de matière
lisible app-side, et un écrivain d'audience atteignable. **Aucun lot 7 ne peut les
lever.**

> **Avertissement d'audit (2026-08-24) — cette table sera PÉRIMÉE le jour où le lot 4
> mergera, et 7.8 merge APRÈS le lot 4.** Deux lignes de l'inventaire s'appuient sur
> `chromeOwner = .atelier` (que ce plan cite en `:246` — l'ancre réelle est **`:269`**) :
> « éventail POST/RÉEL gaté » et « audience + liste nommée ». Or la **tâche 4.5 du lot 4**
> a précisément pour objet de faire dériver `chromeOwner` de la surface montée
> (`.scene → .atelier`, `.document`/`.mood → .host`) et de transformer le `publishButton`
> — aujourd'hui un `Label` inerte, vérifié `:545` — en vrai bouton. Si 4.5 est livrée, le
> socle EST peint sous la surface document, et deux « non » de cette table deviennent
> « partiellement ». **7.8 doit donc REMESURER l'inventaire sur l'arbre issu du lot 4, pas
> le recopier d'ici.** Une table de parité qui décrit un état révolu est exactement le
> document qui autorise un retrait qu'aucune mesure ne justifie.

**Le coût annexe.** Une garde de source lit le fichier PAR CHEMIN :
`SheetToolbarSemanticsTests.swift:63-68` (`try readSource("Meeshy/Features/Main/Components/EditPostSheet.swift")`)
— supprimer le fichier fait rougir par un **throw de lecture**, pas par une
assertion, et son commentaire `:59-62` érige la feuille en **référence
doctrinale** pour `StatusComposerView` (que le lot 4 retire). Deux autres
fichiers la citent en commentaire de doctrine : `ReelsPlayerView.swift:91`,
`StatusComposerView.swift:108`.

**Conclusion opposable** : le retrait est **hors de ce lot**. La tâche 7.8
produit son inventaire de parité et corrige le mensonge de la table ; le retrait
lui-même est un STOP nommé, à lever par un lot qui possède `MeeshyUI`.

---

## B. Les lois que ce lot câble

**Loi 1 — le contrat partagé porte la loi produit, jamais les affordances**
(§B). Ce que la tâche 7.1 descend dans `packages/shared` est un **protocole**
(un champ d'écho sur un événement socket), pas une affordance : les deux
plateformes doivent l'honorer à l'identique pour réconcilier une ligne
optimiste. `showsSlides`/`opensWith` restent chez iOS.

**Loi 3 — on n'écrit que ce qu'on sait complet et qu'on a su rendre** (§B).
Elle a **deux moitiés**, et le dépôt n'en tient qu'une. La moitié FIL est tenue
(omission des `nil`, §A.6). La moitié **DÉCLARATION** ne l'est qu'à un seul
site — `StoryViewModel.swift:2719-2721`. La tâche 7.7 la généralise par
`buildUpdatePayload` et son miroir Swift, comme la loi 3 le prescrit mot pour
mot (« une fonction, testée une fois, plutôt que sept drapeaux dispersés dont le
prochain serait oublié », `composer-contract.ts:157-160`).

**Loi 5 — le repost miroite** (§B). Ce lot ne l'écrit pas : le lot 0 bis (web)
et le lot 4 (iOS) la câblent. Ce lot lui donne ce qui lui manque pour **survivre
au réseau** : l'idempotence (7.1b) et un écrivain unique (7.5).

**Doctrine, loi 9 et rév. 2 C11 — la reprise assumée de S2.** Les planches ont
déscopé `PublishIntent` avec une raison explicite : « le composer unifié appelle
les trois chemins d'envoi existants · l'utilisateur voit UN composer ; le verbe
unique est de l'hygiène, pas un gain ». **Ce lot ne conteste pas cet
arbitrage — il en change la prémisse.** La mesure §A montre que les chemins ne
sont pas trois mais huit, que quatre perdent leur contenu hors ligne, et qu'un
d'eux publie aujourd'hui un mood republié **sans son attribution**. Le gain
revendiqué par ce lot est donc **la durabilité et l'ordre**, jamais le verbe. Si
une tâche de ce plan ne referme aucun défaut mesuré, elle est de l'hygiène et
doit être coupée.

---

## Global Constraints

- **Fichiers POSSÉDÉS** — gateway/shared : `services/gateway/src/socketio/handlers/SocialEventsHandler.ts`, `services/gateway/src/routes/posts/core.ts` (bloc broadcast seulement), `services/gateway/src/routes/posts/interactions.ts` (route repost seulement), `packages/shared/types/post.ts`, `packages/shared/utils/index.ts`. SDK : `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/MutationPayloads.swift`, `.../Persistence/OutboxRecord.swift`, `.../Persistence/StoryPublishQueue.swift`, `.../Services/PostService.swift` (signatures de repost seulement). App : `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift` **(nouveau)**, `.../Services/OutboxDispatcher.swift`, `.../Services/StoryPublishService.swift`, `.../ViewModels/{Feed,Reels,PostDetail,Status,Story}ViewModel.swift`, `.../Views/FeedView+Attachments.swift`, `.../Views/ProfileUserPostsList.swift`.
- **Fichiers INTERDITS** : `apps/ios/Meeshy/Features/Main/Composer/**` (lots 2/3 **MERGÉS** `96b707da6` ; **c'est le lot 4 qui rend ce répertoire interdit désormais**), `apps/ios/MeeshyTests/Unit/Composer/**` sauf la garde nommée en 7.3, `apps/web/**` (lot 6), `apps/android/**` (lot H suspendu). **`PublishIntent` naît sous `Services/`, PAS sous `Composer/`** — c'est ce qui rend ce lot mergeable en parallèle du lot 4.
  > **Conséquence non déclarée, relevée par l'audit du 2026-08-24.** Le plan du **lot 4** annonce que sa
  > tâche 4.5 crée sur `MeeshyComposerHost` un canal `onPublishDocument: (ComposerDocumentDraft) async -> Bool`
  > et l'appelle « l'ancêtre minimal du `PublishIntent` du lot 7, **que le lot 7 absorbera** ». **Ce lot ne
  > l'a jamais accepté et ne peut pas l'absorber** : `Composer/**` lui est interdit, et il écrit noir sur
  > blanc « ce lot ne touche PAS le meuble ». Écrit d'un seul côté, c'est un travail que chacun croit chez
  > l'autre — le défaut que le lot 4 dénonce lui-même pour `UnifiedPostComposer`. **Ce qui est opposable
  > ici : `onPublishDocument` appartient au lot 4 et y reste** ; `PublishRouting` (7.3) et
  > `onPublishDocument` (4.5) peuvent coexister — le premier tranche le CHEMIN durable, le second n'est
  > qu'une fermeture fournie par un site de montage. Leur fusion, si elle a lieu, est un lot à écrire.
- **Ordre de merge** : les préconditions « lot 3 » et « lot 0 bis » sont **LEVÉES** (`96b707da6`, `d4a40f600` — audit 2026-08-24). Reste la seule vraie : **après le lot 4** pour la tâche 7.8 — le lot 4 possède `LegacyComposer`, et sa tâche 4.5 déplace le sol sous l'inventaire de parité du §A.7.
- **TDD strict, non négociable** : chaque tâche écrit son test ROUGE d'abord, sur un comportement, jamais sur une implémentation.
- **Aucune nouvelle clé de catalogue sans les SEPT langues** iOS (`ar, de, en, es, fr, it, pt-BR` — vérifié sur `apps/ios/Meeshy/Localizable.xcstrings`, 3 323 clés). Réutiliser `status.queuedOffline` et `feed.post.publish.error`, déjà traduites dans les sept.
- **Le web n'est PAS touché** : sa file de publication n'a pas été ouverte par cette mesure — **non vérifié**, et il appartient au lot 6.
- Gates : `cd services/gateway && bun run test:coverage` · scheme `MeeshySDK-Package` (DerivedData privée `/tmp/meeshy-dd-lot-7-sdk`) · `xcodegen generate` puis `./apps/ios/meeshy.sh test`.

---

### Task 7.1: Les deux dettes SERVEUR que la file exige

Rien de ce lot ne tient sans elles, et elles sont livrables seules, sans un seul
changement client.

**Files:**
- Modify: `packages/shared/types/post.ts` (`StoryCreatedEventData:271`, `StatusCreatedEventData:333`)
- Modify: `services/gateway/src/socketio/handlers/SocialEventsHandler.ts` (`broadcastStoryCreated:368`, `broadcastStatusCreated:429`)
- Modify: `services/gateway/src/routes/posts/core.ts` (`:453-456` — les deux branches STORY/STATUS)
- Modify: `services/gateway/src/routes/posts/interactions.ts` (`:930` — la route repost ; `:913` — l'appel de broadcast dont la signature bouge)
- Test: `services/gateway/src/__tests__/unit/socketio/socialEvents.cmidEcho.test.ts` (nouveau), `services/gateway/src/__tests__/unit/routes/posts/repostIdempotency.test.ts` (nouveau)

- [ ] **Step 1: Tests rouges.**
  1. `broadcastStoryCreated(story, authorId, 'cmid_…')` émet `{ story, clientMutationId }` ; sans cmid, la clé est **ABSENTE** du payload (pas `undefined` sérialisé) ;
  2. idem `broadcastStatusCreated` ;
  3. `POST /posts` avec `type: 'STORY'` et un en-tête `X-Client-Mutation-Id` valide échoue aujourd'hui à faire remonter le cmid dans l'événement — le test l'exige et rougit ;
  4. **repost idempotent** : deux `POST /posts/:id/repost` portant le MÊME `X-Client-Mutation-Id` créent **UN** repost, le second rendant le premier (`onDuplicate` → `getPostById`) ; deux cmid différents en créent deux ; **sans** cmid, le comportement actuel est inchangé (`withMutationLog` exécute `op()` une fois, `withMutationLog.ts:10-13`).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter.** Troisième paramètre optionnel `clientMutationId?: string` sur les deux `broadcast*` (rétro-compatible : `interactions.ts:913` compile inchangé) ; `core.ts` passe `request.clientMutationId` sur les **trois** branches ; `interactions.ts:930` enveloppe `postService.repostPost` dans `withMutationLog({ kind: 'repost', … })` — `kind` est un `string` libre (`withMutationLog.ts:47`), aucune migration Prisma.
- [ ] **Step 4: Vert.** **Step 5: Commit.**

**DoD :** `cd services/gateway && bun run test:coverage` vert ; `cd packages/shared && bun run build` (le type modifié compile chez ses consommateurs). **Piège à ne pas déclencher** : `POST /posts` et `PUT /posts/:postId` n'ont **aucun `schema.response`** (`core.ts:293-296`, `:540-542` — vérifié) ; ne pas en introduire un, sous peine de tronquer en silence les champs non listés.

---

### Task 7.2: La charge durable cesse d'amputer — et un mood republié hors ligne retrouve sa SOURCE

C'est le seul défaut de ce lot qui soit visible par un utilisateur **aujourd'hui**.

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/Mutations/MutationPayloads.swift` (`CreatePostPayload:274`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` (`CreatePostBody:1303`, son `encode(to:)` `:1327+`, et le dispatch `:495`)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift` (`:211-224`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Persistence/CreatePostPayloadFidelityTests.swift` (nouveau), `apps/ios/MeeshyTests/Unit/Services/OutboxCreatePostBodyTests.swift` (existant si présent, sinon nouveau)

- [ ] **Step 1: Tests rouges.**
  1. **Le défaut, nommé** : `StatusViewModel.setStatus(emoji:…, repostOfId: "p1", audioUrl: "…")` **hors ligne** enfile une charge qui porte `repostOfId == "p1"` **et** `audioUrl`. Rouge aujourd'hui : le premier n'existe pas dans la charge, le second existe et n'est pas transmis. **Le test n'assère RIEN sur `viaUsername`** — le serveur ne le lit pas (§A.2, correction d'audit), et une garde qui l'exigerait graverait dans un magasin persisté un champ qui ne porte rien.
  2. **Rétro-compatibilité on-disk** : un JSON de `CreatePostPayload` écrit AVANT ce lot (sans les **quatre** clés neuves) décode toujours, les quatre à `nil`. Les raw values sont des identifiants persistés — « renaming a case is a migration, not a refactor » (`OutboxRecord.swift:6-8`) ; ici on n'ajoute que des optionnels.
  3. **Omission à l'encodage** : `CreatePostBody.encode` n'écrit une clé que si sa valeur est non vide (patron déjà tenu `:1327-1340`) — un `repostOfId` nil ne pose pas `"repostOfId": null`, que le gateway lirait autrement.
  4. `storyEffects` sérialisé puis relu rend un `StoryEffects` égal (round-trip), et il part **assaini** (`sanitizedForServerPublish()`, patron `PostService.swift:655`).
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter.** **Quatre** champs optionnels sur `CreatePostPayload` — `repostOfId`, `storyEffects`, `allowSoundExtraction`, `mediaAlt` — et leurs jumeaux sur `CreatePostBody`, avec un commentaire par champ disant **pourquoi il ne vit nulle part ailleurs** (patron `StoryPublishQueueItem.mentionsPayload`, `StoryPublishQueue.swift:54-63`). **`viaUsername` n'en fait PAS partie** : écrire au passage, dans le commentaire de `repostOfId`, que l'attribution passe par LUI et par rien d'autre — sans quoi la session suivante rouvrira la question. Et `StatusViewModel` transmet enfin `audioUrl`/`audioDuration` dans sa branche hors ligne : deux arguments, zéro changement de format.
- [ ] **Step 4: Vert.** **Step 5: Commit.**

**DoD :** scheme `MeeshySDK-Package` vert + `./apps/ios/meeshy.sh test` vert. Le commit dit, en une phrase, le geste utilisateur réparé : « republier un mood sans réseau cesse d'en couper la source — et un mood vocal cesse de partir muet ».

---

### Task 7.3: `PublishIntent` — un verbe, et sa règle de routage jugée à sec

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift`
- Test: `apps/ios/MeeshyTests/Unit/Services/PublishIntentTests.swift` (nouveau)
- Modify: `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentSurfaceTests.swift` (**retournement** de `test_leRoutageDEnvoi_nEstMonteNullePart`, `:662-691`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift` (`:144-198` — `ComposerDocumentSendPath`/`SendRouting` deviennent l'héritage de `PublishRouting`)

**Interfaces** (gelées pour 7.4–7.6) :

```swift
nonisolated struct PublishIntent: Equatable {
    let clientMutationId: String        // cmid_<uuid v4 lowercase>
    let format: ComposerFormat          // .story | .post | .reel | .status
    let payload: CreatePostPayload      // enrichi par 7.2 — la charge, une seule fois
    let localMediaURLs: [URL]           // vide = rien à téléverser
}

nonisolated enum PublishPath: Equatable { case durableOutbox, storyPublishQueue, direct }

nonisolated enum PublishRouting {
    /// L'ORDRE des questions EST la règle — l'inverser perd du contenu.
    static func path(format: ComposerFormat, carriesCanvas: Bool, hasLocalMedia: Bool) -> PublishPath
}
```

- [ ] **Step 1: Tests rouges (à sec, aucune vue montée).**
  1. texte seul, quel que soit le réseau ⇒ `.durableOutbox` (le chemin actuel `FeedViewModel.swift:560-568` **ne teste pas le hors-ligne** — vérifié : `isDurableTextOnly` ne consulte pas `NetworkMonitor`. Cette absence de gate est un ACQUIS, pas un oubli : elle est reconduite telle quelle) ;
  2. média local, hors ligne comme en ligne ⇒ `.durableOutbox` — l'exception audio de la feuille historique n'est PAS reconduite (`ComposerDocumentSurface.swift:184-189` la nomme déjà comme une perte) ;
  3. canevas (`carriesCanvas`) ⇒ `.storyPublishQueue` tant que 7.6 n'a pas fusionné les pilotes ; après 7.6, ce cas devient `.durableOutbox` et **le test bascule avec lui, il ne se supprime pas** ;
  4. `.status` avec `repostOfId` ⇒ `.durableOutbox` (7.2 l'a rendu transportable) ;
  5. un `PublishIntent` construit deux fois depuis la même matière porte **deux cmid différents** — un cmid est un jeton d'envoi, jamais une empreinte de contenu.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter**, et **RETOURNER la garde** : `test_leRoutageDEnvoi_nEstMonteNullePart` exige aujourd'hui `declarations == 1 && appels == 0` sur `ComposerDocumentSendRouting`. `ComposerDocumentSendRouting` est **absorbé** par `PublishRouting` ; la garde est **réécrite** — jamais supprimée — pour exiger que `PublishRouting.path(` ait au moins un appelant de production et que `ComposerDocumentSendRouting` n'existe plus. Son commentaire `:655-657` nomme déjà V7 comme sa condition de levée : la reprendre mot pour mot en la datant.
- [ ] **Step 4: Vert.** **Step 5: Commit.**

**DoD :** `xcodegen generate` puis `./apps/ios/meeshy.sh test` — le fichier de test NEUF doit apparaître dans le delta `project.pbxproj` **avant** le run, sinon il ne s'exécute pas et la suite passe verte en ne mesurant rien.

**Ce que 7.3 ne fait PAS** : elle ne touche à AUCUNE vue. La garde
`test_laSurface_nOuvreAucunCheminDePublication` (`ComposerDocumentSurfaceTests.swift:614-622`)
interdit `PostService`, `TusUploadManager`, `createPost(`, `OutboxFlusher`,
`APIClient` **dans le bloc de la vue** — elle reste vraie après ce lot, et c'est
le signe que la publication est bien restée hors de la surface.

---

### Task 7.4: L'audio composé hors ligne cesse d'être perdu — le premier appelant

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView+Attachments.swift` (`publishAudioPost:431`, `publishAudioFromSheet:1722`)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/FeedViewModel.swift` (`createPost:546`, `createBorrowedSoundPost:615`)
- Test: `apps/ios/MeeshyTests/Unit/ViewModels/FeedViewModelPublishIntentTests.swift` (nouveau)

- [ ] **Step 1: Tests rouges.**
  1. un post **audio** composé hors ligne enfile une ligne durable et **n'appelle pas** `TusUploadManager` — aujourd'hui `publishAudioFromSheet:1727` monte droit sur tus, qui jette, et l'enregistrement est perdu (le commentaire `ComposerDocumentSurface.swift:185-188` le consigne) ;
  2. le même post en ligne produit le MÊME `PublishIntent` et le même corps — un seul chemin, deux conditions réseau ;
  3. `createBorrowedSoundPost` cesse d'encoder son propre `CreatePostRequest` sur `api.request` brut (`FeedViewModel.swift:619-629`) : **6ᵉ constructeur de corps supprimé**, assertion négative de source sur `api.request(endpoint: "/posts"` hors `PostService`/`OutboxDispatcher` ;
  4. le type publié suit `ReelComposition.defaultType` **au même endroit** qu'aujourd'hui (non-régression : un audio ≥ 3 s reste un RÉEL, `forcePlainPost` reste honoré).
- [ ] **Step 2-5:** rouge → `PublishIntent` construit une fois, `PublishRouting` tranche, l'existant `enqueueDurableTextPost`/`enqueuePostMedia` reçoit la charge → vert → commit.

**DoD :** `./apps/ios/meeshy.sh test`. La réconciliation optimiste est déjà acquise pour POST **et RÉEL** (§A.4) — aucun changement gateway n'est requis ici.

---

### Task 7.5: Le repost a UN écrivain, et il survit au réseau

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` (`repost:510` — ajout d'une surcharge portant `clientMutationId`, patron `addComment(… clientMutationId:)` `:90`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` (le kind `.repostStory` cesse d'être mort **ou** un kind `.repostPost` est ajouté — trancher au Step 1, voir ci-dessous)
- Modify: les **huit** sites : `FeedViewModel.swift:892`, `ReelsViewModel.swift:434`, `PostDetailView.swift:305`, `ProfileUserPostsList.swift:975`, `RootViewComponents.swift:336`, `FeedView.swift:475`, `StoryViewerView.swift:872`, `StoryViewerView.swift:1280`
- Test: `apps/ios/MeeshyTests/Unit/Services/RepostIntentTests.swift` (nouveau)

- [ ] **Step 1: Tests rouges + UN arbitrage à écrire.**
  - **Arbitrage de kind.** `.repostStory` existe (`OutboxRecord.swift:45`) mais son payload `RepostStoryPayload` (`MutationPayloads.swift:255`) porte `targetConversationId` — un repost PRIVÉ en conversation, qui n'est pas notre geste. Deux issues : élargir ce payload, ou **appender** un kind `.repostPost`. **Trancher pour l'append** sauf preuve contraire : les raw values sont des identifiants on-disk, et réutiliser un kind pour un autre contrat est exactement la migration silencieuse que `OutboxRecord.swift:6-8` interdit. Écrire la raison dans le commit.
  - Tests : un repost émis hors ligne enfile une ligne durable et **ne perd pas** son `targetType` (loi 5 — le format miroite jusque dans la file) ; le flush envoie l'en-tête `X-Client-Mutation-Id`, et un rejeu **ne double pas** (garanti par 7.1b) ; **échec TERMINAL nommé** : un 404 sur la source (`POST_NOT_FOUND` — la story a expiré pendant l'attente) et un 403 `REPOST_AUDIENCE_WIDENING` sont des échecs **définitifs**, pas des retries — la ligne quitte la file et l'auteur est prévenu, jamais une boucle infinie ;
  - assertion négative de source : plus aucun appel direct à `PostService.repost` hors du dispatcher et du chemin en ligne unique.
- [ ] **Step 2-5:** rouge → un `RepostIntent` app-side, huit sites recâblés, deux traitements d'erreur nommés → vert → commit.

**DoD :** `./apps/ios/meeshy.sh test` + scheme SDK. **Dépend de 7.1b** : sans idempotence serveur, mettre le repost en file **crée des doublons**. Ne pas commencer cette tâche avant que 7.1 soit vert.

---

### Task 7.6: Les deux magasins, un seul PILOTE (le « Tier C » que le code nomme)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher.swift` (`:87-99` — le rejet 501 devient un dispatch)
- Modify: `apps/ios/Meeshy/Features/Main/Services/StoryPublishService.swift` (son timer de retry est **désarmé** ; il ne reste que l'exécuteur et les toasts)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Persistence/StoryPublishQueue.swift` (l'`enqueue` écrit AUSSI la ligne outbox pointeuse ; la file cesse de se piloter)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift` (`persistPublishIntentToQueue:1686`)
- Test: `apps/ios/MeeshyTests/Unit/Services/PublishQueueSinglePilotTests.swift` (nouveau)

- [ ] **Step 1: Tests rouges — et le premier est le seul qui compte.**
  1. **EXCLUSION MUTUELLE.** Une story en attente est exécutée **UNE FOIS** quand les deux pilotes s'éveillent au même instant (reconnexion réseau + foreground). Deux pilotes sur un même item **publient deux fois** — c'est le risque n°1 de cette tâche, et le test le nomme avant l'implémentation ;
  2. l'ordre FIFO est **global** : un post texte enfilé avant une story part avant elle (aujourd'hui les deux files n'ont aucun ordre l'une par rapport à l'autre) ;
  3. le témoin est **UN** : `pendingCount` compte les deux natures ; `OutboxUIItem.mapStory` (`:92`) cesse d'être du code mort et rend une ligne lisible ;
  4. **la charge ne bouge pas** : `PublishStoryPayload` reste `{ clientMutationId, offlineQueueItemId }`, l'instantané des slides reste dans `story_publish_queue.json` — c'est exactement ce que son commentaire (`MutationPayloads.swift:241-244`) prévoit, et c'est ce qui rend cette tâche petite ;
  5. **migration au démarrage** : les items déjà présents dans le JSON à l'installation de cette version reçoivent leur ligne outbox pointeuse au premier lancement, une fois, sans doublon (patron `MigrateLegacyQueues.swift`).
- [ ] **Step 2-5:** rouge → dispatch `.publishStory` vers `StoryPublishExecutor`, retrait du pilotage propre à `StoryPublishQueue`, migration idempotente → vert → commit.

**STOP nommé.** Si le test 1 ne peut pas être rendu vert **sans** toucher
`MeeshyUI`, la tâche s'arrête et le remonte : deux publications d'une même story
sont une régression pire que deux files. Les tâches 7.1–7.5 et 7.7 restent
livrées et le produit reste fonctionnel — c'est exactement pourquoi 7.6 est
placée après elles.

---

### Task 7.7: L'édition a un seul écrivain de CORPS — `buildUpdatePayload` cesse d'être mort

**Files:**
- Modify: `packages/shared/utils/index.ts` (ré-export de `./composer-contract.js` — extension `.js` **obligatoire**, un import sans extension crashe en prod ESM)
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostEditPayload.swift` (le miroir Swift de `buildUpdatePayload`)
- Modify: `apps/ios/Meeshy/Features/Main/Components/EditPostSheet.swift` (`save():642-657` construit sa déclaration `known`, sans changer un pixel de l'écran)
- Modify: `FeedViewModel.swift:987`, `ReelsViewModel.swift:506`, `PostDetailViewModel.swift:636`, `ProfileUserPostsList.swift:1024` — **le corps seulement**
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/PostEditPayloadTests.swift` (nouveau), `packages/shared/__tests__/composer-contract.test.ts` (étendu)

- [ ] **Step 1: Tests rouges.**
  1. les **trois pièges du tri-état**, en Swift, mot pour mot depuis les cas TS (`composer-contract.test.ts:164-183`) : `[]` déclaré connu est **ÉCRIT** ; `null`/`.remove` déclaré connu est **ÉCRIT** ; un champ **non déclaré connu** est **OMIS**, même s'il porte une valeur ;
  2. **le cas qui a coûté** : un composer qui n'a pas rendu les références déclarées ne les écrit pas — miroir exact de `editingKnowsDeclaredReferences` (`StoryComposerViewModel+Edit.swift`) et du seul site qui l'applique aujourd'hui (`StoryViewModel.swift:2719-2721`) ;
  3. **non-régression des six chemins** : chacun des six appelants de `postService.update` (§A.6) produit, à matière identique, **le même corps qu'avant ce lot** — le test compare l'encodage JSON, pas les appels ;
  4. `@meeshy/shared/utils` exporte `buildUpdatePayload` (aujourd'hui `utils/index.ts` ré-exporte une douzaine de modules mais **pas** `composer-contract` — voir la correction d'audit du §A.6 ; le ré-export s'AJOUTE, il n'écrase pas la liste).
- [ ] **Step 2-5:** rouge → un constructeur de corps, quatre `updatePost` qui l'appellent → vert → commit.

**Ce que 7.7 ne fait PAS, et pourquoi.** Elle ne fusionne pas les quatre
`updatePost`. Ils diffèrent par leur **collection optimiste** (`posts`, `reels`,
un `snapshot` de détail, une liste de profil) — ce n'est pas un doublon de loi,
c'est la même forme sur quatre états distincts. Fusionner les listes serait le
sur-périmètre que la §G interdit. **Un seul écrivain du CORPS, pas un seul
propriétaire de la liste.**

**Note serveur mesurée :** `PUT /posts/:postId` n'a **pas** de `withMutationLog`
(`core.ts:540-542`). L'édition reste donc hors file durable dans ce lot ;
`removeMediaIds` rejoué serait un no-op, mais rien ne le prouve et rien ne
l'exige — l'édition hors ligne est nommée en Hors périmètre.

---

### Task 7.8: Parité avant retrait — l'inventaire opposable, et `LegacyComposer` cesse de mentir

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift` (`LegacyComposer:76`, profil `.edit:243-263`) — **fichier possédé par les lots 3 puis 4 : cette tâche ne démarre qu'après le merge du lot 4**
- Test: `apps/ios/MeeshyTests/Unit/Composer/EditParityInventoryTests.swift` (nouveau)
- Modify: `docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md` (§E lot 7 : le compte 498 → 658, et le retrait re-séquencé)

- [ ] **Step 1: Tests rouges.**
  1. **Le mensonge, nommé.** `ComposerProfile.profile(for: .edit(postId:, documentFormat: .post))` rend aujourd'hui `routesToLegacy: .storyEdit` (`ComposerIntent.swift:262`) — or `.storyEdit` désigne `storyEditComposerCover` (`StoryTrayView.swift:23`, 4 montages : `StoryTrayView.swift:175` et `:883`, `iPadRootView.swift:192`, `RootView.swift:711`), qui est l'édition de **story**. Éditer un POST ou un RÉEL n'a **aucune** représentation dans la table. Le test exige un cas `editPostSheet` et un routage juste par format ;
  2. **l'inventaire de parité** est une table de test, pas une prose : les **sept** capacités de la §A.7, chacune avec le site qui la tient et un `XCTAssertFalse` sur celui qui ne la tient pas encore. Elle rougira quand une capacité arrivera — c'est le signal que le retrait se rapproche, et le seul qui vaille ;
  3. **garde négative reformulée, pas supprimée** : `.statusComposer`, `.repostComposer`, `.storyEdit` et le nouveau `.editPostSheet` restent déclarés dans `LegacyComposer` même quand plus aucune porte n'y route — le lot 3 a écrit pourquoi (`ComposerIntent.swift:69-75` : « la garde négative qui interdit à toute porte d'y retomber doit pouvoir NOMMER son interdit »), et ce lot reprend ce gabarit sans l'inventer.
- [ ] **Step 2-5:** rouge → un cas d'enum, un routage par format, une table d'inventaire → vert → commit.

**STOP de retrait, opposable.** Le retrait d'`EditPostSheet.swift` **n'a pas
lieu dans ce lot**. Ses deux conditions sont mesurées et vivent dans `MeeshyUI`
(`MeeshyComposerHost.swift:518-534`) : un gate de matière lisible app-side, un
écrivain d'audience atteignable par le meuble. Tant qu'elles ne sont pas levées,
retirer la feuille retire **sept** capacités et rend rouge une garde qui lit le
fichier par chemin (`SheetToolbarSemanticsTests.swift:63-68`). Le lot qui les
lève est celui qui possède `MeeshyUI` — pas celui-ci.

---

### Task 7.9: Gate final + planches P0

- [ ] `cd services/gateway && bun run test:coverage` — suites complètes vertes (prérequis CI : `bun install --ignore-scripts`, `npx prisma generate --generator client`, `cd packages/shared && bun run build`).
- [ ] `cd packages/shared && TZ=UTC bun run test` — `composer-contract.test.ts` étendu vert.
- [ ] Scheme `MeeshySDK-Package` COMPLET (DerivedData privée `/tmp/meeshy-dd-lot-7-sdk`, attendre le lock `xcodebuild` voisin).
- [ ] `xcodegen generate` puis `./apps/ios/meeshy.sh test` COMPLET — les **cinq** classes de test neuves de ce lot doivent apparaître dans le delta `project.pbxproj` ; greffer le delta contre `origin/main`, **jamais** committer un pbxproj régénéré en entier (il emporterait le WIP des lots voisins).
- [ ] Planches P0 (`docs/product/planche-meeshy-composer.html`) — **remesuré à l'audit du 2026-08-24 : rév. 22 (2026-08-24), fichier modifié NON COMMITTÉ, et INCOHÉRENT avec lui-même** (arc et centre `62 / 70` l. 278-281 contre « 57 tâches (81,4 %) » l. 287 ; rév. 17 « INCHANGÉ : 57/70 » contre rév. 22 « INCHANGÉ à 62/70 »). Le « 57/70 » qu'écrivait ce plan ne peut donc pas être repris tel quel — réconcilier, ou dire laquelle fait foi : camembert **ET** matrice mis à jour **dans le même commit que ce gate** — la règle de maintenance héritée (§A bis du design) en fait un défaut bloquant. La ligne S2 y porte encore « PublishIntent déscopé / différé » : elle est **amendée**, pas réécrite, avec la raison du §B ci-dessus (la prémisse a changé, pas l'arbitrage d'hygiène).
- [ ] Merge : **après** les lots 3 et 0 bis ; la tâche 7.8 **après** le lot 4.

---

## C. Ordre contraint — par les dépendances, pas par la taille

```
7.1 (serveur : écho + idempotence)  ──┬──> 7.2 (charge fidèle) ──> 7.3 (le verbe, à sec)
                                      │                               │
                                      └──> 7.5 (repost durable) <─────┤
                                                                      ├──> 7.4 (audio, 1er appelant)
                                                                      └──> 7.6 (un seul pilote)
7.7 (corps d'édition) — indépendante, livrable en parallèle
7.8 (parité + LegacyComposer) — APRÈS le lot 4
7.9 (gate)
```

0. **Le lot 4 avant 7.8, et rien d'autre en amont.** Les lots 3 et 0 bis ont mergé ; leur mention comme
   « en vol » ailleurs dans ce plan est périmée (audit 2026-08-24).
1. **7.1 avant tout.** Sans l'écho, story et status ne peuvent pas être
   réconciliés ; sans l'idempotence, mettre le repost en file **crée des
   doublons**. C'est la seule dépendance dure du lot, et elle est serveur.
2. **7.2 avant 7.3.** `PublishIntent` porte `CreatePostPayload` : le figer avant
   qu'il soit fidèle graverait l'amputation dans une interface.
3. **7.3 avant 7.4/7.5/7.6.** La règle se juge à sec avant d'avoir un appelant —
   patron déjà tenu par `ComposerDocumentSendRouting`.
4. **7.6 en dernier des tâches app.** C'est la seule qui porte un risque de
   double publication ; la placer après garantit qu'un STOP y laisse le reste
   livré.
5. **7.7 est indépendante** : elle ne touche ni la file ni le meuble. Elle peut
   partir en parallèle de 7.1.
6. **7.8 après le lot 4**, qui possède `LegacyComposer`. La faire avant
   fabriquerait un conflit sur la ligne la plus disputée du chantier.

---

## D. Les pièges nommés — ceux du dépôt, appliqués ici

1. **Une garde NÉGATIVE dont la cible disparaît passe au VERT en perdant sa
   protection.** Deux gardes sont concernées :
   `test_leRoutageDEnvoi_nEstMonteNullePart` (`ComposerDocumentSurfaceTests.swift:662`)
   se **retourne** en 7.3 ; les cas de `LegacyComposer` **restent déclarés** en
   7.8. La question à se poser à chaque fois : *rougirait-elle si on
   réintroduisait l'interdit ?*
2. **Un fichier de test NEUF n'est PAS exécuté par `xcodebuild` tant qu'il n'est
   pas dans `project.pbxproj`.** Cinq fichiers neufs ici. `xcodegen generate`
   puis greffe du **delta** pbxproj contre `origin/main` — un pbxproj régénéré
   en entier emporte le WIP des sessions voisines, qui tournent en ce moment.
3. **Isolation MainActor par défaut (Swift 6.2) sur la cible app.** `CreatePostBody`
   porte déjà `nonisolated` pour cette raison exacte (`OutboxDispatcher.swift:1299-1302`) :
   « une conformance `Encodable` isolée ne peut pas servir depuis le dispatch ».
   `PublishIntent`, `PublishPath` et `PublishRouting` naissent `nonisolated`.
4. **Pas de `@ViewBuilder` + `if #available` imbriqué** — débordement de pile par
   profondeur de type, 1 008 Ko de pile sur device contre 8 Mo au simulateur.
   Sans objet ici (ce lot ne touche aucune vue), et c'est précisément pourquoi
   il ne doit pas commencer à en toucher.
5. **Un schéma de réponse Fastify TRONQUE en silence les champs non listés.**
   `POST /posts` et `PUT /posts/:postId` n'en ont **pas** (vérifié) — ne pas en
   introduire un en passant.
6. **Import `@meeshy/shared` sans extension `.js` = crash en prod ESM.** Le
   ré-export de 7.7 s'écrit `export * from './composer-contract.js';`.
7. **Toute clé neuve dans les SEPT catalogues iOS** (`ar, de, en, es, fr, it,
   pt-BR`). Ce lot ne devrait en créer aucune : `status.queuedOffline` et
   `feed.post.publish.error` existent et sont traduites dans les sept.
   Le web est localisé en **quatre** langues — hors périmètre, lot 6.
8. **Les raw values d'`OutboxKind` sont des identifiants ON-DISK.** Renommer un
   cas est une migration. 7.5 **appende** plutôt que de recycler `.repostStory`.
9. **Un commentaire qui énonce un invariant plus large — ou plus étroit — que
   son correctif devient la loi lue par la suivante.** Deux à corriger en
   passant, dans les fichiers que ce lot ouvre :
   `FeedViewModel.swift:552-555` (« only type == "POST" can be reconciled » —
   faux, le RÉEL l'est aussi) et `StatusViewModel.swift:205-210` (vrai
   aujourd'hui, **faux après 7.1** — le retirer dans le même commit que
   l'écho).
10. **Deux pilotes sur une même file publient deux fois.** C'est le risque n°1
    de 7.6, et son test 1.

---

## E. Ce que ce lot NE fait PAS — dit une fois, opposable

Renvoi à **§G « Hors v2 »** du design du 2026-08-23 et à **§F « Hors v1 »** de la
spec du 2026-08-20, qui gardent leur opposabilité.

- **Le RETRAIT d'`EditPostSheet.swift`** — séquencé derrière la tâche 7.8, STOP
  nommé, conditions mesurées dans `MeeshyUI` (§A.7).
- **Le verbe unique côté UI** — le composer ne gagne aucun bouton, aucune
  surface, aucun `chromeOwner: .host`. Les lots 1/2/3 possèdent le meuble.
- **L'édition hors ligne** — `PUT /posts/:postId` n'est pas idempotent
  (`core.ts:540`), et rien dans la mesure ne montre un défaut utilisateur ici.
- **Le web** — lot 6. Sa file de publication n'a pas été ouverte : **non
  vérifié**.
- **Android** — lot H **suspendu** par directive du 2026-08-23.
- **`PendingStatusQueue`** (`apps/ios/.../Services/PendingStatusQueue.swift`,
  96 l.) — c'est la file des accusés de lecture (`mark-as-read`), pas une file
  de publication. Elle ne fusionne pas.
- **`POST /posts/from-attachment`** et la fiche de forward — lot 5.
- **La conversion de format par l'ÉDITION au-delà de POST↔REEL** — rôle du
  repost (loi 5), et `UpdatePostSchema` le refuse (`types.ts:348`, vérifié).

---

## F. Ce qui n'a PAS été vérifié pour écrire ce plan

Écrit ici parce qu'une affirmation non vérifiée présentée comme mesurée est un
défaut, pas une approximation.

- **Aucun test, aucun build n'a été lancé** (lecture seule imposée). Toute
  phrase « cette garde rougirait » est une lecture de source, jamais une
  exécution.
- **`apps/web` n'a pas été ouvert.** Le nombre de chemins de publication web et
  leur durabilité sont **inconnus** ; `posts.service.ts` est en outre modifié
  non committé par le lot 0 bis.
- **Android n'a pas été ouvert.**
- **`StoryPublishQueue.swift` (823 l.) n'a été lu qu'en partie** — en-tête,
  champs de l'item, noms de fichiers et emplacement disque. Sa **politique de
  retry** et son comportement exact à froid ne sont pas caractérisés : la tâche
  7.6 doit les lire avant d'écrire son test 1.
- **`MeeshyUI` n'a pas été ouvert.** Les deux conditions de levée de
  `chromeOwner: .host` sont citées depuis les commentaires du host
  (`MeeshyComposerHost.swift:518-534`), pas vérifiées dans le SDK.
- **La couverture de tests des six chemins d'édition n'a pas été mesurée** : on
  ignore lesquels rougiraient si 7.7 changeait leur corps. D'où le test 3 de
  7.7, qui compare l'encodage plutôt que de faire confiance à l'existant.
- **`ComposerIntent.swift` et `MeeshyComposerHost.swift` étaient SALES** à la
  rédaction. **Ils ne le sont plus** (audit 2026-08-24, `d4a40f600`) : ils ont
  bougé une seconde fois avec le merge du lot 3, et les ancres corrigées sont
  données dans l'encadré du §A. Elles bougeront **encore** avec le lot 4.
- **`packages/shared/utils/index.ts` a changé le 2026-08-24** (`d4a40f600` y a
  ajouté `repost-target.js`) : le ré-export de 7.7 s'ajoute à une liste vivante.
