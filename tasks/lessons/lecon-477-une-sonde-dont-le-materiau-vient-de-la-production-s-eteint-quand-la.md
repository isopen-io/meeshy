## Leçon 477 — Une sonde dont le matériau vient de la PRODUCTION s'éteint quand la production grandit

**Le fait (2026-09-03, #4933).** Le self-test de `check-v3-pipeline.mjs` a rendu
`AVEUGLE` sur une sonde qui n'avait rien de cassé : la livraison de l'écran
`/links` venait de faire de la v3 le serveur de `/links`, et la sonde tirait sa
victime de la liste des routes que le legacy sert SEUL.

Le garde qu'elle éprouve est juste : « un `PathPrefix` sans barre finale emporte
ses voisins de CHAÎNE » — `PathPrefix(`/l`)` prend `/links` et `/login`. Pour le
faire rougir, la sonde retirait la barre de `PathPrefix(`/l/`)` et attendait le
nom d'une victime. Cette victime a changé DEUX fois :

| cycle | victime nommée | ce qui l'a tuée |
|---|---|---|
| — | `/login` | la v3 s'est mise à servir `/login` |
| — | `/links` | la v3 s'est mise à servir `/links` |
| 2026-09-03 | *plus aucune* | `/l`, `/links`, `/login` sont les TROIS routes du legacy en `/l`, et la zone les sert toutes |

**Ce qui rend la leçon coûteuse : le commentaire du second changement décrivait
déjà le mécanisme.** Il disait, mot pour mot, « `/links`, lui, reste au legacy :
c'est la victime qui SUBSISTE, et la sonde suit la réalité plutôt que sa
formulation d'origine ». Le diagnostic était exact et la conclusion s'est
arrêtée un cran trop tôt : **une victime qui subsiste est une victime en
sursis.** Constater qu'un fusible a fondu pour la seconde fois par la même cause
et le remplacer par un fusible identique, c'est programmer la troisième.

> **Un fusible ne doit pas se déclencher par CROISSANCE.** Une sonde de mutation
> éprouve une LOI ; si son matériau est un fait de production — une route
> existante, une date de feuille de route, un compte, un nom de fichier —, elle
> s'éteint le jour où la production change sans que rien n'ait régressé. Et
> comme elle s'éteint en rendant `AVEUGLE`, elle ressemble à un garde cassé :
> on cherche le défaut du côté du garde, pas du côté du décor.

**Le remède est de FABRIQUER le matériau.** Un monde muté est fait pour ça : la
sonde ajoute elle-même le voisin (`world.legacyRoutes = [...world.legacyRoutes,
'/l-voisine-du-legacy']`) au lieu d'en emprunter un au dépôt. Elle reste vraie
quel que soit le nombre d'écrans que la v3 finira par servir — et le garde, lui,
continue de lire les VRAIES routes, ce qui est son travail.

Voisines : la sonde de `/aucun-ecran-ne-sert-ceci`, déplacée pour la même raison
un lot plus tôt (« un fusible dont le calibre est une DATE de la feuille de route
s'éteint le jour où la feuille de route y arrive ») — et, une couche plus haut,
la règle du dépôt sur les doubles de test qui ACCEPTENT ce que la production
refuse : dans les deux cas c'est le DÉCOR du témoin, jamais son assertion, qui
décide s'il pourra encore tomber demain.
