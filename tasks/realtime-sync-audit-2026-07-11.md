# Realtime sync audit — 2026-07-11 (continuous-improvement pass)

Passage ciblé sur le cœur temps-réel **testable en isolation** côté TypeScript
(gateway + `packages/shared`), l'environnement d'exécution étant Linux (pas de
toolchain Swift/Xcode — l'app iOS et le SDK ne sont ni compilables ni testables
ici ; cf. findings #2–#4 de `realtime-sync-audit-2026-07-05.md`, toujours ouverts,
qui exigent macOS).

**Conclusion : aucun défaut de correction sûr et isolé à corriger-puis-merger.**
Le cœur temps-réel audité est bien durci et couvert par des tests exhaustifs. Le
seul candidat relevé s'avère **conforme au contrat existant** (pinné par un test
intentionnel) — le corriger changerait une sémantique produit d'accusés de lecture
sans nécessité. Détail ci-dessous pour éviter de re-défricher le même terrain au
prochain cycle.

## Surfaces vérifiées correctes (ne pas re-vérifier)

- **`packages/shared/utils/`** — `mention-parser.ts` (tri displayName décroissant,
  frontières Unicode, invariant `hasMentions ⟺ parseMentions([])`),
  `user-presence.ts` (échelle 60s/5min/30min, branche `isOnline` autoritative,
  gestion NaN-vs-null), `conversation-helpers.ts`/`resolveUserLanguage` (priorité
  system→regional→custom→device→`fr`), `time-remaining.ts`, `relative-time.ts`,
  `client-message-id.ts`, `sender-identity.ts`, `participant-helpers.ts`. Chaque
  fonction pure a été tracée contre sa docstring et son suite de tests — aucune
  erreur de borne, comparaison inversée ni off-by-one.
- **`MessageReadStatusService`** — bornes `minFloorMs`, recherche binaire `countAbove`
  en `>` strict, soustraction `all − own`, garde `lt` ObjectId de `_advanceCursor`,
  clés de dédup scoping par `messageId` résolu (cf. finding #5 du 2026-07-06),
  union curseur ∪ reçu figé appliquée identiquement aux 4 méthodes de lecture.
- **`MessageProcessor`** — dédup idempotent `(conversationId, clientMessageId)` :
  INSERT direct + catch `P2002` atomique + relecture `findFirst`, race-safe.
- **Handlers Socket.IO** — `StatusHandler` (suppression typing multi-device),
  `ReactionHandler`/`AttachmentReactionHandler` (idempotence + `dedupKey` apparié à
  un `eventType` distinct, donc add/remove ne se collapsent pas), `ConversationHandler`
  (gardes de join), `emitConversationPreviewUpdate`, `serializeAttachmentForSocket`.

## Candidat écarté — `getMessageStatusDetails` omet les participants jamais actifs

`services/gateway/src/services/MessageReadStatusService.ts:1262-1324`

**Observation** : la méthode construit son ensemble à partir de
`evaluatedParticipantIds = union(curseurs, reçus figés)`. Un membre de groupe qui a
rejoint mais n'a **jamais** rien reçu/lu n'a ni curseur ni entrée figée, donc il est
absent — y compris sous `filter: "unread"` et `filter: "all"`. À l'inverse, la
méthode sœur `getMessageReadStatus` (`:1045-1053`) énumère **tous** les participants
actifs pour son `notSeenBy`.

**Pourquoi c'est conforme, pas un bug** : le contrat de `getMessageStatusDetails` est
« participants **ayant un statut enregistré** » (curseur ou reçu figé), avec
pagination et filtres delivered/read/unread. Ce contrat est **pinné par un test
intentionnel** : `MessageReadStatusService.test.ts` → `it('returns empty statuses
when no cursors found')` (~ligne 3228) assert `statuses = []` ET
`participant.findMany` **non appelé** quand aucun curseur n'existe. Le roster complet
« qui n'a pas vu ce message » vit délibérément sur l'endpoint résumé
`getMessageReadStatus.notSeenBy` (route `/messages/:id/status` vs.
`/messages/:id/status-details`). Les deux surfaces ont des contrats distincts par
conception.

**Si l'équipe UI veut fusionner les deux contrats** (afficher aussi les membres
jamais-actifs dans le détail `unread`/`all`), c'est un changement produit délibéré,
pas une correction de bug : il faudrait alors amorcer `evaluatedParticipantIds`
depuis tous les participants actifs (comme `getMessageReadStatus`) ET mettre à jour
le test ci-dessus. Décision propriétaire requise — non traité dans ce cycle.

## Environnement de vérification (parité CI)

- `bun install` échoue sur le postinstall `grpc-tools` (téléchargement S3 bloqué par
  le proxy) ; `bun install --ignore-scripts` complète le linking des binaires.
- Tests `packages/shared` : `bun x vitest run <file>`.
- Tests `services/gateway` : `bun x jest --config=jest.config.json <file>`.
