# Iteration 42 — Analyse d'optimisation (2026-07-03)

## Contexte
Reprise après une longue série de merges non documentés dans `docs/routine`
(les analyses s'arrêtaient à l'iter 41 / 2026-06-14, mais `main` a beaucoup
avancé : calls, push FCM multicast, realtime, a11y iOS). Vérifié que les items
concrets gateway de l'iter 41 (fan-out invitations parallèle, dédup
`user.findUnique` à la création de conversation) sont **déjà mergés**.

Priorité 1 du mandat = features récemment développées. Les surfaces testables sur
ce runner Linux sont gateway / web / shared (iOS/SDK non testable ici). Deux
audits parallèles ciblés (calls ; push/realtime) ont été menés. Baseline
mesurée : `PushNotificationService.test.ts` **73/73** vert avant modification ;
suites notifications **165/165** vertes.

## Audit — constats vérifiés

### 1. Fan-out push séquentiel : un token lent bloque tous les autres appareils (RETENU)
`services/gateway/src/services/PushNotificationService.ts` — `sendToUser()`
(anciennement l.349-389) envoyait à chaque token d'un utilisateur **en série**
via une boucle `for … await`, écriture DB de suivi comprise :

```ts
for (const tokenRecord of tokens) {
  result = await this.sendViaFCM(...) // ou sendViaAPNS(...)
  await this.handleFailedToken(...) | await this.prisma.pushToken.update(...)
}
```

Chaque appel provider est enveloppé dans un `CircuitBreaker` avec **timeout 10 s**
plus retries (`sendApnsWithRetry` / `sendFcmWithRetry`, backoff 200→400 ms). Un
seul token lent ou en timeout **retarde la livraison à tous les autres appareils
sains** du même utilisateur (téléphone + tablette + web + VoIP). C'est sur le
chemin chaud : `createNotification` appelle `sendToUser` pour chaque
message/mention/réaction. Latence O(N) → O(1). Impact HAUT, gateway-only,
unit-testable.

**Sûreté de la parallélisation vérifiée** : les tokens sont indépendants,
chaque `pushToken.update` cible une ligne distincte, et `handleFailedToken` est
gardé par `deactivatingTokenIds` (Set par tokenId). Le `CircuitBreaker` évalue
son état à l'entrée de `execute()` : 5 échecs parallèles l'ouvrent quand même,
et l'ouverture protège l'appel `sendToUser` **suivant** (contrat inter-appels,
qui est le vrai objet du breaker).

### 2. Quirk latent exposé : 1 token → 2 résultats contradictoires sur erreur DB
Dans l'ancien code, `results.push(result)` précédait le `pushToken.update` du
chemin succès. Si cet `update` de bookkeeping (`lastUsedAt`) échouait, le `catch`
externe poussait un **second** résultat `failure` pour le **même** token — donc
`results.length !== tokens.length` et un push pourtant **délivré** rapporté comme
échoué, ce qui pouvait déclencher un **renvoi en double** côté appelant.

## Améliorations livrées
- `sendToUser()` : boucle `for … await` → `Promise.all(tokens.map(...))`.
  Fan-out parallèle, un token lent ne bloque plus les autres.
- Chemin succès durci : l'`update` de bookkeeping est best-effort (try/catch
  local + `warn`). Un push délivré reste `success:true` même si l'écriture DB de
  suivi échoue → **un résultat par token**, plus de renvoi en double.

## Bénéfices attendus
- Latence de livraison multi-appareils : O(N)·(timeout provider) → O(1).
- Robustesse : un provider dégradé n'affame plus les appareils sains.
- Correctness : contrat clarifié (1 résultat/token ; livré = succès).

## Risque & validation
- Risque FAIBLE : changement localisé à une méthode, aucun changement de
  signature ni de contrat externe (l'ordre des résultats n'est pas exploité).
- Validation : TDD (test de concurrence RED→GREEN + test d'isolation d'erreur) ;
  suite `PushNotificationService.test.ts` **75/75** ; suites notifications
  **165/165** ; aucun nouveau type-error attribuable au changement.

## Constats secondaires (non retenus cette itération — backlog)
- `CallEventsHandler.resolveActiveCallParticipantId` fait un `getCallSession`
  (include 4 relations) sur 8 handlers hot-path (heartbeat, quality-report,
  signal, toggles…). Remplaçable par une requête `callParticipant` étroite
  (projection `participantId` + `participant.userId`). Impact HAUT, gateway-only.
- `NotificationService` compte deux fois `notification.count({readAt:null})` par
  notification créée (badge push + `emitCountsUpdate`).
- `MeeshySocketIOManager` `drainActiveTypingState` sur `disconnect` peut émettre
  un faux `typing:stop` multi-appareils (le chemin `disconnecting` gère déjà
  correctement le multi-device).
