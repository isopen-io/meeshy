# Iteration 181 — `StatusService.resetMetrics()` sous-évalue `cacheSize` (omet `onlineEnsureCache`)

## Protocole (démarrage)
`main` @ `4881f06` (derniers merges : #2061 android/status L1 cache, #2058
Republish action, #2055 status composer…). Branche `claude/brave-archimedes-6l1efc`
réinitialisée sur `origin/main`. Ce cycle prend **181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Les dépendances gateway ont été installées
(`bun install`), le client Prisma généré et `@meeshy/shared` buildé pour
reproduire la parité CI locale (jest 30 sous Node 22).

## Current state
`services/gateway/src/services/StatusService.ts` maintient trois caches de
throttling en mémoire : `activityCache`, `connectionCache` et `onlineEnsureCache`
(ce dernier ajouté plus tard pour throttler `ensureUserOnline` via REST). La
métrique d'observabilité `metrics.cacheSize` (exposée par `getMetrics()` et
consommée par la route `GET /maintenance` → `maintenance.ts:178`) doit refléter la
taille cumulée **des trois** caches.

Six sites recalculent `cacheSize` à l'identique après une mutation de cache :
```ts
this.metrics.cacheSize = this.activityCache.size + this.connectionCache.size + this.onlineEnsureCache.size;
```
Mais `resetMetrics()` (ligne 502) réécrivait la somme **à la main** en oubliant le
troisième cache :
```ts
cacheSize: this.activityCache.size + this.connectionCache.size,  // onlineEnsureCache manquant
```

## Problems identified
1. **`cacheSize` sous-évaluée après `resetMetrics()`.** Immédiatement après un
   reset des compteurs (déclenché par `POST /maintenance/reset-metrics` →
   `maintenance.ts:216`), `metrics.cacheSize` omet `onlineEnsureCache.size`. Un
   opérateur qui reset puis lit les métriques voit une taille de cache fausse
   (sous-estimée du nombre d'utilisateurs actuellement throttlés sur
   `ensureUserOnline`). `resetMetrics` **ne vide pas** les caches — il est donc
   censé conserver la taille *live* réelle, ce que la ligne fautive brisait.
2. **Duplication de l'expression (7 copies) = divergence par construction.** La
   même somme était réécrite littéralement à 7 endroits. Le bug est exactement la
   conséquence de cette duplication : un seul site (`resetMetrics`) a dérivé
   quand `onlineEnsureCache` fut ajouté aux six autres.

## Root cause
`onlineEnsureCache` a été introduit après coup et les six sites d'assignation ont
été mis à jour pour l'inclure, mais `resetMetrics` — qui recopiait l'expression à
la main plutôt que de la factoriser — a été oublié. Aucune source unique du calcul
n'existait pour empêcher cette dérive.

## Business / Technical impact
- **Observabilité** : métrique de capacité mémoire faussée après reset → un
  monitoring/alerting basé sur `cacheSize` (fuite mémoire des caches de throttle)
  peut manquer une croissance anormale de `onlineEnsureCache`. Impact limité aux
  outils d'ops (pas d'impact fonctionnel utilisateur), mais c'est précisément le
  genre de dette silencieuse que la mission vise à éliminer.
- **Maintenabilité** : 7 copies d'une même expression → chaque futur cache ajouté
  risque de reproduire l'oubli.

## Risk assessment
Très faible. Refactor purement interne : extraction d'une méthode privée
`computeCacheSize()` renvoyant la somme des trois caches, appelée par les 7 sites.
Comportement inchangé pour les six sites déjà corrects (résultat identique) ;
`resetMetrics` est ramené à la valeur correcte. Aucune signature publique touchée.

## Proposed improvements / Correctif (TDD)
- **RED** : +1 test (`unit/services/StatusService.test.ts` → `resetMetrics`) —
  peuple les trois caches (`activityCache`, `connectionCache`, `onlineEnsureCache`)
  puis appelle `resetMetrics()` et attend `cacheSize === 3`. Échoue sur le code
  d'origine (`Received: 2`).
- **GREEN + REFACTOR** :
  1. Ajout de la méthode privée `computeCacheSize()` (source unique de la somme,
     JSDoc documentant le bug historique évité).
  2. Les 6 assignations `this.metrics.cacheSize = …` et la ligne `resetMetrics`
     délèguent à `this.computeCacheSize()`.

## Expected benefits
- `cacheSize` exacte dans tous les états, y compris juste après `resetMetrics`.
- Divergence future impossible : une seule expression à maintenir.

## Implementation complexity
Faible — extraction d'un helper privé + remplacement de 7 sites (dont 6
strictement identiques via `replace_all`).

## Validation criteria
- `services/gateway` : `unit/services/StatusService.test.ts` **55/55** verts
  (1 nouveau) ; `unit/routes/maintenance-routes.test.ts` **13/13** verts
  (consommateur de `getMetrics`/`resetMetrics`). Total **68/68**.
- RED prouvé : le nouveau test échoue (`Expected 3, Received 2`) sur la ligne
  fautive restaurée, passe avec le fix.

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — ordre de résolution `username ?? displayName`
  (sémantique « présence key ») : hors périmètre, à ne PAS uniformiser sans analyse
  dédiée (reporté depuis itér. 179/180).
- Résolution `sender.displayName || sender.username` dispersée dans ~15 composants
  admin/web sans passer par `getUserDisplayName` (SSOT) : candidat SSOT large, à
  planifier (les 4 définitions de `getUserDisplayName` sont déjà consolidées).
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
