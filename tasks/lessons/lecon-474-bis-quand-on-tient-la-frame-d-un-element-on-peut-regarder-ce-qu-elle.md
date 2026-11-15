## Leçon 474 bis — Quand on tient la FRAME d'un élément, on peut REGARDER ce qu'elle contient

J'ai ouvert une issue affirmant qu'un bouton était **invisible** — « une zone
tactile posée sur la rangée de stories, sans glyphe propre » — et j'ai bâti tout
son raisonnement dessus : l'auteur apprend une fausse règle *parce qu'il ne voit
rien à rater*.

Le bouton était parfaitement visible. C'était le disque à dégradé que je voyais
depuis le début et que j'avais rangé, sans y penser, dans « décoration de
l'anneau de story ».

Ce qui rend la faute évitable, et donc instructive : **j'avais ses coordonnées
exactes** — `{{19.25, 125.25}, {53.5, 53.5}}`, lues dans l'arbre d'accessibilité
et recopiées dans l'issue. Il suffisait de recadrer la capture sur cette frame et
de l'agrandir. Deux lignes :

```python
im.crop((x0, y0, x1, y1)).resize((360, 360), Image.NEAREST).save(...)
```

Je ne l'ai fait qu'en revenant corriger l'issue — après l'avoir écrite, publiée,
argumentée, et proposée comme critère de fin.

> **Une frame est une invitation à regarder, pas seulement une valeur à citer.**
> Tant qu'on ne l'a pas ouverte, ce qu'on dit de son contenu est une inférence —
> et une inférence sur un pixel se réfute en deux lignes, ce qui est le rapport
> coût/certitude le plus favorable de toute la boîte à outils.

**Et le vrai défaut, une fois regardé, était plus intéressant que celui que
j'avais écrit** : deux contrôles ont le même coin par DÉFAUT. L'un est fixe (la
pastille « Ajouter une story »), l'autre est un bouton flottant DÉPLAÇABLE dont
la position par défaut est `"0.0,0.0"`. Ils se recouvrent parce que personne n'a
eu à les placer l'un par rapport à l'autre — le produit a même prévu que
l'utilisateur déplace le second, mais rien ne lui dit qu'il doit le faire.

Corollaire, qui vaut au-delà des pixels : **une chose vue et non nommée est une
chose non vue.** J'ai regardé ce disque des dizaines de fois pendant la nuit en
le classant « décor ». Le nommer — « qu'est-ce que c'est, exactement ? » — aurait
coûté la même question que celle qui a fini par le trancher.
