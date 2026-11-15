## Leçon 494 — Un témoin qui juge l'ATTRIBUT ne juge pas ce que l'utilisateur PERÇOIT

Le point d'état du fil v3 portait `data-etat` et un libellé hors-écran. Quatre
épreuves e2e vérifiaient l'attribut à chaque transition ; **aucune ne regardait
le libellé**, et le module ne l'écrivait donc jamais. Le document naissait en
« Temps réel : pas encore actif » — servi par le serveur, ce qui est vrai à
l'ouverture — et l'annonçait **pour toute la vie de la page**, y compris sur un
fil parfaitement vivant. Un `aria-live` figé sur le contraire de ce qu'il
montre est pire qu'un `aria-live` absent.

Le même angle mort avait une seconde moitié, visuelle : `inconnu` et `creux`
partageaient le MÊME rendu — un point creux —, donc « le module n'est jamais
arrivé » était indiscernable de « il respire ». C'est ce qui a rendu une image
périmée en staging invisible pendant tout un tour : la page se dégradait en
Post/Redirect/Get, exactement comme prévu par l'amélioration progressive, sans
qu'aucun témoin — à l'écran, dans l'arbre d'accessibilité ou dans la CI — ne
dise pourquoi. **Une dégradation gracieuse qui ne se DIT pas est un mystère,
pas une dégradation.**

La question à poser à tout témoin d'état n'est donc pas « l'attribut est-il
posé ? » mais **« un être humain, avec ou sans yeux, peut-il distinguer cet
état du voisin ? »**. Et l'assertion se place dans le HARNAIS que toutes les
épreuves traversent (`attendLeTempsReel`), jamais dans une seule : c'est le
seul endroit où la divergence entre l'attribut et le nom se voit à chaque
passage.
