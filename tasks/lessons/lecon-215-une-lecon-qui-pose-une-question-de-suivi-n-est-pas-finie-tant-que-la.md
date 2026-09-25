## Leçon 215 — une leçon qui pose une question de suivi n'est pas finie tant que la question n'a pas été posée à TOUS les sites (2026-08-17, routine messagerie, cycle 54-bis)

**Le constat.** La leçon 212, écrite au cycle 53, se termine par une question
explicitement qualifiée de mécanique : *quels sont TOUS les écrivains de ce que
la ligne AFFICHE ?* Le cycle 53 y a répondu — pour le seul chemin qu'il
corrigeait, le fan-out serveur. Il a même chiffré la réponse (« ici la réponse
était trois ») en la bornant, sans le dire, aux écrivains de l'événement qu'il
instruisait. Le cycle 54 a repris la même question sur le même fichier et trouvé
**cinq** écrivains locaux supplémentaires, tous porteurs du même défaut, dont un
— `link:message:new` — que **rien** ne rattrapait, le gateway ayant délibérément
renoncé à lui envoyer le jumeau qui corrige les quatre autres.

**Pourquoi la question n'avait pas été reposée.** Parce qu'une leçon se lit comme
un compte rendu de ce qui a été corrigé, pas comme un outil à réappliquer. Elle
finit par une règle, et une règle donne le sentiment que le travail est fait :
elle protège l'AVENIR. Or une question mécanique posée à la fin d'un cycle est
aussi une dette sur le PASSÉ — tous les sites auxquels elle n'a pas encore été
posée. Le cycle 53 a fermé un chemin et écrit la règle qui l'aurait évité ; il
n'a pas énuméré les chemins voisins auxquels la même règle s'appliquait déjà.

**L'aggravant, et il est structurel.** La question « qui écrit ce que l'écran
affiche ? » n'a pas de réponse locale : elle se pose sur un FICHIER, voire sur un
écran, jamais sur la fonction qu'on vient de corriger. Un cycle qui l'instruit
depuis le site du défaut la répond donc toujours trop étroitement — non par
négligence, mais parce que le site du défaut est le mauvais point de vue pour
elle. Elle demande de partir du RENDU (`ConversationItem` lit deux champs) et de
remonter vers les écrivains, pas de partir d'un écrivain et de regarder ce qu'il
touche.

**La règle.** Quand un cycle produit une leçon dont l'énoncé contient une
question mécanique, la question devient un ITEM DE BACKLOG à part entière, pas
une morale de fin de texte. Le cycle suivant la repose — depuis le point de vue
qu'elle exige, pas depuis celui du défaut d'origine — et **énumère**, avant de
chercher un défaut nouveau ailleurs. Corollaire opérationnel : une réponse à une
telle question doit toujours être écrite comme un TABLEAU de sites avec la
colonne du critère, jamais comme un nombre en prose. « La réponse était trois »
ne se vérifie pas ; cinq lignes avec « écrit l'objet / écrit la carte » se
vérifient, et laissent voir ce qu'elles ne couvrent pas.

**Le corollaire — un commentaire qui justifie une ABSENCE d'événement est un site
de la même classe.** `broadcastLinkMessage` explique ne pas émettre
`conversation:updated` parce que « the clients already applied it ». La phrase
nomme une DONNÉE (l'aperçu) et un CLIENT, pas un CHEMIN et un AFFICHAGE — exactement
le défaut de formulation que la leçon 212 avait déjà relevé sur « le web est
indemne ». Toute justification d'une absence de fan-out doit donc être relue avec
la même question : *applied ce que, exactement, et est-ce tout ce que l'écran
lit ?* Ici, la réponse était « l'objet, oui ; la carte du Prisme, non » — et c'est
sur ce chemin-là, le seul sans filet, que le défaut était durable au lieu d'être
transitoire.
