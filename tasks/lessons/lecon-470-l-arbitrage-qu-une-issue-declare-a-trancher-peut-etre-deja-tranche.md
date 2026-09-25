## Leçon 470 — L'arbitrage qu'une issue déclare « à trancher » peut être DÉJÀ tranché, ailleurs

#4918 proposait trois places pour la trace d'un son de fond et concluait : « entre
(1) et (2), c'est un arbitrage de disposition que la planche ou le porteur doit
rendre ». J'allais le demander. Deux des trois étaient fermées par des lois déjà
écrites dans le dépôt :

- la **(2), entrée du rail gauche**, par `ComposerRailLevel.appearsOnCanvas`,
  dont le doc-comment dit que cette question « et elle seule » décide du côté où
  une porte se pose. Un son ne se voit pas sur la toile ;
- la **(1) lue comme un calque sur la scène**, par `apps/ios/CLAUDE.md` § 1 —
  « aucun contrôle ne se pose SUR la scène » — dont la loi 6 donne la raison : un
  contrôle posé sur la scène fait mentir l'aperçu sur le rendu final. Un son de
  fond en est le cas d'école, puisqu'il ne produit AUCUN pixel.

Il ne restait qu'une place, et elle n'avait pas besoin d'un arbitrage : le
COULOIR du plateau, au niveau SLIDE de l'escalier que le bas de l'écran descend
déjà.

> **Avant de faire trancher un arbitrage, chercher s'il l'a été.** Une issue est
> écrite depuis SON sujet ; les lois qui la gouvernent sont écrites ailleurs, et
> ne se citent pas elles-mêmes. Le coût de l'omission n'est pas seulement une
> question de trop — c'est un aller-retour avec le porteur, et le risque qu'il
> tranche CONTRE une règle qu'on ne lui a pas montrée.

Corollaire vérifié dans le même lot : une session voisine était bloquée depuis
des heures sur « pourquoi mon overlay ne peint-il pas au-dessus du canvas ? ».
La réponse n'était pas technique. Elle n'avait pas le droit de le peindre.
