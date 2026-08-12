---
"@meeshy/web": patch
---

Une réaction n'invalide plus la liste de conversations

Les deux handlers socket de réaction (`use-reactions-query.ts`) faisaient
`invalidateQueries({ queryKey: conversations.lists() })`, commentaire à l'appui : « réaction
ajoutée = conversation modifiée ». Deux défauts dans le même geste.

`lists()` valait `['conversations','list']` ; la sidebar lit `infinite()` =
`['conversations','infinite']`. Les deux préfixes étaient DISJOINTS : l'intention écrite n'était
jamais exécutée. Panne silencieuse, pas code mort — le commentaire faisait foi pour le prochain
lecteur.

Et l'intention elle-même est fausse : une ligne de liste ne porte rien qui dérive des réactions
(aperçu du dernier message, non-lus, horodatage). L'emoji `reaction` rendu par `ConversationList`
est la PRÉFÉRENCE de conversation, sans rapport avec les réactions de message. Rediriger vers
`infinite()` aurait donc relu toutes les pages chargées à chaque réaction — exactement le
refetch que le cycle 77 venait de retirer du chemin de focus.

Le seul cache concerné par une réaction reste celui du message, déjà mis à jour juste en dessous
par `updateReactionSummaryInMessageCache`. Le commentaire qui reste sur le site dit pourquoi il
n'y a PAS d'invalidation : un retrait silencieux inviterait le prochain lecteur à « réparer
l'invalidation manquante ».
