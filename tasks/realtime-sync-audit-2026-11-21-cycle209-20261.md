## Cycle 209 — l'aperçu avant décroché lit la participation vivante (#20261)

Date : 2026-11-21. Branche `claude/exciting-planck-iofkyv`, depuis la tête de
`dev` qui contient #20155.

### Le défaut

`socketio/call-preview-events.ts` : `isMember` était

```ts
(await prisma.participant.count({ where: { conversationId, userId, isActive: true } })) > 0
```

et c'est le **SEUL** contrôle d'appartenance de `calleeRefusal`, qui gouverne
les DEUX verbes de l'aperçu — `CALL_PREVIEW_REQUEST` et `CALL_PREVIEW_SIGNAL`,
c'est-à-dire le relais WebRTC de la caméra et du micro de l'appelant **avant
tout décroché**. Rien ne relit `Participant` en aval : `loadCall` ne lit que
`CallSession`. La question « qui AUTORISE ce que cette clause rend ? » (#20183)
se répond donc ici, et nulle part ailleurs.

### Comment il a été trouvé

Par l'**exclusion de portée** du balayage livré au cycle précédent, pas par le
balayage. `count` en était écarté au motif que « ce sont des mesures », et le
`CLAUDE.md` a bien tranché ce régime — « la troncature et le sur-comptage y
sont des nombres FAUX, pas des fuites ». C'est juste **quand le nombre est
affiché**. Ici le nombre est lu par un `if` : la troncature n'est pas un nombre
faux, c'est un laissez-passer.

> La question à poser à une mesure n'est pas « est-ce un nombre ? » mais
> **« ce nombre est-il lu par un humain ou par un `if` ? »**.

### Les deux mesures que l'issue demandait, et qui changent le récit

L'issue le disait explicitement non mesuré. Mesuré :

**1. Le bannissement EST atteignable en tête-à-tête.** La route
`POST /conversations/:id/participants/:userId/ban` n'a **aucune garde par type
de conversation** — vérifié, pas une occurrence de `'direct'` dans
`participant-ban-core.ts` — et son plancher est `MemberRole.MODERATOR`. Or
l'ouvreur d'un direct reçoit `role: 'creator'` (`core-lifecycle.ts`, le
`participants.create`), donc au-dessus du plancher. A ouvre un tête-à-tête avec
B, A est créateur, A bannit B : le geste passe.

**2. Mais un bannissement d'AUJOURD'HUI ne produit pas l'état vulnérable.**
`resolveBanWrite` écrit **toujours** `isActive: false` à côté de `bannedAt` :

```ts
if (participant.isActive === false) return { data: { bannedAt, isActive: false }, … };
return { data: { bannedAt, isActive: false, leftAt: bannedAt }, … };
```

La clause nue excluait donc déjà le banni du chemin nominal. **Seules les lignes
HÉRITÉES** d'avant #19688 / #10436 portent `isActive: true, bannedAt ≠ null`, et
aucune migration ne les a reprises (`2026-11-07-participant-active-and-banned.mongodb.js`
n'a été exécutée ni en staging ni en production, et la population n'est mesurée
nulle part).

> **C'est donc un PIÈGE ARMÉ, pas une panne vivante.** Ce qui ne change rien à
> la conclusion — règle du cycle 84 : on ne laisse pas un piège armé au motif
> que personne n'a encore marché dessus — et tout au récit. Annoncer une panne
> qu'on n'a pas mesurée coûte la confiance dans les cycles où il y en a une
> (leçon du cycle 103).

L'issue #20261 annonçait « un membre banni le franchit » sans cette nuance :
elle est corrigée avec la mesure.

### Le témoin, et pourquoi il ne pouvait pas vivre dans le harnais voisin

`call-preview-events.test.ts` remplace `isMember` par une liste de membres : il
garde le CÂBLAGE des deux verbes et, par construction, **ne peut rien dire de la
clause**. Un témoin qui stube la garde atteste un contrat que personne ne
respecte.

`call-preview-membership-living-participation.test.ts` passe donc par
`callPreviewDependencies` — la vraie fabrique — et fait évaluer le `where` RÉEL
par `matchesMongoWhere`, la sémantique Mongo UNIQUE du dépôt. Comparer le
`where` à une copie écrite à la main mentirait par ce qu'elle refuse (leçon du
2026-11-21, #20209 : un double ad-hoc produit un faux ROUGE sur un correctif
juste).

Cinq témoins, dont deux qui ne gardent pas le défaut mais le ROUGE du
resserrement : le membre vivant reste admis, et un `bannedAt` **ABSENT** vaut
« jamais banni ». Sans le second, une orthographe exigeant `bannedAt: null`
STRICT retirerait l'aperçu à tout le monde — le défaut symétrique de celui qu'on
corrige, et le plus coûteux des deux.

Et un témoin écrit sur `isActive: false` ne garderait RIEN : il passe déjà sous
la clause nue. Le ROUGE est prouvé sur le seul état qui compte.

### Gates

`tsc --noEmit` à 0 erreur · les 5 cliquets de la famille (72 témoins) verts ·
`npx jest call` : 179 suites / 2123 témoins verts · suite complète du gateway.
