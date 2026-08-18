# Cycle 72 — « no one can write » ignorait le canal qui écrit ET qui réveille : l'APPEL

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-eke0u6`
**Périmètre** : gateway (`services/CallService.ts`, `routes/links/creation.ts`),
`packages/shared` (un code d'erreur d'appel, additif)
**Clients touchés** : aucun — aucun nom d'événement, aucune charge utile
modifiés ; un code de refus s'ajoute (`CONVERSATION_CLOSED`), et le parseur des
deux transports le laisse passer tel quel (§ 5.3)

---

## 1. D'où vient ce cycle

Le cycle 70-bis a laissé deux pistes. La première nommait **trois** sites d'une
même famille — « garde d'ÉCRITURE sans jumelle sur l'état du FIL » :

> Vérifié par balayage sur `main` : `ReactionHandler`, l'édition de message
> (`routes/messages.ts`) et la création de lien de partage
> (`routes/links/creation.ts`) contrôlent tous `Participant.isActive` et
> **jamais** `Conversation.isActive`/`closedAt`.

Le cycle 71 (PR #3211, en vol) en a couvert **deux** : réagir, éditer. Le
troisième — la création de lien — reste ouvert sur `main`, et ce cycle le prend.

Mais le balayage du 70-bis s'était borné aux verbes qui écrivent du TEXTE. En
posant la question sur le modèle plutôt que sur le vocabulaire — *qui pose une
ligne `Message` dans une conversation ?* — il en sort un quatrième site, et c'est
de loin le plus cher : **l'appel**.

---

## 2. Le défaut

### 2.1 Un appel écrit dans le fil, et réveille tout le monde

`packages/shared/prisma/schema.prisma` documente `Conversation.closedAt` par
« Conversation closed for all — **no one can write**, messages stay readable ».
La phrase a toujours été lue comme une règle sur le *chat*. Elle est en fait une
règle sur la table `Message`, et l'appel y écrit deux fois :

| moment | écriture | où |
|---|---|---|
| sonnerie | `postLiveCallMessage` → `prisma.message.create` (bulle « appel en cours ») | `CallService.ts:2915` |
| raccroché | résumé terminal → `prisma.message.create` | `CallService.ts:2824` |

Et entre les deux, l'éventail de sonnerie : `call:initiated` sur toutes les
sockets de chaque membre, **plus un push VoIP/APNs `bypassDnd: true`** pour les
absents (`CallEventsHandler`). C'est le seul canal du produit qui perce le mode
« Ne pas déranger ». Le faire partir d'un fil que le serveur tient pour mort
n'est pas une nuance d'affichage.

### 2.2 Ce que la porte vérifiait, et ce qu'elle ne pouvait pas voir

`CallService.initiateCall` est le point de passage **unique** des deux transports
d'ouverture (`call:initiate` socket, `POST /calls` REST — vérifié : deux
appelants, aucun autre). Il chargeait déjà la conversation :

```ts
select: { id: true, type: true, identifier: true }
```

… et posait deux questions : *existe-t-elle ?* et *son TYPE supporte-t-il les
appels ?* (direct/group oui, public/global non). Puis une troisième sur la
personne : *l'appelant est-il un `Participant` actif ?*

Aucune sur l'ÉTAT du fil. Et c'est structurel, exactement comme au cycle 70 :
**fermer n'écrit sur aucune ligne `Participant`**, donc l'appartenance de
l'initiateur survit intacte à la clôture. Relire la logique d'autorisation ne
pouvait pas montrer le trou — elle est correcte, elle regarde simplement un autre
modèle.

### 2.3 La création de lien, troisième site du 70-bis

Même forme, même angle mort :

```ts
select: { id: true, type: true, title: true }
```

appartenance + type, jamais la clôture. On pouvait donc fabriquer un lien de
partage **neuf** sur un fil terminé. Le cycle 70 rend la chose inoffensive à
l'ARRIVÉE (les quatre portes d'entrée répondent 410) — mais pas à la source :
le lien est créé `isActive: true`, les écrans de gestion le présentent comme
vivant (piste 3 du cycle 70), il circule, et sa seule issue possible est le 410
pour chacun de ceux qui le suivent. Un 201 qui promet ce que le serveur a déjà
décidé de refuser.

---

## 3. Ce qui a été livré

### 3.1 `CallService.initiateCall` — la garde, au point de passage unique

```ts
select: { id: true, type: true, identifier: true, isActive: true, closedAt: true }
...
if (isConversationClosed(conversation)) {
  throw new Error(`${CALL_ERROR_CODES.CONVERSATION_CLOSED}: Conversation is closed`);
}
```

Posée **avant** la garde de type : un fil terminé l'est quel que soit son type, et
répondre « les appels ne sont pas supportés ici » à une conversation `direct`
close décrirait la mauvaise cause.

`isConversationClosed` vient de `services/messaging/conversationWriteAdmission` —
la source de vérité déjà utilisée par les quatre portes d'entrée et par la porte
anonyme. Aucune règle n'est réécrite ici.

### 3.2 `POST /links` — la garde, avec le 410 de la famille

```ts
select: { id: true, type: true, title: true, isActive: true, closedAt: true }
...
if (isConversationClosed(conversation)) {
  return sendError(reply, 410, 'CONVERSATION_CLOSED', { message: 'Cette conversation est terminée' });
}
```

Même code, même statut et même formulation que les refus d'entrée posés au
cycle 70 (`sharing.ts`, `anonymous.ts`) — un lecteur qui suit un lien et un
créateur qui en fabrique un reçoivent désormais le même énoncé. Le 410 est
déclaré au schéma de réponse de la route.

### 3.3 `CALL_ERROR_CODES.CONVERSATION_CLOSED` — additif, et c'est vérifié

Ajouté à `packages/shared/types/video-call.ts`. Le code voyage jusqu'aux deux
transports SANS aucune modification d'appelant, parce que les deux dérivent le
code du préfixe `CODE: message` de l'erreur jetée :

- socket → `parseCallHandlerError` (`socketio/utils/call-error-parsing.ts`), qui
  documente explicitement « AUCUNE validation de code » ;
- REST → le `catch` de `routes/calls.ts`, qui fait le même découpage.

Aucun client n'énumère ces codes de façon exhaustive : `apps/web` importe
`CALL_ERROR_CODES` sans en lire un seul membre, et ni iOS ni Android n'en
possèdent de miroir (vérifié par balayage, pas supposé). Un code inconnu retombe
donc sur le message générique — dégradation, jamais rupture.

### 3.4 Périmètre ASSUMÉ : l'OUVERTURE, pas la fin

Un appel **déjà en cours** quand la clôture tombe va à son terme. Deux raisons,
et elles sont produit autant que technique : ses messages sont déjà écrits (la
bulle « en cours » existe, le résumé la remplacera), et raccrocher au nez de gens
qui se parlent serait une régression, pas une garde. `joinCall` n'est donc pas
touché.

Corollaire, porté au § 6 : **aucun chemin de clôture ne termine les appels en
cours** de la conversation qu'il ferme.

---

## 4. Les gardes, et laquelle compte

Huit témoins, deux fichiers.

`__tests__/unit/services/CallService.closedConversation.test.ts` (5) :

| témoin | ce qu'il tient |
|---|---|
| fermée par `closedAt` | le refus, sur la population moderne |
| fermée par `isActive: false` **seul** | la population héritée (fils fermés par l'ancien `leave.ts`, avant le cycle 67 : `isActive: false` et AUCUN `closedAt`, que rien ne rétro-remplit) |
| n'écrit rien | ni revendication d'appel actif (`conversation.updateMany`), ni `$transaction`, ni `callSession.create`, ni `message.create` |
| **le `select` demande les deux colonnes** | la garde de REQUÊTE — § 4.1 |
| conversation ouverte | le contrôle : la porte n'est pas simplement murée |

`__tests__/unit/routes/links/creation.test.ts` (3) : les deux formes de clôture →
410 sans `conversationShareLink.create`, plus la même garde de `select`.

### 4.1 Pourquoi la garde de `select` est la seule qui compte

C'est la leçon du cycle 70-bis, appliquée avant qu'elle ne coûte quelque chose.
`isConversationClosed` accepte une ligne n'ayant qu'**une** des deux propriétés :
retirer `isActive` du `select` **compile**, et le double mocké rend de toute
façon l'objet qu'on lui dicte — donc tous les témoins de comportement restent
VERTS pendant que la production rouvre la porte à toute la population héritée.

**Mesuré par mutation, pas supposé**, sur les deux sites :

| mutation | témoins de comportement | témoin de requête |
|---|---|---|
| `isActive` retiré du `select` de `CallService` | **4 verts** | **1 ROUGE** |
| `isActive` retiré du `select` de `POST /links` | **13 verts** | **1 ROUGE** |

Un seul témoin tombe, et c'est celui qui existe pour ça.

Le RED initial est prouvé de même : avant la garde, 4 des 5 témoins d'appel
tombaient (seul le contrôle « conversation ouverte » passait) et 3 des 3 témoins
de lien.

---

## 5. Vérification

- `services/gateway` : **748/748 suites, 18 115/18 115 témoins VERTS** (`bun run test`).
- `tsc --noEmit` gateway : propre.
- `packages/shared` : `bun run build` propre.
- L'assertion de `select` préexistante de `CallService.test.ts` a été mise à jour
  — elle est tombée toute seule sur le nouveau `select`, ce qui est exactement le
  service qu'on lui demande.

---

## 6. Pistes pour le cycle 73

1. **Aucun chemin de clôture ne termine les appels EN COURS du fil qu'il ferme.**
   Ce cycle refuse d'en ouvrir un ; il ne dit rien de celui qui sonne déjà quand
   `leave.ts` / `core.ts` / `delete-for-me.ts` commit la clôture. La sonnerie
   continue, les deux messages d'appel se posent dans un fil mort, et le résumé
   terminal arrive après. À instruire — et la décision « couper ou laisser
   finir » est PRODUIT.
2. **Le partage de position vive (`LocationHandler`) est le prochain site de la
   même famille**, et le plus proche de l'appel : il diffuse dans la room de
   conversation et arme une minuterie jusqu'à 8 heures, sans jamais interroger
   l'état du fil.
3. **`POST /links` avec `conversationId === "meeshy"`** résout l'appartenance via
   `conversation.findFirst({ identifier: "meeshy" })` puis relit la conversation
   par `findUnique({ where: { id: "meeshy" } })` — l'identifiant littéral, pas
   l'`ObjectId` résolu juste au-dessus. Constat de lecture, hors périmètre de ce
   cycle : à instruire pour savoir si cette branche a jamais rendu autre chose
   qu'un 404 ou une erreur Prisma.
4. **La moitié COMMUNAUTÉ des préférences n'a pas reçu ce que la moitié
   CONVERSATION a reçu.** `reorderConversationPreferences` diffuse
   `USER_PREFERENCES_REORDERED` — son commentaire dit que le défaut « ne devait
   ni (2) ni (3) » et a été corrigé ; `POST /user-preferences/communities/reorder`
   écrit et se TAIT, donc les autres appareils ne convergent jamais sur l'ordre.
   Et `PUT /user-preferences/communities/:id` est un upsert **sans garde
   d'appartenance**, là où son jumeau la pose (« un appel non porté laisse
   n'importe quel authentifié frapper des lignes contre des ids arbitraires »).
   Demande un événement de réordonnancement à portée communauté — donc du travail
   client, à peser.
