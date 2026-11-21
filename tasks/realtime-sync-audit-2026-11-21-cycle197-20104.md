## Cycle 197 — un membre actif-et-banni n'invite plus personne dans la conversation dont il est exclu (#20104)

**Date** : 2026-11-21. **Base** : `dev` à `10d199f39`. **Issue** : #20104.
**Milestone** : #286 « Un membre banni n'écrit plus rien dans la conversation
dont il est exclu » (créé par ce lot — la famille #20091/#20100 n'en avait aucun).

### Le défaut

`POST /conversations/:id/invite` chargeait ses membres sous la clause NUE
(`{ isActive: true, type: 'user' }`) puis résolvait l'inviteur dedans. Une ligne
`isActive: true, bannedAt ≠ null` EXISTE en base : un banni-mais-actif
franchissait la porte, et « inviter » écrit ici un `Participant` immédiatement
ACTIF.

### La prémisse de l'issue était FAUSSE, et c'est elle qui interdisait le bon correctif

L'issue — et l'inventaire du cliquet d'audiences, qui classait le site
`porte-sur-un-sur-ensemble` — interdisaient de resserrer le `where` :

> « Le `where` ne se resserre PAS : la même lecture tient `newMemberRefusal`, un
> refus par égalité exacte (un tête-à-tête chiffré reste à DEUX, #16188). »

**Mesuré faux.** `newMemberRefusal(conversation)` prend
`{ type, encryptionMode }` et rien d'autre (`conversations/newMemberAdmission.ts`) :
le tête-à-tête chiffré se tient par `isEndToEndDirect`, qui **ne compte
personne**. Les deux autres consommateurs de l'objet `conversation` ne lisent pas
la liste davantage :

| consommateur | ce qu'il lit de `conversation` |
|---|---|
| `newMemberRefusal` | `type`, `encryptionMode` |
| `resolveConversationEntry` | `isActive` / `closedAt` (via `isConversationClosed`) — il relit ses PROPRES lignes avec leur `bannedAt` |
| `loadSalonCommunity` | `communityId` |

La liste a donc **un** consommateur : la porte. Aucun refus ne dépend du
sur-ensemble, donc rien n'oblige à juger la loi en code — et la clause est le
seul endroit qu'un balayage de source sait lire (#20050).

> **Une raison ÉCRITE dans un inventaire est une affirmation, pas une mesure** —
> et celle-ci était fausse dans le sens le plus coûteux : elle interdisait le
> correctif le plus simple ET le plus visible au cliquet. Le mécanisme est celui
> du § « un doc-comment qui EXEMPTE une unité d'une règle se vérifie comme une
> affirmation », appliqué à un inventaire de cliquet plutôt qu'à un commentaire.

### Conséquences d'inventaire, qui sont le lot autant que le correctif

- Le site n'est plus une audience nue ⇒ son entrée **part**. Une entrée qui ne
  désigne plus rien autorise en silence un site futur qui reprendrait sa clé
  (leçon du cycle 194).
- Sa RAISON part avec elle, puisque sa prémisse est fausse. La garder « pour
  l'histoire » aurait laissé lisible une interdiction mesurée fausse.
- Le commentaire voisin qui énonçait « chargé avec `where: { isActive: true }` »
  est devenu faux dans le même mouvement, et le lot le corrige.

Mesure du cliquet : `bare` passe de 90 à 89, l'inventaire de 90 à 89. **Et le
balayage RECONNAÎT le spread** (`{ ...PARTICIPATION_VIVANTE, type: 'user' }` ⇒
`usesLaw: true`, vérifié par une sonde) — la crainte du cycle 194 (« un refactor
qui sort un discriminant du littéral casse le cliquet ») ne s'applique pas à
cette forme-ci, et ça valait d'être mesuré plutôt que supposé.

### Le ROUGE, et pourquoi le troisième témoin existe

| mutation | témoin rouge |
|---|---|
| clause NUE (l'état d'avant) | le témoin du **banni** |
| `bannedAt: null` au lieu d'`unsetOrNull` | le témoin du membre **JAMAIS banni** |

La seconde est l'erreur SYMÉTRIQUE, et elle est **pire** que le défaut corrigé :
la colonne étant ABSENTE du document d'un participant jamais banni, une égalité
à `null` ferme la route à toute la population. Un témoin posé seulement sur le
banni ne la verrait pas.

### Deux pièges rencontrés en écrivant le témoin

1. **Un décorateur `authenticate` vide** laissait la route répondre `401` —
   `onRequest: [fastify.authenticate]` en étant le seul producteur d'`authContext`.
   Deux témoins qui assertaient `not.toBe(403)` passaient alors **sans rien
   prouver** : 401 ≠ 403. C'est la forme la plus banale de « un témoin qui
   accepte les deux issues n'atteste rien », et elle s'attrape en exigeant une
   observation POSITIVE.
2. **L'admission se mesure au premier site qui SUIT la porte**
   (`user.findUnique` de l'invité), pas par un `200` : le chemin de création
   touche l'ouverture de conversation directe, l'admission en salon, les
   notifications et le socket. Un double de tout cela mesurerait la CRÉATION, pas
   la porte. La frontière est écrite dans le témoin pour qu'elle ne se lise pas
   comme un oubli.

### Le critère « relire les autres portes » — deux issues ouvertes

- **#20135** — `PATCH /links/:linkId` : clause nue `{ userId, isActive: true }`,
  un seul consommateur (`isConversationAdmin`), donc même correctif de clause. Un
  modérateur banni administre les liens de partage d'une conversation dont il est
  exclu.
- **#20136** — `POST /communities/:id/conversations/:conversationId` : forme
  DIFFÉRENTE, et c'est ce qui la rend intéressante. La liste est chargée **sans
  `where`** et la porte juge en code `p.isActive !== false` — qui admet une ligne
  dont `isActive` est absent ou nul — **sans rien dire de `bannedAt`**. Le `select`
  ne charge pas la colonne : y poser `participationEstVivante` sans l'ajouter
  serait un **no-op muet**, `undefined == null` étant vrai.

`core-lifecycle.ts:289` a été relu et écarté : il décide la RÉ-INITIATION d'un
tête-à-tête vide, pas un accès, et sa clause vient d'un flux — autre question,
qui ne se tranche pas par la même loi.
