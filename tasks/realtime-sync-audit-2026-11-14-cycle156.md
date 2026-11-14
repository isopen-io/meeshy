# Cycle 156 — la FORME des charges socket a sa garde, et les trois divergences qu'elle nommait sont réparées

*2026-11-14. Branche `claude/exciting-planck-uzlkwz`, partie de `dev` à `b7746e4e1`.*

**Livré** : #18070 (la garde) et #18069 (le défaut qui l'a révélée), ensemble —
la garde est le témoin de la réparation, et la réparation est ce qui lui permet
d'être verte.

---

## Ce que le cycle 155 laissait, et la correction qu'il faut lui apporter

Le cycle 155 a mesuré #18069 et refusé de le livrer, pour une raison explicite :

> `android.yml` n'a ni `workflow_dispatch` ni déclencheur `pull_request` : il ne
> tourne que sur `push` vers `main` et `dev`. Un lot Android n'est donc prouvable
> qu'une fois FUSIONNÉ.

**C'est faux, et c'est la première chose que ce cycle a vérifiée.** Le fichier
porte les deux : `pull_request: branches: [main, dev]` avec `apps/android/**`
dans ses chemins (`:59`), et `workflow_dispatch` (`:92`). Un lot Android **est**
prouvable avant fusion. L'arbitrage du cycle 155 — consigner plutôt que livrer —
reposait donc sur une lecture, pas sur une mesure.

> **Un blocage qui dispense de livrer se vérifie avec le même soin qu'un défaut
> qu'on rapporte.** Celui-ci tenait en un `grep` dans le fichier qu'il citait.

Ce qui est vrai, en revanche, et qui a été mesuré ici : le conteneur ne compile
pas Kotlin. `./apps/android/meeshy.sh jvm-check` échoue sur
`build-artifacts.signal.org` (403 par le proxy) avant même `dl.google.com`. La
preuve est donc la CI, et c'est elle qui tranche — pas une relecture.

---

## Lot A — la garde (#18070)

`packages/shared/__tests__/ci/socket-payload-shape-gate.test.ts`.

Les NOMS d'événements ont trois gardes ; la FORME des charges n'en avait
aucune. Elle compare, pour chaque événement serveur→client qu'Android décode,
les champs que le miroir Kotlin **EXIGE** (non-nullables, sans défaut) à ce que
le contrat **DÉCLARE** (`ServerToClientEvents`).

**Aucune table tenue à la main.** Le couple (événement, classe) se déduit des
sites de routage — `route(SocketEventNames.X, _sujet)`, `route<K>(…)`,
`SocketInboundRoute.decoding(…)` — et le sujet donne la classe. C'est la leçon du
cycle 155 appliquée à l'outil qu'elle visait : *un gate indexé sur une RELATION
déclarée ne balaie pas les sites qui n'en ont pas.* Ici il n'y a pas de relation
à déclarer, donc rien à oublier d'y inscrire.

**Le contrat est résolu par le COMPILATEUR**, pas par une lecture de texte : les
types de charge passent par des alias, des `extends`, des intersections et des
unions, et vivent parfois hors de `types/socketio-events/`. `getPropertiesOfType`
les résout tous — et d'une union ne rend que les propriétés COMMUNES, ce qui est
exactement « ce que la charge porte à coup sûr ». TypeScript 7 (épinglé par
`packages/shared`) étant le portage natif, qui n'expose pas l'API JS, la garde
charge la 6 de la racine — et **échoue** si aucune ne répond, plutôt que de se
sauter.

### Le mode de panne d'une garde qui DÉDUIT sa table

Une table déduite peut se vider en silence : un renommage de `route(` rendrait
zéro route, et zéro route ne rougit jamais. Quatre invariants ferment la porte,
et chacun est un `expect` — pas un commentaire :

| invariant | ce qu'il attrape |
|---|---|
| au moins 100 routes balayées (119 mesurées) | le balayage devenu vide |
| toute constante d'événement se résout | un nom de constante renommé |
| toute classe de charge se résout | un sujet déplacé, un `typealias` cassé |
| tout événement routé est au contrat | un canal qu'Android écoute hors contrat |

### Mesure

119 routes, **zéro** non résolue, **zéro** événement hors contrat, et exactement
**six** divergences — les trois que #18070 prédisait, sans aucun bruit. Les
domaines SOCIAL, RELATION et ENSEMBLE, que l'issue disait non confrontés, sont
balayés par la même passe et sont propres.

**Vue rougir des DEUX côtés** : en remettant `attachmentId` requis dans le miroir
(le piège armé), et en rendant `conversationId` optionnel au CONTRAT pour
`message:deleted`. C'est la seconde qui compte le plus : la divergence future ne
viendra pas forcément du miroir, et elle rougit chez celui qui l'écrit.

---

## Lot B — les trois divergences (#18069 et les deux pièges)

### `message:translation` — le Prisme ne tenait plus qu'à un rechargement

Le miroir déclarait une forme PLATE que la passerelle n'a jamais émise. Son
émetteur unique, `buildTranslationEvent.ts`, IMBRIQUE les traductions et ne
porte **pas** de `conversationId` — le web le documente mot pour mot
(`realtime-apply.ts` : « La charge ne porte PAS `conversationId` : on retrouve la
page en balayant les fils déjà en cache »). Trois champs requis manquaient donc à
chaque trame ⇒ `MissingFieldException` ⇒ avalée par `SocketInboundRoute.guarded`.

Conséquence sur l'appareil : aucune traduction temps réel n'atteignait Android.
Le lecteur voyait la bulle dans la langue de l'auteur, et elle ne changeait
jamais jusqu'à un refetch REST.

Le miroir porte désormais la forme du fil, et ses trois consommateurs itèrent
`translations`. **Le filtre `event.conversationId == conversationId` de
`ChatTranslationController` a disparu** : il s'adossait à un champ inexistant, il
ne gardait donc rien. La portée vient du dépôt, indexé par `messageId` et no-op
sur un message absent — le même arbitrage que le web.

> Deux témoins asséraient « une trame d'une AUTRE conversation est ignorée ».
> Ils étaient **verts sur une fiction** : ils construisaient en Kotlin un
> `conversationId` que le fil ne transporte pas. Un témoin qui fabrique son
> entrée dans le langage du client ne peut rien dire du fil.

### Les deux pièges armés

`ReactionUpdateEvent.userId` et `AttachmentUpdatedEvent.attachmentId` exigeaient
ce que le contrat déclare optionnel — délibérément dans les deux cas (une charge
rejouée hors ligne peut précéder l'ajout de `userId` ; `attachmentId` n'est posé
que par l'émetteur qui nomme une pièce). Tous deux passent à `String? = null`.

**Et le correctif ouvrait sa propre trappe** : `event.userId == me` devient VRAI
quand les deux valent `null`, c'est-à-dire pour un lecteur ANONYME face à la
réaction d'un tiers. D'où `isOwnEcho(currentUserId)`, site unique de la question,
et ses deux appelants.

> **Rendre un champ nullable déplace le défaut, il ne le supprime pas** : toute
> comparaison d'identité qui le lisait devient une comparaison de deux inconnues.

### Le témoin qui manquait

`SocketPayloadWireContractTest.kt` (`:core:model`) décode du **JSON de fil brut**
à travers le `Json` réel de `SdkModule`. C'est la moitié que les témoins
existants ne tenaient pas, et la raison pour laquelle #18069 a vécu : un témoin
qui construit l'événement en Kotlin vérifie le consommateur et **saute le
décodeur**. Il reste vert quelle que soit la charge réellement émise.

Les deux gardes se complètent et ne se recouvrent pas : la garde TS confronte le
miroir au CONTRAT, pour tous les événements d'un coup ; le témoin Kotlin le
confronte à une charge LITTÉRALE, pour ceux qui ont déjà coûté.

---

## Ce que ce cycle a trouvé et n'a pas réparé

**`message:attachment-updated` a DEUX miroirs Kotlin routés en parallèle** :
`MessageAttachmentUpdatedEvent` (indulgent, porte la pièce entière, consommé) et
`AttachmentUpdatedEvent` (plat, c'est celui qui portait le piège) — dont le flux
`attachmentUpdated` n'est **collecté nulle part**. Une jumelle divergente dont
une moitié est morte. Sa suppression traverse trois modules que ce conteneur ne
compile pas : elle devient une issue, pas un geste à l'aveugle.

**La garde ne regarde que le PREMIER niveau.** `SocketPostCreatedData.post`,
`SocketCommentAddedData.comment` imbriquent des objets entiers dont un seul champ
requis tue le document de la même façon. C'est le critère de fin de #18070, et
l'extension est une issue à son tour.
