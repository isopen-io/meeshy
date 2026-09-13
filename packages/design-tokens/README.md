# `@meeshy/design-tokens` — les jetons CSS du web

Le paquet que la v3.1 (`apps/web-v2`) importe pour se peindre.

```
package.json  le manifeste — c'est lui qui rend le paquet ATTEIGNABLE
ios.css       la palette DÉRIVÉE de MeeshyColors.swift — générée, jamais éditée à la main
tokens.css    @import des deux schémas + ce qui ne dépend d'aucun schéma
dark.css      schéma sombre — porté par :root ET .dark
light.css     schéma clair  — porté par .light seulement
```

| feuille | importée par |
|---|---|
| `ios.css` | `apps/web-v2/src/styles/ios.css` |
| `tokens.css` (donc `dark.css` et `light.css`) | `apps/web-v2/src/styles/app.css`, `apps/web-v2/src/styles/institutional.css` |

Un franchissement de frontière de paquet se **déclare** : `@meeshy/design-tokens`
est un workspace, la v3.1 le porte en dépendance, et `docker.yml` reconstruit son
image quand ce paquet change (`packages/design-tokens/` figure dans la détection
de `web_v31`). `apps/web-v2/scripts/check-docker-context.mjs` vérifie que
`.dockerignore` laisse entrer les cinq fichiers.

## `ios.css` — la palette dérivée

`scripts/generate-from-ios.mjs` lit `MeeshyColors.swift` et écrit `ios.css`. Une
couleur qui existe côté iOS ne s'écrit donc pas ici : elle se déclare en Swift et
se régénère.

```bash
cd packages/design-tokens && bun run generate:ios   # régénérer
cd apps/web-v2 && bun run check:tokens              # le CSS généré n'a pas dérivé de Swift — en CI (« Gates web-v2 »)
cd apps/web-v2 && bun run check:tokens-resolved     # le navigateur PEINT ces valeurs, dans les deux schémas — à la main
```

## `tokens.css`, `dark.css`, `light.css` — la table héritée

Ces trois feuilles sont la table de l'ancienne refonte web v3, annulée le
2026-09-07 puis retirée du dépôt (#5994). La v3.1 les importe encore.

**Ce qui est de nouveau gardé (#6000).** Les contrôles qui tenaient cette table
vivaient dans les scripts de l'ancienne refonte et sont partis avec elle,
laissant la table sans gate pendant qu'elle restait importée par `apps/web-v2` —
défaut relevé et refermé le même jour. `packages/design-tokens/scripts/check-jetons.mjs`
porte désormais la moitié TABLE de l'ancien script (rapports de contraste WCAG
sur la table résolue — 4,5:1 pour ce qui se lit, 3:1 pour un contour ou une
pastille —, ordre de luminance des quatre plans, parité des clés entre les deux
schémas, disjonction du couple de focus, valeur SERVIE par la cascade invariante
sous les deux schémas d'OS), câblé dans `apps/web-v2`'s `check:tokens` (donc dans
« Gates web-v2 » en CI) :

```bash
cd packages/design-tokens && node scripts/check-jetons.mjs   # ou : bun run check:jetons
cd packages/design-tokens && bun test scripts/                # 15 témoins
```

La moitié SOURCES de l'ancien script (`moteursParalleles` — « un seul moteur de
thème », couleurs écrites en dur dans les composants) n'a pas été portée : elle
dépendait de la géographie de l'app annulée (`app/theme-script.tsx`), et
`apps/web-v2` a un bootstrap de thème différent (`src/lib/scheme.ts` +
`src/lib/inline-scheme-bootstrap.js`, scindé à dessein) qui reste à mesurer
avant d'écrire son gate — suivi : #6020.

Deux règles de conception restent, parce qu'elles tiennent aux fichiers et non à
un gate :

- **La table ne bascule pas toute seule.** Aucune feuille ne contient de
  `prefers-color-scheme` (`grep -c prefers-color-scheme packages/design-tokens/*.css`
  rend 0 partout) : le schéma suit la CLASSE, posée par la coquille
  (`apps/web-v2/index.html`) et corrigée par
  `apps/web-v2/src/lib/inline-scheme-bootstrap.js`.
- **Le sombre est porté par `:root`.** Un lecteur sans JavaScript, donc sans
  classe, reçoit un thème complet — le sombre, rendu de référence de la planche
  d'origine. `:root.light` l'emporte par spécificité quel que soit l'ordre des
  imports, et `color-scheme` est déclaré dans chaque schéma pour que les contrôles
  natifs suivent.

## D'où viennent les valeurs

Le schéma **sombre** a été MESURÉ sur la planche « nocturne » de l'ancienne
refonte, puis corrigé là où il ne se lisait pas (dimension 5) ; le schéma **clair**
est DÉRIVÉ, la planche n'ayant aucune vue claire. Le détail — tableau des
provenances, échelle des rayons et des tailles, corrections de lisibilité avec
leurs rapports avant et après — se relit dans l'historique :

```bash
git show 9c3bf0b24a:packages/design-tokens/README.md
```

## Ajouter un jeton

1. Une couleur qui existe côté iOS se déclare dans `MeeshyColors.swift`, puis
   `bun run generate:ios` — jamais à la main dans `ios.css`.
2. Une valeur **de schéma** (elle change entre clair et sombre) va dans `dark.css`
   **et** `light.css`.
3. Une valeur **hors schéma** (typographie, rayon, palette catégorielle) va dans
   `tokens.css`. Le test : *sa lisibilité dépend-elle du fond ?* Si oui, ce n'est
   pas une valeur hors schéma — c'est ce qui a fait sortir `--color-presence-*` de
   `tokens.css`.
4. `node scripts/check-jetons.mjs` calcule les rapports de contraste et l'ordre
   des plans sur la table RÉSOLUE — pas besoin de les mesurer à la main.
