---
"@meeshy/gateway": patch
---

Un participant sans compte reçoit enfin les accusés de lecture et de remise de ses pairs.

L'éventail de rooms chaîné — celui qui garantit que Socket.IO ne livre qu'**une** copie à une
socket présente à la fois dans la room de conversation et dans sa room personnelle — existait
en **trois copies verbatim** : `MessageHandler.autoDeliverToOnlineRecipients`,
`routes/message-read-status.ts` et `routes/conversations/messages.ts`. Les trois portaient le
même `if (!p.userId) continue`, donc le même angle mort ; deux des trois ne chargeaient même
pas `Participant.id` (`select: { userId: true }`), si bien que l'identité de repli n'était pas
ignorée, elle n'était pas lue.

Ce n'est pas une room absente qu'elles sautaient, c'en est une qui existe. `AuthHandler` fait
rejoindre `ROOMS.user(participant.id)` à toute socket anonyme, et le commentaire qui l'a mis là
dit pourquoi : c'est « la seule room que TOUT émetteur d'événement personnel adresse
(`io.to(ROOMS.user(participant.userId ?? participant.id))`) », et l'avoir nommée autrement avait
déjà privé les anonymes de leur pastille de non-lus. La room de conversation n'est pas un
substitut — c'est même la raison d'être du chaînage : un client parti sur la liste des
conversations a quitté `conversation:<id>` et n'est plus joignable que par sa room personnelle.

Conséquence observable, sur les trois chemins : un participant anonyme n'apprenait ni qu'un
pair avait lu, ni — depuis le correctif d'accusé de remise qui vient de précéder — que la
remise qu'il venait lui-même d'acquitter avait eu lieu. Le correctif précédent l'avait fait
entrer dans le NUMÉRATEUR de `getLatestMessageSummary` sans le faire entrer dans la diffusion
qui l'annonce.

Correctif : une unité unique `emitToConversationParticipants`
(`socketio/emitToConversationParticipants.ts`) par laquelle passent désormais les trois sites,
adressant chaque participant par `userId ?? id`. La forme correcte existait déjà à un fichier
de distance, dans `emitUnreadCountsToRecipients` — c'est donc une extraction, pas une
invention. Les deux routes y perdent au passage leurs casts `any` sur l'émetteur.
