# Une issue de décision encore ouverte n'est pas une décision en attente : lire ses commentaires

**Date :** 2026-10-22 · **Domaine :** pilotage, relevé d'avancement

## Ce qui s'est passé

Un bilan du chantier média a rapporté au porteur que les neuf issues de décision (#11247 à #11255) « attendaient son verdict », sur la seule foi de `state == open`. Or le porteur avait écrit son verdict en commentaire dès le 2026-10-21 (« les DÉFAUTS proposés sont validés ») sur sept d'entre elles. Il a dû rappeler que « sans perte » était déjà tranché.

## La règle

Une issue `décision-produit` reste souvent ouverte après le verdict, parce que son critère de fin (« chaque point a un verdict ») n'est pas fermé par un commit. Avant de dire qu'une décision attend quelqu'un :

1. lire les commentaires de l'issue (`gh api repos/isopen-io/meeshy/issues/<n>/comments`), pas seulement son état ;
2. distinguer les points à défaut validé des points marqués « ATTEND », qui seuls bloquent des lots ;
3. une fois le verdict écrit, fermer l'issue de décision : son état doit dire la vérité au prochain relevé.
