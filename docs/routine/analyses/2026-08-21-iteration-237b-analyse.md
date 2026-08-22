# Iteration 237 — `chunk(items, size)` trahissait son contrat documenté pour tout `size` fini < 1

## Protocole (démarrage)
`main` @ `3e64afaa` (dernier commit : `fix(ios): la fiche conversation collait un « s » latin
sur toutes les langues au chapeau « Membres » (#3241)`). Branche
`claude/brave-archimedes-oj0vgv` réalignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité CI : `bun install --ignore-scripts` (le postinstall `grpc-tools`
échoue derrière le proxy sortant, cf. CLAUDE.md), puis `cd packages/shared && npx prisma generate
--generator client && bun run build`.

**Audit anti-doublon** (8 PRs jcnm ouvertes au départ : #3242, #3243, #3245 — invariant temporel
`endMs >= startMs` ; #3251 — compteur de membres iOS ; #3249 — casse des primitives de rôle ;
#3247 — groupement de bulle Focal ; #3250/#3252 — CTA inscription iOS / brouillon effets Android).
Le présent constat ne touche AUCUN de ces domaines : il porte sur `packages/shared/utils/concurrency.ts`,
un module de découpage/ordonnancement pur, absent de toutes les PR en vol.

Baselines vertes au départ : `packages/shared` `tsc --noEmit` (0 erreur), `services/gateway`
`tsc --noEmit` (0 erreur), suite `concurrency.test.ts` (20 tests hors nouveau constat).

## Current state
`chunk<T>(items, size)` (`packages/shared/utils/concurrency.ts:80`) découpe une liste en tranches
de `size` éléments. Son docstring (ligne 77-78) énonce un contrat explicite :

> `size` non finie **ou < 1** produit une tranche unique.

L'implémentation :
```ts
const step = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : items.length;
```

## Problems identified
Pour un `size` **fini et < 1** (`0`, négatif, ou fractionnaire comme `0.5`), `Number.isFinite(size)`
vaut `true`, donc `step = Math.max(1, Math.floor(size)) = 1`. Résultat : `chunk([1,2,3], 0)` rend
`[[1],[2],[3]]` (trois singletons) au lieu de la **tranche unique** `[[1,2,3]]` promise. Seul le
chemin non fini (`NaN`/`Infinity`) tombe correctement sur `items.length` (tranche unique). Le code
et son docstring divergent.

Le test existant (`__tests__/utils/concurrency.test.ts:180`) n'attrapait pas le drift : il
n'assertait que `result.flat()`, jamais la **structure** — `[[1],[2],[3]]` et `[[1,2,3]]` ont le
même `.flat()`, donc les deux passaient.

## Root causes
Le finite-branch clone accidentellement la logique de clamp-à-1 de son voisin `mapWithConcurrency`,
dont le docstring documente l'intention **opposée** pour une entrée absurde (« une valeur nulle,
négative ou non finie vaut 1 (séquentiel) », ligne 20-21). Deux fonctions du même fichier, deux
contrats distincts pour l'entrée absurde ; `chunk` a hérité du mauvais. Le **code** est fautif, pas
le docstring : le chemin non fini honore déjà « tranche unique ».

## Business impact
Latent aujourd'hui. Le seul appelant de production, `apps/web/hooks/composer/useAttachmentUpload.ts:329`
(`chunk(files, batchSize)`), passe `batchSize` = 10 par défaut (entier positif) et calcule
`start = batchIndex * batchSize` en supposant des tranches d'exactement `batchSize` éléments — il ne
déclenche jamais `size < 1`. Le gateway (`MessageProcessor.ts`) n'utilise que `mapWithConcurrency`,
pas `chunk`. Aucune régression utilisateur en vol.

## Technical impact
Dette de contrat : une SSOT de concurrence (partagée gateway + web, cf. docstring d'en-tête) dont le
comportement contredit sa propre documentation. Tout futur appelant lisant le docstring et passant
un `size` calculé pouvant descendre sous 1 (borne dynamique, `Math.floor` d'un ratio) recevrait un
fragment en singletons — l'inverse de « ne pas découper ». Le test vert masquait le défaut.

## Risk assessment
- **Fix : très faible.** Un seul opérateur ajouté (`&& size >= 1`). Comportement inchangé pour tout
  `size >= 1` (`Math.floor(size)` identique à `Math.max(1, Math.floor(size))` quand `size >= 1`) et
  pour tout `size` non fini (déjà `items.length`). Seul le finite-`< 1` bascule de singletons vers
  tranche unique — précisément le contrat documenté.
- **Rollback :** retirer `&& size >= 1` et restaurer l'assertion `.flat()` du test.

## Proposed improvements
1. **GREEN.** `const step = Number.isFinite(size) && size >= 1 ? Math.floor(size) : items.length;`
   — un `size` fini < 1 rejoint le chemin « tranche unique » des entrées non finies.
2. **Test durci.** Remplacer l'assertion `.flat()` par une assertion de **structure**
   (`toEqual([[1, 2, 3]])`), étendue à `0.5` (fractionnaire) et `Number.POSITIVE_INFINITY`, épinglant
   uniformément le contrat « toute taille absurde ⇒ une seule tranche ».

## Expected benefits
- Le code honore son docstring : zéro drift contrat/implémentation.
- Le voisin `mapWithConcurrency` (clamp-à-1) et `chunk` (tranche unique) ont chacun un contrat
  d'entrée-absurde explicite ET testé — plus de confusion entre les deux.
- Durcissement préventif : un futur appelant à borne dynamique est protégé.

## Implementation complexity
Triviale. 1 ligne de production, 1 bloc de test réécrit.

## Validation criteria
- [x] Baseline `concurrency.test.ts` verte au départ (20 tests).
- [x] RED prouvé : structure `[[1,2,3]]` échoue sur `0`, `-1`, `0.5` (3 fails), passe sur `NaN`/`Infinity`.
- [x] GREEN : `concurrency.test.ts` 23/23.
- [x] Suite `packages/shared` complète : 96 fichiers / 2330 tests verts.
- [x] `tsc --noEmit` (shared) : 0 erreur. `bun run build` (shared) : OK.
- [x] `tsc --noEmit` (gateway) : 0 erreur (baseline confirmée).
- [x] Appelants audités : `useAttachmentUpload.ts` (`chunk`, batchSize positif) et
      `MessageProcessor.ts` (`mapWithConcurrency` seul) inchangés.
