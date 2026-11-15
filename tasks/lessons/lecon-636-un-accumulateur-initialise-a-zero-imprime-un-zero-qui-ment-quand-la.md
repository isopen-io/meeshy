## Leçon 636 — un accumulateur initialisé à ZÉRO imprime un zéro qui MENT quand la mesure n'a pas eu lieu, et la paire d'assertions qui le rattrape ne sauve que le verdict, jamais le journal

2026-09-19, #7110 (suite de l'enquête #7095 : `apps/web-v2/scripts/check-thread-virtualization.mjs`, `scripts/lib/insertion-drift.mjs`). Le gate de virtualisation du fil agrégeait ses tirages de pages ainsi :

```js
let insertionJump = 0;
if (pull.drift === null) lostAnchor += 1;
else insertionJump = Math.max(insertionJump, pull.drift);
```

Quand la rangée repérée disparaît du document, `drift` vaut `null`, `insertionJump` n'est pas touché — et le gate imprime **« saut à l'insertion 0 px »** au moment précis où il n'a PAS pu mesurer le saut. Zéro sur zéro mesure, affiché comme zéro pixel de dérive.

**Comment il a été trouvé : par MUTATION, pas par lecture.** L'ancrage du fil (`use-older-messages.ts:130`, l'écriture `el.scrollTop = el.scrollHeight - captured`) a été retiré, et le gate rejoué. Il rougit — mais par des assertions VOISINES (`lostAnchor === 0`, « deux pages se chargent », « le premier message est atteint »), jamais par celle qui nomme le défaut. La ligne chiffrée disait toujours `0 px`.

**Ce que la paire sauve, et ce qu'elle ne sauve pas.** `lostAnchor === 0` est posée juste à côté : la correction tient, et c'est elle qui a fait tomber la mutation. Le problème n'est donc pas la COUVERTURE — c'est la LISIBILITÉ du verdict. Un humain qui lit un journal de CI de treize minutes lit la ligne chiffrée, pas l'inventaire des assertions ; c'est exactement le coût que #7095 a payé, quatre lectures du même journal pour comprendre ce que « 38 px » puis « 0 px » voulaient dire. Et le jour où une évolution assouplit l'assertion voisine, celle du saut verdira **par absence de sujet** — un gate qui ment au lieu d'un gate qui explose.

**Le même piège, payé deux fois dans la même heure.** Le protocole écrit pour reproduire #7095 sous bridage processeur a rendu « aucune dérive » en servant un `dist` bâti SANS `MEESHY_BENCH=500` : le fil tenait en une page, la sentinelle haute naissait `exhausted`, la boucle ne tournait **jamais**. Ce qui l'a démasqué n'est aucune assertion mais une colonne ajoutée sans y penser — `pages : 0` partout. **Un protocole de mesure a besoin de sa propre garde de non-vacuité, au même titre que le code qu'il mesure.**

**La règle.** Un agrégat dont la valeur initiale est un verdict VALIDE (`0` px de dérive, `0` échec, `100 %` de réussite) ne peut pas distinguer « mesuré et bon » de « pas mesuré ». Le type SOMME est le contrat — c'est la forme de `paintedAt` / `near` / `loin` (#7048, leçon 630) portée de la SONDE à l'AGRÉGAT : `insertionDrift` rend `mesurée` · `non-mesurable` · `aucune-page`, et l'assertion exige explicitement `genre === 'mesurée'`. Une sentinelle numérique (`-1`, `NaN`) ne suffirait pas : elle se compare, donc se compare mal — `NaN <= 2` rend `false` sans le dire.

> **Avant de lire un chiffre dans un journal de gate, demander : « ce chiffre pouvait-il s'imprimer sans qu'aucune mesure ait eu lieu ? »** Un zéro qui vaut à la fois « rien ne bouge » et « je n'ai pas pu regarder » est le pire des deux — il ne rassure que lorsqu'il ne devrait pas. La question se pose à l'ÉCRITURE de l'accumulateur, pas à la lecture du journal : c'est l'initialisation qui décide de ce que le silence voudra dire.
