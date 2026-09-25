## Leçon 159 — Un filtre qui ne filtre que le déjà-chargé ne gaspille pas : il MENT

Cycle 123 (`GET /notifications`, onglets de la cloche web).

Sept paramètres de filtrage partaient du web vers une route qui ne les déclarait pas. Fastify les
retirait de `request.query` sans bruit. La lecture facile — celle qui a laissé l'écart ouvert un
cycle de plus — est « des octets envoyés pour rien, à nettoyer un jour ». Elle est fausse, et c'est
la SUITE qui compte : il fallait bien que quelque chose filtre, et ce quelque chose était
`matchesFilter`, appliqué **aux pages déjà chargées**.

**Sur une liste paginée, filtrer le déjà-chargé n'est pas une approximation du filtrage — c'est une
autre opération, qui rend une réponse d'une autre nature.** « Aucune mention » ne voulait pas dire
« vous n'avez pas de mention » mais « aucune mention parmi les vingt dernières notifications », et
rien n'allait chercher les autres. L'utilisateur, lui, lit la première phrase. Un onglet vide n'était
pas une réponse, c'était une fenêtre.

**Règle de reconnaissance : devant un filtre client, demander sur QUOI il s'applique. S'il s'applique
à une collection paginée, il ment — et il ment d'autant plus fort que l'utilisateur a d'historique**,
c'est-à-dire exactement chez les utilisateurs qui comptent. Le corollaire vaut pour tout chiffre
dérivé de la même collection : ici les pastilles de comptage des onglets et le sous-titre
« N notifications » mentaient de la même façon, et personne ne les avait rangés avec le filtre parce
qu'ils ne s'appellent pas « filtre ». **Un filtre et un compteur posés sur la même collection
partagent leur défaut ; corriger l'un sans l'autre laisse l'écran incohérent avec lui-même.**

**Corollaire — une signature qui accepte un paramètre non honoré est la CAUSE, pas la conséquence.**
`fetchNotifications(options: Partial<NotificationFilters> & …)` admettait `priority`,
`conversationId`, `startDate`, `endDate`, `sortBy`, `sortOrder`. Le type disait « tu peux filtrer
là-dessus » ; le serveur n'en savait rien. Tant que la signature les accepte, personne n'a de raison
de vérifier qu'ils arrivent quelque part — et un appelant futur les passera de bonne foi. Le
correctif durable n'est pas de les faire honorer (construire un filtre sans lecteur est le défaut
symétrique) : c'est de faire dire au type **ce que la route accepte réellement**, et rien d'autre.

**Corollaire — filtrer côté serveur crée un danger neuf du côté temps réel.** Le socket insérait
chaque notification dans TOUTES les listes en cache (`setQueriesData` sur un préfixe). Tant que
toutes les listes voyaient la même chose, c'était juste ; dès qu'une liste porte un filtre, l'écriture
aveugle y injecte ce que le serveur n'aurait jamais servi — le temps réel contredisant le filtre que
la liste vient d'appliquer. **Quand on rend une liste sélective, il faut relire tous ses ÉCRIVAINS,
pas seulement son lecteur.** La sélection était déjà disponible au bon endroit : dans la clé de la
query, qui la transporte par construction.

**Corollaire — deux `switch` identiques dans un même fichier ne sont pas une duplication de style.**
`countByFilter` et `matchesFilter` recopiaient ligne pour ligne le groupement d'alias
(`user_mentioned` et `mention` sous « mentions »). Rien n'avait encore divergé — mais le jour où le
filtre part au serveur, il faut envoyer CETTE table, et une table qui existe en deux exemplaires n'a
pas de nom à envoyer. La duplication ne coûtait rien tant que la règle restait locale ; elle a coûté
le droit de la déplacer.
