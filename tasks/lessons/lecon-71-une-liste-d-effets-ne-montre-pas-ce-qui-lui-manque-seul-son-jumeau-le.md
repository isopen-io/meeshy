## Leçon 71 — Une liste d'effets ne montre pas ce qui lui manque ; seul son JUMEAU le montre (2026-08-10, routine messaging, cycle 51)

`applyPostRemovalEffects` a été créée exactement pour empêcher ce défaut : son en-tête raconte que
la console avait rattrapé un par un, à trois cycles d'intervalle, ce que le service faisait et
qu'elle ne faisait pas, et conclut « chaque omission a attendu son propre incident parce que rien ne
NOMMAIT la liste ». La liste a été écrite. Elle a nommé trois effets. Le quatrième — retirer les
notifications du post — n'y a jamais figuré, et l'unité créée contre l'oubli n'a rien signalé.

Elle ne pouvait pas. **Une liste rend visible ce qu'elle contient, jamais ce qu'elle omet** : la
relire donne trois effets cohérents, bien commentés, et aucun trou où pointer. Le nom même du
fichier (« TOUT ce qu'un retrait de post doit écrire ») décourage la question, puisqu'il affirme la
complétude.

Ce qui la rend visible existait pourtant à une ligne de distance : le commentaire de tête nomme
lui-même `applyMessageRemovalEffects` comme jumeau. **Deux listes jumelles se lisent en DIFF, pas
l'une après l'autre.** Le diff donnait immédiatement le quatrième effet, présent d'un côté depuis
deux cycles et absent de l'autre.

Règle : dès qu'un module déclare un jumeau dans son propre commentaire, la revue de ce module est
un diff avec ce jumeau. Corollaire d'audit : quand une famille de défauts se répète (ici la
cinquième ligne dénormalisée survivant à son référent), ne pas chercher l'occurrence suivante par le
mécanisme — la chercher par les PAIRES d'unités censées faire la même chose de part et d'autre d'une
frontière de domaine.
