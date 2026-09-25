## Leçon 203 — une méthode d'invalidation sur un objet construit N fois n'invalide rien (2026-08-16, routine temps réel, cycle 47)

**Le constat.** `PrivacyPreferencesService.invalidateCache(userId)` existait,
écrit et documenté (« à appeler après mise à jour des préférences »), sans un
seul appelant. Le geste évident était de le brancher depuis la route d'écriture.
Il aurait purgé **une copie sur six** : le service est construit CINQ fois dans
le processus — gestionnaire Socket.IO, singleton de présence, et un par plugin de
routes — et sa mémoire était un champ d'**instance**. Une sixième copie vivait
dans un cache statique voisin.

**Ce qui compte.** Une purge partielle ne corrige pas un défaut de fraîcheur :
*elle le rend non déterministe*, selon la porte que le client emprunte — et elle
se lit dans le code comme une garantie tenue. Elle est donc **pire** qu'une
absence de purge, qui au moins se voit.

**La règle.** *La mémoire d'une donnée vit à la portée de la DONNÉE, pas à celle
de son lecteur.* Un cache d'instance sur un service construit par plugin ou par
requête n'est pas un cache, c'est N caches. Hisser la mémoïsation au niveau
module — à côté du résolveur dont elle mémoïse le résultat — rend l'invalidation
atteignable sans câblage : la route importe une fonction, elle n'a pas à remonter
une chaîne de décorateurs Fastify pour trouver « la bonne » instance. Cette
remontée, ici, aurait été un travail réel produisant un correctif faux.

**Le signal, disponible avant de compter les instanciations.** Une API
d'invalidation SANS appelant. Elle n'a pas été écrite morte : elle est devenue
inapplicable le jour où le service s'est mis à être construit par plugin, et
personne ne pouvait plus s'en servir correctement. *Une méthode publique
d'invalidation sans appelant est un indice de portée, pas de code mort : avant de
la brancher, compter les `new` du type qui la porte. Si le compte est supérieur à
un, ce n'est pas l'appel qui manque — c'est la portée du cache qui est fausse.*

**Corollaire de test.** Cinq suites vidaient le cache statique par
`(Service as any).champPrivé.clear()`. La tentation, en unifiant, est de laisser
un shim au même nom pour ne pas les toucher. *Un nom de cache qui ment sur son
contenu rouvre exactement la confusion qu'on vient de fermer* — la statique a été
retirée et les cinq suites appellent la vraie fonction de purge.

**Généralisation.** Trois cycles consécutifs sur la même préférence ont chacun
trouvé leur défaut à une couche différente : cycle 45 le gate, cycle 46
l'adresse, cycle 47 la portée de la mémoire. *Quand une donnée traverse
écriture → stockage → cache → gate → diffusion, corriger une couche ne dit rien
des autres : la question « est-ce que ça marche maintenant ? » se pose à chaque
étape, une par une, jusqu'à ce que le chemin soit parcouru en entier.*
