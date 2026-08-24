# Analyse — Itération 259 : le prédicat ObjectId était quadruplé DANS le package shared, dont deux regex de forme divergente

## Protocole (démarrage)

`main` @ `58d5cdd6` (dernier commit : `feat(android/stories): re-resolve text
overlays into the Exploration language (#3427)`). Branche
`claude/brave-archimedes-wi8l1h` réalignée sur `origin/main` au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`. Baselines vertes au départ : shared `conversation-helpers` +
`validation` (159 tests), suite shared complète (2560 tests après ajout).

**Audit anti-doublon** (4 PRs ouvertes au départ) : #3428 (Android calls,
Kotlin), #3426 (iOS i18n), **#3424 (gateway : SSOT du prédicat ObjectId —
`services/gateway/src/utils/object-id.ts`, 8 copies gateway rebranchées)**,
#3418 (web/admin scheduling formatters). La #3424 est le voisin le plus proche
de ce travail, mais elle **ne touche QUE des fichiers `services/gateway/`** :
zéro chevauchement avec `packages/shared/`. Les deux passes sont complémentaires,
pas concurrentes — voir « Améliorations futures ».

## Sélection : **Priorité 3 — dette transverse : un prédicat SSOT quadruplé dans le package qui est censé ÊTRE la source de vérité**

Le package `shared` est, par définition, la source de vérité des types et règles
partagées. Or le prédicat « cette chaîne est-elle un ObjectId MongoDB ? » y vivait
recopié sur **quatre** sites, dont deux avec une regex de forme **différente**.

## Current state (avant correctif)

| site | forme | rôle |
|---|---|---|
| `utils/conversation-helpers.ts:401` | `/^[0-9a-fA-F]{24}$/.test(id)` | `isValidMongoId` (booléen, consommé par gateway `routes/users/blocking.ts`) |
| `types/migration-utils.ts:46` | `/^[0-9a-fA-F]{24}$/.test(id)` | `isValidObjectId` (booléen + garde `typeof`) |
| `utils/validation.ts:165` | `z.string().regex(/^[0-9a-fA-F]{24}$/, …)` | `CommonSchemas.mongoId` (Zod, consommé par gateway `call-schemas.ts`) |
| `types/validation.ts:168` | `z.string().regex(/^[a-f\d]{24}$/i, …)` | `mongoIdSchema` (Zod) |

Les deux schémas Zod portaient **deux formes syntaxiques de la même regex** :
`/^[0-9a-fA-F]{24}$/` d'un côté, `/^[a-f\d]{24}$/i` de l'autre. Elles décrivent
exactement le même langage (24 hex, casse indifférente) — mais un lecteur qui en
édite une n'a aucun moyen mécanique de savoir que l'autre existe.

Fait aggravant : le patron `object-id.ts` (`OBJECT_ID_REGEX` + `isValidObjectId`)
existe DÉJÀ, à l'identique, côté **web** (`apps/web/utils/object-id.ts`) et arrive
côté **gateway** (#3424). Le package `shared` était le seul des trois à ne pas
avoir sa brique canonique — l'outlier exact.

## Problems identified

1. **Un invariant SSOT consommé en quatre exemplaires, dans le package SSOT.**
   C'est le patron « cette entité a-t-elle une jumelle ? » que le harnais
   gateway passe son temps à réduire, ici poussé à quatre, dans le package dont
   la raison d'être est de ne pas avoir de jumelles.
2. **Deux regex de forme divergente pour un même concept.** `/^[a-f\d]{24}$/i` et
   `/^[0-9a-fA-F]{24}$/` sont équivalentes aujourd'hui ; rien ne le garantit
   demain. La divergence est déjà là, à un caractère près de devenir
   comportementale.
3. **Incohérence inter-packages.** Web et gateway convergent vers un `object-id.ts`
   nommé `OBJECT_ID_REGEX`/`isValidObjectId` ; shared restait éclaté.

## Root causes

Les quatre sites sont apparus indépendamment, à des époques différentes
(`migration-utils` lors de la migration de types, les deux `validation.ts` comme
deux familles de schémas Zod distinctes, `conversation-helpers` comme helper
métier). Chacun a réinliné la regla la plus courte du monde plutôt que d'importer —
et une regex de 20 caractères est précisément ce qu'on recopie sans y penser.

## Business impact

**Nul en runtime** — comportement rigoureusement inchangé (même langage reconnu,
mêmes verdicts sur toutes les entrées). Le gain est de **cohérence et de
prévention de dérive** : une règle, une regex, gelée par un témoin qui tombe si
l'une des cinq lectures s'écarte des autres.

## Technical impact

- **Nouveau module feuille** `packages/shared/utils/object-id.ts` :
  `OBJECT_ID_REGEX` + `isValidObjectId(id: unknown): id is string`. Aucun import
  → aucun risque de cycle, consommable depuis `utils/` comme depuis `types/`
  (précédent exact : `utils/client-message-id.ts` consommé par `types/messages.ts`).
- **Quatre sites rebranchés** sur `OBJECT_ID_REGEX`, exports et signatures
  **inchangés** (`isValidMongoId(id: string): boolean`,
  `isValidObjectId(id: string): boolean`, `CommonSchemas.mongoId`, `mongoIdSchema`)
  — zéro impact sur les consommateurs.
- **Nommage aligné** sur les briques sœurs web/gateway (`OBJECT_ID_REGEX` /
  `isValidObjectId`).
- **`tsc --noEmit` (shared) : exit 0.** Types inchangés.

## Risk assessment

- **Négligeable.** La regex canonique est identique à celle des trois sites
  `/^[0-9a-fA-F]{24}$/`, et strictement équivalente à la quatrième
  `/^[a-f\d]{24}$/i`. Prouvé par un témoin d'accord qui exécute les CINQ
  prédicats sur les mêmes jeux valides/invalides.
- **Rollback :** supprimer `object-id.ts` + le test, réinliner les 4 regex.

## Proposed improvements → réalisé

1. **RED** : `packages/shared/__tests__/utils/object-id.test.ts` — accepte les
   ids canoniques (deux casses), rejette les malformés (23/25 chars, non-hex,
   espaces), type guard rejette non-string, et un **témoin d'accord** exécutant
   `isValidObjectId`, `isValidMongoId`, `isValidObjectId`(migration),
   `CommonSchemas.mongoId`, `mongoIdSchema` sur les mêmes entrées.
2. **GREEN** : `object-id.ts` (regex + type guard).
3. **Rebranchement** des 4 consommateurs.

## Expected benefits

- Prédicat ObjectId déclaré **une** fois dans shared, comme sur web et gateway.
- Les deux formes de regex divergentes fondues en une — dérive rendue impossible
  sans faire tomber le témoin d'accord.
- Package `shared` cohérent avec ses packages sœurs (`object-id.ts` partout).

## Implementation complexity

- **Faible.** 1 fichier neuf (+2 exports), 4 fichiers rebranchés (+1 import
  chacun, 1 ligne réécrite chacun), +1 fichier de test (6 cas).

## Validation criteria

- [x] RED prouvé : le test échoue (module introuvable) avant l'ajout d'`object-id.ts`.
- [x] GREEN : `object-id` 6/6.
- [x] Baselines shared : `conversation-helpers` + `validation` inchangés.
- [x] Suite shared complète : **2560/2560** (aucune régression).
- [x] Gateway consommateurs (`users-blocking`, `call-schemas`, `participants`) :
      **223/223**.
- [x] `bunx tsc --noEmit` (shared) : exit 0.
- [ ] CI verte sur la PR (gate lint/bun réel).

## Améliorations futures (hors périmètre)

- **Convergence gateway → shared.** Une fois #3424 fusionnée, le
  `services/gateway/src/utils/object-id.ts` qu'elle introduit et cette brique
  shared expriment la MÊME règle dans deux packages. Le gateway pourrait à terme
  importer `@meeshy/shared/utils/object-id` plutôt que maintenir sa propre copie —
  à évaluer sans précipitation (l'import cross-package a un coût de bundle et
  #3424 a délibérément choisi le local). À traiter APRÈS le merge de #3424 pour
  éviter tout conflit.
- **`migration-utils.isValidObjectId` vs `object-id.isValidObjectId`.** Deux
  fonctions homonymes coexistent désormais dans shared (l'une garde `typeof`,
  l'autre est un type guard `unknown`). `migration-utils` n'a aucun consommateur
  externe repéré ; une passe ultérieure pourrait le déprécier au profit de la
  brique canonique. Non fait ici pour rester purement additif.
