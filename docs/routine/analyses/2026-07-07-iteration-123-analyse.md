# Iteration 123 — Analyse (2026-07-07)

## Protocole (démarrage)
Tâche : routine continue d'audit/amélioration de la feature d'appel audio/vidéo (calling stack complet :
Swift/SwiftUI iOS, WebRTC, signaling gateway, CallKit/PushKit, sécurité, UX, performance). `main` @
`eb58730b`, working tree propre. Branche `claude/loving-thompson-ykzqoe`.

## Revue de l'existant (constat de démarrage)
La feature d'appel a déjà reçu ~20 vagues de la routine `tasks/calls-fonctionnel-todo.md` plus l'audit 360°
`docs/audit-calls-2026-05-11.md` (5 P0 + 18 P1 identifiés en mai, tous fixés sauf 2 nécessitant un accès
prod SSH / device réel). 4 PRs calls étaient déjà ouvertes au démarrage de cette session (sessions
parallèles le même jour) : #1601 (socket-room eviction sur GC force-end), #1606 (version-bump
`initiateCall` + web quality-report), #1597 (typo prop web), #1610 (docs-only). Un agent d'exploration
dédié (lecture seule), explicitement briefé pour éviter ces 4 zones et le backlog déjà déprioritisé (C6,
CALL-DIAG retagging, `negotiate()` guard spéculatif, threading TTL complet), a identifié une cible neuve à
haute confiance.

## Cible : un callee répondant à un appel AUDIO transmettait quand même de la vidéo live (gap privacy/consentement)

Voir `tasks/calls-fonctionnel-todo.md` § Vague 21 pour le détail complet (mécanisme, fix, tests, résultats
de suite). Résumé :

- **Root cause double** (sibling-drift gateway + gap web) : `CallService.joinCallAttempt` ne gate pas
  `isVideoEnabled` par `call.metadata.type` (contrairement à `initiateCall` qui le fait déjà côté
  initiateur) ; `CallManager.handleAcceptCall` (web) n'appelait jamais `getUserMedia` du tout, laissant
  `VideoCallInterface` retomber sur des contraintes média inconditionnelles audio+vidéo.
- **Fix** : gateway — gate `isVideoEnabled` sur `joinCallAttempt` en miroir de l'initiateur (1 ligne +
  lecture `call.metadata.type`, pattern déjà établi ailleurs dans le fichier). Web — extraction d'une
  source unique de contraintes média (`lib/calls/call-media-constraints.ts`) et pré-authorization du callee
  AVANT `call:join`, en miroir exact du pattern déjà existant côté caller.
- **Validation** : gateway `CallService.test.ts` 179/179 (+1 nouveau, RED→GREEN prouvé), suite gateway
  filtrée calls 31/31 suites/864/864 tests, `tsc --noEmit` gateway 0 erreur. Web : `CallManager.acceptCall`
  5/5 (+3 nouveaux, RED→GREEN prouvé par patch scopé au seul diff source), `use-video-call` 46/46 (refactor
  sans régression), nouveau helper 4/4, suite web filtrée calls/webrtc 21 suites/430 tests, `tsc --noEmit`
  web 1535 erreurs identiques avant/après (bruit préexistant confirmé par stash).
- **iOS** : non ré-audité cette session (pas de toolchain Xcode dans cet environnement Linux) — noté comme
  candidat pour une passe dédiée sur le chemin JOIN iOS.

## Future improvements (backlog, non traité ce cycle)
Inchangé : items J (validation device réel), C6 (court-circuit dédup cosmétique), CALL-DIAG retagging (12
sites cosmétiques), `forceEndCall` room Socket.IO non vidée (déjà couvert par PR #1601 en cours), threading
TTL TURN complet à travers tous les événements call, `negotiate()` guard `makingOffer` spéculatif.
