## Leçon 623 — Un témoin qui AMORCE l'état qu'il mesure peut RÉPARER ce que le produit détruit

**Le gate navigateur de la mise à jour de web-v2 (#6936) devait prouver « la
session survit à l'invalidation de tout le cache ».** Il pose la session dans le
`localStorage` par un `addInitScript` de Playwright — qui s'exécute à CHAQUE
document, donc aussi après le rechargement que le gate déclenche. Pour ne pas
réécrire par-dessus ce que le produit vient de purger, l'amorçage était gardé
par un drapeau… rangé dans le `localStorage` lui-même.

**La mutation l'a révélé, la passe nominale ne pouvait pas.** Avec une purge
fautive qui faisait `localStorage.clear()`, le drapeau partait AVEC la session,
l'amorçage se rejouait au rechargement, et le gate affichait « `meeshy.session`
est intacte après la mise à jour » — vert, sur un produit qui venait de
déconnecter son lecteur. Au rang nominal, drapeau dedans ou dehors rendent le
même verdict : le défaut du témoin n'est visible QUE sous la mutation qu'il est
censé attraper.

> **Le marqueur « déjà amorcé » d'un témoin ne doit jamais vivre dans le magasin
> que le témoin mesure.** Ici `sessionStorage` (il survit au rechargement dans
> le même onglet, et le produit n'y touche pas). La question à poser à tout
> harnais qui (ré)installe une précondition : *si le produit détruit CE que je
> mesure, mon harnais le remet-il en place sans le dire ?*

**Corollaire, sur la même clé et dans le même lot : quand la version NEUVE
réécrit légitimement ce que l'ancienne a purgé, l'état final n'est pas
mesurable — c'est la SUITE des gestes qui l'est.** « `meeshy.query-cache` est
absente après le rechargement » est faux par construction : le cache de requêtes
se repersiste dans les 250 ms qui suivent la première requête de la nouvelle
version. Le gate journalise donc chaque `setItem`/`removeItem` de cette clé (en
`sessionStorage`, qui traverse le rechargement) et exige que le DERNIER geste
avant le rechargement soit un retrait. Mutation : sans le verrou de persistance,
trois écritures apparaissent après ce retrait — le `pagehide` du rechargement
réécrivait ce que la purge venait d'effacer. Une assertion sur un ÉTAT aurait
été soit toujours verte, soit instable ; une assertion sur un ORDRE nomme
exactement le défaut.
