## Leçon 155 — Un événement ÉMIS peut ne porter aucune information, et rien dans le code d'émission ne le dit (2026-08-13, routine messaging, cycle 117)

`deleteAllRead` faisait tout ce qu'un chemin correct fait : il purgeait, il vérifiait `count > 0`,
et il émettait. L'audit qui le lit y voit un chemin annoncé. Il ne l'est pas : l'événement émis est
`notification:counts`, et une purge des LUES ne fait bouger aucun compteur — `unread` est inchangé
par construction (les lignes qui partent sont lues), `total` n'est affiché nulle part. Zéro bit
d'information part, sous l'apparence complète d'une notification de changement.

**La règle** : pour tout événement émis après une mutation, poser la question « quelle VALEUR
change dans ce payload, du fait de cette mutation ? ». Si la réponse est « aucune », le chemin est
muet quel que soit le nombre d'`emit` qu'on y lit. La question ne se pose pas au site d'émission —
elle se pose en rapprochant la CLAUSE de la mutation (`{ isRead: true }`) du CONTENU du payload
(`{ unread, total }`). Deux fichiers, aucun symptôme, et l'`emit` qui rassure entre les deux.

**Le corollaire qui a mordu ici** : cet écart est plus grave que son jumeau du cycle 116, alors
qu'il en est le symétrique « moins visible ». Là-bas (`markAllAsRead`), `counts` recalait au moins
le badge et ne laissait dériver que les lignes ; ici il ne recale rien. **L'ordre de gravité de
deux défauts symétriques ne suit pas l'ordre de leur visibilité** — et l'intuition inverse est
précisément ce qui a laissé `deleteAllRead` ouvert un cycle de plus, une fois la fiche déjà écrite.

**Le second corollaire, sur la justification** : le geste livré des deux côtés est le même (ne pas
toucher au badge), mais sa raison change de NATURE. Au cycle 116, précaution — un cache paginé
matche moins de lignes que le serveur. Ici, conséquence du prédicat — toute ligne retirée était
lue, donc jamais comptée. Quand on porte un patron d'un cas au suivant, écrire la raison du cas
COURANT et non celle du cas source : « même chose qu'au-dessus » en commentaire aurait transmis une
précaution révisable là où il y a une impossibilité.

**Le refus qui vaut d'être testé** : égrener un `notification:deleted` par ligne aurait fermé
l'écart ET la divergence transitoire résiduelle. Refusé parce que la purge n'est pas bornée (des
milliers de lignes sur un compte ancien) et que la divergence est déjà acceptée sur l'appareil
acteur. Un tel refus est invisible dans le code livré — il ne laisse aucune trace. Le figer par un
test (`count: 1200` ⇒ zéro `notification:deleted`) est ce qui empêche une « optimisation » future
de l'annuler sans savoir qu'elle tranchait quelque chose.
