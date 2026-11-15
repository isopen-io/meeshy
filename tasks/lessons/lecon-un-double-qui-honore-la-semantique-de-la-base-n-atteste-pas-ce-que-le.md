## Leçon — un double qui honore la sémantique de la BASE n'atteste pas ce que le CLIENT accepte d'émettre (#6811)

`contactLookupScope` a posé `blockedUserIds: { isSet: false }` pour répondre au
piège « absent vs null » de #6452. `isSet` n'existe pas sur une liste scalaire
REQUISE : Prisma ne le génère que pour les champs OPTIONNELS, et
`StringNullableListFilter` ne déclare que `equals`, `has`, `hasEvery`,
`hasSome`, `isEmpty`. Le client rejette la requête AVANT le moteur
(`PrismaClientValidationError`), le `catch` de la route traduit en 500, et
**les quatre appelants sont morts en production** — `GET /directory/people`,
`GET /users/email/:email`, `GET /users/phone/:phone`, le matching du carnet.

Trois gardes existaient, et aucune ne pouvait le voir :

| garde | ce qu'elle atteste | pourquoi elle est restée verte |
|---|---|---|
| `contact-lookup-scope-blocked-absent.test.ts` | la forme SÉLECTIONNE les bons documents | son double (`mongo-where.ts`) implémente `isSet` sur un tableau, parce que MongoDB le ferait |
| `tsc` | rien | la fonction rendait `Record<string, unknown>`, un type écrit POUR échapper à `UserWhereInput` |
| la suite unitaire entière | rien | `moduleNameMapper` remplace `@meeshy/shared/prisma/client` par un STUB |

> **Un double de base de données atteste la SÉMANTIQUE ; il n'atteste jamais
> l'ACCEPTATION.** Ce sont deux questions disjointes — « ce `where` choisit-il
> les bonnes lignes ? » et « le client consent-il à l'émettre ? » — et il faut
> une garde pour chacune. L'issue #6452 le demandait explicitement à son critère
> de fin (« un test d'intégration MongoDB ; un faux Prisma accepte toute
> forme ») ; elle a été fermée avec un double plus fidèle, ce qui n'est pas la
> même chose qu'un vrai client.

Deux corollaires de méthode :

- **Le type de retour EST la garde la moins chère.** `Prisma.UserWhereInput`
  transforme la classe entière en erreur de compilation. Un `Record<string,
  unknown>` sur un objet de requête est la MARQUE d'une déclaration manquante,
  jamais une commodité — même famille que le `as any` qui NOMME le champ absent
  (cycle 96).
- **Un témoin peut interroger le vrai client sans base.** Une adresse morte
  portant `serverSelectionTimeoutMS=50` rend le verdict du VALIDATEUR en
  quelques millisecondes : refus ⇒ la forme est fausse, échec de connexion ⇒ la
  forme est passée. C'est ce que fait
  `contact-lookup-scope-prisma-accepts.test.ts`, et son premier cas est un
  opérateur volontairement invalide — un témoin qui ne sait pas rougir n'atteste
  rien.

Le correctif ne réécrit pas la clause, il la SORT du `where` : le blocage, dans
les deux directions, devient une LISTE (`blockedIdsAroundViewer`, bâtie sur la
requête POSITIVE `blockedUserIds: { has: viewerId }` que sert
`@@index([blockedUserIds])`). Un champ absent ne bloque personne, donc il ne
figure pas dans la réponse — le piège de #6452 n'a plus de site où se poser.
