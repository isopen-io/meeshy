## Leçon 287 — une garde d'atteignabilité trouve la FEUILLE ; seule son itération trouve l'ARBRE (2026-08-25, itération 244i)

243i avait écrit, dans le doc-comment de sa propre garde, ce qu'elle
n'attrapait pas :

> Une fonction citée uniquement par une autre fonction elle-même morte reste
> verte. La garde attrape la FEUILLE de l'arbre mort, pas l'arbre.

244i l'a validé **par l'exemple, sur le dépôt lui-même**. Retirer deux feuilles
mortes de `StoryViewerView+Content` — `storyTextContent`, `mediaOverlay` — a
fait apparaître **quatre** branches qui n'étaient appelées que par elles :
`fontForStyle`, `textAlignmentFor`, `compositeAlignment`,
`coloredMediaFallback`.

> **Un retrait de code mort n'est pas un événement, c'est une ITÉRATION.**
> Chaque suppression change le graphe d'appel et peut en détacher un morceau.
> Relancer la mesure APRÈS chaque tour, jusqu'au point fixe — sinon on livre
> l'arbre en autant de lots qu'il a d'étages, un par itération.

Corollaire d'inventaire, découvert au même endroit : **élargir une garde d'un
cran élargit aussi son inventaire**. Ajouter le répertoire `ViewModels/` au
balayage a fait apparaître six fonctions que la première mesure, bornée à
`Views/`, ne voyait pas. Ne jamais présumer propre un périmètre voisin.

### Le corollaire le plus cher : le code TESTÉ et le code EXPÉDIÉ peuvent différer

`FeedViewModel.likePost` et `.bookmarkPost` sont largement couvertes par
`FeedViewModelTests` — et appelées par **aucun** code de production. `FeedView`
a réécrit leur logique en ligne ; ses propres commentaires l'avouent (« same one
`FeedViewModel.likePost` already uses », « Mirror the pre-fix behaviour from
FeedViewModel.bookmarkPost »). La vue porte le toggle optimiste, l'appel socket,
le repli REST, la file hors-ligne et l'observation d'issue ; l'implémentation
canonique ne tourne jamais.

> **Une suite verte sur du code que personne n'appelle n'atteste rien du
> produit : elle mesure une seconde implémentation que personne ne rend.**
> C'est la forme la plus coûteuse de « code mort testé vert » — les autres
> retirent de la confiance, celle-ci en ACHÈTE.

Le symptôme se repère à une phrase, dans un commentaire de vue : *« mirrors »*,
*« same one X already uses »*, *« pre-fix behaviour from X »*. Un commentaire
qui dit qu'un code en COPIE un autre nomme une divergence à venir.

### Et le partage entre retirer et inscrire

La mesure brute proposait quinze suppressions. Sept auraient cassé la suite
(leur seul appelant est un test), deux auraient laissé de l'état orphelin —
dont `markProgrammaticScroll`, unique écrivain d'un drapeau que deux sites
LISENT encore. **Retirer ce qui est mort de bout en bout ; inscrire nommément,
avec sa raison, ce qui est vivant d'un côté.** Une allowlist commentée est une
dette VUE ; une suppression hâtive est une dette DÉPLACÉE.
