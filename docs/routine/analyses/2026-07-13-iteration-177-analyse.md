# Iteration 177 — `getTrackingLinkStats` date-filtered `uniqueClicks` returned the all-time count

## État actuel
`TrackingLinkService.getTrackingLinkStats(token, { startDate?, endDate? })`
alimente le dashboard analytics d'un lien de tracking. Il est atteignable en
production via `GET /api/v1/tracking-links/:token/stats?startDate=&endDate=`
(`routes/tracking-links/tracking.ts:539-542`, schéma de query `types.ts`).

## Problème identifié
Quand un filtre de date est fourni :
- le WHERE de `trackingLinkClick.findMany` applique bien `clickedAt.gte/lte`
  (`TrackingLinkService.ts:429-437`), donc `clicks`, `totalClicks` et **tous**
  les histogrammes (`clicksByCountry`, `clicksByDate`, `clicksByHour`, …) ne
  couvrent que la fenêtre ;
- `uniqueIps` / `uniqueFingerprints` sont recalculés depuis ce set filtré
  (`:507-512`) ;
- **mais** `uniqueClicks` était pris inconditionnellement du compteur STOCKÉ
  all-time `trackingLink.uniqueClicks` (`:517-518`).

Ce compteur est initialisé à `0` dans `createTrackingLink` (`:160`) et seulement
incrémenté à l'écriture (`:347`) : il est **toujours** un nombre, donc le
fallback `?? Math.max(uniqueIps.size, uniqueFingerprints.size)` était du code
mort, et les tailles filtrées fraîchement calculées étaient silencieusement
jetées.

## Cause racine
Le compteur stocké a été introduit (Vague antérieure) pour que les endpoints
non filtrés renvoient tous le MÊME nombre (cohérence cross-endpoint avec
`/posts/:id/share`). Cette justification n'est valable **que** pour la requête
non filtrée : le compteur ignore la notion de fenêtre `[startDate, endDate]`.
La branche filtrée a hérité du compteur all-time par omission.

## Impact
- **Technique** : viole l'invariant évident `uniqueClicks ≤ totalClicks`.
  Ex. lien avec `uniqueClicks` stocké = 40, `totalClicks` all-time = 100 ; 2
  clics (1 IP unique) dans la fenêtre → réponse `totalClicks: 2` (correct) mais
  `uniqueClicks: 40` (faux ; correct = 1).
- **Business** : toute lecture analytics filtrée par date (rapports
  hebdo/mensuels, comparaisons de campagne) affichait un taux d'unicité
  incohérent (>100 %), sapant la confiance dans le dashboard.
- **Risque** : faible — correctif isolé, une seule méthode, une condition.

## Correctif proposé (implémenté, TDD)
- **RED** : nouveau test `recomputes uniqueClicks from the filtered set when a
  date range is provided` — lien stocké `uniqueClicks: 40`, 2 clics filtrés (1
  IP) → attend `uniqueClicks === 1` et `uniqueClicks ≤ totalClicks`. Échoue sur
  le code actuel (reçoit 40).
- **GREEN** : sur une fenêtre de date, recalculer depuis le set filtré ; sinon
  garder le compteur stocké (cohérence cross-endpoint préservée) :
  ```ts
  const recomputedUniqueClicks = Math.max(uniqueIps.size, uniqueFingerprints.size);
  const isDateFiltered = Boolean(params?.startDate || params?.endDate);
  const uniqueClicks = isDateFiltered
    ? recomputedUniqueClicks
    : ((trackingLink as TrackingLink).uniqueClicks ?? recomputedUniqueClicks);
  ```

## Bénéfices attendus
- L'invariant `uniqueClicks ≤ totalClicks` tient sur toutes les fenêtres.
- Le chemin non filtré reste bit-for-bit identique (cohérence cross-endpoint
  intacte) — vérifié par le test existant `uses stored uniqueClicks`.

## Complexité d'implémentation
Triviale : +1 constante, +1 condition, aucune signature ni caller modifiés.

## Critères de validation
- `TrackingLinkService.test.ts` : 74/74 (dont le nouveau + l'existant non
  filtré).
- Toutes les suites `tracking` : 12 suites / 244 tests verts.
- `tsc --noEmit` : 0 erreur nouvelle sur le fichier touché.

## Environnement
Linux (pas de toolchain Swift/Xcode). Surface 100 % TypeScript testable en
isolation. `bun install --ignore-scripts` + `prisma generate` + `bun run build`
(shared) + `bunx jest`.
