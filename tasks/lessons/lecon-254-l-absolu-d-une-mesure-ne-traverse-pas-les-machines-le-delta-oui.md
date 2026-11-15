## Leçon 254 — l'absolu d'une mesure ne traverse pas les machines, le delta oui

Le cliquet de dette de types (`scripts/check-type-debt.sh`) compare un COMPTE à
une baseline écrite dans le script. Mesuré le même jour, sur le même commit :
**1223 sur cette machine, 1209 sur le runner**. Quatorze erreurs d'écart, stable,
reproduit à quatre états différents du dépôt, sans rapport avec le code.

Qui remesure localement et écrit ce qu'il lit fait rougir la CI de 14 — et pire,
qui *baisse* la baseline depuis une mesure locale offre 14 points de budget de
dette à qui suivra, silencieusement.

> **Ce qui traverse les machines, c'est le DELTA, jamais l'absolu.** La bonne
> méthode : mesurer `main` ET sa branche dans le MÊME environnement, prendre la
> différence, et l'appliquer à la valeur que la CI a rendue. Ici : CI 1240 sur
> `main`, delta local −5 (mesuré fichier par fichier), donc 1235.

Le garde lui-même connaissait un tiers du problème : le cycle 108 avait fermé le
cas `packages/shared/dist` absent (+3), en refusant de MESURER plutôt que de
rendre un verdict faux. La bonne réaction ; simplement, l'inventaire des sources
de dérive n'était pas clos, et rien dans le script ne le dit.

### Et la fusion peut casser un garde en gardant les DEUX moitiés

Deux lots ont écrit la même précondition sous deux noms — `shared_dist_is_built`
et `unresolved_dist_imports`. La fusion a retenu la DÉFINITION du premier et
l'APPEL du second, collés l'un derrière l'autre. Le garde mourait sur
« command not found », donc rendait non-zéro, donc la CI aurait rougi **sur le
garde lui-même en nommant une régression de dette inexistante** : exactement le
faux verdict que le cycle 108 venait de fermer. Un `git merge` sans conflit n'est
pas une revue.

---
