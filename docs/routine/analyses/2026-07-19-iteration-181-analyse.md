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
# Iteration 181 — `deviceLocale` middleware : cache de debounce non borné (fuite mémoire par utilisateur distinct)

## Protocole (démarrage)
`main` @ `b158a9b` (derniers merges : #2055/#2052/#2050 android/status, #2044
web/i18n normalize codes, #2037 ios/a11y…). Branche
`claude/brave-archimedes-q76pfd` réinitialisée sur `origin/main`. Ce cycle prend
**181**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (gateway/shared). Les PR iOS ouvertes (#2040→#2056) sont pilotées par
d'autres sessions et hors périmètre. Point de départ : **revue Priorité 1**
(fonctionnalités récentes) sur la surface gateway TS — le middleware
`deviceLocale` (Prisme étendu 2026-05-26) est l'ajout serveur récent le plus
directement testable.

## Current state
`services/gateway/src/middleware/deviceLocale.ts` persiste opportunément la locale
appareil (`X-Device-Locale`) dans `User.deviceLocale`, avec un **debounce
par utilisateur de 5 min** implémenté par une `Map` de processus :

```ts
const DEBOUNCE_MS = 5 * 60 * 1000;
const lastUpdateByUserId = new Map<string, number>();  // userId → last write ts
// ...
lastUpdateByUserId.set(userId, now);   // ← une entrée par utilisateur, jamais évincée
```

Le hook est un `preHandler` **global** : il s'exécute sur **chaque requête
authentifiée** de **chaque route**. La `Map` reçoit donc une entrée pour tout
utilisateur enregistré ayant émis au moins une requête portant `X-Device-Locale`.

## Problems identified
1. **Fuite mémoire non bornée (scalabilité).** `lastUpdateByUserId` n'est
   **jamais purgée**. Elle accumule une entrée par utilisateur distinct pour
   **toute la durée de vie du process gateway**. Sur une plateforme visée à
   100k+ utilisateurs (et une gateway à long uptime), la `Map` croît linéairement
   avec le nombre cumulé d'utilisateurs actifs — ~100k entrées ≈ ~10 Mo, 1M ≈
   ~100 Mo — sans plafond. C'est une fuite lente mais réelle.
2. **Entrées mortes conservées.** Une entrée dont l'horodatage dépasse
   `DEBOUNCE_MS` ne peut **plus jamais** supprimer une écriture (la garde
   `now - last < DEBOUNCE_MS` échoue toujours pour elle). Elle est donc du poids
   mort pur : la conserver n'apporte rien mais coûte de la mémoire.

## Root cause
Le debounce a été conçu pour la **correction fonctionnelle** (ne pas marteler la
DB) sans stratégie d'éviction : la `Map` est un cache qui **grandit mais ne
rétrécit jamais**. Le cycle de vie d'une entrée (utile seulement pendant
`DEBOUNCE_MS` après sa dernière écriture) n'était pas exploité pour la libérer.

## Business / Technical impact
- **Mémoire / scalabilité (serveur)** : empreinte du process qui croît de façon
  monotone avec la base d'utilisateurs cumulée — pression GC accrue, risque
  d'OOM sur un uptime long, coût RAM en production.
- **Observabilité** : une croissance mémoire lente et diffuse est difficile à
  diagnostiquer ; la borner par construction supprime une classe entière de
  faux positifs d'investigation.
- **Correctness** : inchangée — le debounce reste strictement identique tant que
  la `Map` est sous le plafond.

## Risk assessment
Très faible. Aucune signature publique ni type de retour modifié. La purge
n'évince que des entrées **expirées** (comportement strictement préservé : elles
ne pouvaient plus supprimer d'écriture). Le plafond dur (`MAX_TRACKED_USERS =
10_000`) ne se déclenche que si >10k utilisateurs distincts écrivent **dans la
même fenêtre de 5 min** — cas pathologique où le seul effet est **une** écriture
`User.update` supplémentaire (idempotente) pour un utilisateur évincé. La purge
est **amortie** (déclenchée uniquement au franchissement du plafond, jamais sur
le chemin chaud nominal). Les 14 tests existants restent verts.

## Proposed improvements / Correctif (TDD)
- **RED** : +3 tests (`deviceLocale.test.ts`, bloc « bounded debounce cache ») —
  (a) éviction des entrées expirées au franchissement du plafond ; (b) borne dure
  respectée même quand toutes les entrées sont fraîches ; (c) pas de purge sous le
  plafond (amortissement, pas d'éviction eager). Nouveaux seams de test
  `_deviceLocaleCacheSize()` / `_DEVICE_LOCALE_MAX_TRACKED_USERS`.
- **GREEN** :
  1. `MAX_TRACKED_USERS = 10_000` + `pruneStaleDebounceEntries(now)` : balaye les
     entrées `now - ts >= DEBOUNCE_MS` puis, si toujours au plafond, évince les
     plus anciennement insérées (ordre d'insertion `Map`).
  2. Chemin d'écriture : avant `set`, si l'utilisateur est nouveau **et** la
     `Map` a atteint le plafond, déclencher la purge. Le hot path nominal (map
     sous plafond) ne paie aucun coût O(n).

## Expected benefits
- Empreinte mémoire du middleware **bornée par construction** (≤
  `MAX_TRACKED_USERS` entrées) quelle que soit la base d'utilisateurs cumulée.
- Élimination d'une fuite mémoire lente sur une fonctionnalité récente.
- Debounce fonctionnellement inchangé sous charge nominale.

## Implementation complexity
Faible — 1 constante + 1 fonction de purge amortie + 1 garde sur le chemin
d'écriture, dans un seul fichier déjà couvert par tests.

## Validation criteria
- `services/gateway` : `deviceLocale.test.ts` **17/17** verts (3 nouveaux, 14
  préexistants inchangés).
- `tsc --noEmit` : 0 nouvelle erreur sur les lignes touchées.

## Backlog (candidats consignés pour une itération future)
- `MeeshySocketIOManager.ts:752` — ordre de résolution différent
  (`username ?? displayName ?? …`, sémantique « présence key ») : hors périmètre,
  à ne PAS uniformiser sans analyse dédiée.
- F69 (`sanitizeFileName` overlong sans extension) : latent, 0 appelant.
