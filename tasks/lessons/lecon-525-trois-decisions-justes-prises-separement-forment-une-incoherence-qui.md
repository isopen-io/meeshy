## Leçon 525 — Trois décisions justes prises séparément forment une incohérence qui n'a aucun site où rougir

Constat du 2026-09-05 (signalement porteur : « Je ne comprends pas les scènes
muettes en pause dans le feed ! », puis « repartage ou non, les scènes sont
comme les vidéos »).

Le fil social rendait le MÊME objet — un canvas 9:16 — sous **trois politiques
de lecture opposées** :

| surface | comportement | décidé par |
|---|---|---|
| réel natif, repost de réel | autoplay muet, élu par le viewport, coupé pendant un appel | la feature RF2 |
| scène composée d'un post | **figée**, avec une étiquette « scène · muette, en pause » | revue Fable n°25, « zéro AVPlayer/décodage actif ici » |
| story repartagée | **jouait en permanence**, sans élection ni call-awareness | l'embed hérité, `isPaused` laissé à son défaut |

**Chacune est défendable prise seule.** Le gel visait un objectif de
performance réel ; l'élection aussi ; l'embed hérité était antérieur aux deux.
Aucun fichier n'était faux, aucune revue n'avait tort, aucun test ne pouvait
tomber — **un test interroge un site, et le défaut n'était dans aucun site.**

Ce qui l'a rendu visible n'est pas une garde mais un ŒIL : celui du porteur,
qui voit les trois surfaces dans le même écran là où chaque commit n'en voyait
qu'une.

1. **Un défaut de COHÉRENCE se mesure entre les sites, jamais dans un site.**
   La garde qui l'attrape énumère les surfaces d'une même famille et affirme la
   propriété commune — ici `FeedSceneCoherenceGuardTests` : « toute surface qui
   monte une scène rapporte sa frame », « aucune ne joue inconditionnellement ».
   Une garde par fichier n'aurait jamais pu la dire.

2. **Un correctif de performance qui ne s'applique qu'à la surface qu'il
   corrige peut DÉGRADER le total.** Le gel évitait un décodage sur la carte de
   post pendant que la story repartagée d'à côté en lançait autant qu'il y avait
   de cellules visibles. L'élection unique — celle qu'on croyait plus coûteuse —
   plafonne à UN. Avant de défendre une optimisation locale, compter ce que font
   les VOISINS de la même famille.

3. **Une étiquette qui explique un état est un aveu.** « scène · muette, en
   pause » avait été posée sur un raisonnement juste (« un état gardé mais muet
   se lit comme une panne ») — mais elle décrivait l'état de la MACHINE, pas
   l'option du lecteur, et c'est précisément ce qu'a signalé le porteur. Quand
   une surface a besoin d'un mot pour ne pas passer pour cassée, c'est la
   surface qu'il faut changer, pas le mot.

4. **Le témoin d'un renversement se réécrit dans le même commit, et son jumeau
   survit souvent intact.** `test_isPlaying_isConstantFalse_neverToggled` est
   devenu `..._isDrivenByTheViewportElection_neverFrozen` ; mais son voisin
   « aucun `@State` de lecture local » n'a pas bougé — et il est devenu PLUS
   juste, parce que la carte ne fabrique toujours pas cet état, elle le reçoit.
   Distinguer, dans une garde qu'on renverse, ce qui portait la DÉCISION de ce
   qui portait la STRUCTURE.

5. **Corollaire mesuré le même jour : une élection tenue et servie à personne
   ne se voit nulle part.** `RootViewComponents` agrégeait les frames, élisait
   une surface, et ne remettait le coordinateur à AUCUNE carte standard — donc
   un repost de réel y restait sur son poster figé pendant que le fil voisin le
   jouait. Le mécanisme était complet, câblé, testé ; il manquait un argument
   dans un appel. Après avoir branché une valeur, compter les HÔTES qui la
   servent, pas les sites qui la produisent.
