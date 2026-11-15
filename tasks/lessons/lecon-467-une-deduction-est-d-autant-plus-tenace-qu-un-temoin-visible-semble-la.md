## Leçon 467 — Une déduction est d'autant plus tenace qu'un TÉMOIN VISIBLE semble la confirmer

Formulation d'une session voisine, sur sa propre erreur. Elle avait affirmé que
le viewer story « pilote » son index de scène. Mesuré, cinq sites élisent la
scène 0 et aucun `@State` n'existe dans le dépôt.

**Sa raison n'était pas la paresse** : le viewer affiche une barre de progression
à SEGMENTS, qui bouge. Elle en a conclu qu'elle parcourait les scènes. Elle
parcourt les **stories du groupe** — deux notions distinctes qui produisent
exactement la même apparence à l'écran.

> **« Qu'est-ce qui bouge à l'écran ? » ne remplace jamais « quelle valeur est
> passée à ce paramètre ? »** Un mouvement visible est une preuve pour la
> question qu'il répond, et un piège pour toutes les autres. Une déduction
> qu'aucun signe ne soutient se soupçonne ; une déduction qu'un signe VRAI
> semble confirmer ne se soupçonne plus.

C'est la forme la plus coûteuse de la leçon 462 (un instrument répond à une
question voisine) : ici l'instrument est l'ÉCRAN, et il ne ment pas — c'est
l'inférence qui saute d'une notion à sa voisine, sous couvert d'une observation
juste.

Le contrôle qui l'attrape porte sur le PARAMÈTRE, jamais sur l'effet :
rechercher `@State` ou `$sceneIndex` plutôt que regarder ce qui s'anime.

**Corollaire de balayage, tiré de ma propre erreur dans le même échange :
chercher la FORME rate les autres formes du même fait.** Mon relevé cherchait
`.constant(0)` et comptait trois sites ; deux de plus passaient un littéral à un
appel direct — dont le DÉCODEUR. Cinq au total. La question était « qui élit une
scène ? » ; j'avais cherché « qui passe un binding constant ? ».
