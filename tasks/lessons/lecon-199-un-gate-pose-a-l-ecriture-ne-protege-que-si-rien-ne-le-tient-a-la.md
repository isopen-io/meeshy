## Leçon 199 — un gate posé à l'écriture ne protège que si rien ne le tient à la lecture ; sinon il ne fait que détruire (2026-08-16, routine temps réel, cycle 45)

**Le fait.** `showReadReceipts` était consulté à DEUX niveaux pour le même
accusé de livraison : à la lecture, par `_loadReadReceiptOptOuts`, qui retire
l'opt-out des cinq lecteurs de statut ; et — sur les deux chemins socket
seulement — à l'écriture, où il coupait carrément `markMessagesAsReceived`. Le
second gate ne rendait pas le premier plus étanche : rien de ce qu'il empêchait
d'écrire n'aurait été servi. Il ne faisait que supprimer une donnée, et le même
message livré au même destinataire laissait une trace par REST et aucune par
socket.

**Pourquoi ça se lit comme une prudence.** Un gate à l'écriture *paraît*
toujours plus sûr qu'un gate à la lecture : « ce qui n'est pas en base ne peut
pas fuir » est vrai, et c'est exactement ce qui le rend difficile à
questionner. La question utile n'est pas « est-ce plus sûr ? » mais **« qu'est-ce
que ce gate ajoute à celui d'en face ? »** — et ici la réponse était : rien,
puisque le gate de lecture s'applique quoi qu'il y ait en base. *Un second gate
qui ne couvre aucun chemin que le premier laisse ouvert n'est pas une défense en
profondeur, c'est une perte de données déguisée en prudence.*

**Ce que la réversibilité change.** Le raisonnement « donnée non écrite = donnée
non divulguée » suppose que la préférence est définitive. Elle ne l'est pas :
c'est une bascule dans les réglages. Le jour où elle repasse à vrai, le gate de
lecture rend la personne à nouveau visible — et l'arriéré qu'on n'a jamais écrit
ressort « jamais livré », faisant régresser les coches de l'expéditeur.
*Un gate d'écriture transforme une préférence réversible en effet irréversible ;
un gate de lecture, non. C'est la seule différence entre les deux, et elle
tranche.*

**Le piège du déplacement.** Retirer le filtre d'avant l'écriture ne suffit pas
quand la diffusion NOMME quelqu'un. Ici le payload porte l'identité du premier
destinataire ayant acquitté, et cette liste était jusqu'alors déjà filtrée :
marquer tout le monde puis garder le premier aurait publié le nom d'un opt-out.
*Quand un filtre servait deux rôles — qui écrit, et qui est nommé — le déplacer
n'en déplace qu'un ; l'autre doit être réécrit explicitement, et c'est là qu'il
faut un témoin qui place le cas gênant en tête de liste.*

**Règle pour la suite.** Devant une préférence de confidentialité consultée à
plus d'un endroit : établir d'abord **où elle est réellement appliquée** (le
site qui décide ce qui sort du serveur), puis traiter tout autre site qui la
consulte comme suspect — soit il couvre un chemin que le premier ne couvre pas,
et il faut pouvoir le nommer, soit il détruit une donnée sans contrepartie.
Écrire toujours, taire à la sortie.
