# Iteration 173 — Retry offer stacked on top of a promoted waiting call (web calls)

## Current state
La bannière call-waiting web (busy-path) a été livrée récemment (`f5c545f`,
`8df5439`, série de la Vague 44). Quand l'utilisateur est déjà en appel et qu'un
SECOND appel arrive, `CallManager` affiche `CallWaitingBanner` au lieu d'un
`setIncomingCall` naïf. Si l'appel ACTIF se termine pendant qu'un appel attend,
`handleCallEnded` **promeut** l'appel en attente en sonnerie entrante normale
(parité iOS re-present-after-teardown).

En parallèle, la feature retry-on-failure (`7e6ea5d49`, puis câblée sur le chemin
`call:ended` en Vague 40) pose un `pendingRetry` (offre « Réessayer ») quand un
appel actif tombe sur une raison transitoire (`failed` / `connectionLost`).

## Problème identifié
Ces deux comportements, corrects isolément, **se cumulent** de façon conflictuelle.
Dans `handleCallEnded`, quand l'appel ACTIF se termine avec une raison transitoire
**alors qu'un appel est en attente** :

1. Le bloc retry (`isRetryableCallFailure(event.reason)`) pose `pendingRetry` pour
   l'appel qui vient de tomber.
2. Le bloc de promotion (`if (waitingCall) { … }`) promeut l'appel en attente en
   sonnerie entrante et `return`.

Résultat : l'utilisateur voit **une sonnerie entrante** (le call promu, sa
prochaine action) **ET**, derrière, une offre « Réessayer » pour l'appel mort —
deux UI d'appel empilées et contradictoires. Il peut ré-appeler la partie tombée
pendant qu'un nouvel appel sonne.

## Cause racine
Le bloc retry a été ajouté (Vague 40) sur le chemin `call:ended` **sans tenir
compte** de l'interaction avec le chemin call-waiting (Vague 44), ajouté plus tard.
Aucun des deux n'a de garde sur l'autre. Le `return` de la promotion empêche le
double-teardown de l'état d'appel mais **pas** la pose du `pendingRetry`, exécutée
avant.

## Impact
- **Business** : UX d'appel confuse dans le scénario multi-appels — l'offre retry
  parasite la sonnerie entrante promue. Edge-case mais 100 % reproductible dès
  qu'un appel actif tombe (réseau) pendant un second appel entrant.
- **Technique** : deux surfaces UI d'appel actives simultanément ; `pendingRetry`
  survivant (`reset()` le préserve volontairement) pouvant fuiter sur l'écran
  suivant.

## Risk assessment
Très faible. La correction est une garde `!waitingCall` sur le bloc retry — elle
ne change RIEN au chemin retry hors call-waiting (couvert par
`CallManager.callEndedRetry.test.tsx`, 8 tests inchangés). Elle supprime une offre
parasite dans un seul scénario.

## Correctif (TDD)
- **RED** : 2 tests dans `CallManager.callWaiting.test.tsx` —
  1. appel actif terminé (raison `completed`) pendant attente → l'appel en attente
     est promu en sonnerie entrante (documente le comportement existant, vert).
  2. appel actif terminé (raison transitoire `connectionLost`) pendant attente →
     l'appel est promu **ET** `pendingRetry === null` (échoue : `pendingRetry`
     valait `{conversationId:'conv-active', type:'video'}`).
- **GREEN** : garde le bloc retry sur `!waitingCall` dans `handleCallEnded`.
  La promotion est propriétaire du teardown quand un appel attend ; aucun retry
  n'est offert.

## Validation
- `CallManager.callWaiting.test.tsx` : 8/8 (2 nouveaux verts).
- `CallManager.callEndedRetry.test.tsx` : 8/8 (feature retry intacte hors
  call-waiting).
- Répertoire `__tests__/components/video-call/` : 11 suites / 49 tests verts.
- `tsc --noEmit` : aucune nouvelle erreur introduite (les erreurs `unknown`/mock
  restantes sont pré-existantes, identiques sur la version pristine).

## Environnement
Linux (pas de toolchain Swift/Xcode). Surface web 100 % testable sous jest/bun.
`bun install` (root) + `bunx jest`.
