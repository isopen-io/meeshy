## Leçon 549 — `justify-content: flex-end` rend le débordement du HAUT injoignable, sans rien dire

**Le fait.** Le fil de la v3.1 défilait dans un `<main class="flex flex-col
justify-end overflow-y-auto">`. En le virtualisant, sa liste est passée à une
hauteur explicite de 46 175 px. Mesuré dans le navigateur :

```
ol.offsetHeight   46175
main.scrollHeight   708      ← sa hauteur VISIBLE
```

Le fil entier était injoignable. Aucune erreur, aucun avertissement, aucune
règle CSS invalide : `justify-content: flex-end` pousse le contenu vers la fin,
et ce qui dépasse par le DÉBUT sort de la zone de défilement — le navigateur
ne crée pas d'overflow atteignable de ce côté. La liste se rendait, les
cellules étaient là, le virtualiseur croyait être en haut du fil parce que
`scrollTop` ne pouvait jamais quitter 0.

**La règle.** Pour ancrer un contenu en bas d'un conteneur défilant, employer
`margin-block-start: auto` sur l'enfant, **jamais** `justify-content: flex-end`
sur le conteneur. La marge automatique donne le même effet quand le contenu est
court et se réduit à zéro quand il est long, ce qui laisse un débordement
normal. C'est exactement le cas d'un fil de conversation, et c'est pourquoi le
piège s'y présente.

**Ce qui l'a attrapé, et ce qui ne l'a pas fait.** Ni `tsc`, ni les tests, ni
l'œil : sur sept messages de fixture, le contenu tient dans l'écran et rien ne
déborde. Il a fallu un témoin qui monte **cinq cents** messages et lise
`scrollHeight`. **Un défaut de débordement ne se voit pas tant que rien ne
déborde** — la fixture nominale est précisément le jeu de données qui le cache.

**Corollaire, et c'est le même que la leçon du `flexShrink: 0` de la Lentille
(rangées mesurées à 31 px au lieu de 84).** Un enfant flex de dimension
explicite est comprimé ou déplacé par son conteneur sans que la dimension
écrite change : `style.height` dit 46 175, `offsetHeight` dit 46 175, et la
zone de défilement dit 708. **Lire la propriété qu'on a écrite ne prouve
rien ; il faut lire celle que le navigateur en tire.**

**Et sur le témoin lui-même.** Sa première version mesurait la stabilité de la
HAUTEUR TOTALE du fil pendant le défilement, et déclarait le virtualiseur cassé
(25 502 px de dérive). C'était le mauvais invariant : dans un fil virtualisé la
hauteur totale change forcément — les estimations cèdent la place aux mesures
réelles, il n'y a pas d'autre façon de connaître la taille de cellules qu'on ne
monte pas. Ce qui ne doit pas bouger, c'est **ce que l'utilisateur regarde** :
une cellule visible reste où elle est, et le virtualiseur corrige `scrollTop`
pour ça. **Un témoin qui mesure la mauvaise invariance condamne le code qui
fait exactement son travail** — et il le fait avec l'assurance d'une mesure.
