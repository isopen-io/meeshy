## Leçon 589 — Un budget qui NOMME un chunk « jamais dans le socle » ne le garantit pas : seule l'ARÊTE d'import statique le prouve

`apps/web-v2/budgets.json` déclarait le chunk `realtime` `dynamic_only: true`
en toutes lettres — la doctrine du dépôt pour « ce module ne s'atteint que par
un `import()`, jamais au chargement de la route ». Le libellé était FAUX :
`routes/thread.tsx` importait `view/use-typing-emitter.ts`, qui importait
`api/realtime.ts` (le possesseur de la connexion socket.io) de façon
STATIQUE. Ouvrir une conversation aurait donc téléchargé `socket.io-client`
(~17 Ko gzip) AVANT la première peinture, exactement ce que le libellé
prétendait exclure — et aucun gate ne rougissait, parce que le gate de poids
mesure une SOMME, jamais un CHEMIN. Cause : `use-typing-emitter.ts` importait
le module qui POSSÈDE la connexion au lieu du PORT dédié à l'émission
(`api/typing-emit.ts`) — la frontière entre « ce qui émet » et « ce qui
possède le transport » n'existait pas encore comme deux fichiers.

**La correction n'est pas un audit ponctuel, c'est une garde qui rejoue à
chaque build.** `measure-weight.mjs` relit désormais, pour CHAQUE fichier
`.js` produit, ses arêtes d'`import … from "./autre-chunk.js"` STATIQUES et
construit la liste des importeurs de chaque module. Un chunk marqué
`dynamic_only: true` dans `budgets.json` qui a ne serait-ce qu'UN importeur
statique fait échouer le build, en le nommant.

> **Un champ de configuration qui DÉCLARE une propriété structurelle
> (`dynamic_only`, `lazy`, `no-side-effects`…) ne la fait pas respecter tant
> qu'aucun outil ne relit le graphe qu'elle prétend décrire.** C'est la forme
> du cycle 124 du Prisme (`CLAUDE.md` racine — « un champ de service qui
> DÉCLARE une restriction ne la fait pas respecter ») rejouée sur un graphe de
> modules plutôt que sur une charge réseau : la question à poser à toute
> promesse de LAZY-LOADING n'est pas « le code appelle-t-il bien `import()`
> quelque part ? » mais **« existe-t-il, ailleurs dans l'arbre, un second
> chemin qui l'importe sans y passer ? »** — et cette question ne se répond
> qu'en relisant le bundle produit, jamais le code source d'un seul fichier.

Trouvée en revue-correction sur #5793 (`apps/web-v2`, le câblage temps réel
socket.io/`typing:start`), avant toute fuite en production — le gate a rougi
en local avant le premier build livré.


---
