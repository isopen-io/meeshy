## Leçon 548 — Un témoin épinglé au DÉCOR tombe quand le décor change, et accuse le mécanisme

**Le fait.** Le témoin hors-ligne de la v3.1 ouvrait le fil en cliquant
`getByRole('link', { name: /Equipe produit/ })`. En remplaçant la projection
locale des types par ceux de `@meeshy/shared` (#5493), la fixture a changé de
titres. Le témoin a rendu :

```
visite 3 HORS LIGNE    titre "ECHEC : locator.click: Timeout 30000ms exceeded."
fil ouvert hors ligne  NON
```

C'est-à-dire **« l'application ne s'ouvre plus réseau coupé »** — une panne
majeure, annoncée avec l'assurance d'une mesure. Le hors-ligne était intact :
seul le NOM d'une conversation avait bougé.

**Le coût réel du défaut n'est pas le temps perdu à diagnostiquer.** C'est
qu'un témoin qui a déjà crié au loup sur un changement anodin sera, la fois
suivante, soupçonné avant le code. Un gate perd son autorité par faux positif
beaucoup plus vite qu'il ne la gagne par vrai positif.

**La règle.** Un témoin s'ancre sur ce qu'il MESURE, jamais sur ce qui
l'entoure. Ici la question est « une navigation interne touche-t-elle le
réseau ? » — elle ne dit rien du titre de la conversation. `[data-row] a`
premier élément répond exactement à la question posée et survit à toute
fixture ; `/Equipe produit/` répondait à une autre.

**Comment le repérer AVANT qu'il tombe.** Relire ses sélecteurs et demander,
pour chacun : *si cette chaîne change demain sans qu'aucun comportement ne
bouge, le témoin rougit-il ?* Un `getByText`, un titre, une date, un compte
d'éléments, un libellé de bouton sont autant d'ancrages sur le décor. Les
ancrages sûrs sont structurels (`[data-*]`, rôle + position) ou fonctionnels
(la présence du composeur, qui EST la preuve que l'écran s'est monté — ce même
témoin l'avait déjà appris en abandonnant le séparateur de jour, qui le faisait
tomber à minuit).

**Corollaire.** Ce défaut appartient à la même famille que la leçon 547 : un
renommage traverse le code ET les chaînes, et les chaînes des TÉMOINS sont
celles qu'on relit le moins — précisément parce qu'on les croit du test, pas du
produit.
