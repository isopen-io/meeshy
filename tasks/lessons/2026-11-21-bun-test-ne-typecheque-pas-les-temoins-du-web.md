## `bun test` ne typechèque PAS les témoins du web — et la passerelle a déjà le jumeau de ce piège

**#20148, 2026-11-21.** J'ai ajouté un témoin dans
`apps/web/src/components/message-receipts-sheet.test.tsx`, lancé
`bun test <ce fichier>` : **16 pass, 0 fail**. Poussé. La CI a rougi sur
`Qualité TS (bun)` :

```
src/components/message-receipts-sheet.test.tsx(362,9): error TS2322:
  Type 'number | null | undefined' is not assignable to type 'number | null'.
```

`rows[0]?.lastPlayPositionMs` rend `number | null | undefined` ; le paramètre
attendait `number | null`. **Un témoin vert, un arbre qui ne compile pas.**

### Le jumeau, déjà connu de l'autre côté du dépôt

Ce n'est pas une surprise, c'est une FORME que le dépôt a déjà documentée :
`tsc-never-loaded-tests-ratchet.test.ts` existe précisément parce que #10203 a
retiré le typecheck de ts-jest — « ce cliquet est désormais le SEUL gate de
types des fichiers de test » côté passerelle. Le web a le même trou, et son
gate s'appelle autrement.

| paquet | ce qui EXÉCUTE les témoins | ce qui les TYPECHÈQUE |
|---|---|---|
| `services/gateway` | `npx jest` (ts-jest, modules isolés, sans types) | `tsc -p tsconfig.test.json` — le cliquet A |
| `apps/web` | `bun test` (transpile, sans types) | `pnpm run type-check` (`tsc --noEmit`), dans le job `Qualité TS (bun)` |

### La règle
**Avant de pousser un témoin, lancer le gate de TYPES de son paquet, pas
seulement sa suite.** Côté web : `cd apps/web && pnpm run type-check`. Une suite
qui passe ne dit rien de ce qui compile, dans les deux paquets — et c'est
exactement pourquoi les deux ont un gate SÉPARÉ.

### Le corollaire, moins évident
Un `?.` sur un élément de tableau introduit `undefined` **même quand la ligne
existe**, et c'est le transpileur qui s'en moque, pas le typage. La forme qui
tient les deux : extraire (`const [first] = rows`), refuser l'absence une fois
(`if (first === undefined) throw`), puis lire les champs sans `?.`. Le témoin y
gagne un message clair quand la fixture change, au lieu d'un `NaN` silencieux.
