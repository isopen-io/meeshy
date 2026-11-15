# Cycle 170 — deux doc-comments affirmaient l'unicité, et il y avait trois files

*2026-11-15. Branche `claude/exciting-planck-jgv7lx`, repartie de la tête de
`dev` (`f02e978b4`).*

**Livré** : #18616 — la file de remise hors ligne est UNE instance par
processus, et c'est désormais un cliquet qui le dit.

> *Le numéro de cycle est pris au moment de l'écriture. Les cycles sœurs
> publient en parallèle ; si 170 est déjà sur `dev` à la fusion, ce journal se
> renomme — c'est ce que le cycle 169 a fait pour 166 à 168.*

---

## Comment le cycle a été ouvert

Le relevé de départ est parti du tableau « ce que le cycle a CÉDÉ ou n'a pas
pris » du cycle 169, qui laissait six issues derrière lui. Relevé des PR
ouvertes (quatorze, horodatées) : aucune ne revendique #18614, #18616, #18617,
#18618, #18619, #18680 ni #18681. Aucun lot n'avait donc d'antériorité
d'écriture, et la règle de tranchage ne s'appliquait pas.

**#18616 a été prise avant #18619**, qui est plus large (signer la charge de
trois émetteurs), pour une raison de forme : #18616 est une affirmation FAUSSE
posée à l'endroit exact où l'on irait vérifier, et ce genre de défaut coûte à
chaque lot qui passe à côté — y compris aux lots qui corrigeront #18619.

## Le constat

`server.ts:272` construit la file de remise et DÉCLARE son unicité sur place :

> « l'instance VIVANTE est celle-ci … donc **la seule dont la tranche MÉMOIRE
> porte des entrées de message**. »

`delivery-queue-registry.ts` le redit (« la seule où les entrées de message sont
effectivement enfilées »). Mesuré sur la tête de `dev`, le balayage rend **trois
constructions de production** :

| site | enregistre ? | ce qu'elle porte |
|---|---|---|
| `server.ts:272` | **oui** (`setSharedDeliveryQueue`) | la file du processus |
| `socketio/MeeshySocketIOHandler.ts:124` | non | les quatre déclencheurs de `message:attachment-updated` |
| `jobs/index.ts:91` | non | un repli dégénéré, jamais enfilé |

La seconde est VIVANTE en production dès que `translationService.getZmqClient()`
est non nul, et elle est remise à `startMediaReadyListener`,
`gatewayLocalMediaRenderer`, `startGatewayPendingSweep` et
`MessageAttachmentAltTranslationService` — les quatre chemins qui enrichissent
une pièce jointe après coup (transcription Whisper, piste TTS NLLB).

## Pourquoi rien ne le signalait

**La tranche REDIS est partagée** — toutes les instances écrivent dans les mêmes
clés, donc le cas nominal marche, et chaque témoin de comportement du pipeline
média était vert à juste titre. **La tranche MÉMOIRE est par instance**
(`RedisDeliveryQueue.memoryQueue`), et c'est le repli qu'emprunte TOUTE entrée
écrite pendant un hoquet Redis. Les trois unités qui la traversent ne connaissent
que l'instance ENREGISTRÉE :

| unité | comment elle trouve la file | ce que la seconde instance lui cachait |
|---|---|---|
| le drain (`_drainPendingMessages`) | `this.deliveryQueue` du manager | une entrée `attachment-updated` tombée en mémoire n'est **jamais livrée** — le destinataire hors ligne garde définitivement le vocal NON enrichi, exactement la panne que `emitAttachmentUpdated` existe pour empêcher |
| la purge (`applyMessageRemovalEffects`, vue unique) | `getSharedDeliveryQueue()` | `attachment-updated` est porteur de TEXTE : la **transcription d'un message brûlé, à vue unique ou supprimé survit** dans ce tas |
| le balayage de TTL (`DeliveryQueueCleanupJob`) | l'instance de `server.ts` | aucune expiration sur cette tranche |

**Et aucun cliquet existant ne pouvait le voir.** `delivery-queue-door-sweep`
garde l'ENFILAGE : il interdit qu'un transport écrive lui-même dans la file. La
seconde instance passe par l'unité partagée, respecte le contrat de fil, et
serait verte à tous les cliquets du dépôt. **Une porte se relâche, une porte se
contourne — et une porte peut aussi être parfaitement franchie, vers la mauvaise
pièce.**

## Le correctif, et pourquoi il RÉSOUT au lieu de recevoir

Le registre existe déjà et son préambule écrit pourquoi (« faire descendre
l'instance jusqu'à chacun d'eux voudrait dire élargir six signatures … et
surtout : la purge serait alors un PARAMÈTRE, donc une garde que son absence
désactive »). Le pipeline média le rejoint par `getSharedOfflineEnqueuer()`.

Deux points de forme qui ne sont pas cosmétiques :

**1. La résolution est un ACCESSEUR, pas une capture.** En production
l'enregistrement précède le câblage (constructeur de `server.ts`, puis `start()`
→ `setupSocketIO()` → `startMediaPipelines`) — et c'est précisément ce qui rend
une capture unique indétectable : elle passerait tous les témoins écrits depuis
l'état nominal. Un `undefined` capturé une fois figerait le pipeline média hors
de la file pour toute la vie du processus, en silence. Le témoin qui tient ce
point enregistre la file APRÈS le câblage, et il tombe sous la mutation « capture
eager ».

**2. La projection déclare la signature RÉELLE, options comprises.**
`QueuedEntryEnqueuer.enqueue` porte le troisième paramètre `{ sealAtRest }`, qui
décide si l'entrée est SCELLÉE avant d'atteindre Redis. Mesuré : une projection à
deux paramètres reste **assignable** à un type à trois, et `tsc --noEmit` rend
`EXIT=0` sous la forme narrow. Le scellement se perdrait donc sans qu'une ligne
ne rougisse — c'est la leçon que le dépôt écrit déjà sur les `select` trop
étroits (« la PROJECTION est la seule des conditions qu'aucun témoin de
comportement ne peut voir »), portée d'une requête à une interface.

**3. Le repli dégénéré de `jobs/index.ts` part, il ne se gèle pas.**
`new RedisDeliveryQueue({ getNativeClient: () => null })` était inoffensif — ce
balayeur n'enfile rien — mais c'est exactement l'inventaire qu'on refuse de
porter. `DeliveryQueueCleanupJob` accepte `undefined` et ne fait rien : **un
objet nul se dit en ne faisant rien, pas en construisant la chose dont on n'a
pas besoin.**

## Preuves

| preuve | résultat |
|---|---|
| mutation par mutation (5 mutations) | voir le tableau ci-dessous |
| `src/socketio` + `src/__tests__/unit/{jobs,socketio}` | **283 suites / 3 798 témoins** |
| suite gateway complète | voir § Preuves finales |
| `tsc --noEmit` gateway | **EXIT=0**, lu hors pipe |

### Le ROUGE, UNE MUTATION À LA FOIS

| mutation de production | témoins qui tombent |
|---|---|
| le pipeline média reconstruit sa file | **3** (les deux cliquets + la purge) |
| le repli dégénéré de `jobs/index.ts` revient | 1 |
| l'inventaire gelé admet `MeeshySocketIOHandler.ts` | 1 |
| la résolution devient une capture EAGER au câblage | **1** |
| la projection perd `sealAtRest` | **0** — voir ci-dessous |

**La cinquième ne fait tomber personne, et ce n'est pas une garde décorative.**
Elle est INVISIBLE au compilateur par construction (bivariance des paramètres :
une fonction à deux paramètres satisfait un type à trois) et invisible au
runtime tant que l'objet enregistré est la vraie `RedisDeliveryQueue`, qui
accepte les options quoi qu'en dise sa projection. Ce que la déclaration large
garde est donc un DOUBLE futur, déclaré sous la projection et sourd au
scellement — un piège armé, pas une panne, et il se ferme par une déclaration
honnête plutôt que par un témoin qui ne peut pas exister.

## Ce que le cycle a CÉDÉ ou n'a pas pris

| # | ce que c'est | pourquoi pas ce lot |
|---|---|---|
| #18619 | la file enfile l'adresse NUE d'une pièce liée au lecteur | lot à soi : trois émetteurs, deux canaux, et un drapeau d'environnement à instruire |
| #18614 | le drain accuse la remise par FENÊTRE DE TEMPS | autre sous-système (accusés) |
| #18617 | `POST /links/:identifier/messages` rend 500 au renvoi | piège armé, hors du chemin de rejeu |
| #18618 | rien n'ordonne le direct contre le drain | demande une décision de contrat |
| #18680 | une perte de rejeu n'est récupérable que sur le WEB | lot client, trois plateformes |
| #18681 | le rejeu révèle l'EXISTENCE d'un message sous plancher | verdict de produit, pas un correctif |

## La leçon du cycle

`tasks/lessons/2026-11-15-une-porte-franchie-peut-mener-a-la-mauvaise-piece.md`.
