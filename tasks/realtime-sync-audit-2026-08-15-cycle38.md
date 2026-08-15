# Audit synchro temps réel — cycle 38 (2026-08-15)

## Point de départ : la piste laissée par le cycle 37

Le cycle 37 a fait accuser réception au drain pour un lecteur sans compte, et a
relevé — sans le livrer — que le chemin symétrique `type: 'read'` portait « le
défaut JUMEAU sur la forme du payload » :

> `broadcastReadStatusUpdate` déclare `args.userId: string` (non-nullable) et le
> recopie tel quel dans `payload.userId`. Pour un acteur anonyme, ce champ part
> donc en portant un `Participant.id` — exactement la forme que ce cycle vient
> d'interdire sur le chemin du drain.

Et il a posé la bonne question, celle qui rendait le correctif non mécanique :

> les deux usages de `args.userId` dans cette fonction veulent des choses
> OPPOSÉES, et c'est ce conflit — pas le renommage d'un paramètre — qui est le
> vrai sujet du cycle suivant.

## Le conflit, nommé

Une seule variable, deux rôles qui divergent exactement sur la population qui
nous intéresse :

| Rôle | Ce qu'il veut | Valeur pour un acteur AVEC compte | Valeur pour un invité de lien |
|---|---|---|---|
| **Champ du contrat** (`payload.userId`) | `User.id` de l'acteur | `User.id` | **`null`** |
| **Clé de room personnelle** (`ROOMS.user(...)`) | l'id dont la room porte le nom | `User.id` | **`Participant.id`** |

`authContext.userId` sert **la seconde** colonne : pour un anonyme il vaut
`participant.id` (`middleware/auth.ts`), jamais le jeton de session. C'est
délibéré et c'est juste — `AuthHandler` fait rejoindre `ROOMS.user(participant.id)`
aux sockets anonymes précisément pour que leur badge leur parvienne. Le défaut
n'était donc PAS que `authContext.userId` soit mal calculé : c'est que sa valeur,
correcte pour le rôle « room », était aussi servie au rôle « contrat ».

## Le contrat était déjà tranché, aux trois bouts

Aucune incertitude à lever, aucun pari à prendre — la même phrase, écrite trois
fois, avant ce cycle :

| Site | Ce qu'il dit |
|---|---|
| `ReadStatusUpdatedEventData.userId` (`packages/shared/types/socketio-events.ts`) | `string \| null` — « `User.id` de l'acteur, ou `null` quand c'est un participant ANONYME » |
| `ReadStatusUpdateEvent.userId` (iOS, `MessageSocketManager.swift`) | `String?`, doc-comment jumeau |
| `ReadStatusUpdatedEvent.userId` (Android, `SocketEvents.kt`) | `String? = null` |

## La divergence réelle : socket vs REST, sur le MÊME événement

C'est ce qui fait de ce cycle un défaut constaté et non une hygiène de type.
Six émetteurs de `read-status:updated`, trois d'un avis, trois de l'autre :

| Émetteur | Transport | Ce qu'il nommait pour un invité |
|---|---|---|
| `ConversationHandler._resyncReadStatusToSocket` | socket | **`null`** — prend un `registeredUserId: string \| null` DISTINCT de `participantRowId`, et son commentaire dit pourquoi |
| `MessageHandler.autoDeliverToOnlineRecipients` | socket | **`null`** (`firstAcker.userId`) |
| `MeeshySocketIOManager` — le drain | socket | **`null`** (cycle 37) |
| `routes/message-read-status.ts` × 3 routes | REST | `Participant.id` |
| `routes/conversations/messages.ts` × 2 routes | REST | `Participant.id` |
| `routes/messages.ts` | REST | *(hors sujet : `allowAnonymous: false`, `userId` y est toujours un vrai `User.id`)* |

**Le même invité, dans la même conversation, était annoncé de deux façons selon
le transport qui parlait.** La forme correcte existait donc déjà dans le dépôt,
une porte plus loin : ce cycle est un alignement, pas une invention — la même
propriété que le cycle 37.

## Le correctif

Les deux rôles se dérivent séparément, à partir d'`isAnonymous` (déjà en portée
dans les cinq routes concernées, il servait à `shouldShowReadReceipts`) :

```ts
const actorUserId = isAnonymous ? null : userId;   // le champ du contrat
const personalRoomKey = actorUserId ?? participantId; // la clé de room
```

`personalRoomKey` réénonce la règle de `participantUserRoomTargets` — la même
partout : la room personnelle d'un participant est nommée `userId ?? id`.

Le paramètre change de type ET de nom : `userId: string` → `actorUserId: string | null`.
Le renommage n'est pas cosmétique — il fait qu'un appelant ne peut plus fournir
la mauvaise des deux valeurs par simple recopie de `authContext.userId`, et que
le type dit désormais lequel des deux rôles il sert.

**L'éventail est inchangé au bit près.** Pour un acteur avec compte,
`actorUserId ?? participantId` vaut `User.id` (identique à avant) ; pour un
invité, `null ?? membership.id` vaut `membership.id`, et `resolveCallerParticipant`
garantit `membership.id === authContext.participantId === authContext.userId`
pour un contexte anonyme (il apparie `id: participantId AND conversationId`).
Mêmes rooms, mêmes destinataires. Seul `payload.userId` change, et seulement
pour un acteur anonyme.

## Ce qui a été VÉRIFIÉ chez les consommateurs avant de nuller le champ

Nuller un champ que trois plateformes lisent demandait de prouver que personne
ne s'appuyait sur la valeur mensongère :

- **iOS — trois consommateurs, deux formes de garde.** `ConversationSyncEngine`
  et `NotificationCoordinator` calculent déjà `event.userId ?? event.participantId`
  et sont donc insensibles au changement. `ConversationStoreSocketBridge`
  compare `event.userId == me` sans repli — mais `me` vient de
  `AuthManager.shared.currentUser?.id`, que la session anonyme d'un lien de
  partage ne renseigne pas (elle vit dans `anonymousSession`, cf.
  `ConversationViewModel` → `connectAnonymous`). Cette garde ne s'appliquait
  donc **déjà** pas à un invité, ni avant ni après.
- **Web** — `presence.service.ts` déstructure le payload SANS `userId`.
- **Android** — `ChatViewModel` ne lit que `summary` et `updatedAt`.

Aucun consommateur ne change de comportement. Le champ cesse simplement de
mentir.

## Le piège que les gardes anti-sur-correction ferment

Le correctif naïf — « `payload.userId` doit être nullable, donc nullons `userId` »
— aurait propagé le `null` jusqu'à la clé de room et émis vers `user:null`. Le
badge de **tous** les invités serait alors resté collé pour toujours, en
remplaçant un champ qui ment par une fonctionnalité qui tombe. Deux témoins le
gardent explicitement (`user:null` / `user:undefined` interdits dans toute
chaîne capturée, et l'éventail qui doit continuer d'atteindre les deux pairs).

## La ligne de doc qui décrivait le mieux la confusion

`services/gateway/CLAUDE.md` affirmait :

```
userId: string,   // user.id or sessionToken
```

Deux erreurs en une : ce n'est jamais le jeton de session (il ne quitte pas le
middleware — aucun secret ne partait en diffusion, c'est le seul point où la
version d'origine était rassurante), et « user.id » y passe sous silence
l'autre moitié du domaine. C'est cette ligne qu'aurait lue quiconque cherchait
à savoir ce que ce champ porte. Elle énonce désormais les deux valeurs, la
raison (le nommage de room), et les deux dérivations à écrire.

## Gates

- 5 RED discriminants vus rouges avant correctif
- 11 non-régressions vertes d'emblée, dont les 2 gardes anti-sur-correction
- `bunx tsc --noEmit` (gateway) : propre
- Suite gateway complète : voir § Validation de `tasks/todo.md`

## Points de conception confirmés (ne pas « corriger »)

- **`ROOMS.user(Participant.id)` pour un invité n'est pas un pis-aller** : c'est
  la room que `AuthHandler` lui fait rejoindre, et `emitUnreadCountsToRecipients`
  l'adresse déjà. La clé de room et l'identité de contrat sont deux choses
  différentes qui coïncident pour un acteur avec compte — c'est cette
  coïncidence qui a caché le défaut.
- **`routes/messages.ts` reste hors du correctif** : `allowAnonymous: false`, et
  son `where: { userId, isActive }` sur la relation ne peut pas apparier un
  participant sans compte. Y ajouter la dérivation serait du bruit.
- `eslint src/` échoue toujours sur une erreur de FORMAT de configuration
  (eslintrc vs flat config eslint 9), avant lecture du moindre fichier —
  indépendante de tout diff. Pré-existante, notée aux cycles 23, 36 et 37.
- `bun install` échoue sur le postinstall de `grpc-tools` (binaire précompilé
  inaccessible derrière le proxy) ; `bun install --ignore-scripts` suffit.
- `bun run test` (gateway) passe `--testPathPattern`, retiré par jest 30 au
  profit de `--testPathPatterns` ; invoquer `npx jest --config=jest.config.json`
  directement pour filtrer. Le script sans filtre, lui, fonctionne.

## Piste pour le cycle suivant — repérée, NON livrée

Le champ `userId` de `read-status:updated` dit maintenant la vérité. Reste ce
que le cycle 37 avait isolé comme la VRAIE question, et qui n'est toujours pas
tranchée parce qu'elle est produit avant d'être technique :

**`lastReadAt` et `unreadCount` voyagent explicitement « scopés sur `userId` »**
— « a recipient whose id differs MUST ignore it ». Pour un acteur anonyme ce
champ vaut désormais `null`, donc ces deux champs sont formellement
inapplicables par ses propres autres appareils. Ce n'est pas une régression de
ce cycle (la garde iOS correspondante ne s'appliquait déjà pas à une session
anonyme, cf. § Consommateurs), mais c'est un trou désormais VISIBLE plutôt que
masqué par un champ qui mentait.

La bonne réponse demande de trancher **par quelle clé un appareil anonyme
reconnaît « c'est moi »**. Les éléments réunis pendant ce cycle :

- `Participant.sessionTokenHash` est porté par la ligne `Participant` elle-même
  (`schema.prisma`), donc **deux appareils partageant un jeton de session
  partagent le même `Participant.id`** — le multi-appareils anonyme est
  techniquement réel, et `participantId` en est la clé naturelle.
- Le payload transporte DÉJÀ `participantId` ; aucun champ nouveau n'est requis.
- Deux des trois consommateurs iOS calculent déjà `userId ?? participantId`.
  Le troisième (`ConversationStoreSocketBridge`) ne le fait pas, et surtout
  aucun des trois ne peut résoudre « mon identité » pour une session anonyme :
  `AuthManager.currentUser` reste nil, l'identité vit dans `anonymousSession`.

Le cycle suivant devrait donc porter sur **iOS, pas sur le gateway** : donner
au SDK une notion d'« identité de l'acteur courant » qui couvre les deux
populations (`User.id` ou `Participant.id` de la session anonyme), puis aligner
les trois gardes dessus. Le gateway, lui, envoie désormais les deux moitiés de
l'information.
