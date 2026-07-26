# Audit temps réel messagerie — Gateway (2026-07-26, session automatisée)

Contexte : firing programmé de l'agent « Real-Time Messaging Continuous Improvement ».
Environnement : conteneur Linux, **sans Xcode** (aucun build/test iOS possible ici).
Branche : `claude/modest-ritchie-811bc1` == `origin/main` (bbeb2736, 0/0). Aucune PR ouverte.

## Ce qui a été fait
- Bootstrap CI-parité : `bun install`, `prisma generate` (v6.19.3), `bun run build` (shared).
- Baseline verte confirmée : `socketio/__tests__` → **8 suites / 594 tests OK**.
- Audit lecture-seule de tout le chemin temps réel du gateway (Socket.IO, ZMQ,
  livraison, receipts read/delivered, réactions, edit/delete, présence,
  reconnexion, ordering, idempotence, filtrage de doublons).

## Conclusion : chemin temps réel déjà production-grade
Aucun défaut confirmé. Chaque classe de bug de la checklist est déjà couverte par
du code défensif explicite ET des tests :
- Listeners async EventEmitter/Socket.IO → try/catch ou `.catch()` partout ;
  ZMQ via `_safeZmqHandler` (testé).
- Frames binaires ZMQ : `binaryFrames[0]` = 1er binaire (contrat respecté).
- Dédup persistance/emit : `clientMessageId` + garde `isDuplicate` + P2002.
- Receipts : `_advanceCursor` avec garde de fraîcheur **atomique dans le WHERE**
  (anti-TOCTOU), invariant « read ⇒ delivered » (readCount ≤ deliveredCount)
  couvert par 3 tests dédiés.
- Reconnexion : rejointe des salles conversation AVANT enregistrement `connectedUsers`.

## Observation A du pré-audit = FAUX POSITIF (ne pas « corriger »)
`MessageReadStatusService._advanceCursor` (ligne ~461) : pour un `messageId`
non-ObjectId, la clause de fraîcheur `OR:[…]` est volontairement omise (`{}`).
Ce n'est PAS un défaut :
- C'est une décision **intentionnelle et documentée** (« safety net for non-Mongo ids »).
- Elle est **épinglée par un test de régression existant** :
  `MessageReadStatusService.test.ts` → « should not treat non-ObjectId message ids
  as stale (safety net for non-Mongo ids) » (et son miroir côté `markMessagesAsRead`).
- Tous les appelants passent soit `undefined` (résolu DB → ObjectId), soit un
  `messageId` validé en DB (findUnique/findFirst), soit un `cursorTarget` dérivé DB.
  La branche non-ObjectId est donc **inatteignable** en pratique.
- Les champs `lastReadMessageId`/`lastDeliveredMessageId` sont `String? @db.ObjectId` :
  un vrai non-ObjectId lèverait de toute façon côté Mongo (garde ou write). Le
  « filet » est inoffensif mais illusoire ; le modifier casserait un test et
  contredirait un choix délibéré. **Laisser tel quel.**

## Décision de ce cycle
Aucune modification de code. Introduire un changement marginal dans un système
durci contredirait « Minimal Impact / No Laziness » et le garde-fou explicite de
la tâche (« pas de merge pouvant écraser des features / perdre des données »).

## Blocage structurel à remonter
Le backlog restant réel est **iOS Story (8 🔴, cf. `story-reprise-2026-07-27.md`)**,
qui exige un environnement Xcode/iOS 18.2 **absent de ce conteneur Linux**. Chaque
firing de ce planning butera sur le même mur. Recommandation : router les cycles
iOS vers un runner Xcode, ou scoper ce planning sur gateway/web/shared.
