## Leçon 430 — Une OMISSION ne se propage pas : la conformité d'un hôte ne dit rien de celle des autres

**Le fait (2026-09-02).** Quatre surfaces reader montent le même atome,
`EngagementGlyph`, qui ne pose **aucun cadre** — il ne rend que
`.font(MeeshyFont.relative(size))`. Mesuré à l'écran :

| surface | cibles |
|---|---|
| carte du fil | **44 × 44** — l'hôte encadre |
| viewer story | **68 × 66** — l'hôte encadre |
| plein écran média | conforme |
| **détail du post** | **32×17, 22×19, 25×17, 17×20** — l'hôte n'encadrait pas |

Une sur quatre, au TIERS du minimum dans chaque dimension.

> **Le composant n'était pas fautif : l'hôte, en le posant, a oublié de lui
> donner une taille.** Deux hôtes du même atome, l'un conforme, l'autre au tiers
> — et rien dans l'atome ne pouvait le dire.

**C'est l'INVERSE de la leçon 429**, et les deux sont vraies ensemble : là, une
MODIFICATION du partagé se propage à tous ses hôtes, donc vérifier un seul ne
vaut rien. Ici, une OMISSION de l'hôte ne se propage pas — donc constater qu'un
hôte est conforme ne vaut rien non plus. **Le partagé transmet ce qu'il
CONTIENT, jamais ce que ses hôtes ajoutent autour.**

**Le geste.** Quand un atome délègue une propriété à ses hôtes (taille, cible
tactile, marge, teinte), la vérifier chez CHACUN — l'énumération des hôtes est
la même que pour la leçon 429, mais la question s'inverse : là « qu'est-ce que
mon changement leur fait ? », ici « lequel a oublié ? ».

**Deux corollaires payés comptant dans le même lot :**

1. **Le voisin le plus proche est souvent le mauvais modèle.** J'ai ajouté un
   item à cette rangée deux tours plus tôt en copiant la forme de ses voisins —
   et j'ai donc reproduit leur défaut en croyant bien faire. La carte du fil, à
   un fichier de là, était le bon modèle. **Imiter transmet ce qu'un voisin a de
   FAUX avec ce qu'il a de juste** ; le modèle se choisit sur une mesure, pas
   sur la proximité.

2. **Un seuil se MESURE, il ne se calcule pas.** Premier réglage : retrait de
   13 pt, « donc 18 + 26 = 44 ». Deux des cinq cibles sont sorties à **43** — le
   plus petit glyphe fait 17, pas 18. Le calcul m'aurait laissé sous le minimum
   en me donnant l'impression de l'avoir atteint. Corrigé à 14, re-mesuré,
   45-48.
