## Un relevé de base sur un `dev` frais MENT jusqu'à `prisma generate` + `shared build` — et il ment en accusant quelqu'un d'autre

**2026-11-21 · cycle 202 → 203 · `dev` @ `f0ce492db`** (fusion de sept PR d'un coup)

Après avoir rapatrié un `dev` qui venait d'absorber **sept PR en une fusion**,
j'ai lancé la suite complète du gateway comme relevé de base — la discipline
même que la directive du 2026-11-15 prescrit. Résultat : **7 suites rouges au
lieu des 6 connues**, et la septième était un **CLIQUET** :

```
● le nombre d'erreurs de typecheck hors codes muets (#6160, gate A)
  Expected: <= 76
  Received:    78
```

Un cliquet qui déborde de 2 après une fusion de sept PR *ressemble
exactement* à ce que la directive du 2026-11-15 décrit : une fonction déclarée
par une PR et consommée par une autre, un client Prisma non régénéré. Les deux
erreurs supplémentaires le confirmaient à la lecture — et c'était **deux
fichiers de PRODUCTION**, donc bien plus grave qu'un cliquet de témoins :

```
src/services/game/FlameService.ts(29,3): TS2305
  Module '@meeshy/shared/utils/game/flame' has no exported member 'firstFreezeGift'
src/services/community-join-request-lifecycle.ts(110,7): TS2322
  'entryVerifiedAt' n'existe pas sur CommunityJoinRequestWhereInput
```

J'étais à un commentaire d'écrire que la fusion des sept PR avait laissé `dev`
rouge sur le typecheck de production, et de nommer les PR.

**Les deux erreurs étaient les MIENNES.** `firstFreezeGift` est bien exporté
(`flame.ts:63`) et `entryVerifiedAt` est bien dans le schéma
(`schema.prisma:2566`). Ce qui était périmé, c'était MON conteneur : le client
Prisma généré au démarrage de session, sur l'arbre d'AVANT, et le `dist` de
`@meeshy/shared` de la même époque. `prisma generate --generator client` +
`bun run build` dans `packages/shared`, et la mesure retombe à **76 — pile au
plafond**. `dev` n'a jamais été rouge.

> **Un `git checkout` d'un `dev` frais déplace les SOURCES, jamais les
> ARTEFACTS GÉNÉRÉS.** Le client Prisma et le `dist` de `@meeshy/shared` sont
> des artefacts, et tout ce qui typecheque ou s'exécute les lit. Un relevé de
> base pris avant de les reconstruire ne mesure pas `dev` : il mesure l'écart
> entre l'arbre de `dev` et mes artefacts à moi.

Ce qui rend ce piège coûteux plutôt que simplement agaçant, c'est **où il
atterrit** :

1. **Il tombe sur un CLIQUET, pas sur un témoin de comportement.** Un cliquet
   énonce un NOMBRE, et un nombre dépassé de 2 ne dit pas d'où viennent les 2.
   Il faut aller chercher la liste, et la liste pointe des fichiers de
   production qu'on n'a pas touchés — c'est-à-dire le profil parfait d'une
   régression de quelqu'un d'autre.
2. **Il arrive juste après une fusion massive**, donc le contexte fournit
   gratuitement une explication plausible et fausse. « Une hypothèse plausible
   répétée ressemble à un diagnostic » (leçon du 2026-11-21 sur #20151) : ici
   il n'a même pas fallu la répéter, la directive du dépôt l'avait déjà écrite.
3. **La conclusion partait vers l'extérieur** — un commentaire sur une issue,
   nommant des PR. Un faux rouge gardé pour soi coûte dix minutes ; publié, il
   coûte la confiance de ceux qu'il accuse.

**La règle, donc : avant tout relevé sur un arbre qu'on vient de déplacer —**

```bash
cd packages/shared && npx prisma generate --generator client && bun run build
```

**— et avant d'attribuer un rouge à autrui, vérifier que le symbole manquant
est bien absent de la SOURCE**, pas seulement du `dist`. Deux `grep` répondent
à la question que cinquante lignes de `tsc` ne tranchent pas.

Corollaire mesuré sur cette session : c'est la **troisième** fois que le `dist`
périmé de `@meeshy/shared` fait rougir le gateway (deux fois en typecheck
pendant les cycles 199–202), et la première où il allait produire une
accusation. Le `CLAUDE.md` racine liste pourtant ces deux commandes comme
prérequis — savoir qu'un prérequis existe ne le fait pas s'exécuter. Il
appartient au geste « je rapatrie `dev` », pas à une liste qu'on relit.
