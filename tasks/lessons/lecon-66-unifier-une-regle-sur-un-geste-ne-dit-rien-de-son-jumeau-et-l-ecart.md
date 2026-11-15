## Leçon 66 — Unifier une règle sur un geste ne dit RIEN de son jumeau, et l'écart devient invisible (2026-08-09, routine messaging, cycle 38)

Les cycles 33/34 ont unifié « qui peut ÉDITER un message » dans `messageEditAdmission.ts`, avec un
en-tête, un tableau des divergences, une suite de tests dédiée. Le cycle 37 a corrigé un site que cet
élargissement avait périmé. Trois cycles sur l'édition, et **personne n'a regardé la suppression** :
`messageDeleteAdmission.ts` n'existait pas, et les **trois** transports de suppression portaient
chacun leur copie de la règle, divergentes sur trois points — dont un visible de l'utilisateur (le
même geste réussissait sur Android et retournait 403 sur iPhone) et un de sécurité (un membre parti,
donc `isActive: false`, gardait le rôle de modération qu'il y avait porté).

**La règle.** Quand on extrait une règle recopiée dans une unité partagée, le geste **jumeau** —
edit/delete, create/update, add/remove, pin/unpin — est le premier endroit à auditer ensuite, pas le
dernier. Les copies d'un jumeau ont exactement la même raison d'avoir dérivé (mêmes transports, mêmes
auteurs, même absence de test), et l'unification de l'un **rend l'autre plus difficile à voir** : le
répertoire contient désormais un fichier qui a l'air de traiter le sujet, avec un nom rassurant et une
documentation soignée. `grep admission` rend un résultat, et l'audit passe.

**Le corollaire qui a coûté le plus cher ici.** Le cycle 37 avait écrit, en toutes lettres : « quand
on corrige un chemin dont il existe un jumeau évident (edit/delete…), écrire le test des DEUX côtés ».
Il l'a fait — pour la file de rejeu hors ligne, le site précis qu'il corrigeait. Il n'a pas remonté
d'un cran : **le jumeau d'un SITE n'est pas le jumeau du GESTE.** Tester `handleMessageDelete` sur le
point qu'on vient de corriger ailleurs ne dit rien de la règle d'admission que ce même handler
applique quinze lignes plus haut. Quand on écrit « j'ai couvert le jumeau », préciser le jumeau de
QUOI — du site, ou du geste.

**Trois symptômes qui désignaient la copie, et qu'on peut chercher directement :**

1. **Un commentaire qui nomme le bon champ à côté d'un code qui lit l'autre.** La route iOS/web
   annonçait « les modérateurs/admins de CETTE conversation » et lisait `membership.user.role` — le
   rôle GLOBAL. Le commentaire décrivait l'INTENTION ; il se lit comme une description du code, et
   trois relectures l'ont cru. (Leçon 64, troisième occurrence.) **Deux espaces de rôles qui ne
   diffèrent que par la casse — `Participant.role` en minuscules, `User.role` en majuscules — sont
   une machine à produire ce défaut** : les deux comparaisons compilent, aucune ne lève, et celle qui
   est fausse est simplement toujours fausse.
2. **Une jointure d'appartenance sans `isActive: true`.** Deux transports sur trois filtraient. Le
   troisième ne filtrait pas, et personne ne l'avait mesuré parce qu'aucun test ne construit un
   participant inactif. **Une permission dérivée d'une ligne d'appartenance doit se lire avec le
   filtre qui la rend vivante, sinon elle survit à la révocation du lien qui la justifiait.**
3. **Une branche de rôle qui ne peut jamais être vraie.** `role === 'CREATOR'` alors que l'enum
   `UserRole` ne le contient pas — le mot existe ailleurs dans le dépôt, comme rôle de COMMUNAUTÉ
   (`MemberRole.CREATOR`). Elle ne causait aucun bug ; elle donnait à lire une permission
   inexistante, ce qui suffit à égarer l'audit suivant. **Une valeur de rôle en dur se vérifie contre
   l'enum, pas contre le souvenir qu'on en a.**

**Sur le choix de la règle unifiée — union, jamais intersection.** Unifier N copies divergentes
oblige à choisir, et tout choix élargit certaines entrées ou en rétrécit d'autres : il n'y a pas
d'option neutre. Prendre l'**union des intentions** (ce que chaque copie CHERCHAIT à admettre, y
compris quand seule sa documentation le disait) ne retire aucune capacité que quelqu'un emprunte ;
prendre l'intersection casse silencieusement le client le plus permissif. Et quand deux copies
divergent sur une question de **produit** et non de correction — ici : un admin global doit-il agir
dans une conversation où il n'est pas ? — la trancher fait partie du travail d'un humain, pas de
celui d'une routine. **Consigner l'écart, l'implémenter dans le sens qui ne retire rien, et le dire.**

**Corollaire de refactor : un refactor qui déplace une lecture peut rouvrir le défaut du cycle
précédent.** Retirer le `include` des participants de la requête de message a supprimé la valeur d'où
le handler socket tirait le `Participant.id` de l'ACTEUR — celle que le cycle 37 avait mise là
exprès. La reconstruire depuis `message.senderId` aurait rouvert **exactement** le défaut fermé la
veille, en croyant simplifier. **Quand un refactor supprime la source d'une valeur, chercher qui la
consomme AVANT de la remplacer par ce qui est à portée de main** — ce qui est à portée de main est
généralement la propriété de l'objet muté, c'est-à-dire la mauvaise réponse (leçon du 2026-08-09
(15)). Ici, la bonne réponse était de faire rendre la valeur par l'unité qui vient de la lire.
