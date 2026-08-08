---
"@meeshy/gateway": patch
---

La coche d'un message envoyé par lien de partage passe enfin de « envoyé » à « remis » — et
un destinataire anonyme cesse d'être invisible à l'accusé de livraison, sur TOUS les chemins.

Deux défauts distincts, la même racine : une obligation dont la seule implémentation est
hors de portée de celui qui la doit.

**1. Aucune des deux routes de lien n'émettait d'accusé de livraison.**
`MessageHandler.autoDeliverToOnlineRecipients` marque le message `received` pour chaque
destinataire connecté, puis émet le `read-status:updated` consolidé qui fait avancer la coche
de l'expéditeur. Les deux transports nominaux l'atteignent — le chemin WS par
`broadcastNewMessage`, le chemin REST/ZMQ par `MeeshySocketIOManager._broadcastNewMessage` —
mais elle est une méthode de `MessageHandler` (elle a besoin de `io`, `connectedUsers`, du
service de statut de lecture et de celui de confidentialité), donc invisible depuis une
route. Les deux routes d'envoi par lien (`POST /links/:identifier/messages` et son jumeau
`/messages/auth`) contournant `MessagingService.handleMessage`, l'auteur d'un message par
lien regardait une coche unique **définitivement figée**, quel que soit le nombre de pairs
assis dans la conversation. Sixième cycle consécutif sur la même racine.

**2. L'accusé excluait les participants ANONYMES par construction, y compris sur le chemin
nominal.** La sonde de présence s'écrivait `!!p.userId && connectedUsers.has(p.userId)`. Or
`AuthHandler._registerUser` indexe un inscrit par `User.id` mais un anonyme par
`Participant.id` — la seule identité qu'il possède, n'ayant pas de ligne `User`. Ce prédicat
ne pouvait donc jamais être vrai pour un anonyme : exclusion par construction, pas par
circonstance. Et l'exclusion n'était pas neutre pour l'expéditeur : `getLatestMessageSummary`
compte TOUT participant actif par `Participant.id` dans `totalMembers`. Un anonyme présent au
dénominateur et inatteignable au numérateur rendait « remis à tous » **impossible pour la
conversation entière** — soit exactement la forme de toute conversation ouverte par lien.

Correctif : la présence et les préférences se lisent désormais sous une clé unique
(`_presenceKey` = `userId ?? id`), et les préférences sont demandées avec `isAnonymous`
correctement renseigné — ce qui sert les défauts sans requête plutôt que d'envoyer un
`Participant.id` à `fetchManyFromDatabase` comme s'il s'agissait d'un `User.id`. Le paramètre
de l'unité est ramené aux deux champs qu'elle lit (`{ id, senderId }`) au lieu d'un `Message`
Prisma complet : exiger ce dont on n'a pas besoin est précisément ce qui la rendait
inatteignable depuis une route. `broadcastLinkMessage` l'appelle comme quatrième obligation,
avec le même contrat best-effort que les trois autres (deux gardes, jamais dans le chemin du
201, jamais un 500) — via un relais public du manager, pour que les trois transports partagent
une seule implémentation plutôt que trois accusés subtilement différents.

Conséquence de contrat : `ReadStatusUpdatedEventData.userId` est déclaré `string | null`,
ce qu'il était déjà en fait pour un acteur anonyme. iOS le décodait déjà en `String?` et le
web ne le lit pas — aucun client n'a à changer, et un consommateur qui compare cette valeur à
sa propre identité (synchro multi-appareils du curseur) garde le bon comportement : `null` ne
correspond à personne.
