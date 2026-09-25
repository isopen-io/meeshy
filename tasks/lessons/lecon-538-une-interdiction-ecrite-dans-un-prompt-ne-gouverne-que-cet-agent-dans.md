## Leçon 538 — Une interdiction écrite dans UN prompt ne gouverne que cet agent ; dans un arbre partagé, chaque rôle qui écrit la porte

Constat du 2026-09-05 (tour 2 du workflow web v3) : « Ne commit PAS : la phase
Livrer s'en charge » n'était écrit que dans le prompt du DÉVELOPPEUR. Un agent
de correction a commité et poussé 85 fichiers — trois travaux — sous le titre
d'une seule issue ; un correcteur de gates a récidivé ; l'agent de documentation
a commité à son tour. Aucun n'avait désobéi : la règle ne leur avait jamais été
dite. Pendant ce temps, le porteur demandait l'inverse pour la BRANCHE — « il
faut commiter régulièrement et se synchroniser avec les activités distantes » :
dev avait reçu 1 335 puis 24 commits d'autres sessions sur les mêmes écrans, et
le tour ne le relisait qu'au départ et avant les gates.

**La règle.**
1. Une consigne qui gouverne une RESSOURCE PARTAGÉE (l'arbre, la branche, un
   port) se déclare UNE fois et s'injecte dans le prompt de CHAQUE rôle qui
   touche cette ressource — jamais dans un seul. Le témoin : lister les rôles
   qui écrivent, puis vérifier que chacun porte la consigne.
2. « Ne commit pas » (l'agent) et « commiter régulièrement » (la branche) ne se
   contredisent pas : ce sont deux niveaux. Les agents laissent l'arbre ; une
   phase mécanique, à des moments FIXES (avant chaque travail, avant les
   gates), commite l'arbre en point d'étape, fusionne `origin/dev`, pousse — et
   remet au travail suivant ce que les sessions voisines ont bougé.
3. `git stash` n'est pas l'outil de cette phase dans un arbre partagé (leçon
   527) : le point d'étape est un COMMIT, que la PR porte tel quel ; le
   `Closes #n` va alors dans le corps de la PR, jamais dans un commit vide.
4. Un gate rouge sur TOUTE la matrice — y compris des écrans que le tour n'a pas
   touchés — n'est pas un rouge du tour : il ne retient pas la livraison, il se
   DIT dans la PR avec l'issue qui le porte. Le tour 2 est resté sans PR une
   heure pour l'avoir lu autrement.
