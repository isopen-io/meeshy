# Itération 163 — `PUT /messages/:messageId` : le fix « caption vide » reste mort en prod (AJV `minLength: 1`)

## Current state
Le commit `8fcdc13` (#1803, « allow empty content on message edit for attachment
caption removal ») a apporté la parité REST/socket pour la suppression de légende :
un edit à contenu vide est autorisé quand le message porte des pièces jointes.

Côté REST (`PUT /conversations/:id/messages/:messageId`,
`services/gateway/src/routes/conversations/messages-advanced.ts`), le fix a :
- relâché le schéma **Zod** `EditMessageBodySchema` (`z.string().max(10000)`, plus de `.min(1)`) ;
- déplacé la décision de vacuité dans le handler via le garde
  `hasAttachments` (`if ((!content || content.trim().length === 0) && !hasAttachments)`).

Mais le schéma **Fastify AJV** `schema.body` de la route est resté inchangé, avec
`content: { type: 'string', minLength: 1 }`.

## Problems identified
Dans le cycle de vie d'une requête Fastify, la validation de schéma AJV s'exécute
**avant** `preHandler`/handler (`preValidation → validation → preHandler → handler`).
Un edit de suppression de légende (contenu vide sur un message avec pièce jointe)
est donc rejeté par un **400 AJV** au niveau du schéma, et le handler — avec son
garde `hasAttachments` et le re-parse Zod permissif — n'est **jamais atteint**.

La fonctionnalité que le commit `8fcdc13` voulait activer sur REST **reste morte
en production**.

## Root cause
Le fix a relâché la couche Zod (re-parse *à l'intérieur* du handler) mais a oublié
la couche AJV `schema.body`, qui est la **première** barrière de validation et
s'applique en amont. C'est exactement la classe de bug que ce même commit a corrigée
côté socket (le `.min(1)` de `SocketMessageEditSchema` masquait la branche
`hasAttachments`) — répétée une couche plus haut sur le chemin REST.

## Business impact
Feature messagerie (Priorité 1). Sur web/mobile via REST, effacer la légende d'une
photo/audio/fichier tout en gardant le média échoue avec une erreur de validation
opaque. La parité socket/REST annoncée par #1803 n'existe pas sur le chemin REST.

## Technical impact
Branche `hasAttachments` du handler REST **inaccessible** pour un contenu vide.
Divergence silencieuse socket ↔ REST. Le re-parse Zod permissif (`safeParse`) devient
du code mort pour la casse « contenu vide ».

## Risk assessment
Faible. Le changement retire une contrainte de longueur minimale et conserve la
borne max (10 000) plus `required: ['content']`. La vacuité reste gardée par le
handler (`hasAttachments`) — un message SANS pièce jointe et à contenu vide reste
rejeté par un 400 explicite (« Message content cannot be empty »). Aucun élargissement
de surface d'attaque : la longueur max et la présence de la clé restent imposées.

## Why the tests didn't catch it
La suite `conversation-messages-advanced.test.ts` invoque la **fonction handler
directement** (`getHandler(...)`), ce qui court-circuite la validation AJV
`schema.body` de Fastify. Les cas « empty content succeeds when the message has
attachments » passaient donc au niveau handler alors que la production rejetait la
requête une couche au-dessus — un faux vert, la même faille « le schéma au bord
masque la branche » que #1803 avait pointée pour le socket.

## Proposed improvements
1. Extraire le schéma AJV du body dans une constante exportée
   `editMessageBodyJsonSchema` (source unique référencée par la route ET les tests).
2. Corriger `content: { minLength: 1 }` → `content: { maxLength: 10000 }` pour
   refléter fidèlement `EditMessageBodySchema` (`z.string().max(10000)`).
3. Ajouter une régression **fidèle** via un vrai Fastify + `inject()`
   (`edit-message-body-schema.test.ts`) qui applique réellement la couche AJV.

## Expected benefits
- Parité socket/REST rétablie pour la suppression de légende.
- Branche `hasAttachments` du handler REST enfin atteignable.
- Garde-fou de régression au niveau du bord AJV (impossible de re-figer `.min(1)`).

## Implementation complexity
Très faible : ~15 lignes (extraction schéma + une contrainte), + un fichier de test
inject de ~65 lignes.

## Validation criteria
- RED : avec `minLength: 1`, le test inject « accepts empty content » échoue
  (400 au lieu de 200) — **vérifié** (2 cas en échec dont la borne max).
- GREEN : `edit-message-body-schema.test.ts` 5/5, `conversation-messages-advanced`
  101/101, `tsc --noEmit` propre — **vérifié**.
- Contrat inchangé côté handler : contenu vide sans pièce jointe toujours rejeté.

## Notes / hors périmètre
- La route sœur `PATCH /messages/:messageId` garde `minLength: 1` : elle fait un
  `content.trim()` inconditionnel sans garde `hasAttachments`, donc sa contrainte
  reste cohérente avec son contrat (pas de chemin « légende vide »). Non modifiée.
- `PostCommentService.deleteComment` laisse des lignes `CommentReaction` orphelines
  sur les commentaires soft-deleted (n'appelle pas `deleteCommentReactions`). Faible
  impact (pas de casse d'invariant `commentCount`) — candidat pour une itération future.
