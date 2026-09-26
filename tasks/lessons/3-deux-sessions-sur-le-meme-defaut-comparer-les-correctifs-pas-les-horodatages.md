## 3. Deux sessions sur le même défaut : comparer les correctifs, pas les horodatages

Livraison en parallèle du même défaut par deux sessions (PR #2708 et celle-ci). L'arbitrage n'est ni
« qui est arrivé en premier » ni « garder les deux » : c'est **défaut par défaut**. Le correctif
arrivé premier couvrait deux sites de plus ; il est conservé intégralement, le module concurrent de
cette session supprimé. **Deux helpers rivaux pour une même règle valent moins que l'un ou
l'autre** — c'est exactement la condition qui avait produit les quatre copies divergentes au départ.

Ne PAS réimposer un choix de structure différent (ici, chaîner plutôt que boucler) quand l'autre
session l'a explicitement argumenté et que le gain est marginal. En revanche, **ce que l'autre
session n'a pas fait reste à faire** : ici, la fidélité de ses propres tests.
