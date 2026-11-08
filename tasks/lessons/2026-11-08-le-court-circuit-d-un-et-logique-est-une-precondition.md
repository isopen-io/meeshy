# Le court-circuit d'un `&&` est une PRÉCONDITION, et elle n'a pas de nom

*Cycle 147, 2026-11-08. Défaut que j'ai introduit moi-même, et qui a cassé le
scellement au repos de toute la file de rejeu le temps d'une révision.*

## Le code d'avant

```ts
const reachableHere =
  connectedUsers.has(queueKey) &&
  !connectedUsers.get(queueKey)?.unreachableConversations?.has(conversationId);
```

J'avais besoin d'une seconde propriété de la même valeur. Pour ne pas appeler
`get` deux fois, j'ai hissé l'appel :

```ts
const socketState = connectedUsers.get(queueKey);          // ← le défaut
const reachableHere =
  connectedUsers.has(queueKey) &&
  socketState?.allConversationRoomsUnreachable !== true &&
  !socketState?.unreachableConversations?.has(conversationId);
```

Le code se lit mieux. Il est faux.

## Ce qui est tombé

Deux suites entières de scellement au repos, avec un symptôme qui ne nommait pas
la cause : `Expected: {"sealAtRest": true}` / `Received: undefined`. Rien dans le
message ne parlait de joignabilité ni de `connectedUsers` — la file n'enfilait
simplement plus rien, parce que `connectedUsers.get` n'est pas appelable pour
toutes les formes de carte que les appelants passent.

## La leçon

**Le `has(x) &&` qui précède un `get(x)` n'est pas une commodité de style : c'est
la précondition de l'appel suivant.** Et elle est invisible, parce qu'elle n'a
pas de nom : aucun type ne la déclare, aucun commentaire ne la portait, et le
compilateur ne la voit pas (`get` est déclaré, il rend juste `undefined` en
théorie).

C'est la même famille que « une garde conditionnée à la PRÉSENCE de ce qu'elle
garde est un no-op », vue de l'autre côté : ici ce n'est pas la garde qui est
conditionnée, c'est **l'appel qui était gardé par l'ordre**, et l'ordre a changé.

## La règle pour la prochaine fois

Avant de hisser un appel hors d'une chaîne `&&` ou `?.`, demander : **qu'est-ce
que la position de cet appel garantissait ?** Si la réponse n'est pas
immédiatement « rien », l'optimisation coûte plus que les deux appels qu'elle
économise — et deux `get` sur une `Map` ne coûtent rien.

Et si on le fait quand même, l'écrire : la version corrigée porte désormais sur
place la raison pour laquelle `has` vient d'abord.

## Corollaire de méthode

Ce défaut n'a pas été trouvé par relecture. Il a été trouvé parce que **la suite
COMPLÈTE a été relancée après chaque lot**, et qu'elle a rendu deux suites rouges
dans un domaine (le scellement au repos) que le lot ne touchait pas. Un lot qui
ne fait tomber que les suites de son propre domaine n'a pas encore été mesuré.
