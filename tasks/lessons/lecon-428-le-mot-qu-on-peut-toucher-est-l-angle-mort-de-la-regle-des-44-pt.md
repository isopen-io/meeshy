## Leçon 428 — Le MOT qu'on peut toucher est l'angle mort de la règle des 44 pt

**Le fait (2026-09-02).** L'invite « voir plus » de la légende partagée faisait
**54 × 16 pt** — la moitié de la hauteur minimale d'Apple. Trois taps de suite
l'ont manquée, et sur une story un tap manqué tombe dans la couche de navigation
et **change de story**.

Le même soir, à trois fichiers de là, le bouton muet du lecteur de réel porte
`minWidth: 44, minHeight: 44` depuis l'origine. Le muet du plein écran aussi.
Les boutons de rail aussi.

> **Le dépôt CONNAÎT la règle. Elle s'applique là où le contrôle est une ICÔNE,
> et se perd là où il est un MOT.**

**Pourquoi.** Une cible tactile se pense naturellement autour d'un glyphe : on
dessine un carré, on y centre une icône, la taille est une décision explicite.
Un texte cliquable, lui, prend la taille de ses caractères — personne n'a
« choisi » 16 pt de haut, c'est la hauteur de la police. La règle n'est pas
violée, elle n'est jamais **convoquée**.

**Le geste.** Chercher les cibles tactiles par ce qu'elles CONTIENNENT, pas par
ce qu'elles font : tout `Button` dont le label est un `Text` sans `frame`
explicite est suspect. L'agrandissement se fait sans déplacer un pixel —

```swift
.padding(.vertical, 14)      // 16 + 2 × 14 = 44
.contentShape(Rectangle())
.padding(.vertical, -14)     // annule le décalage visuel
```

**Le corollaire qui rend l'affaire grave** (leçon 424) : sous une couche qui
capte les touchers, une cible sous-dimensionnée ne rate pas son action, elle en
déclenche une AUTRE. Un test de cible tactile mesure la taille et ne regarde
jamais ce qu'il y a dessous — les deux défauts se composent, et aucun des deux
outils ne voit le produit des deux.
