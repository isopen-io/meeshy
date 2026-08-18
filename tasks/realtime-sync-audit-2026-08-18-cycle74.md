# Cycle 74 — sortir d'un fil VIVANT n'éteignait pas ce qu'on y tenait de vivant

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-u1feo4`
**Périmètre** : gateway (`socketio/endConversationMembership.ts` — neuf,
`socketio/handlers/LocationHandler.ts`, `socketio/MeeshySocketIOManager.ts`,
`routes/conversations/{leave,ban,participants,delete-for-me}.ts`)
**Clients touchés** : aucun (aucun nom d'événement, aucune charge utile modifiés ;
un `location:live-stopped` de plus part, sur un événement que les deux clients
portant la fonction traitent déjà — iOS `MessageSocketManager`, Android
`LiveLocationEventFold`. `apps/web` n'a aucun client de position vive,
l'événement y est inerte.)

---

## 1. D'où vient ce cycle

Le cycle 73 a posé une règle dans `tasks/lessons.md` § Leçon 239 :

> Devant tout état éphémère, poser DEUX questions et non une : « qu'est-ce qui
> termine cet objet ? » **et** « qu'est-ce qui termine ce qui le contient ? ».

Elle a été appliquée à la lettre, et elle était **incomplète d'une question**.
Ses deux questions portent sur des ENTITÉS. Il existe une fin qui n'est ni celle
de l'objet ni celle du conteneur : celle du **lien** entre les deux — la fin
d'APPARTENANCE. Le conteneur est intact, l'objet est intact, seule la relation
s'arrête. Aucune des deux listes ne la contient.

---

## 2. Le défaut

### 2.1 Quatre chemins, la même omission

Quatre routes mettent fin à l'appartenance d'un membre à une conversation qui,
elle, **continue de vivre** :

| route | geste | fil après |
|---|---|---|
| `leave.ts` (branche non-créateur) | quitter | vivant |
| `ban.ts` | bannir | vivant |
| `participants.ts` `DELETE` | retirer (modérateur) | vivant |
| `delete-for-me.ts` (non-créateur, ou successeur promu) | supprimer pour soi | vivant |

Les quatre écrivent `isActive: false` sur la ligne `Participant`, annoncent leur
fait propre, sortent les sockets du partant de `ROOMS.conversation(...)` et
invalident son cache d'appartenance. **Aucune** n'éteignait le partage de
position que le sortant tenait dans le fil.

### 2.2 Ce que ça coûtait — le cycle 73 par le chemin INVERSE, et un cran plus cher

`LiveLocationSession` vit jusqu'à `expiresAt`, soit **≤ 8 heures**
(`durationMinutes` ≤ 480). Les membres restants sont toujours dans la room. La
position réelle du sortant restait donc affichée **au groupe qui vient de
l'exclure**.

Et il ne pouvait pas l'arrêter. `handleLiveLocationStop` commence par
`_resolveParticipantId`, qui exige `isActive: true` :

```ts
const participantId = await this._resolveParticipantId(context, normalizedId);
if (!participantId) return;   // ← silencieux : ni callback, ni erreur, ni log
```

**La garde d'autorisation protège aussi le verbe de RETRAIT.** La perte du droit
gèle l'état au lieu de le libérer.

Comparaison avec le cycle 73, où le coût est le même obtenu autrement :

| | cycle 73 (clôture) | cycle 74 (appartenance) |
|---|---|---|
| l'écran disparaît | oui (`conversation:closed` + `isActive: true` à la racine) | oui (`participants.some({ userId, isActive: true })`) |
| la commande d'arrêt meurt | **avec** l'écran | **avant** l'écran |
| trace | aucune | aucune |

Les `live-update` d'après butent sur la même garde : l'épingle **se fige** au lieu
de suivre. Elle se présente comme vivante et ne l'est plus — exactement ce que
l'en-tête de `LocationHandler` chiffre déjà pour la mort du socket : « sur une
fonction dont le contrat entier est *voici où je suis MAINTENANT*, c'est un
défaut de sécurité avant d'être un défaut d'affichage ».

### 2.3 Le coût côté partageur, qui n'existait dans aucun cycle précédent

Aucun `location:live-stopped` ne partait, donc **l'appareil du sortant
n'apprenait rien**. Il gardait le GPS allumé et continuait d'émettre des
`live-update` que le serveur jette silencieusement — une dépense d'énergie pure,
pendant des heures, pour un partage qui n'atteint plus personne.

---

## 3. Le remède

### 3.1 Le point de convergence, et pourquoi ce n'est pas quatre gardes

Les quatre routes portaient **déjà**, recopiée quatre fois et alignée à la main,
la même paire de gestes :

```ts
const userSockets = await io.in(ROOMS.user(userId)).fetchSockets()
await Promise.all(userSockets.map(s => s.leave(ROOMS.conversation(id))))
manager?.invalidateParticipantCache?.(userId, id)
```

Ajouter un cinquième appel à chacune aurait reproduit exactement la structure que
les cycles 67, 71 et 73 ont payée. `socketio/endConversationMembership.ts` la
remplace : **éteindre, puis sortir, puis invalider**. Le prochain chemin de
sortie en hérite parce qu'il n'y a plus qu'une façon de sortir quelqu'un.

Une répétition EXISTANTE à N endroits est le meilleur indice de l'endroit où
créer l'unité : elle prouve que les N chemins partagent déjà une décision.

### 3.2 L'ORDRE, et l'argument inverse de celui du cycle 73

`_broadcastStopped` vise `ROOMS.conversation(...)` — toute la room, **partageur
COMPRIS**, parce qu'il porte une décision du SERVEUR et non le geste d'un pair.
C'est le seul point d'accroche par lequel l'appareil du sortant apprend qu'il
doit couper le GPS.

| unité | contrainte | raison |
|---|---|---|
| `announceConversationClosed` | éteindre **avant** d'annoncer | les clients OUBLIENT la conversation en recevant l'annonce |
| `endConversationMembership` | éteindre **avant** d'évincer | le sortant QUITTE la room par laquelle on l'atteint |

Même contrainte, deux raisons sans rapport. La déduire de la première aurait
donné la bonne réponse pour la mauvaise raison.

### 3.3 L'extinction n'invente AUCUN mécanisme

`endSessionsForDepartedMember` avance le terme à MAINTENANT sur **UNE** entrée —
le fil vit, et les partages des membres restants avec lui. C'est la même
expiration anticipée que le cycle 73, factorisée avec elle dans
`_expireSessionNow`. Les trois propriétés du cycle de vie restent donc déjà
écrites et déjà gardées, et ce lot n'en réécrit aucune :

- les `live-update` d'après sont tus par la borne de `handleLiveLocationUpdate` ;
- `replayLiveLocationsTo` saute l'entrée ;
- `handleSocketDisconnecting` la ramasse sans rediffuser une fin déjà annoncée.

**Aucune lecture ajoutée** : l'appartenance vient de finir, la relire ne rendrait
rien. Un témoin tient cette absence.

### 3.4 L'identifiant se lit sans conversion aux trois étages

Ce n'est pas une coïncidence — les trois nomment la même chose :

| étage | source | compte | invité de lien partagé |
|---|---|---|---|
| registre des partages | `SocketUser.id` (`AuthHandler`) | `User.id` | `Participant.id` |
| routes de sortie | `authContext.userId` | `User.id` | `Participant.id` |
| room personnelle | `ROOMS.user(userId ?? id)` | `User.id` | `Participant.id` |

### 3.5 Effet de bord réparé au passage

`delete-for-me.ts` plaçait son éviction **en tête** du bloc socket, donc avant
`announceConversationClosed`. Sur ses branches de clôture, l'appelant sortait de
la room avant que l'extinction du cycle 73 ne diffuse. L'unité, appelée à cette
même place, éteint sa session **avant** de l'évincer ; l'extinction du fil entier
qui suit saute une session dont le terme est déjà avancé, et n'annonce pas deux
fois la même fin.

---

## 4. Les témoins

**21 neufs** : 11 handler
(`socketio/handlers/__tests__/LocationHandler.departedMember.test.ts`),
6 unité de convergence
(`socketio/__tests__/endConversationMembership.test.ts`),
4 route (un par chemin de sortie, dans le harnais existant de chacun).

### RED prouvé, par quatre mutations distinctes

| mutation | tombe |
|---|---|
| extinction **inversée** avec l'éviction | **1 ROUGE**, et lui seul — les témoins de présence restent verts, seul un témoin qui enregistre la SÉQUENCE peut voir l'inversion |
| extinction rendue **muette** | **4/11** handler + **4/4** route |
| extinction **élargie** à toute la conversation | **1 ROUGE** — celui qui distingue cette fin de celle du cycle 73 |
| une route **rouvre sa copie** de l'éviction au lieu d'appeler l'unité | **1 ROUGE** |

### Un témoin qui fige le MÉCANISME, pas le correctif

Le douzième témoin handler atteste que `location:live-stop` tombe en silence dès
l'appartenance finie. Il est vert avant comme après le lot : il existe pour
répondre seul, le jour où quelqu'un proposera « le client n'a qu'à envoyer un
stop avant de partir ».

### Suite complète

**754/754 suites gateway, 18 198 témoins verts.** `tsc --noEmit` propre.

---

## 5. Périmètre assumé, et ce qui reste ouvert

**Assumé** : la position vive seule. Les APPELS en cours d'un membre qui sort
restent hors périmètre — même décision produit que le cycle 72 § 6 piste 1 et que
l'en-tête d'`announceConversationClosed` : raccrocher au nez de gens qui se
parlent serait une régression, là où une épingle figée est un défaut de sécurité.

**Balayage vérifié et non déduit** — des registres en mémoire de `socketio/` :

| registre | clé | durée | concerné |
|---|---|---|---|
| `StatusHandler.activeTypers` | socket | quelques secondes | non (s'auto-purge) |
| `CallEventsHandler` (6) | appel | durée de l'appel | non (hors périmètre assumé) |
| `LocationHandler.sessions` | (conversation, compte) | ≤ 8 h | **oui** |

**Pistes pour le cycle suivant** :

1. **La suppression de COMPTE** (`routes/me/delete-account.ts`) est la variante
   de la même question, au niveau au-dessus : elle termine l'acteur lui-même dans
   TOUTES ses conversations à la fois. À vérifier plutôt qu'à supposer — la mort
   des sockets peut la couvrir, ou pas.
2. **La ré-entrée** est le miroir non exploré de ce cycle : un membre banni puis
   débanni, ou retiré puis réinvité, retrouve-t-il un état cohérent ?
   `ban.ts` ré-injecte le débanni dans la room ; `replayLiveLocationsTo` n'est
   appelé que sur `conversation:join`.
3. **La règle de la Leçon 240** appliquée aux autres états par (acteur,
   conteneur) du produit, hors position : brouillons, épinglages, présence par
   conversation.
