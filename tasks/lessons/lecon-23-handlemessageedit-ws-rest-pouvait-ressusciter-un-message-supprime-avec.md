## Leçon 23 — `handleMessageEdit` (WS + REST) pouvait ressusciter un message supprimé avec du contenu édité (2026-07-04, itération 94)

Audit expert (agent Explore, 27 tool-uses) sur la synchronisation temps réel du gateway, suite directe
de la Leçon 21. Parmi 4 findings (le plus fort — max-1-réaction-par-user TOCTOU sur `PostReaction`/
`CommentReaction` — nécessite une migration de schéma, différé pour un cycle isolé sans migration),
retenu : `MessageHandler.handleMessageEdit` (socket) et la route `PUT /messages/:messageId` (REST,
`routes/messages.ts`) lisaient le message avec `deletedAt: null`, décidaient l'autorisation sur ce
snapshot, puis écrivaient sans condition via `prisma.message.update({ where: { id } })` — classique
check-then-act. Un `message:delete` (ou `DELETE /messages/:messageId`) atterrissant entre la lecture et
l'écriture de l'edit n'empêche PAS ce `update` par id de réussir (il ne filtre pas sur `deletedAt`) : la
ligne soft-supprimée ressuscite avec le contenu édité, et le gateway diffuse quand même
`MESSAGE_EDITED` — un client ayant déjà retiré le message de son cache le voit réapparaître édité.

Fix, exactement le même motif que `handleMessageDelete`/`MessageReadStatusService` (Leçon 21) : remplacer
le `update` inconditionnel par un `updateMany({ where: { id, deletedAt: null }, data: {...} })` gardé,
puis brancher sur `count`. Socket handler : `count === 0` → erreur générique, aucune diffusion ; le
payload broadcasté est reconstruit localement (`{ ...champs déjà lus, content, isEdited, editedAt }`)
plutôt que depuis le retour d'`updateMany` (qui ne renvoie que `{ count }`), zéro requête
supplémentaire. Route REST : même garde, mais la réponse HTTP a toujours renvoyé la ligne complète
(toutes les colonnes scalaires, via l'`include` d'origine) — reconstruire ce payload à la main aurait
risqué d'omettre un champ (mentions, chiffrement, view-once, etc.) et de changer silencieusement le
contrat API. Choix plus sûr : après le `updateMany` gardé, un `findUniqueOrThrow` réhydrate la ligne à
jour avec le même `include: { sender: {...} }` que l'ancien `.update()` — un aller-retour DB
supplémentaire dans le cas commun, mais fidélité de contrat garantie plutôt qu'une énumération de champs
fragile.

**Piège de test répété (3 fichiers)** : chaque test qui stubait `prisma.message.update(...).mockResolvedValue(fullRow)`
et assertait dessus a dû être réécrit en `updateMany(...).mockResolvedValue({ count: 1 })` — le retour
n'est plus un message complet, donc les helpers `makeUpdatedMessage()` qui construisaient ce retour
deviennent morts une fois tous les call sites migrés (supprimés dans
`MessageHandler.core.test.ts`). Repéré par grep `prisma\.message\.update\b` scindé entre le describe
`handleMessageEdit` (à migrer) et `handleMessageDelete` (inchangé — sa propre écriture reste
volontairement non gardée, seul son recompute de `lastMessageAt` l'est, cf. Leçon précédente) : ne pas
migrer tout le fichier en aveugle. RED confirmé sur les deux fixes (`git stash` du fichier prod seul) :
le test "concurrent delete race" échoue avec `success: true`/`200` sur l'ancien code, prouvant le bug
avant le fix.

Suites vérifiées : `MessageHandlerEditDelete.test.ts` 36/36, `MessageHandler.core.test.ts` (fichier
complet) inchangé sauf edit block, `unit/routes/messages.test.ts` 32/32 (+2), `messages-extended.test.ts`
migré (mock prisma partagé). Suite complète gateway (bun, workaround `client_default` transitoire pour
lever le TS2305 baseline Leçon 20, schema restauré immédiatement après, `git diff` vide) :
506/506 suites, 13680/13681 tests (1 skip pré-existant).
