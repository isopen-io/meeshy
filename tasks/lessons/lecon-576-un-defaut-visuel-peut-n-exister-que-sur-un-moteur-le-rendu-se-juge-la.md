## Leçon 576 — Un défaut visuel peut n'exister que sur UN moteur : le rendu se juge là où il est servi

Les captures de recette de `apps/web-v2` sont prises par Chromium sur macOS, à
390 × 844 (`scripts/capture.mjs`). Après l'alignement des vues, elles étaient
propres.

Lancée sur l'**émulateur Android** — la coque Capacitor étant la cible réelle
du chantier —, la même liste montrait **deux barres grises permanentes** :
l'une horizontale sous les chips de filtre, l'autre verticale le long du bord
droit de la liste. Personne ne les avait dessinées.

La cause n'est pas dans le code : **le moteur Android peint des barres de
défilement CLASSIQUES**, c'est-à-dire un rail gris qui occupe de la place et
reste visible au repos, là où WebKit et les navigateurs de bureau modernes
posent un indicateur SUPERPOSÉ qui s'efface. Le même CSS, deux rendus — et
celui qu'on regardait était celui qui ne montrait pas le défaut.

> **Une capture prise sur le moteur de la machine de build mesure la machine de
> build.** C'est la parente exacte de « un ROUGE des deux côtés du diff mesure
> aussi la MACHINE » : ici c'est un VERT, et il mesure le moteur. Tant qu'une
> application est servie par plusieurs moteurs, un seul d'entre eux ne fait pas
> une recette.

Deux corollaires pratiques :

- **`overflow-*: auto` n'est pas une décision neutre.** Chaque conteneur
  défilant est un endroit où un moteur PEUT peindre un rail. Les rails
  HORIZONTAUX (rails de stories, chips de filtre, tiroir du composeur) ne
  doivent jamais en montrer — iOS pose `showsIndicators: false` sur les siens.
- **La validation d'une coque se fait DANS la coque.** `build-shells.mjs`
  refuse, à raison, de construire une coque sur fixtures ; pour juger le RENDU
  sans identifiants, on sert le serveur de développement à l'émulateur
  (`--host`, `http://10.0.2.2:<port>`) — c'est le même moteur, le même écran,
  et aucun artefact mal étiqueté n'est produit.
