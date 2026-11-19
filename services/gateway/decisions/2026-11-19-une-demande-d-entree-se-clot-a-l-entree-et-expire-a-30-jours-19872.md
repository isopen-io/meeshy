# Une demande d'entrée en communauté se clôt à l'entrée, et expire à trente jours (2026-11-19, #19872)

## Contexte

Une communauté qui « valide chaque entrée » reçoit des demandes (`CommunityJoinRequest`, #19429). Le détail sert au demandeur `currentUserJoinRequest: 'pending'` (#19868), les intendants les listent et les tranchent (#19871). Deux états hérités, relevés par l'audit adversarial de #19868 :

1. **Entrer par une autre porte ne fermait pas la demande.** Invité, ajouté par un administrateur, entré par un salon : la demande restait `pending`. Repartie, la personne relisait « Demande envoyée », et accepter la vieille demande la faisait revenir.
2. **Une demande pouvait n'avoir aucun juge.** `decidableRequest` cache à un intendant la demande d'un demandeur bloqué avec lui (dans un sens ou l'autre) ou au compte un temps inutilisable. Si aucun intendant ne la voit, le demandeur attendait indéfiniment.

## Décision

- **Toute entrée clôt les demandes en attente de la personne** (`closePendingJoinRequests`, `services/community-join-request-lifecycle.ts`) : statut `accepted`, `decidedAt`, `decidedBy` = celui qui fait entrer (l'intendant qui invite ou ajoute, la personne elle-même pour une adhésion directe, `null` pour une entrée implicite par un salon). Appelée par les quatre écrivains d'entrée — `admitCommunityMember`, `POST …/invite`, `POST …/members`, `applyCommunityAdmission` — APRÈS l'écriture de l'appartenance ; elle ne lève jamais (l'entrée a eu lieu ; une demande restée ouverte n'est de toute façon servie qu'à un non-membre). Le cliquet `community-member-writer-sweep` exige l'appel chez chaque écrivain d'entrée.
- **Une demande vit trente jours** (`JOIN_REQUEST_TTL_MS`). Toute lecture et toute bascule d'une demande en attente passe par `liveJoinRequestWhere(now)` : détail du demandeur, liste et décision des intendants, compteur de `community:join-requested`, déduplication de `requestCommunityEntry`. Passé ce délai, la demande n'est plus servie ni tranchable, et une nouvelle demande peut partir ; la vieille est alors écrite `expired` (nouvelle valeur de `status`, qu'aucun client ne lit : ils ne voient que `pending` ou rien).

## Alternatives écartées

- **Refus implicite au blocage** : il dirait au demandeur, par le délai de sept jours d'un refus, qu'un intendant l'a bloqué (ou qu'il en a bloqué un). L'expiration ne révèle rien : elle arrive à tout le monde.
- **Balayage planifié des demandes périmées** : inutile tant que chaque lecture filtre par `liveJoinRequestWhere` ; la ligne périmée n'est réécrite (`expired`) que quand son auteur redemande.
- **Fermer à la lecture** (une demande antérieure au dernier `joinedAt` est morte) : `applyCommunityAdmission` ne réécrit pas `joinedAt`, la règle aurait menti pour les entrées par un salon.

## Conséquences

- Aucun contrat d'API ne change ; aucun client n'a à bouger.
- Trente jours est un choix de produit : à revoir si les intendants se plaignent de demandes disparues.
