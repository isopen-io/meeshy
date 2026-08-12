# Iteration 172 — `GET /reactions/user/:userId` always returned an empty list

## Symptôme
L'endpoint REST authentifié `GET /api/v1/reactions/user/:userId` (voir sa
propre timeline de réactions) renvoyait systématiquement `{ success: true,
data: [] }`, quel que soit le nombre de réactions posées par l'utilisateur.

## Cause racine
`routes/reactions.ts` passait `authContext.userId` (un **`User.id`**) à
`ReactionService.getParticipantReactions(participantId)`, qui filtre la table
`Reaction` par **`participantId`** (un **`Participant.id`**).

`Participant.id` et `User.id` sont deux ObjectId de collections différentes et
n'entrent jamais en collision (le codebase s'appuie explicitement sur cette
propriété ailleurs, ex. `MessageHandler._isSender`). Le filtre
`where: { participantId: <User.id> }` ne matchait donc **zéro** ligne.

Conception sous-jacente : un utilisateur a un `Participant.id` **distinct par
conversation**. Récupérer « ses » réactions impose d'abord d'étendre
`userId → participant ids`, puis de filtrer les réactions sur l'ensemble — un
seul `participantId` ne pourrait de toute façon jamais couvrir toutes les
conversations.

## Correctif (TDD)
- **RED** : 3 tests service (`getUserReactions`) + mise à jour des tests route
  (`reactions-routes`) échouant sur le code actuel.
- **GREEN** : nouvelle méthode `ReactionService.getUserReactions(userId)` :
  1. `participant.findMany({ where: { userId }, select: { id: true } })`
  2. court-circuit `[]` si aucun participant
  3. `reaction.findMany({ where: { participantId: { in: participantIds } },
     orderBy: { createdAt: 'desc' }, take: 100 })`
  Le primitif `getParticipantReactions` (testé, filtre bien par
  `Participant.id`) est laissé intact ; la route pointe désormais sur
  `getUserReactions`.

## Vérification
- `ReactionService.test.ts` : 78/78.
- `reactions-routes.test.ts` : 40/40.
- Toutes les suites `reaction|Reaction` : 18 suites / 520 tests verts.
- Contrat d'endpoint inchangé (`ReactionData[]`) — corrige uniquement la
  résolution d'identifiant. Route déjà fermée aux anonymes en amont, donc
  `getUserReactions` n'est appelée que pour un vrai `User.id`.

## Environnement
Linux (pas de toolchain Swift/Xcode). Surface 100 % TypeScript testable en
isolation. `bun install --ignore-scripts` + `prisma generate` + `bun x jest`.
