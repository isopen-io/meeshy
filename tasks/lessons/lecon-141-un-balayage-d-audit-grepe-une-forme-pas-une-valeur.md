## Leçon 141 — Un balayage d'audit grepe une FORME, pas une valeur

Découvert en corollaire de la leçon 140, et vérifié sur le dépôt.

`participants.ts` porte la trace explicite d'un audit d'audience passé : « Thread-only À JUSTE
TITRE, vérifié plutôt que déduit — noté ici pour qu'un prochain balayage de `to(ROOMS.conversation(`
ne le rouvre pas. » Le balayage cherchait donc cette FORME. Or les deux seules lignes du service à
composer leur room à la main — `` to(`conversation:${conversationId}`).emit('message:pinned', …) ``
— sont exactement celles qui portaient le défaut du cycle : **l'audit ne pouvait pas les voir.**

Écrire par la constante (`ROOMS.conversation()`, `SERVER_EVENTS.X`) n'est donc pas une préférence de
style : c'est ce qui rend un site VISIBLE au prochain balayage. Un site qui recompose la valeur à la
main est exclu de tous les audits futurs de sa propre famille, silencieusement, et pour toujours.

**Corollaire de vérification** : quand le correctif remplace une chaîne littérale par la constante
qui vaut la même chose, les tests existants qui assertent la chaîne LITTÉRALE sont la preuve
d'équivalence — ils doivent rester verts sans être touchés. S'il faut les modifier, la substitution
n'était pas neutre.
