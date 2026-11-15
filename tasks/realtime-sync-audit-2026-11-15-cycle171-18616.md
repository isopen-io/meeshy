# Cycle 171 — deux doc-comments affirmaient l'unicité, et il y avait trois files

*2026-11-15. Branche `claude/exciting-planck-jgv7lx`, repartie de la tête de
`dev` (`f02e978b4`).*

**Livré** : #18616 — la file de remise hors ligne est UNE instance par
processus, et c'est désormais un cliquet qui le dit.

> *Le nom de ce fichier porte le NUMÉRO **et** l'ISSUE, et c'est délibéré.
> 170 était libre à l'ouverture du cycle et occupé à la fusion — un relevé
> d'identifiant libre a la durée de vie d'un `fetch`. Le dépôt a déjà payé la
> suite : deux sessions ont écrit `…-cycle163.md` le même jour et git a FUSIONNÉ
> ligne à ligne deux journaux sans rapport, sans un conflit à voir
> (`tasks/lessons/2026-11-15-un-identifiant-partage-utilise-comme-nom-de-fichier-fusionne-en-silence.md`).
> Suffixer l'issue rend la collision impossible au lieu de la rendre
> détectable.*

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

## L'audit adversarial, et ce qu'il a changé

Le lot touche la purge d'un contenu détruit : il passe par `auditeur-adversarial`
avant fusion. Verdict : **ACCEPTABLE AVEC RÉSERVES**, aucun blocage de
confidentialité ni de disponibilité.

**Il a d'abord DISCULPÉ le risque que je lui avais désigné comme le plus
probable.** Je craignais qu'un des quatre consommateurs déstructure `mediaDeps`
et fige le getter ; mesuré, aucun ne le fait — `ready-listener.ts:66` lit
`deps.deliveryQueue` À L'INTÉRIEUR de la flèche, donc par événement. Aucun
chemin de production ne fait tourner le pipeline avant l'enregistrement (le
collecteur de manifeste n'appelle pas `setupSocketIO`), aucun sceau n'est perdu,
rien n'a été retiré en silence.

Trois constats ont été SOLDÉS dans le même lot, et les trois portent sur ce que
le lot lui-même affirmait :

| # | constat | ce qui a changé |
|---|---|---|
| F1 | le cliquet ne voyait **aucune** des SIX façons de construire une seconde file autrement que par `new RedisDeliveryQueue(` — alias d'import, liaison locale, parenthèses, `Reflect.construct`, **sous-classe**, fichier `.mts` ; la vraie fonction a rendu `[]` sur les six | quatre formes refusées, `.mts`/`.cts` lus, les scripts de la passerelle balayés, et une fixture par forme |
| F2 | l'invariant « résolu PAR USAGE » n'était tenu qu'au LITTÉRAL : déstructurer `deps` dans le VRAI `mediaReadyPorts` laissait `tsc` à `EXIT=0` et 197 suites socket au vert | un témoin fait tourner le vrai consommateur et tombe sous cette capture |
| F3 | la branche `undefined` que le lot AJOUTE au job de nettoyage n'avait aucun témoin | témoin posé — et **la première rédaction ne pouvait pas tomber**, le `try/catch` avalant le `TypeError` : il assert sur le JOURNAL, seul effet observable |

### F5 — et le fichier que je réécrivais citait un témoin qui n'existe pas

`delivery-queue-registry.ts` affirme depuis sa création que l'instance de
production porte `enqueue` « par PREUVE DU COMPILATEUR, non par confiance :
`delivery-queue-registry-capabilities.test.ts` affirme … ». **Ce fichier
n'existait pas** — sa seule occurrence dans le dépôt était le doc-comment qui le
citait, et `SharedDeliveryQueue` déclare `enqueue` sous un `Partial`, donc
l'enregistrement n'en était pas la preuve non plus.

> C'est la classe de défaut que ce lot existe pour fermer, dans le fichier que
> ce lot réécrit — et le lot y avait ajouté DEUX doc-comments sans la voir. La
> réponse n'est pas de retirer la phrase : c'est de la rendre vraie.

Il existe désormais, et c'est lui qui tient le troisième paramètre
(`{ sealAtRest }`) **par son ARITÉ**, l'assignabilité étant bivariante. Écrire
ce témoin a produit la leçon la plus nette du cycle : **sa première rédaction a
créé une affirmation fausse de plus, deux paragraphes sous le récit de la
précédente.** Elle créditait `ts-jest` de tenir `TS2344` — vrai de sa liste
d'amnistie, et sans objet depuis #10203, qui lui a retiré le typecheck. Mesuré :
sous la mutation, `npx jest` est VERT et c'est le **gate A**
(`tsc -p tsconfig.test.json`) qui rougit, portant son compte de 76 à 77.

### Les deux affirmations du lot corrigées À LA BAISSE

| affirmation | ce qui est vrai |
|---|---|
| « le scellement au repos se perdrait sans qu'une ligne ne rougisse » | **non** : le type qui gouverne l'appel scellant est celui du SITE D'APPEL (`OfflineParticipantQueueDeps`, trois paramètres), et l'objet résolu est la vraie file, qui honore l'option quoi qu'en dise sa projection. C'est un piège DÉSAMORCÉ pour un double futur, pas une garde porteuse |
| « la résolution par accesseur » présentée comme un correctif | c'est une garantie de CONCEPTION : l'ordre de démarrage réel figerait de toute façon la bonne valeur |

### Le seul constat que ce lot ne solde pas, et il est devenu une issue

**#18707** — la tranche MÉMOIRE est désormais PARTAGÉE entre la famille média et
la famille message, et ses deux bornes sont par instance (50 entrées par
lecteur, éviction des plus anciennes). Sous un hoquet Redis, les enrichissements
de messages anciens — le balayage des pièces `pending` n'a aucune borne
temporelle basse — peuvent évincer un `message:new` du début de la panne, jamais
rejoué. C'est la **seule régression de disponibilité introduite par le lot**, et
elle est assumée : avant lui, 100 % des entrées média de cette tranche étaient
perdues. La refermer demande un sous-budget par famille ou une priorité
d'éviction — une décision, pas un correctif.

### Une note de PROCESS, parce qu'elle se reproduira

Le lot tel que commité à `37cab576f` **ne typecheckait pas** : les deux fixtures
importaient à la mauvaise profondeur. La réparation a voyagé dans un commit
étiqueté `docs(…)`. Une correction de compilation sous une étiquette `docs` est
invisible à quiconque relit l'historique par ses étiquettes.

## Ce que le cycle a CÉDÉ ou n'a pas pris

| # | ce que c'est | pourquoi pas ce lot |
|---|---|---|
| #18619 | la file enfile l'adresse NUE d'une pièce liée au lecteur | lot à soi : trois émetteurs, deux canaux, et un drapeau d'environnement à instruire |
| #18614 | le drain accuse la remise par FENÊTRE DE TEMPS | autre sous-système (accusés) |
| #18617 | `POST /links/:identifier/messages` rend 500 au renvoi | piège armé, hors du chemin de rejeu |
| #18618 | rien n'ordonne le direct contre le drain | demande une décision de contrat |
| #18680 | une perte de rejeu n'est récupérable que sur le WEB | lot client, trois plateformes |
| #18681 | le rejeu révèle l'EXISTENCE d'un message sous plancher | verdict de produit, pas un correctif |
| **#18707** | la tranche mémoire partagée entre familles | **ouverte par ce cycle**, depuis son propre audit |

## La leçon du cycle

`tasks/lessons/2026-11-15-une-porte-franchie-peut-mener-a-la-mauvaise-piece.md`.
