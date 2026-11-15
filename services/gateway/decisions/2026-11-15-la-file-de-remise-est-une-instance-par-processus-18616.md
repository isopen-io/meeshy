## 2026-11-15 : la file de remise hors ligne est UNE instance par processus, et un cliquet le dit

*2026-11-15 — #18616, cycle 171.*

### Contexte

`server.ts` construit `RedisDeliveryQueue`, l'enregistre
(`setSharedDeliveryQueue`) et DÉCLARE sur place que c'est « la seule dont la
tranche MÉMOIRE porte des entrées de message ». `delivery-queue-registry.ts` le
redit.

L'affirmation était fausse : `MeeshySocketIOHandler.startMediaPipelines` en
construisait une seconde pour les quatre déclencheurs de
`message:attachment-updated`, vivante en production dès que le client ZMQ du
translator l'est ; `jobs/index.ts` en construisait une troisième, dégénérée, en
repli d'un paramètre optionnel.

### Décision

1. **Un seul site de production construit la file : `server.ts`**, et c'est le
   couple *construire + enregistrer* qui fait d'une instance « la file du
   processus ». Toute autre unité la RÉSOUT par le registre.
2. **Le registre expose l'ENFILAGE sous deux accesseurs nommés par AUDIENCE**,
   le discriminant que le dépôt emploie déjà pour ses deux portes partagées :
   `getSharedPersonalMarkEnqueuer()` (les autres APPAREILS d'un compte) et
   `getSharedOfflineEnqueuer()` (les MEMBRES absents d'une conversation). Un
   appelant nomme l'audience dont il remplit la dépendance ; il ne choisit pas
   un comportement.
3. **La résolution est un ACCESSEUR, par usage** — jamais une capture au
   câblage. C'est une garantie de CONCEPTION, pas un correctif de panne, et il
   faut le dire ainsi : l'ordre d'initialisation de production (enregistrement
   dans le constructeur, câblage dans `start()`) est correct, donc une capture
   figerait aujourd'hui la BONNE valeur. C'est exactement ce qui la rend
   indétectable à tout témoin écrit depuis l'état nominal — et ce qui oblige à
   mettre en scène l'ordre que la production ne produit pas.
   **L'invariant vaut jusqu'au CONSOMMATEUR, pas seulement au littéral** :
   déstructurer `deps` en tête du vrai `mediaReadyPorts` laissait `tsc` à
   `EXIT=0` et 197 suites socket au vert (mesuré à l'audit adversarial).
   `socketio/__tests__/media-ports-resolve-queue-per-use.test.ts` fait tourner
   le VRAI `mediaReadyPorts` et tombe sous cette capture.
4. **La projection de capacité déclare la signature réelle**, `{ sealAtRest }`
   compris. Une projection plus étroite reste **assignable** (bivariance des
   paramètres) — mesuré, `tsc --noEmit` rend `EXIT=0` sous la forme à deux
   paramètres.
   **Ce que la déclaration large coûte vraiment, sans l'exagérer** : le
   scellement ne se perdrait PAS en production. Le type qui gouverne l'appel
   scellant est celui du site d'appel (`OfflineParticipantQueueDeps`, trois
   paramètres), et l'objet résolu est la vraie `RedisDeliveryQueue`, qui honore
   l'option quoi qu'en dise sa projection. Ce qui est gardé ici est un DOUBLE
   futur, déclaré sous la projection et sourd à l'option — un piège désamorcé,
   pas une garde porteuse. Il est tenu par l'ARITÉ et non par l'assignabilité
   (`delivery-queue-registry-capabilities.test.ts`), et c'est le **gate A**
   (`tsc -p tsconfig.test.json`) qui le tient rouge : `ts-jest` ne typecheque
   plus depuis #10203.
5. **Un objet nul se dit en ne faisant rien.** `DeliveryQueueCleanupJob` accepte
   `undefined` et n'agit pas, plutôt que de recevoir une file dégénérée.

### Ce qui tient la décision

`socketio/__tests__/delivery-queue-door-sweep.ts` →
`sweepDeliveryQueueConstructions`, inventaire de sites **figé à `server.ts`**,
balayant `src/` entier hors témoins. Il complète sans le doubler le cliquet
d'ENFILAGE du même module : celui-là garde « qui écrit dans la file », celui-ci
garde « combien de files il y a ». Aucun cliquet d'appels ne peut voir une
unicité d'instance.

Et trois suites de comportement : `media-pipeline-delivery-queue-instance.test.ts`,
qui part du déclencheur MÉDIA — le chemin dont la tranche n'était pas purgée —
et prouve que la transcription qu'il enfile est purgeable par le site de
destruction ; `media-ports-resolve-queue-per-use.test.ts`, qui fait tourner le
VRAI consommateur ; et `delivery-queue-registry-capabilities.test.ts`, que le
registre CITAIT depuis sa création sans qu'il existe — l'audit adversarial du
lot l'a mesuré, et la réponse à une affirmation fausse posée à l'endroit où l'on
irait vérifier n'est pas de retirer la phrase, c'est de la rendre vraie.

### Ce qui a été écarté

**Faire descendre la file en PARAMÈTRE jusqu'au pipeline média.** C'est
l'arbitrage que le préambule du registre a déjà instruit, et il ne change pas :
un paramètre dont l'absence désactive une garantie est un demi-correctif, et le
site de destruction n'a aucun chemin vers une instance passée de main en main.

**Geler `MeeshySocketIOHandler.ts` dans l'inventaire.** Il n'y a pas de seconde
file légitime dans un processus : l'inventaire de sites est une liste de ceux
qui ENREGISTRENT, pas une liste d'exemptions.
