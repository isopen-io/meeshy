## Leçon 588 — Une PR dont la preuve a été effacée par la résolution de son propre conflit garde TOUS les signes d'une PR prouvée

2026-09-12, #6154 / #6152. La PR livrait un rail de stories et citait ses gates
comme preuve : « `check-lens.mjs` § 7, `check-list-actions.mjs` § 10,
`check-curve.mjs` (cote 36) ». La résolution de son conflit contre `dev` a pris
`check-lens.mjs` **du côté de dev, à l'octet** :

```
check-lens.mjs            dansEnveloppeDuPlateau (dev)   § 7 stories (branche)   sha
  d76b5468d7 (dev)                    2                          0            6e276e8f
  76a657eacc (branche)                0                       présent         bf63ec7a
  05b07720c5 (résolution)             2                          0            6e276e8f
```

La garde d'a11y de `dev` survit — c'était le risque que l'issue nommait. **Mais
les 134 lignes que la branche ajoutait au même fichier ont disparu, et ce sont
celles qui prouvaient sa propre feature.** Le rail neuf (`stories-rail.tsx`) est
absent de l'arbre du merge, proprement : aucune référence pendante, l'arbre
compile.

> **Prendre un côté VERBATIM sur un fichier en conflit n'est pas une résolution,
> c'est un choix de camp.** Deux moitiés d'un fichier de gardes gardent des
> invariants DIFFÉRENTS : il n'existe pas de côté à garder, seulement deux
> moitiés à réunir.

Ce qui rend ce défaut plus coûteux que celui d'une branche à moitié fusionnée (où
les signaux visibles restent intacts par ACCIDENT) : ici ils restent intacts **par
construction**. Le corps de la PR cite un gate ; le gate porte toujours son nom,
côté `dev` ; le code compile ; la CI est verte. Rien de ce qu'on relit d'habitude
ne bouge. Ce qui a disparu est la seule chose que personne ne relit après un
merge : **le CONTENU du témoin.**
