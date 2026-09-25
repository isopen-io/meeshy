## Leçon 77 — Deux chemins qui appliquent la même règle ne l'appliquent pas au même INSTANT, et c'est correct (2026-08-10, routine messaging, cycle 55)

Le retrait interactif d'un post coupe ses liens de partage au SOFT-delete ; le balayage du contenu
éphémère les coupe au HARD-delete. La première lecture y voit une incohérence — deux chemins, une
règle, deux moments — et pousse à aligner le second sur le premier.

C'est cohérent, et la formulation qui le montre est la seule qui vaille : **chaque chemin agit au
moment où SON contenu devient définitivement inatteignable par SON propre chemin.** Un post non
éphémère n'est jamais hard-deleté — il reste soft-deleté pour toujours, donc le retrait interactif
n'a pas d'instant ultérieur où agir. Un post éphémère, lui, est réellement détruit, et c'est cette
destruction qui condamne le lien.

La leçon de méthode est sur la formulation, pas sur le cas : quand deux implémentations d'une même
règle divergent sur le QUAND, chercher l'énoncé sous lequel les deux deviennent le même geste avant
de conclure qu'une des deux a tort. S'il n'existe pas, l'une a effectivement tort ; s'il existe, il
est la bonne documentation des deux — et il dit du même coup ce qui se passerait si l'un des deux
chemins changeait de nature.

Contrepartie honnête, notée dans l'ADR : l'instant théoriquement juste dans les deux cas serait le
soft-delete, et ne pas l'avoir retenu pour le balayage tient à un coût mesurable (la passe de
soft-delete est un `updateMany` sans ids matérialisés, dont la conversion imposerait une borne et
la réécriture des témoins du cycle précédent), pas à une justification de principe. **Une
justification de coût s'écrit comme telle, avec la fenêtre résiduelle chiffrée** — sinon le cycle
suivant la relira comme une justification de principe et ne rouvrira jamais le sujet. C'est
exactement le mécanisme de la leçon 76, une rubrique plus haut dans le même document.
