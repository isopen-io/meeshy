## Cycle 199 — la porte du rattachement, et la liste qui ÉCRIT, lisent la participation VIVANTE (#20136)

**Date** : 2026-11-21. **Base** : `dev` à `ed391159a`. **Issue** : #20136
(ouverte par le cycle 197 en instruisant le critère « relire les autres portes »).
**Milestone** : #286.

### Deux écarts de gravité très inégale

`POST /communities/:id/conversations/:conversationId` charge TOUS les
participants, sans clause, puis jugeait l'appelant en code :

| ce que le site écrivait | la loi | conséquence |
|---|---|---|
| `p.isActive !== false` | `isActive === true` | une ligne dont `isActive` est ABSENT ou nul passait |
| *rien sur `bannedAt`* | `bannedAt == null` | **un administrateur BANNI rattachait « sa » conversation** |

### Ce que le constat de départ n'avait pas : la liste qui ÉCRIT

Le même relevé, sous le même prédicat, alimente `planCommunityAdmission` :

```ts
participantIds: conversation.participants
  .filter((p) => p.isActive !== false)   // ← le même prédicat faible
  .flatMap((p) => (p.userId ? [p.userId] : [])),
```

**Cette liste n'affiche rien : elle ÉCRIT.** `applyCommunityAdmission` crée une
ligne `CommunityMember` par identité remise — donc un participant banni de la
conversation devenait **membre de la communauté privée d'accueil**, une
appartenance qu'aucune autre porte ne lui aurait donnée, obtenue par un geste
qui parle d'autre chose.

C'est la question du cycle 125 posée à une lecture plutôt qu'à une charge :
*qu'est-ce que ce relevé alimente À CÔTÉ de ce que je viens de garder ?*

### Le piège était ANNONCÉ, et il a quand même failli passer

L'issue nommait le risque en gras dans son critère de fin : « sans la colonne,
la garde est un no-op MUET — `undefined == null` est vrai ». Le lot l'a donc
corrigé d'emblée.

**Et la mutation qui le reproduit ne faisait tomber AUCUN témoin.** Douze verts,
`bannedAt` retiré du `select` de production, zéro rouge.

La cause est le HARNAIS, pas le code : un double Prisma rend ce qu'on lui dit
quel que soit le `select` reçu. La fixture portait `bannedAt`, donc le prédicat
le lisait, donc tout était vert — que la production ait demandé la colonne ou
non. **La PROJECTION est la seule des trois moitiés d'une règle — la CLAUSE, la
PROJECTION, le PRÉDICAT — qu'un témoin de comportement ne peut pas observer.**

### Le correctif est l'INSTRUMENT, pas un témoin de plus

Un témoin de projection garde UN site ; le suivant ne l'aura pas. Le double
APPLIQUE désormais le `select` : une fixture ne peut plus rendre un champ que la
requête n'a pas demandé, et le no-op redevient visible par les témoins de
COMPORTEMENT ordinaires, sans qu'aucun d'eux ait à parler de projection.

C'est la **jumelle de `mongo-where.ts`**, et la parenté vaut d'être dite : ce
dépôt a déjà un double qui ÉVALUE le `where` au lieu de le comparer à une copie,
pour la raison exactement symétrique. La clause avait son instrument ; la
projection n'en avait pas. Les deux moitiés d'une lecture ont désormais chacune
le sien.

### Le ROUGE

| mutation | témoins rouges |
|---|---|
| la PORTE sur `p.isActive !== false` | **2** (le banni, et la ligne sans `isActive`) |
| la liste d'ADMISSION sur le prédicat faible | **1** |
| `bannedAt` retiré du `select` | **2** — et **0** avant que l'instrument soit réparé |

La troisième ligne est la mesure du lot : le même code de production, le même
jeu de témoins, et un verdict qui passe de 0 à 2 selon la fidélité du double.

### Ce qui reste ouvert sur cette route

La réponse sert sa propre liste de participants, par une requête SÉPARÉE
(`conversation.update(... include: { participants: { where: { isActive: true } } })`),
gardée pour la présence par `gateConversationParticipantsPresence`. C'est une
troisième question — ce qu'une liste de membres MONTRE — qui ne se tranche pas
par la même loi que l'accès, et le lot ne l'a pas touchée.
