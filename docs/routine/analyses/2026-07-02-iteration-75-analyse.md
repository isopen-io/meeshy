# Iteration 75 — Analyse d'optimisation (2026-07-02)

## Protocole (démarrage)
`main` @ `86ce3163` (PR #1326 mergée, aucune PR ouverte). Branche de travail
`claude/brave-archimedes-xirfpd` recréée à neuf depuis `origin/main`
(`git checkout -B ... origin/main`).

Revue Priorité 1 (features récentes) :
- **FCM multicast push** (commit `6cd1a3c4`, `FirebaseNotificationService`) : déjà couvert par
  une suite unitaire exhaustive (129 tests sur les 3 fichiers qui la référencent). Rien à backfill.
- En inspectant le chemin d'envoi Firebase, découverte d'un anti-pattern de timeout partagé par
  **3 sites** du gateway — cible retenue ci-dessous.

## Cible iter 75 — Fuite de timer du pattern `Promise.race([op, setTimeout-reject])` (source unique `withTimeout`)

### Current state
Trois sites du gateway implémentaient un timeout via l'idiome `Promise.race([operation,
new Promise((_, reject) => setTimeout(() => reject(...), ms))])`, **sans jamais annuler le timer** :

| Fichier | Timeout | Fréquence d'appel |
|---------|---------|-------------------|
| `services/zmq-translation/ZmqRequestSender.ts:99` | 5 s | **chaque envoi de traduction** (chemin chaud, cible 100k msg/s) |
| `services/notifications/FirebaseNotificationService.ts:188` | 5 s | par push notification |
| `utils/circuitBreaker.ts:130` | configurable | par opération protégée (Socket.IO, Redis, DB, API) |

D'autres sites de timeout (`MetadataManager` ffprobe/ffmpeg, `AgentHttpClient`) utilisent déjà
correctement `clearTimeout` / `AbortController` — hors périmètre.

### Problem identified
Quand l'**opération gagne la course** (cas nominal, quasi tous les appels), le `setTimeout` reste
**programmé jusqu'à son échéance** : le callback de rejet demeure dans la file de timers de Node,
gardant l'event loop occupé et retenant la closure (message, `taskId`…) en mémoire.

Sur `ZmqRequestSender.send()` — un timer de 5 s créé **à chaque message traduit** — le coût est
structurel : à la charge cible (100k msg/s), jusqu'à ~500k timers vivants simultanément, chacun
retenant sa closure jusqu'à expiration. Churn CPU (insertion/expiration dans le heap de timers) +
pression mémoire évitables.

### Root cause
Idiome `Promise.race` + `setTimeout` recopié inline à chaque site, sans `finally { clearTimeout }`.
Le rejet tardif sur une promesse déjà settled est un no-op silencieux (pas d'`unhandledRejection`),
donc le défaut ne se manifeste jamais fonctionnellement — seulement en ressources.

### Business impact
FAIBLE fonctionnellement (aucun changement de comportement observable), MOYEN en scalabilité :
le chemin ZMQ est exactement celui que Meeshy doit tenir à 100k msg/s. Élimine une source de churn
timer/mémoire directement sur le hot path.

### Technical impact
- Une **seule** implémentation de timeout testée/maintenue (SSOT), au lieu de 3 copies.
- Timer systématiquement annulé (resolve, reject, timeout) via `finally`.
- Amélioration de type au passage : `FirebaseNotificationService` typait le résultat multicast en
  `any` (via `admin` non typé) → désormais `MulticastResponse` explicite.

### Risk assessment
**Faible.** `withTimeout` reproduit exactement la sémantique de `Promise.race` (même course, mêmes
messages d'erreur préservés à l'identique — assertions existantes `ZMQ send timeout after 5s`,
`Operation timed out after {n}ms`, `Firebase timeout` inchangées). Seul ajout : `clearTimeout` en
`finally`, invisible du point de vue du contrat.

### Proposed improvement (implémenté)
Nouvelle source unique `services/gateway/src/utils/with-timeout.ts` :
```ts
export async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, message?): Promise<T>
```
Course contre une deadline, timer toujours nettoyé en `finally`. Les 3 sites délèguent, en passant
leur message d'origine pour préserver les assertions et les logs.

### Expected benefits
- Suppression de la fuite de timer sur le hot path ZMQ (churn CPU + mémoire à la charge cible).
- 3 réimplémentations inline remplacées par 1 helper testé (cohérence, maintenabilité).
- Type-safety renforcée du résultat multicast Firebase.

### Implementation complexity
Faible — 1 nouveau fichier + 1 test (7 cas), 3 sites convertis, +1 type local.

### Validation criteria
- [x] `jest` `with-timeout.test.ts` : **7/7** (resolve/reject transparents, timeout message
      défaut + custom, **0 timer résiduel** vérifié via `jest.getTimerCount()` sur resolve, reject
      et timeout).
- [x] `jest` `circuitBreaker.test.ts` : **77/77** (message `Operation timed out after 100ms` inchangé).
- [x] `jest` `FirebaseNotificationService` (2 fichiers) + `ZmqRequestSender` (2 fichiers) :
      **129/129** (assertions `ZMQ send timeout after 5s`, timeout Firebase inchangées).
- [x] Total suites affectées : **213/213** verts.
- [x] `tsc --noEmit` : **0 erreur neuve** dans les 4 fichiers touchés (seul résidu : import
      `@meeshy/shared/prisma/client` non résolu — pré-existant/environnemental, client Prisma
      non généré sous ce sandbox, présent sur `main`).

## Consignés pour itérations futures

| # | Constat | Impact |
|---|---------|--------|
| F32-humain | `TriggerSchedulingModal`/`AgentScheduleTimeline` : durée **humaine** (j/h/min) → source unique distincte si besoin | FAIBLE |
| F31 | `truncateText` : collision de nom `truncate.ts` (objet) vs `xss-protection.ts` (string) | FAIBLE |
| F2 | `SOCKET_LANG_FILTER` OFF par défaut — flip = validation staging (non autonome) | HAUT (~75 % BP) |

## Gain
Fuite de timer supprimée sur les 3 sites `Promise.race`+`setTimeout` du gateway, dont le hot path
ZMQ (un timer par message traduit → 0 timer résiduel). Source unique `withTimeout` testée
(nettoyage garanti en `finally`). Type-safety Firebase multicast renforcée. 213 tests verts,
aucune erreur `tsc` neuve.
