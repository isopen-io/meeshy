## 2026-11-21 — Une preuve de CI porte sur une TÊTE, pas sur une branche (#20111, routine messagerie, cycle 204)

**Voisine, et à lire avec elle** :
`tasks/lessons/2026-11-21-un-redispatch-de-ci-tue-le-run-precedent-du-meme-ref.md`,
écrite le même jour par une autre session. Celle-ci en est la moitié que son
constat n° 3 annonce (« une PR a été fusionnée sans qu'aucun run n'ait mesuré sa
tête finale ») vue depuis le lot qui a failli la payer.

### Le fait

Run dispatché vert, **26 jobs sur 26**, sur `a3e8f058a`. Puis la directive du
2026-11-15 (#18654) a exigé de fusionner `dev` — qui avait avancé de 18
commits — et de rejouer les gates sur l'arbre fusionné. La fusion a été propre,
**sans aucun fichier en commun** entre les 18 commits de `dev` et le lot.

La tête est devenue `2344246f3`. Le run vert, lui, porte toujours sur
`a3e8f058a` — et c'est un autre arbre.

> **Un run vert n'est pas une propriété de la branche, c'est une propriété d'un
> SHA.** La fusion qui rend la branche fusionnable est exactement le geste qui
> périme sa preuve, et les deux arrivent dans le même mouvement. La question à
> poser avant toute fusion : **le run dont je me sers a-t-il tourné sur la tête
> que je vais fusionner ?**

### Pourquoi « aucun chevauchement de fichiers » ne suffit pas

C'était la tentation, et elle est raisonnable : si `dev` ne touche aucun de mes
fichiers et que je ne touche aucun des siens, que peut casser la fusion ?

Des choses mesurables : un cliquet d'inventaire que `dev` a resserré et qu'un de
mes fichiers alimente désormais ; une garde de texte que `dev` a ajoutée et que
mon doc-comment viole ; un budget de lignes que `dev` a abaissé ; une
dépendance que `dev` a montée et dont mon paquet dépend. **Aucune de ces
collisions n'apparaît dans un `comm -12` de noms de fichiers**, parce qu'aucune
n'est une collision de FICHIER — ce sont des collisions de RÈGLE.

C'est le même raisonnement que le dépôt condamne ailleurs : « un audit qui liste
des `select:` ne liste pas des fuites ». Un diff de noms de fichiers ne liste pas
des incompatibilités.

### Le piège de cadence, et comment ne pas y rester

`dev` bouge plus vite qu'un cycle de CI ne dure (ici : 18 commits en ~50
minutes). Fusionner `dev` puis attendre un run peut donc ne jamais converger, et
c'est la vraie difficulté — pas la règle.

Ce qui marche : **fusionner, dispatcher, et ne plus toucher à la branche**
jusqu'au verdict. Le risque résiduel est que `dev` ait encore bougé à l'arrivée ;
il est acceptable parce que `dev` est elle-même mesurée à chaque poussée
(`cancel-in-progress: false` l'exempte), donc la fusion d'un arbre prouvé dans un
arbre prouvé est un pari borné — pas une preuve, un pari borné, et il faut le
DIRE plutôt que de le présenter comme un vert.

Ce qui ne marche pas : re-dispatcher pour une raison cosmétique pendant l'attente
(un commit de journal, une correction de documentation). Chaque dispatch **tue**
le run en vol du même ref — c'est la leçon voisine — donc il repousse le verdict
qu'on attend tout en semant un `Verdict CI` rouge sur la PR.

### Corollaire : devant un `Verdict CI` rouge, lire le `conclusion` du run PARENT

La leçon voisine le dit, et cette session l'a vérifié dans l'autre sens, ce qui
vaut d'être ajouté : `cancelled` ⇒ il n'y a rien à chercher **dans le code**, mais
il y a quelque chose à chercher **dehors**. Ici, onze runs sur sept branches et
quatre workflows ont été annulés dans la même minute, `dev` comprise. Le groupe
de concurrence est keyé par ref : il ne peut pas produire cela. Des annulations
manuelles concurrentes, elles, oui — et la leçon voisine en avoue quatre.

> Une annulation qui frappe plusieurs refs à la fois n'est jamais un effet de
> concurrence : c'est quelqu'un. Compter les refs touchés distingue les deux en
> une requête.
