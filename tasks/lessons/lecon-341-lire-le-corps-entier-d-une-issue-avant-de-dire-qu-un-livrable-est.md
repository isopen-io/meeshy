## Leçon 341 — Lire le corps ENTIER d'une issue avant de dire qu'un livrable est hors périmètre

Même cycle. La revue reprochait, en majeur, d'avoir livré le moteur de thème sous une issue dont le
**Critère de fin** est « squelette seul, aucune route requise » — donc en avance sur son lot. Le
reproche citait ce Critère de fin, la matrice, et les deux clés de thème divergentes du legacy.
Il était faux : le `## Détail` de la même issue dit, mot pour mot, « `app/layout.tsx` minimal avec
ThemeScript inline (posé ici car requis dès la première route, mais son contenu détaillé [...] relève
de L0 ; ce lot ne fait que le brancher) ». Le livrable était **prescrit** par l'issue qu'on invoquait
pour le refuser.

> **Une issue de ce dépôt a cinq sections, et le périmètre ne vit pas toutes dans la même.** Contexte,
> Preuve attendue, Critère de fin, Détail, Source. Le Critère de fin dit comment on MESURE la fin ; le
> Détail dit ce qu'on ÉCRIT. Conclure « hors périmètre » depuis le seul Critère de fin, c'est lire le
> thermomètre pour connaître le menu.

Ce qui restait vrai dans le reproche méritait quand même une issue, et c'est là que la revue avait
raison sur le fond : le lot avait figé une clé de stockage (`meeshy-theme` — la **troisième** du
dépôt) que nul document ne nomme, et le rapport de session la signalait lui-même comme « décision à
valider ». Une décision produit signalée dans un rapport n'existe pas : elle devient une issue
`décision-produit` assignée au porteur, ou elle est prise en silence par le code.

**La règle des deux sens** : un constat de revue peut être faux sur sa cause et juste sur son odeur.
Le réfuter avec sa preuve, puis se demander *qu'est-ce qui a fait sentir quelque chose au relecteur ?*
— et ouvrir l'issue de ça.
