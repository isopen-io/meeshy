## Leçon 239 — une liste de fins de vie ne couvre que les fins de l'OBJET, jamais celles de son CONTENEUR (2026-08-18, routine messagerie, cycle 73)

### Le fait

`LocationHandler` documente **trois** fins de vie d'un partage de position, les
traite toutes les trois, et les nomme par leur mécanisme : le socket meurt, le
terme arrive, la passerelle redémarre. La liste est juste, complète, soignée —
et une quatrième manquait : **la clôture de la conversation qui porte le
partage**. Aucun des trois chemins de clôture n'éteignait quoi que ce soit ; ils
annonçaient, et c'est tout.

Le coût dépassait celui des trois fins traitées, parce que la clôture ajoute ce
qu'aucune d'elles n'ajoute : **le propriétaire ne peut plus l'arrêter lui-même.**
Les clients retirent la conversation de leur cache sur `conversation:closed` et
`GET /conversations` filtre `isActive: true` — le fil disparaît de tous les
écrans, avec dedans l'unique commande d'arrêt. Une position réelle continuait
d'être diffusée pendant des heures, sans recours.

### Pourquoi une relecture ne pouvait pas le voir

Les trois fins listées sont des fins **de l'objet**. La quatrième est une fin
**du conteneur**. Une relecture qui demande « les fins de vie sont-elles
couvertes ? » trouve une liste qui se présente comme exhaustive et s'arrête —
c'est la variante « liste plausible » du cycle 71, appliquée cette fois non à des
gardes mais à un cycle de vie.

> Devant tout état éphémère, poser DEUX questions et non une : « qu'est-ce qui
> termine cet objet ? » **et** « qu'est-ce qui termine ce qui le contient ? ».
> La seconde ne se déduit jamais de la première, et c'est toujours celle qui
> manque — parce que la liste répondant à la première a l'air complète.

### Le corollaire de conception : créer le point de convergence, pas la N-ième garde

Trois routes ferment une conversation. Y ajouter trois appels aurait reproduit
exactement la structure qui a produit les deux défauts précédents du dépôt sur ce
même geste — cycle 67 (`leave.ts` seul à n'écrire qu'`isActive: false`,
trente-sept cycles d'écart) et cycle 71 (une règle appliquée à un verbe quand
quatre l'exigeaient).

> Quand un cycle découvre qu'une décision manque à N endroits, le livrable n'est
> pas N gardes : c'est **l'unité qui rend le N-plus-unième impossible**. Le
> prochain chemin de clôture hérite de la règle parce qu'il n'y a plus qu'une
> façon d'annoncer.

### Le corollaire d'implémentation : réutiliser le terme plutôt qu'inventer un état

L'extinction **avance le terme à maintenant** — elle fait de la clôture une
expiration anticipée. Les trois propriétés du cycle de vie (mises à jour tues,
rattrapage muet, pas de double annonce) sont alors déjà écrites et déjà gardées :
**zéro ligne de mécanisme neuf**. Supprimer l'entrée, le réflexe naturel, aurait
au contraire cassé la première — le fichier pose qu'« une session INCONNUE n'est
jamais une session TERMINÉE ».

> Avant d'écrire un état « terminé », chercher si l'unité porte déjà un état qui
> SIGNIFIE terminé. Le réemployer transporte gratuitement toutes ses gardes ;
> en ajouter un second demande de les réécrire, et d'en oublier une.

### Et une leçon d'OUTIL, payée cash cette fois-ci

Pour mesurer le kill par mutation, la production a été mutée puis « restaurée »
par `git checkout -- <fichier>`. Cette commande ne défait pas la mutation : elle
restaure le fichier depuis l'INDEX, donc **efface aussi tout le travail non
commité** qu'il portait. Quatre-vingts lignes de production ont dû être
réécrites.

> Pour une mutation temporaire sur du travail non commité, l'aller-retour est
> `git stash push -- <fichiers>` / `git stash pop`, **jamais** `git checkout --`.
> Le premier a une opération inverse ; le second n'en a pas.

---
