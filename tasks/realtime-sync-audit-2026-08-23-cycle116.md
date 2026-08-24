# Cycle 116 — la seule garantie DURABLE de `message:new` était placée en AVAL de ce qui ne l'est pas

Point de départ : un balayage des trois portes de sortie de `message:new`, et
non un suivi hérité. Le dépôt gouverne désormais très finement ce que la file
hors ligne CONTIENT (nom rejoué, forme de charge, adressabilité de la
conversation — cycles 106, 109 bis, 111, 112, 114). Personne n'avait regardé si
elle est ATTEINTE.

---

## 1. Les trois portes, et la seule qui ne se rattrape pas

| porte | audience | ce qu'on perd si elle tombe |
|---|---|---|
| `io.to(conversation:<id>)` | sockets ayant le fil OUVERT | rien : le client recharge |
| rooms personnelles (`conversation:updated`, badges) | sockets connectés | un re-tri de liste, un compteur |
| **`RedisDeliveryQueue`** | **destinataires DÉCONNECTÉS** | **le message, définitivement** |

Aucun client ne redemande spontanément un message qu'il n'a jamais vu passer :
le rejeu de `_drainPendingMessages` est la seule voie. C'est la porte
DESTRUCTIVE, et le dépôt le sait — il applique déjà la règle correspondante à
l'instantané de reconnexion, où le drain est placé **hors** du `try` « pour
qu'un accroc Mongo sur l'instantané (cosmétique) n'échoue jamais le rejeu
(destructif) ». Une copie de test qui avait inversé cet ordre a été supprimée au
cycle 62 pour cette seule raison.

**Les deux producteurs d'envoi l'avaient inversée en production**, chacun à sa
façon — et les deux façons se lisent comme du code correct.

---

## 2. Moitié REST/ZMQ : la garantie durable, dernière instruction d'un `try` « non-bloquant »

`MeeshySocketIOManager._broadcastNewMessage`, avant ce lot :

```ts
try {                                   // « [CONV_SYNC] … (non-bloquant) »
  const allParticipants = await prisma.participant.findMany(…);
  for (…) io.to(room).emit(CONVERSATION_UPDATED, …);   // ← cosmétique
  await emitUnreadCountsToRecipients(…);               // ← cosmétique
  for (…) deliveryQueue.enqueue(…);                    // ← DURABLE, en dernier
} catch (syncError) {
  logger.warn('⚠️ [CONV_SYNC] Erreur sync liste conversations (non-bloquant):', syncError);
}
```

`io.to(room).emit(...)` **lève** quand l'adaptateur ou l'encodeur est en défaut —
ce n'est pas une hypothèse, c'est ce que le dépôt écrit lui-même à l'endroit où
il s'en garde (`emitWithSeq`, § « la cause est réelle et pas hypothétique »).
Une seule levée dans la boucle par destinataire, et le rejeu n'a jamais lieu :
pour TOUS les absents de la conversation, sous un journal qui annonce la perte
d'un re-tri de liste.

> **Un `catch` qui qualifie son incident (« non-bloquant ») ne qualifie que ce
> que l'auteur avait en tête, pas ce que le `try` contient.** L'étiquette était
> juste pour les deux premières instructions et fausse pour la troisième — et
> c'est l'étiquette, pas le code, qui se relit.

---

## 3. Moitié WS : `[]` dit « personne », quand il fallait dire « je ne sais pas »

`MessageHandler.broadcastNewMessage` avait, lui, un `try` dédié autour de sa
requête participants — la bonne forme. Ce qu'il en faisait ne l'était pas :

```ts
let sharedParticipants: Array<…> = [];        // ← défaut VIDE
try { sharedParticipants = await findMany({ select: SUPERSET }); }
catch { warn('participant fetch failed — skipping CONVERSATION_UPDATED + unread'); }
…
await enqueueForOfflineParticipants(…, { participants: sharedParticipants });
```

et, dans l'unité partagée :

```ts
const participants = params.participants ?? (await prisma.participant.findMany(…));
```

`[]` n'est pas nullish. L'unité partagée recevait donc une liste VIDE — c'est-à-dire
l'AFFIRMATION « cette conversation n'a aucun participant » — et n'enfilait pour
personne. Le journal, lui, annonçait deux pertes ; il y en avait trois, et la
troisième était la seule irrécupérable.

**La requête qui tombe n'est même pas celle dont la file a besoin.** Le SUPERSET
(`PREVIEW_PRISM_PARTICIPANT_SELECT` + `joinedAt`) porte les préférences de
langue de la ligne de liste ; la file ne demande que `{id, userId}` et sait
faire sa propre requête. On perdait le message pour un Prisme illisible.

> C'est exactement l'ambiguïté que le dépôt a déjà tranchée à un étage voisin :
> `bridgeComputed(undefined)` (« j'ai calculé, il n'y en a pas ») contre
> `bridgeNotComputed()` (« je n'ai pas calculé »). Ici les deux états
> partageaient une valeur — `[]` — et le consommateur ne pouvait pas les
> distinguer.

---

## 4. Ce que le lot fait

1. **REST/ZMQ** — la requête participants passe dans son PROPRE `try` et rend
   `undefined` quand elle tombe ; l'enfilage remonte AVANT les deux synchros
   cosmétiques ; les deux synchros passent sous `if (allParticipants)`.
2. **WS** — `sharedParticipants` devient `| undefined` ; l'enfilage remonte
   juste après l'émission live, avant `conversation:updated` ; le journal de
   panne dit ce qu'il fait vraiment.
3. **La copie inline disparaît.** Le REST/ZMQ délègue à
   `_enqueueForOfflineParticipants` — l'unité partagée que la classe portait
   déjà. C'était **le dernier appelant direct de `deliveryQueue.enqueue` du
   dépôt** (`grep` : deux sites, l'unité partagée et celui-ci), et le dernier
   endroit où une charge pouvait être enfilée sous une forme que le fil ne
   diffuse pas : son `payload: broadcastPayload as Record<string, unknown>`
   effaçait la corrélation `(eventType, payload)` posée au cycle 106.
   **Le cast n'était pas nécessaire** — mesuré : `tsc --noEmit` rend 0 erreur
   avec `payload: broadcastPayload` nu. Il ne masquait aucune divergence ; il
   masquait la GOUVERNANCE.
4. **Un cliquet ferme la porte** — `socketio/__tests__/delivery-queue-door-sweep.ts`,
   inventaire VIDE. Le contrat de la file est tenu au TYPE
   (`QueuedEventVariant`), mais **un type ne garde que ceux qui l'IMPORTENT** :
   la sixième copie n'importait rien. Une porte se relâche, une porte se
   CONTOURNE — deux régressions distinctes, et la seconde est la plus probable
   (les cinq copies précédentes prouvent qu'on la réécrit spontanément). Le
   discriminant est l'APPEL (`.enqueue(`), jamais le nom du receveur : chercher
   `deliveryQueue.enqueue` mesurerait la popularité d'un nom de variable
   (leçon du cycle 107, dont le balayage a été jeté pour cette faute).

---

## 5. Les témoins, et pourquoi ils vivent dans ce fichier-là

Ils rejoignent `message-new-producer-parity.test.ts`, le seul harnais qui
construit UN manager portant le VRAI `MessageHandler` : les deux productions
confrontées sont celles que la passerelle exécute. Écrire un second fichier
aurait exigé de recopier un mur de doubles — c'est-à-dire de fabriquer un
**double PARTIEL**, la famille de défauts que le dépôt a payée trois fois
(cycles 86, 91, 93, 104).

Cinq témoins ROUGES contre le code livré, deux par producteur plus un cliquet :

| témoin | rouge avant |
|---|---|
| REST/ZMQ enfile même quand `conversation:updated` LÈVE | `undefined` — rien d'enfilé |
| WS enfile même quand `conversation:updated` LÈVE | `undefined` |
| REST/ZMQ enfile même quand la requête SUPERSET tombe | `undefined` |
| WS enfile même quand la requête SUPERSET tombe | `undefined` |
| les DEUX producteurs enfilent la MÊME entrée | `eventType: undefined` ≠ `'new'` |

Le sixième — « aucun producteur n'enfile pour l'EXPÉDITEUR » — était VERT avant
et le reste : il garde une propriété que ce lot ne devait pas casser en
changeant l'identité d'exclusion (le REST n'excluait que par `Participant.id`,
il exclut désormais par les deux comme son jumeau).

Le témoin de panne fait lever `emit` **par le nom d'événement**, jamais en
bloc : un double qui lève sur tout ne prouverait pas que la file survit à la
panne de la cosmétique, seulement qu'elle survit à un harnais mort.

Note de harnais : `jest.clearAllMocks()` efface les APPELS, pas les
IMPLÉMENTATIONS. Un témoin qui fait lever `emit` sans le rendre le ferait lever
pour tous les suivants — d'où le `mockImplementation` neutre au `beforeEach` ET
à l'`afterEach`.

---

## 6. Gates

| gate | résultat |
|---|---|
| `tsc --noEmit` passerelle | **0 erreur** |
| suites `src/socketio` | **52 suites, 1643 témoins** (avant le cliquet neuf) |
| cliquet d'enfilage | inventaire **VIDE**, et le balayage VOIT sa fixture |
| `check-law-literals.sh` | vert |
| `test:coverage` passerelle | voir le message de commit |
| RED prouvé | 5 témoins, contre le code livré |

---

## 7. Suivis

- [ ] **Neuf** — REST/ZMQ : l'enfilage reste sous `if (senderId)`. Un message
      sans expéditeur (agent, système) n'est jamais rejoué aux absents. La file
      n'a pourtant pas besoin d'un acteur (`actorParticipantId` est nullable) ;
      élargir demande d'abord de relever les producteurs de messages sans
      `senderId`, et ce qu'un client fait d'un `message:new` rejoué sans auteur.
- [ ] **Neuf** — WS : sous échec de la requête participants,
      `resolveForwardSourceForBroadcast` reçoit une liste de lecteurs VIDE, donc
      `refusingReaderIds` vide, donc la provenance de transfert part à des
      lecteurs qui l'ont REFUSÉE. Fail-open d'une règle de confidentialité sur
      panne de base — antérieur à ce lot, pas touché par lui, et de la famille
      « un `catch` fail-open couvre aussi la question qu'on a mal posée »
      (cycle 113).
- [ ] **Neuf** — REST/ZMQ n'a aucun équivalent de `resolvePayloadForReader` :
      le retrait par LECTEUR de la source de transfert n'existe que sur le
      chemin WS. Sur le chemin REST, un absent qui a refusé les sources se les
      verra rejouer.
- [ ] `messageId` / `dedupKey` (hérité 113 §5).
- [ ] Hérité (107 bis) — la bivariance `strictFunctionTypes: false`.
- [ ] Hérité — `LinkMessagePayload` porte encore `readonly [key: string]: unknown`.
- [ ] Hérité (108 ter) — l'en-tête du cliquet de dette, fausse de trois points.

---

## 8. Leçon de méthode

**Un lot qui GOUVERNE une frontière ne dit rien de la façon dont on l'ATTEINT.**

Six cycles ont durci ce que la file hors ligne contient : le nom qu'elle rejoue,
la forme de sa charge, l'adressabilité de sa conversation, la corrélation du
couple. Tous portaient sur des entrées DÉJÀ ÉCRITES. Aucun n'a demandé si
l'écriture a lieu — et le chemin d'écriture, lui, était suspendu au succès de
deux synchronisations que le code lui-même qualifie de non-bloquantes.

> La question à poser à toute garantie durable n'est pas seulement « ce qu'elle
> stocke est-il correct ? » mais **« de quoi son EXÉCUTION dépend-elle, et ces
> dépendances ont-elles le droit d'échouer ? »**. Ici les deux dépendances
> avaient ce droit — écrit, assumé, et journalisé comme tel.

Corollaire, qui est la forme locale de la même chose :

> **Une valeur par défaut choisie pour la commodité du site d'appel décide à la
> place du consommateur.** `= []` rendait le code d'après plus court (`.map`,
> `.length` sans garde) et transformait une IGNORANCE en AFFIRMATION. Le
> consommateur qui savait quoi faire des deux — `participants ?? ma propre
> requête` — n'a jamais eu l'occasion de le faire.
