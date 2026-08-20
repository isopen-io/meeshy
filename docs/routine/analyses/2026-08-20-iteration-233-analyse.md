# Iteration 233 — Cache infini des conversations : `pages` ↔ `pageParams` désynchronisés (contrat `InfiniteData` de React Query)

## Protocole (démarrage)
`main` @ `680fd2b6` (dernier commit : `feat(android): forwarded badge names its source conversation (#3228)`).
Branche `claude/brave-archimedes-roblxl` déjà alignée sur `origin/main` (0 avance / 0 retard).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts`, puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suites vitest
partagées vertes au départ (`user-presence`, `conversation-helpers`, `resolve-last-message-preview`).

**Audit anti-doublon** (14 PRs ouvertes au départ) : les PRs jcnm en vol portent les itérations
222→232 (séquences `$`, focal quote, ZMQ audio dedup, parité langue TS↔Swift, pickers iOS). **Aucune
PR ouverte ne touche `apps/web/lib/conversations/infinite-cache.ts`** — zéro chevauchement de fichier.

## Sélection : **Priorité 1 — code récent, bug de contrat de cache documenté comme classe dangereuse**

`infinite-cache.ts` est le point d'écriture STRUCTURÉ unique du cache
`queryKeys.conversations.infinite()` (la liste de la sidebar), extrait récemment de
`use-socket-cache-sync.ts` et partagé avec le catch-up delta
(`use-conversations-delta-sync.ts`). C'est exactement la « feature récemment développée » que la
stratégie priorise, et la classe de bug que `apps/web/CLAUDE.md` marque explicitement comme
corruptrice (« la route paginant par OFFSET… duplique une ligne à chaque frontière de page »).

## Current state (avant correctif)

`rebuildInfiniteConversationPages(old, updated)` reconstruit les pages depuis une liste à plat mise à
jour en préservant les frontières de pages d'origine. Quand la liste à plat est plus longue que la
somme des longueurs d'origine (insertion nette — une conversation neuve arrivée par socket ou par
delta), la fonction pousse une **page de surplus** mais retourne `pageParams: old.pageParams`
**inchangé** :

```ts
if (cursor < updated.length) {
  const last = old.pages[old.pages.length - 1];
  rebuiltPages.push({ conversations: updated.slice(cursor),
    pagination: { ...last.pagination, offset: cursor, total: updated.length } });
}
return {
  pages: rebuiltPages,        // longueur = old.pages.length + 1
  pageParams: old.pageParams, // longueur = old.pages.length   ← off-by-one
};
```

React Query modélise `InfiniteData<TData, TPageParam>` comme **deux tableaux parallèles de même
longueur** (`pages[i]` ↔ `pageParams[i]`). Après cette écriture ils divergent.

## Problems identified

1. **Violation du contrat `InfiniteData`.** `pages.length > pageParams.length` viole l'invariant de
   parallélisme que React Query documente et que ses types imposent. `getNextPageParam` est invoqué
   avec `pageParams[lastIndex]` = `undefined` pour la page de surplus.
2. **Le désync s'ÉLARGIT sans borne.** Le rebuild est rejoué depuis le cache précédent à CHAQUE
   arrivée. Comme chaque appel retourne `old.pageParams` verbatim tout en ajoutant une page,
   `pages.length - pageParams.length` grandit d'un cran à chaque conversation neuve reçue par
   socket/delta entre deux refetches — pas un off-by-one fixe, un écart cumulatif.

## Root causes
- La branche de surplus a été ajoutée pour ne PAS perdre l'élément excédentaire (bien), mais sans
  poser le `pageParam` correspondant. `old.pageParams` était retourné tel quel — le seul champ non
  reconstruit de la structure.

## Business impact
- La sidebar de conversations est l'écran le plus consulté. Une structure de cache non conforme au
  contrat de la lib de data-fetching est une dette de fiabilité sur le chemin le plus chaud :
  `refetchOnMount: 'always'` est armé sur cette query (relecture au montage de la sidebar).

## Technical impact
- **React Query 5.101.4, mesuré sur la source `infiniteQueryBehavior`** : le refetch complet
  (`direction` absent) itère `remainingPages = oldPages.length` — donc il RECONSTRUIT jusqu'à la
  longueur de `pages`, pas de `pageParams`, et s'arrête proprement via le `break` sur
  `getNextPageParam == null` (`hasMore: false`). Le désync est donc TOLÉRÉ / auto-cicatrisé dans
  cette version précise : pas de perte de lignes observable aujourd'hui.
- Le risque est **de contrat et de fragilité**, pas une corruption visible en 5.101.4 : tout
  consommateur direct de `pageParams` (devtools, persister IndexedDB rejouant la structure, une
  future version de React Query qui itérerait `pageParams` au refetch, `maxPages` trimming) hérite
  d'un état incohérent. C'est le genre de dette latente que la routine existe pour éteindre avant
  qu'un upgrade ne la réveille.

## Risk assessment
- **Correctif** : une copie + un `push` supplémentaire. Zéro changement de comportement observable en
  5.101.4 (le refetch se recalait déjà). Risque de régression négligeable ; couvert par test pur.

## Proposed improvements
Reconstruire `pageParams` en parallèle de `pages` : copier `old.pageParams`, et quand une page de
surplus est créée, pousser son offset de départ (`cursor`) — cohérent avec `pagination.offset: cursor`
déjà posé sur cette même page.

```ts
const rebuiltPageParams = [...old.pageParams];
if (cursor < updated.length) {
  rebuiltPages.push({ /* … page de surplus, offset: cursor … */ });
  rebuiltPageParams.push(cursor);
}
return { pages: rebuiltPages, pageParams: rebuiltPageParams };
```

## Expected benefits
- `pages.length === pageParams.length` en tout temps ; le désync ne peut plus s'élargir sur des
  insertions répétées. Cache conforme au contrat `InfiniteData`, robuste aux upgrades et aux
  consommateurs de `pageParams`.

## Implementation complexity
- **Faible.** 1 fichier source (`infinite-cache.ts`, +~8 lignes dont commentaire), 1 fichier de test
  pur (`__tests__/infinite-cache.test.ts`).

## Validation criteria
- RED d'abord : test prouvant `pages.length !== pageParams.length` après une insertion nette (3 vs 2),
  et l'élargissement du désync sur insertions répétées.
- GREEN après correctif : parité stricte + `pageParams[surplus] === offset de la page de surplus` +
  aucune ligne perdue + cas sans insertion inchangé (`[0, 2]` préservé).
- Non-régression : suites appelantes vertes — `use-conversations-query` (+ dedupe, + pagination-rq),
  `use-socket-cache-sync` (×2), `use-conversations-delta-sync` : **188 tests verts**.
- `tsc --noEmit` : **zéro NOUVELLE erreur** (baseline projet 1267, inchangé — les 2 erreurs
  pré-existantes de `infinite-cache.ts` sur `deletedConversationIds` sont hors périmètre, présentes
  avant ce correctif).

## Notes environnement
- `npx eslint` échoue globalement dans ce conteneur (ESLint 10 + `eslint-plugin-react` 7.37 :
  `contextOrFilename.getFilename is not a function`) — incompatibilité d'outillage pré-existante,
  sans rapport avec ce changement. Gate lint réel = CI (bun).
- `tsc --noEmit` à la racine web remonte 1267 erreurs pré-existantes (config incluant les tests) —
  le build réel (`next build`) et les suites jest ne s'en trouvent pas bloqués. Le correctif
  n'en ajoute aucune.
