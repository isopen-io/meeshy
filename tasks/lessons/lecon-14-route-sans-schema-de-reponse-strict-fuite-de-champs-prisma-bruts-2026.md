## Leçon 14 — Route sans schema de réponse strict = fuite de champs Prisma bruts (2026-07-03, routine calling-feature)

`GET /conversations/:conversationId/active-call` (`services/gateway/src/routes/calls.ts`) contournait un
bug connu `fast-json-stringify` (`oneOf: [schema, {type:'null'}]` crashe quand la valeur est `null`) en
supprimant TOUT schema sur `data` (`additionalProperties: true`) au lieu de corriger la vraie cause. Effet
de bord non anticipé : les 5 routes soeurs (`callSessionSchema` en whitelist stricte) filtrent déjà tout
champ non déclaré côté serializer Fastify, mais celle-ci sérialisait le document Prisma brut — quand un
nouveau champ privé (`CallParticipant.analytics`, télémétrie WebRTC) a été ajouté au schema Prisma des
mois plus tard, il a fuité silencieusement vers n'importe quel membre de la conversation (authz =
membership, pas participation à CET appel précis) sans qu'aucun diff ne touche cette route. **Règle : un
contournement de bug de sérialisation qui désactive le filtrage de champs (`additionalProperties: true`,
schema absent sur une branche `oneOf`) est une dette de sécurité latente — elle ne fuite rien AU MOMENT du
contournement, mais fuite automatiquement le prochain champ sensible ajouté ailleurs dans le modèle, sans
qu'aucun reviewer ne relise cette route.** Fix correct pour `oneOf`+`null` : `nullable: true` directement
sur le schema objet (pas de `oneOf`) — évite le bug fast-json-stringify tout en gardant le filtrage.
Vérifié par script Node autonome sur `fast-json-stringify` avant d'écrire le test Jest (plus rapide que
d'itérer sur un test complet pour valider le comportement d'une lib de sérialisation).

**Piège de test associé** : un test qui boote un VRAI Fastify + `.inject()` (nécessaire ici — les tests
existants du fichier, `calls-routes.test.ts`, mockent `sendSuccess` ET
`@meeshy/shared/types/api-schemas` en stubs `{type:'object'}`, donc ne peuvent PAS attraper un bug de
sérialisation) exige que CHAQUE mock de hook `preValidation`/`onRequest` soit une vraie fonction
`async (request) => {...}`, jamais un `jest.fn()` nu à 0 argument — sous dispatch Fastify réel (pas
l'extraction-et-appel-direct des tests `getRoute`), un stub nu fait `.inject()` **hang indéfiniment**
(pas d'erreur, pas de timeout explicite avant celui de Jest) sans qu'aucun mock en aval (prisma, service)
ne soit jamais invoqué — symptôme distinctif à chercher en premier sur tout futur test `.inject()`-based.
