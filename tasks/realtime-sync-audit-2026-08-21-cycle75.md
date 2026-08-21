# Cycle 75 — sortir quelqu'un d'un fil ne le sortait pas de l'appel qui s'y tenait

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-ox4upm`
**Périmètre** :
- gateway (`socketio/CallEventsHandler.ts`, `socketio/MeeshySocketIOManager.ts`,
  `socketio/endConversationMembership.ts`, `socketio/announceConversationClosed.ts`)
- shared (`types/socketio-events.ts` — documentation du contrat `CALL_FORCE_LEAVE`)
- web (`components/video-call/CallManager.tsx` — récepteur neuf)
- android (`core/model/.../CallSignalMapper.kt`, `CallSocketEvents.kt`,
  `sdk-core/.../CallSignalManager.kt` — récepteur neuf)

**Clients touchés** : aucun nom d'événement neuf, aucune charge utile modifiée.
Un événement DÉJÀ déclaré dans le contrat partagé (`SERVER_EVENTS
.CALL_FORCE_LEAVE`) et DÉJÀ entièrement implémenté côté iOS commence à être
émis ; web et Android reçoivent le récepteur qui leur manquait.

---

## 1. D'où vient ce cycle

Les cycles 73 et 74 ont fermé deux fins de vie autour de la même question :
qu'est-ce qui reste allumé quand quelque chose se termine ?

- **cycle 73** — la CLÔTURE d'un fil n'éteignait pas la position vive qu'il
  portait ;
- **cycle 74** — la fin d'APPARTENANCE (quitter, être banni, être retiré,
  supprimer le fil pour soi) ne l'éteignait pas davantage, et pire : la perte du
  droit faisait taire le verbe d'arrêt lui-même (`handleLiveLocationStop`
  commence par exiger `isActive: true`).

Le cycle 73 avait explicitement laissé une porte ouverte, et l'avait nommée :

> Elle ne termine pas les APPELS en cours du fil. C'est une décision produit
> ouverte (cycle 72, § 6, piste 1) et non un oubli : raccrocher au nez de gens
> qui se parlent serait une régression.

**L'argument est juste pour la clôture, et il s'inverse pour l'appartenance.**
La clôture ne retire le droit de personne — tous les interlocuteurs restent
membres, et les faire taire serait une perte. La fin d'appartenance retire le
droit de QUELQU'UN, précisément. C'est cette asymétrie que ce cycle exploite :
la même famille, le même geste, une conclusion opposée selon la fin considérée.

---

## 2. Le défaut

### 2.1 Deux rooms, et rien qui relie l'une à l'autre

Un appel vit dans `ROOMS.call(callId)`. Une conversation vit dans
`ROOMS.conversation(id)`. `endConversationMembership` sortait le partant de la
seconde ; **la première n'était touchée par rien.**

Et rien en aval ne rattrapait l'écart. L'autorisation du relais de
signalisation ne lit pas l'appartenance au fil :

```ts
// CallEventsHandler, handler `call:signal`
const findSender = (session) =>
  session.participants.find(
    p => ((p.participant?.userId || p.participantId) === userId) && !p.leftAt
  );
```

Le seul critère est la ligne `CallParticipant` et son `leftAt`. Or aucun des
quatre chemins de fin d'appartenance n'écrivait ce `leftAt`.

### 2.2 Ce que ça coûtait

Un membre **banni pendant un appel** y restait entièrement :

| ce qui continuait | par quel chemin |
|---|---|
| signalisation WebRTC (SDP, ICE) | `call:signal`, autorisé sur `!p.leftAt` |
| média audio/vidéo | P2P déjà établi — aucun serveur dans la boucle |
| transcriptions de tous les autres | `call:transcription-result` vers la room de l'appel |
| traductions vives de tous les autres | `call:translated-segment` |
| son micro, en émission | idem |

Le fil venait de l'exclure ; il continuait de l'entendre et d'y parler. Le coût
n'est pas d'affichage, il est de confidentialité : c'est le même verdict que
`LocationHandler` porte déjà pour une épingle figée, un cran plus haut — ce qui
survit n'est pas une position périmée, c'est un micro ouvert.

### 2.3 Et il ne pouvait pas en sortir — le cycle 74 à l'identique

`call:force-leave`, dans son sens CLIENT→serveur, est le seul verbe qui retire
quelqu'un des appels d'une conversation. Il commence par :

```ts
const membership = await this.prisma.participant.findFirst({
  where: { conversationId: data.conversationId, userId, isActive: true },
  select: { id: true }
});
if (!membership) { /* NOT_A_PARTICIPANT */ return; }
```

**La garde d'autorisation protège aussi le verbe de RETRAIT.** C'est mot pour
mot le défaut du cycle 74 sur `handleLiveLocationStop`. Le motif s'est donc
répété une troisième fois, sur la fonction la plus chère du produit.

### 2.4 Le contrat que personne n'honorait

`SERVER_EVENTS.CALL_FORCE_LEAVE` existe dans le contrat partagé depuis
longtemps, avec sa phrase : *« Server-side GC/admin forced the call to end —
clients should dismiss call UI. »*

- **iOS l'implémente ENTIÈREMENT** : `MessageSocketManager` le décode,
  `CallManager` le garde sur `currentCallId`, démonte la session WebRTC
  (`endCallInternal(reason: .remote)`) **et clôt la session CallKit**. Quatre
  tests le prouvent (`CallManagerTests`).
- **Le gateway ne l'émettait JAMAIS.** Zéro site d'émission.
- **Android l'avait constaté et documenté** : « `call:force-leave` is
  deliberately ABSENT: the gateway never emits it (audit appels 2026-07-11 —
  verified dead; subscribing would be a silent no-op inviting drift). »
- **Web n'avait aucun récepteur.**

Un contrat écrit, un récepteur complet et testé côté iOS, et rien pour
l'alimenter. C'était exactement la phrase qui manquait au sorti.

---

## 3. Le remède

### 3.1 Le point de convergence, encore

Le geste est ajouté à `endConversationMembership` — l'unité créée au cycle 74
comme point de convergence des quatre chemins. Aucune des quatre routes n'est
touchée : *« le prochain chemin de sortie en hérite parce qu'il n'y a plus
qu'une façon de sortir quelqu'un »* — c'est la première fois que cette promesse
est encaissée.

L'unité passe de « éteint (position), sort, invalide » à
**« éteint (position, appel), sort, invalide »**.

### 3.2 Ce que fait `endCallParticipationForDepartedMember`

Par appel VIVANT du fil dont le partant tenait une ligne active :

1. `cancelDisconnectGrace` — une fenêtre de grâce encore armée n'a plus d'objet ;
2. `leaveParticipationAndBroadcast` → `leaveCall` (écrit `leftAt`, ferme le
   relais de signalisation) puis `call:participant-left` **dans la room de
   l'appel** : les restants démontent leur `RTCPeerConnection`, ce qui coupe le
   média P2P qu'aucune action purement serveur n'atteindrait ;
3. `clearRingingTimeout` + `clearBufferedOfferFor` — même hygiène par-partant
   que `call:leave` / `call:force-leave` ;
4. **`call:force-leave` vers la room PERSONNELLE du sorti** ;
5. éviction des seuls appareils du sorti de la room de l'appel.

### 3.3 La recherche, et la clause qu'elle n'a PAS

```ts
where: {
  OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
  participant: { userId, conversationId }        // ← aucun isActive
}
```

Exiger `isActive: true` ici reproduirait exactement le silence qu'on corrige :
la route appelante vient de passer la ligne à `false`. Un témoin le prouve **par
la structure** (`expect(JSON.stringify(where)).not.toContain('isActive')`) et
non par un effet — l'absence d'une clause ne se lit pas dans un résultat.

### 3.4 Pourquoi `call:force-leave` en plus de `call:participant-left`

Les deux événements ne disent pas la même phrase :

| événement | phrase | audience |
|---|---|---|
| `call:participant-left` | « un pair s'en va » | la room de l'appel = les RESTANTS |
| `call:force-leave` | « c'est TOI qu'on sort » | la room personnelle du SORTI |

Le sorti reçoit certes son propre `participant-left` avant l'éviction, mais
aucun client ne traite « je me vois partir » comme un ordre de raccrocher — et
c'est correct, ce serait ambigu. `call:force-leave` porte la phrase sans
ambiguïté, et c'est celle qu'iOS savait déjà entendre.

La room personnelle est aussi la seule que l'éviction ne touche pas : la phrase
arrive quel que soit l'ordre.

### 3.5 Raison gravée : `completed`

`CallEndReason` n'accueille aucune valeur neuve. Un départ d'appartenance grave
`completed` — ce que produit déjà un raccroché ordinaire. Aucun client n'a de
raison de plus à connaître, et sur le web aucune offre « Réessayer » n'est
posée pour un appel qu'on n'a plus le droit de rejoindre.

`leaveParticipationAndBroadcast` reçoit donc un `endReasonHint` paramétrable,
dont le défaut (`connectionLost`) sert inchangé son appelant historique —
l'expiration d'une fenêtre de grâce.

### 3.6 Les trois clients

| client | avant | après |
|---|---|---|
| **iOS** | récepteur complet, jamais alimenté | inchangé — il reçoit enfin |
| **web** | aucun récepteur | délègue à `handleCallEnded` (garde sur le callId suivi, extinction de sonnerie, `reset()`), même délégation que l'ACK `CALL_ENDED` du re-join après reconnexion |
| **Android** | non abonné, avec commentaire disant pourquoi | `CallSignalMapper.endedSignal` mappe la trame en `CallEndedSignal(callId, RemoteHangUp)` — identity-gated comme `call:ended`/`call:missed` ; commentaire remplacé |

---

## 4. Ce que ce cycle NE change PAS

- **La clôture d'un fil laisse toujours vivre ses appels.** La décision produit
  du cycle 72 tient, et son argument est maintenant écrit à côté de son
  inverse dans `announceConversationClosed`.
- **Aucune des quatre routes** (`leave`, `ban`, `participants`,
  `delete-for-me`) n'est modifiée.
- **Aucun nom d'événement, aucune charge utile.**

---

## 5. Preuves

| gate | résultat |
|---|---|
| `tsc --noEmit` gateway | vert |
| gateway — suites neuves + touchées | 18/18 (dont 12 rouges sans le correctif, vérifié par `git stash`) |
| gateway — suite complète | voir § Revue |
| web — `CallManager.forceLeave.test.tsx` | 5/5 |
| android — `CallSignalMapperTest` (+4 cas) | via CI `Android` (SDK inatteignable en conteneur, cf. l'en-tête de `.github/workflows/android.yml`) |

---

## 6. Pistes laissées ouvertes

1. **Le relais `call:signal` ne relit jamais l'appartenance au fil.** Ce cycle
   ferme le chemin par lequel un exclu y restait, en écrivant son `leftAt` ;
   il ne pose pas de garde de défense en profondeur sur le relais lui-même.
   Une seconde ligne — vérifier l'appartenance à la conversation au join, pas
   seulement à l'initiation — resterait un durcissement utile.
2. **Le média P2P déjà établi ne dépend d'aucun serveur.** La coupure passe
   par le démontage volontaire des pairs sur `call:participant-left`. Un pair
   modifié pourrait choisir de ne pas démonter : la garantie est de
   coopération, pas de contrainte. Une architecture SFU la rendrait
   contraignante ; c'est une décision produit, pas un correctif.
3. **`postCallSummary` grave un résumé d'appel dans le fil quand ce départ
   termine l'appel.** Pour un bannissement en appel direct, le résumé est
   posté dans une conversation dont le banni est sorti — comportement voulu
   (les restants ont droit à leur trace), mais à revérifier si le produit
   décide un jour de masquer les traces d'un exclu.
