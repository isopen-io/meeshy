## 2026-11-07 — Une audience se construit sur le sous-ensemble le plus ÉTROIT, une liste de refus sur le plus LARGE

**Date** : 2026-11-07. **Cycle** : 140, lot #16690.
**Famille** : « appliquer une loi uniformément » — et le cas où c'est faux.

### Le constat

Le dépôt a une loi d'appartenance unique, `PARTICIPATION_VIVANTE` (actif **et**
`bannedAt` nul ou absent), et douze audiences de diffusion la contournaient en
lisant `isActive` nu. Le correctif avait l'air mécanique : une loi, un `where`,
quinze sites. Un balayage, un `sed`, un cliquet.

**Deux des quinze sites se seraient CASSÉS en recevant la loi**, et pas
légèrement : en lui ouvrant la fuite qu'on était en train de fermer.

`translationReaders` porte les deux requêtes dans un **seul `Promise.all`** :

```ts
const [active, admittedRows] = await Promise.all([
  prisma.participant.findMany({ where: { conversationId, isActive: true } }),            // ← NUE
  prisma.participant.findMany({ where: { conversationId, ...ADMITTED_FILE_READER_WHERE } }), // ← lawful
]);
// …
rooms:              allowed.map(…),                                   // ← qui REÇOIT
excludedQueueKeys:  active.filter(p => !allowedIds.has(p.id)).map(…),  // ← qui ne doit RIEN recevoir
```

Un membre actif-et-banni est dans `active`, n'est pas dans `allowedIds`, **donc
il atterrit dans `excludedQueueKeys`** : il est exclu de la file hors ligne.
Resserrer cette requête l'aurait fait DISPARAÎTRE de `active` — donc de la liste
d'exclusion — et la file lui aurait servi la traduction. Le correctif aurait
transformé une protection correcte en fuite, dans le fichier même où l'autre
moitié de la loi était déjà appliquée correctement.

Même forme pour `_getBlockedSocketIdsInRoom` (`StatusHandler`), qui rend les
sockets à EXCLURE d'une diffusion de frappe — et dont le même relevé décide
`typerIsRegistered`, donc laquelle des deux lois de confidentialité s'applique :
un frappeur actif-et-banni y aurait basculé de la loi des cercles vers la règle
de blocage seule, strictement plus faible.

### La règle

| l'ensemble répond à | l'appliquer veut dire | le sous-ensemble juste |
|---|---|---|
| **qui REÇOIT** (audience, destinataires, rooms) | servir | le plus **ÉTROIT** |
| **qui ne doit RIEN recevoir** (exclusion, deny list, `except`) | taire | le plus **LARGE** |

C'est le même raisonnement fail-closed dans les deux cas, et il rend des
verdicts OPPOSÉS. Un ensemble ne se resserre pas parce qu'une loi existe : il se
resserre si le resserrement est le sens où il échoue FERMÉ.

> **Avant d'appliquer une loi d'appartenance à un `where`, demander ce que
> l'ensemble SERT** — pas ce qu'il décrit. « Les membres vivants de cette
> conversation » et « les membres à qui ne rien envoyer » s'écrivent avec le
> même vocabulaire, se lisent de la même façon, et n'ont pas la même réponse.

### Comment on l'attrape

Pas par le `where`, qui est identique des deux côtés. **Par le nom de la
variable et par son consommateur** : `rooms` / `recipients` / `members` d'un
côté, `excluded*` / `blocked*` / `hidden*` de l'autre. Les deux sites fautifs se
nommaient `active` et `_getBlockedSocketIdsInRoom` — le premier ne dit rien de
son usage, le second le DIT dans son nom, et c'est lui qui a été vu le plus
vite. Lire la variable jusqu'à son emploi, jamais seulement sa requête.

### Corollaire : un inventaire de refus n'est pas toujours une dette

Le dépôt pose d'ordinaire ses cliquets à inventaire VIDE, avec la règle « il n'y
a pas de porte non typée légitime à porter ». Ici l'inventaire est NON vide par
construction, et ses deux entrées ne sont pas de la dette : ce sont des
DÉCISIONS, chacune avec sa raison écrite, et un cliquet qui exigerait le vide
pousserait le prochain lot à « réparer » les deux sites corrects.

> Avant de poser un cliquet à inventaire vide, vérifier que la propriété
> gardée est VRAIE de tous les sites qu'elle balaie. Sinon le cliquet
> n'enseigne pas la règle, il enseigne son contraire sur les exceptions.

### Deux erreurs de balayage, dans les deux sens, mesurées le même jour

Le cliquet de ce lot s'est trompé deux fois avant d'être juste, et les deux
erreurs sont symétriques :

- **sur-signaler** — un `[^}]*` pour capturer le corps d'un `where` s'arrête à
  la première accolade fermante, donc à l'INTÉRIEUR du premier objet imbriqué
  (`conversationId: { in: [...] }`). Le cliquet a signalé un site parfaitement
  conforme ; j'ai failli « re-réparer » du code juste.
- **omettre** — un discriminant « ce `where` nomme-t-il une identité ? » écrit
  comme `/\buserId\b/` écartait en silence **trois audiences réelles** (frappe,
  appel manqué, pont d'agent) dont le `where` porte `userId: { not: null }` : un
  filtre de NULLITÉ, qui ne nomme PERSONNE.

> Un balayage qui tronque se trompe dans les deux sens, **et seul le sens
> rassurant est silencieux.** Le sur-signalement se voit (on ouvre le site, il
> est correct) ; l'omission ne se voit jamais — le cliquet est vert.

### Et le remède peut être plus dangereux que le mal

Resserrer sur `bannedAt` est un correctif à risque que ce dépôt a déjà payé
quatre fois en production : `{ bannedAt: null }` est une **égalité** et
n'apparie PAS une colonne ABSENTE — l'état de toute ligne jamais bannie, donc de
l'immense majorité. Écrite naïvement, cette loi aurait **vidé toutes les
audiences de diffusion de la passerelle**.

Le témoin le plus important du lot n'est donc pas celui qui prouve qu'un banni
ne reçoit plus : c'est celui qui prouve qu'un membre **jamais banni, dont la
colonne n'existe pas, reçoit toujours**. Et il n'a eu de valeur qu'après avoir
été rendu capable de TOMBER : ma première version de l'évaluateur de `where`
n'évaluait `bannedAt` que dans une clé `OR`, si bien que la forme naïve passait
au vert. **Un évaluateur incomplet est un double qui ment par ce qu'il ne
REGARDE pas** — jumelle du « double qui ment par ce qu'il ACCEPTE » (cycle 112).

### Et trois doubles qui discriminaient sur une propriété incidente

`unsetOrNull('bannedAt')` rend une clé `OR`. Trois doubles de
`revokeShareLinkGuests` rangeaient leurs requêtes par `if (where?.OR)` — la
marque, jusqu'ici, des requêtes d'invités de lien. La loi en a donné une à la
requête d'effectif, qui s'est mise à répondre la liste des invités. L'un des
trois faisait alors passer un témoin de chemin d'**erreur** par le chemin
**nominal** (`failRemaining` n'était plus atteint).

> **Un double qui discrimine ses appels sur une propriété INCIDENTELLE de la
> clause se trompe au premier lot qui touche la clause** — et il se trompe en
> répondant poliment, donc en vert. Discriminer sur ce que la requête DÉCLARE
> (`type: 'anonymous'`), jamais sur la forme qu'elle a eue hier. C'est la règle
> « changer la méthode Prisma qu'un handler appelle oblige à repointer les
> témoins d'erreur », portée de la MÉTHODE à la CLAUSE.
