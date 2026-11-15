## Leçon 34 — F73 soldé : `PATCH /messages/:messageId` (route Android) éditait le message sans jamais diffuser `message:edited` ni retraduire (2026-07-06, itération 110)

Nouvelle variante de la famille « deux routes REST jumelles répondant à la même action produit
divergent » (Leçon 26/67/68). Trois routes gateway éditent un message par ID :
`PUT /conversations/:id/messages/:messageId` (`messages-advanced.ts`), `PUT /messages/:messageId`
(`messages.ts`) et `PATCH /messages/:messageId` (`messages-advanced.ts`, décrite dans son propre
schéma OpenAPI comme « alternative to PUT /conversations/:id/messages/:messageId »). Les deux `PUT`
invalident les traductions en base, déclenchent `_processRetranslationAsync` et diffusent
`SERVER_EVENTS.MESSAGE_EDITED` sur `ROOMS.conversation`. Le `PATCH` — utilisé par le client Android
(`MessageApi.kt` : `@PATCH("messages/{id}")`) — ne faisait qu'un `prisma.message.update` puis
`sendSuccess`, avec un commentaire fantôme (« Le service de traduction sera notifié si nécessaire via
WebSocket ») ne correspondant à aucun code. Effet live : un utilisateur Android éditant un message,
toute autre session (web, iOS, autre appareil Android) dans la même conversation ne recevait jamais
la mise à jour tant qu'aucun refetch complet n'était déclenché ; les traductions déjà en cache
restaient alignées sur l'ancien contenu — violation directe du Prisme Linguistique sur ce chemin
précis. Aucun test existant ne couvrait le socket/la retraduction pour cette route (le describe
`PATCH /messages/:messageId` n'assertait que `sendSuccess`/`sendForbidden`/`sendNotFound`).

**Fix** : le handler `PATCH` inclut désormais `translations: null` dans son unique
`prisma.message.update` (une seule requête, pas de round-trip séparé comme le sibling
`messages-advanced.ts`), déclenche `fastify.translationService._processRetranslationAsync` dans un
try/catch qui n'échoue jamais l'édition, transforme `translations` en tableau via
`transformTranslationsToArray` (contrat client), et diffuse `SERVER_EVENTS.MESSAGE_EDITED` vers
`ROOMS.conversation(message.conversationId)` — strictement le même pattern que
`PUT /messages/:messages.ts`. RED→GREEN : 5 nouveaux cas dans
`conversation-messages-advanced.test.ts` (broadcast, retraduction déclenchée, retraduction en échec
n'empêche pas le succès, `socketIOManager` null → pas de broadcast mais succès) ; suite ciblée
95/95 verte. `tsc --noEmit` gateway : aucune nouvelle erreur (bruit préexistant inchangé :
`SequenceService.ts` TS2305, itération 86).

**Règle réutilisable** : quand TROIS routes (pas seulement deux) répondent à la même question
produit, l'audit de parité doit comparer les trois entre elles, pas seulement la paire la plus
visible — ici la troisième route porte dans son propre schéma OpenAPI la mention explicite d'être
une "alternative" à une autre, ce qui est un signal fort qu'elle doit être auditée pour la même
parité comportementale (pas seulement la même forme de payload). Un commentaire du type "sera notifié
si nécessaire via WebSocket" sans aucun appel `emit` associé est un marqueur quasi certain de
sibling-drift non résolu — grep `via WebSocket` / `WebSocket si nécessaire` dans les commentaires du
repo pour trouver d'autres promesses non tenues du même genre.
