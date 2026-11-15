## Leçon 152 — Une MÊME variable qui porte deux colonnes selon l'appelant : le filtre ne plante pas, il rend vide

Cycle 115 (`gwcontract-09`, ouverture de `GET /sync` aux sessions anonymes).

`authContext.userId` porte un `User.id` pour un compte et un `Participant.id` pour une session
anonyme. La RLS de `/sync` filtrait `Participant.userId` — qui est **NULL pour tout anonyme**.
Retirer le seul `allowAnonymous: false` aurait donc produit une route qui répond **200 avec des
streams vides**, sans erreur, sans log, sur le canal dont le métier est précisément de dire « voici
ce que tu as manqué ». Le silence aurait été indiscernable d'un « rien n'a changé » (leçon 145,
même famille).

**Le symptôme à reconnaître** : une variable dont le NOM désigne une entité (`userId`) mais dont la
VALEUR dépend de qui appelle. Elle traverse le code sans jamais se contredire, parce que rien
n'oppose son nom à la colonne qu'elle finit par filtrer. Le remède n'est pas un commentaire, c'est
une **union discriminée** — `{kind:'user', userId} | {kind:'anonymous', participantId}` — qui oblige
chaque lecteur à dire laquelle des deux colonnes il interroge, et rend la confusion inexprimable
plutôt qu'improbable.

**Corollaire — la fiche qui annonce un crash peut se tromper de mécanisme, et sa garde devient du
code mort RASSURANT.** La fiche d'audit annonçait que `currentSeq(userId)` planterait sur un
sessionToken non-ObjectId, et prescrivait une garde `/^[0-9a-f]{24}$/`. Vérification faite,
l'anonyme porte un `Participant.id`, ObjectId parfaitement valide : la garde n'aurait jamais été
franchie, et son test serait resté vert pour toujours en prouvant qu'on ne plante pas sur un cas
impossible. Le court-circuit reste, mais pour la raison qui tient debout : `UserEventSeq` est
indexée par `User.id`, donc la question n'a pas de réponse à poser. **Avant d'écrire une garde
dictée par une fiche, exécuter mentalement le chemin qu'elle décrit sur le code réel** — une garde
mal motivée survit à la revue et fossilise l'erreur d'analyse.

**Corollaire — un plancher d'historique se pose sur la colonne qui NAÎT, pas sur celle qui BOUGE.**
La même fiche prescrivait, pour interdire l'historique d'un lien `allowViewHistory:false`, de
remonter le watermark : `sinceDate = max(sinceDate, joinedAt)`. Cela ne ferme rien. `since` borne
`updatedAt` ; un message écrit AVANT la jointure et **réédité** depuis porte un `updatedAt` récent,
franchit le plancher, et repart avec tout son contenu. La borne d'un droit d'accès à l'historique
est `createdAt >= joinedAt` — exactement la colonne que la route de lecture utilise déjà. Règle
générale : **quand une borne exprime un DROIT, elle porte sur la date qui ne se réécrit pas ; une
date `@updatedAt` ne borne qu'une fenêtre de synchronisation.**

**Corollaire — la règle appartient à la LIGNE, pas au TYPE d'identité.** Le plancher de lien de
partage est porté par `Participant.shareLinkId`, que le participant soit anonyme ou inscrit. En
cherchant à ne le poser que pour les anonymes, on aurait laissé ouverte la même fuite pour tout
utilisateur inscrit entré par le même lien — un trou qui existait déjà, et qui ne se voyait pas
parce qu'on l'avait rangé sous « fiche sessions anonymes ». **Quand on s'apprête à conditionner une
règle sur un type d'identité, chercher d'abord quelle COLONNE la porte : si c'est une colonne, tous
ceux qui l'ont y ont droit.**

**Corollaire — « je n'ai pas pu lire » et « il n'y a rien à lire » ne se dégradent pas pareil.** Le
stream des disparitions personnelles annonce `truncated: true` quand sa lecture échoue (« redemande
depuis la même position »). Pour un anonyme, ce stream n'existe pas : `UserMessageDeletion` est
attachée à `User`. Le rendre `truncated` aurait fait redemander indéfiniment une page qui n'a rien à
livrer. Et pour le plancher d'historique, l'arbitrage est **inverse** de celui du masquage : le
masquage est une courtoisie (son échec dégrade vers « on sert »), le plancher est un contrôle
d'accès (son échec doit retirer les conversations concernées). **La posture d'échec se déduit de ce
que la règle PROTÈGE, jamais de ce que le module voisin fait.**

---
