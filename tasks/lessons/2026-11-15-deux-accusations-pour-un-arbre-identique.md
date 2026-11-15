## Deux accusations DIFFÉRENTES pour un arbre IDENTIQUE : la signature d'un seuil posé sur une égalité, jamais d'une régression

*2026-11-15, #18607 (rencontré au cycle 166, sur la PR #18604). `dev` rouge une
passe sur deux depuis que la garde existe.*

### Ce qui s'est passé

`Web · gardes navigateur · tranche 3` échouait sur `check-calls-effects.mjs`,
invariant « chaque puce fait 44 au moins ». Deux runs sur la **même tête**
(`83fde1aba`) ont accusé deux choses différentes :

| run | accusation |
|---|---|
| PR | `clair 390×844` |
| dispatch | `sombre 390×844` |
| local, même arbre | **les deux** |

### Le diagnostic, et ce qui l'a donné

**C'est la DIVERGENCE des accusations qui est le diagnostic**, pas leur
contenu. Un défaut de produit accuse la même chose à chaque passe ; un seuil
posé sur une égalité flottante accuse ce que l'arrondi décide ce jour-là.

Mesuré : `CHIP` porte `min-h-11`, soit `2.75rem` — **exactement 44 px** à une
racine de 16 px. La boîte rendue vaut `44.000030517578125` en clair et
`43.999969482421875` en sombre. La garde comparait `>= 44`.

> **Un témoin qui tranche sur une égalité flottante ne mesure pas le produit,
> il mesure l'arrondi du moteur de rendu.** C'est le jumeau du « témoin qui ne
> peut pas tomber » : celui-ci tombe, mais pas sur ce qu'il prétend garder — et
> il est plus coûteux, parce qu'un rouge intermittent s'impute à la dernière
> branche passée plutôt qu'à la garde.

### Les trois règles que j'en tire

1. **Devant un rouge qui change d'accusation, suspecter le SEUIL avant le
   diff.** Deux passes de la même tête qui nomment deux cas différents ont déjà
   répondu : rien du produit n'a bougé entre les deux.
2. **Mesurer en local plutôt que dépenser un re-run pour tester l'hypothèse
   « flake ».** Un re-run rend un bit (vert ou rouge) ; la mesure locale a rendu
   le NOMBRE — `44.00003` contre `43.99997` — c'est-à-dire la cause. Ici le
   `dist` se construit et la garde se rejoue avec le Chromium déjà installé ;
   trois passes ont coûté moins qu'un run de CI.
3. **Chercher l'idiome du correctif DANS le fichier avant de l'inventer.**
   `check-calls-effects.mjs` portait déjà `TAP_FLOOR - 0.5` à **trois**
   endroits, posés par quelqu'un qui avait rencontré le même bruit. Il manquait
   au seul site qui rougissait. Un fichier qui applique une convention à trois
   sites sur onze ne documente pas une règle : il documente que trois personnes
   l'ont rencontrée.

### Et ce que je n'ai PAS fait

Les sept autres comparaisons nues du même fichier portent le même piège latent.
Je ne les ai pas relâchées : **chacune mesure un autre élément**, certaines ont
peut-être une marge réelle au-dessus de 44, et les relâcher sans mesurer
masquerait un vrai défaut de cible tactile. Relâcher par analogie ce qu'on n'a
pas mesuré, c'est échanger un rouge intermittent contre un vert aveugle —
exactement le marché que la règle 1 vient de refuser.
