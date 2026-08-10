---
"@meeshy/gateway": patch
---

Les messages d'appel entraient en base sans la colonne que toutes les lectures de messages vivants interrogent — ils étaient invisibles de l'aperçu de conversation, du compte de non-lus et du delta `/sync`.

Le modèle `Message` résout le piège MongoDB du soft-delete par le côté ÉCRITURE : ses ~119 lectures
filtrent `deletedAt: null`, et c'est chaque créateur qui rend ce filtre vrai en écrivant explicitement
la colonne à `null`. Sur le connecteur MongoDB de Prisma, une colonne `DateTime?` jamais écrite est
ABSENTE du document et n'apparie pas ce filtre — c'est le même piège qui, du côté LECTURE, avait vidé
feed / reels / stories en production (post-mortem en tête de `services/posts/postIncludes.ts`).

Cette convention n'était portée par aucun nom : sept `message.create` répartis dans six fichiers
répétaient le littéral, et **deux d'entre eux l'avaient perdu** — `createCallSummaryMessage` et
`createLiveCallMessage`. Les lignes qu'ils écrivaient n'étaient appariées par aucune des lectures
gardées par ce filtre :

- `emitConversationPreviewUpdate` — un « Appel audio en cours » ou un « Appel manqué » ne devenait
  jamais l'aperçu de la conversation ; la liste affichait le message précédent ;
- `MessageReadStatusService` — un résumé d'appel ne faisait monter aucun badge de non-lus ;
- le delta `/sync` — les messages d'appel n'étaient jamais livrés à la synchronisation incrémentale ;
- l'admission d'édition, de suppression et de réaction (`{ id, deletedAt: null }`) — un message
  d'appel était introuvable, donc non réactionnable ;
- les statistiques de conversation, qui ne les comptaient pas.

Les sept créateurs étalent désormais une seule constante nommée, `LIVE_MESSAGE_MARK`
(`services/messaging/liveMessage.ts`), jumeau côté écriture du `NOT_DELETED` côté lecture du modèle
`Post`. L'invariant a maintenant un endroit où être écrit une fois et un nom à chercher avant
d'ajouter un huitième créateur.
