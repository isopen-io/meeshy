# Iteration 108 — Analyse d'optimisation (2026-07-05)

## Protocole (démarrage)
`main` @ `2e2584a9` (« Merge PR #1509 »), working tree propre après merge de l'itération 107
(PR #1507, F76 `isUrlOnly`, mergée). Branche de travail `claude/brave-archimedes-fru31a` recréée depuis
`origin/main` (`git checkout -B … origin/main`), 0 commit non-mergé à préserver.

### Revue d'ingénierie (constat de démarrage)
Suite de l'itération 107 : les candidats reportés F77/F78 ont été réévalués. F78 (`buildAttachmentUrl`)
reste conditionnel (dépend de l'existence effective d'URLs `www.`/porteuses de query — le endpoint
statique gateway est JWT-header, pas query-token, donc drop de query = impact faible/incertain) →
maintenu en report. **F77 retenu** après vérification que les breakers sont réellement câblés en
production (pas des factories mortes) :
- `CacheStore.ts` — `createRedisBreaker()` protège **tout** l'accès Redis (get/set/del/keys/setnx/
  expire/info) — chemin de cache chaud.
- `PushNotificationService.ts` — deux `CircuitBreaker` (FCM + APNs) protègent l'envoi de push.

## Cible : F77 — `CircuitBreaker` ignore `failureWindowMs` → ouverture parasite sur échecs dispersés

### Current state
`services/gateway/src/utils/circuitBreaker.ts` implémente le pattern Circuit Breaker (CLOSED/OPEN/
HALF_OPEN). Le contrat `CircuitBreakerConfig` documente deux champs conjoints :
```ts
/** Number of failures before opening circuit */
failureThreshold: number;
/** Time window for counting failures (ms) */
failureWindowMs: number;
```
Sémantique standard et documentée : « ouvrir le circuit quand `failureThreshold` échecs surviennent
**dans** `failureWindowMs` ». Toutes les factories fixent ce champ (`createSocketIOBreaker` 60 s,
`createRedisBreaker` 30 s, `createDatabaseBreaker` 60 s, `createExternalAPIBreaker` 30 s ;
`PushNotificationService` FCM/APNs 60 s).

### Problems identified
- **[LIVE] `failureWindowMs` n'est référencé nulle part dans la logique de la classe.** `onFailure`
  faisait `this.failureCount++` sans aucun vieillissement temporel ; `failureCount` ne retombait à 0
  que sur un **succès** (`onSuccess`, état CLOSED) ou une transition. Conséquence : des échecs
  **dispersés arbitrairement loin** dans le temps (sans succès intercalé) s'accumulent indéfiniment et
  finissent par franchir `failureThreshold`, ouvrant le circuit alors qu'aucune **rafale** n'a eu lieu
  dans la fenêtre prévue.
- Scénario concret (Redis, threshold 3 / fenêtre 30 s) : échec à t=0, puis à t=10 min, puis à t=20 min
  (trafic Redis faible, aucun succès intercalé) → `failureCount` atteint 3 → circuit OPEN → toutes les
  lectures Redis basculent en fallback (bypass cache) pendant `resetTimeoutMs`, malgré trois échecs
  isolés totalement bénins. Pour `createDatabaseBreaker`, le fallback **jette** « Database is currently
  unavailable » — erreur utilisateur directe.

### Root cause
La fenêtre de comptage n'était jamais matérialisée : le compteur d'échecs était purement cumulatif,
borné seulement par un succès. Le champ `failureWindowMs` — pourtant documenté et configuré partout —
était du code mort de configuration.

### Business impact
Ouverture parasite d'un disjoncteur = dégradation injustifiée : bypass du cache Redis (latence accrue,
charge MongoDB), voire erreurs « service indisponible » côté DB, et push non délivrés (FCM/APNs) — le
tout déclenché par des échecs transitoires épars qui n'auraient jamais dû compter ensemble. Fiabilité
de l'infra en dessous du contrat annoncé.

### Technical impact
Correction locale à la classe : implémenter une **fenêtre fixe** ancrée au premier échec du cycle.
Nouveau champ `failureWindowStart?: number`. Dans `onFailure` : si la fenêtre a expiré
(`now - failureWindowStart > failureWindowMs`) **ou** si le compteur est à 0 (premier échec, ou après
un reset/succès), on démarre une nouvelle fenêtre (`failureWindowStart = now`, `failureCount = 1`) ;
sinon on incrémente. `transitionToClosed` réinitialise aussi `failureWindowStart`. Les consommateurs
(`CacheStore`, `PushNotificationService`) héritent automatiquement du comportement correct sans
changement d'API.

### Risk assessment
Très faible. Tous les tests existants déclenchent leurs échecs dans le **même tick** de faux timer
(donc dans la fenêtre) → comportement **identique** (le circuit ouvre toujours au seuil sur une
rafale). Le seul changement observable concerne les échecs séparés de plus de `failureWindowMs` — qui
ne s'accumulent plus. Aucune régression sur les 77 tests existants (prouvé).

### Proposed improvements (implémenté ce cycle)
- Champ `failureWindowStart?: number`.
- `onFailure` : fenêtre fixe ancrée au premier échec ; reset du compteur quand la fenêtre expire.
- `transitionToClosed` : reset de `failureWindowStart`.
- Commentaire expliquant le *pourquoi* (accumulation sans borne temporelle → ouverture parasite).

### Expected benefits
- `failureWindowMs` honore enfin son contrat documenté sur les 6 breakers câblés.
- Élimine les ouvertures parasites de disjoncteur sur trafic infra faible/intermittent.
- Aucun coût : une soustraction + une comparaison par échec.

### Implementation complexity
Faible (1 champ + ~12 lignes dans `onFailure` + 1 ligne dans `transitionToClosed` ; 3 tests neufs).
Aucun changement de signature/contrat public.

### Validation criteria
- [x] `circuitBreaker.test.ts` **80/80** (77 existants inchangés + 3 neufs : échecs dispersés au-delà
      de la fenêtre n'ouvrent pas, échecs dans la fenêtre ouvrent, reset du compteur à l'expiration).
- [x] Aucun changement d'API ; consommateurs héritent du fix.

## Candidats écartés ce cycle (documentés)
- **F78 — `buildAttachmentUrl`** (`apps/web/utils/attachment-url.ts:54-60`) : correction limitée à
  l'hôte exact `meeshy.me` (pas `www.meeshy.me`) + reconstruction depuis `pathname` seul (drop query/
  hash). **Maintenu en report** : impact conditionnel à l'existence d'URLs `www.`/porteuses de query
  en prod (le endpoint statique gateway s'authentifie par header JWT, pas par query-token → drop de
  query probablement sans effet fonctionnel aujourd'hui).

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/`.
- **F56b** (LOW) : `likeCount` absolu sur `post:reaction-added/removed`.
- **F60b** (LOW) : parité parsing mention iOS/Android sur `MENTION_HANDLE_CHARS` (tiret).
- **F67b** (LOW) : audit découpage jour-calendaire iOS.
- **F69** (LOW) : `sanitizeFileName` plafond 255 sur nom sans extension (latent, 0 appelant).
- **F70** (LOW) : `deepCleanTranslationOutput` apostrophes FR (code mort, 0 appelant).
- **F68b** (LOW) : contrepartie iOS des initiales (parité point-de-code).
- **F78** (LOW-MEDIUM) : `buildAttachmentUrl` hôte-spécifique + drop query — impact conditionnel.
