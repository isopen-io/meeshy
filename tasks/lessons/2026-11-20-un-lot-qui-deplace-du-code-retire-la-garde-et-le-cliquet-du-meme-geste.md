## Un lot qui DÉPLACE du code retire la garde ET le cliquet qui la tient, du même geste (#19977)

*2026-11-20, #19977.*

### Le motif

J'ai sorti un chemin d'émission de son fichier d'origine vers une unité à lui.
Le déplacement a emporté, sans que rien ne rougisse :

1. **la garde** — `safeBroadcast('message:edited (call summary)', …)`, présente
   au site d'origine avec sa raison écrite, absente de la réécriture ;
2. **la visibilité du site au cliquet qui garde cette classe** — l'enfilage
   passait désormais par un paramètre de RAPPEL nommé `enqueue`, absent de
   `ENQUEUE_CALLS`, donc la paire (émission, enfilage) n'était plus formée.

Mesuré par l'audit adversarial, sur une bulle dont l'émission lève :

| arbre | `queue.enqueue` | `conversation:updated` |
|---|---|---|
| parent du lot | 1 | true |
| lot | **0** | **false** |

Et la portée du cliquet, mesurée par le cliquet lui-même : **14 → 13** émissions
candidates, sous un témoin dont le plancher est `>= 10`. Il ne pouvait pas voir
la perte.

### La règle

> **Les deux mouvements ont la même cause — on a déplacé du code — et aucun des
> deux ne rougit, parce qu'un cliquet mesure ce qu'il ATTEINT.** Un lot qui
> déplace un chemin gardé doit donc répondre à DEUX questions, pas une : « la
> garde est-elle encore là ? » et « le cliquet voit-il encore le site ? ».

La seconde se répond par une MESURE, jamais par une lecture : faire tourner le
balayage sur l'arbre d'AVANT et sur l'arbre d'APRÈS, et comparer sa portée. Un
inventaire resté vide ne dit rien — c'est exactement ce qu'il rend quand il ne
regarde plus.

### Le corollaire : réparer la garde au bon étage

La réparation naïve est de remettre `safeBroadcast` au site. Elle est
insuffisante et elle était déjà trompeuse : la garde manquait **dans la porte
partagée** (`emitEditedToReaders` enrobait sa boucle par lecteur et laissait ses
branches de ROOM nues), donc elle manquait chez les TROIS transports, dont deux
la compensaient par un enrobage externe. Une garde qui doit être retapée à
chaque site est une garde qu'un site finira par ne pas avoir — ce que le
doc-comment de ce module dit déjà de la LOI qu'il porte.

Elle vit donc dans la porte. **Et le site la garde quand même**, pour une raison
qui n'est pas la sécurité : c'est ce que le cliquet LIT. Une garde qui ne vit
que chez le callee est juste et INVISIBLE, et un site invisible retombe au
prochain lot.

### Le corollaire d'enrobage : enrober sans relayer SUPPRIME un signal

Poser le `try/catch` dans la porte a fait tomber un témoin voisin :
`broadcastMessageMutation` passe un `onError` que son propre `try` alimentait, et
ce témoin exigeait de le voir appelé quand la room lève. La porte prend donc
l'`onError` de son appelant et le relaie à chaque sortie, avec un repli local.

> **Avaler une erreur n'est une garde que si quelqu'un l'apprend.** Le site qui
> a le CONTEXTE (conversation, message, destinataire) est l'appelant ; le site
> qui a la DISCIPLINE est la porte. Les deux moitiés doivent voyager ensemble.

### Le corollaire de double : isoler une lecture, c'est affirmer qu'on connaît ses sosies

Le témoin censé couvrir la garde durable rejetait `participant.findMany` EN
BLOC — ce qui tuait aussi la lecture interne à la file, si bien que l'enfilage
n'était jamais atteint, garde ou pas : la garde pouvait être SUPPRIMÉE sans
qu'un seul témoin tombe.

**Et j'ai reproduit la faute en la corrigeant** : ma première isolation
discriminait sur `select.shareLinkId`, que `HISTORY_FLOOR_PARTICIPANT_SELECT`
demande aussi — donc elle tuait la loi de lecture, et le témoin repassait au
vert par une SECONDE raison vacante. Quatre requêtes de participants traversent
ce chemin, et trois demandent `shareLinkId` ; le discriminant juste est
`shareLinkId` **sans** `historyVisibleFrom`.

> Avant d'écrire « cette lecture-là seulement », compter les lectures qui
> traversent le chemin et relire leur `select`. Une mutation qui ne fait tomber
> le témoin qu'on vient d'écrire pour elle est la seule preuve qu'il existe.
