# Realtime sync audit — 2026-08-01 (continuous-improvement pass)

Cycle #5 du passage temps-réel continu. Environnement d'exécution Linux — **pas
de toolchain Swift/Xcode** : l'app iOS (`apps/ios`) et le SDK (`packages/MeeshySDK`)
ne sont ni compilables ni testables ici. Surface auditée = cœur temps-réel
**testable en isolation** côté TypeScript (gateway + `packages/shared` + client web
`apps/web`), sous Jest/bun.

**Conclusion : aucun défaut de correction sûr, isolé et testable à
corriger-puis-merger.** Verdict identique aux quatre cycles précédents
(`realtime-sync-audit-2026-07-05.md`, `-07-11.md`) + aux trois commits de fix
post-audit (`1b719ed`, `bf05bed`, `39bbb70`) qui ont fermé les défauts atteignables.
Le cœur temps-réel est production-hardened.

## Méthode de ce cycle

- Baselines vertes établies avant tout : gateway `ReactionHandler` (8 suites /
  208 tests), web `services/socketio/` (9 suites / 423 tests). Prérequis CI
  reproduits (prisma generate + `packages/shared` build).
- Chasse adversariale gateway (sous-agent dédié, 35 outils) avec construction de
  scénarios d'échec concrets pour chaque candidat.
- Revue indépendante du client web (hors scope du sous-agent).

## Surfaces re-vérifiées correctes ce cycle (ne pas re-défricher)

### Gateway (`services/gateway/`)
- **Réactions** — swap 👍→❤️ removal-on-aggregation-failure déjà corrigé
  (`1b719ed` : `_degradedRemovalEvent` + `_propagateReplacedEmojiRemoval`, pinné).
  Le `.then()` à `ReactionHandler.ts:186` n'a pas de `.catch()` traînant mais
  aucun chemin d'unhandled-rejection n'existe (les appels internes sont async
  avec leur propre `.catch`/`void` ; le `.catch` à :182 renvoie un objet sync
  pur). `PostReactionService`/`CommentReactionService` cappent à
  `MAX_REACTIONS_PER_USER = 1` et **throw** `ConflictError` sur un swap (pas de
  broadcast replaced-emoji) → la classe de bug `1b719ed` n'y existe pas.
  Guard `unchanged` cohérent across Reaction/AttachmentReaction/PostReaction.
- **Curseurs read/delivery** (`MessageReadStatusService.ts`) — `buildCursorFreshnessGuard`
  (`bf05bed`, ordre par `createdAt` pas ObjectId hex) : "transient stall never
  rollback" intentionnel et documenté ; `_advanceCursor` create/P2002-retry,
  hint `cursorExists`, bloc "read implies delivered", guard write-forward-only.
  `computeContiguousReadPrefix`/`resolveReadAt` (`utils/read-exactness.ts`)
  purs, sans off-by-one, pinnés (bord de cutover `>=` inclus).
- **Delivery offline / backfill** (`RedisDeliveryQueue.ts`, `MeeshySocketIOManager.ts`)
  — enqueue dedup-vs-supersede (`new` immutable, events mutables LSET-in-place),
  tri FIFO `byEnqueuedAt`, `collapseCrossSliceDuplicates` (interleave mémoire+Redis),
  éviction par enqueuedAt. Replays add→remove→add convergent. `_drainPendingMessages`/
  `_emitDeliveryForDrainedMessages` group-by-conversation garde le messageId le
  plus récent, filtre `eventType==='new'`, fan-out receipts dédupé.
- **Send/broadcast** (`MessageHandler.broadcastNewMessage`, `MessageProcessor`) —
  enrichissement best-effort (`39bbb70`) complet (forwarded/story-reply/mentions
  ont chacun un `.catch`) ; dédup `(conversationId, clientMessageId)` = INSERT +
  catch P2002 + `findFirst` relookup, race-safe.

### Client web (`apps/web/services/socketio/`)
- **Re-join des rooms au reconnect** — double mécanisme robuste : client
  (`meeshy-socketio.service.ts:50` enregistre `setAutoJoinCallback` →
  `_autoJoinLastConversation` sur `connect`) **et** gateway (`AuthHandler`
  auto-join de TOUTES les conversations de l'utilisateur au connect via
  `_joinUserConversations` + `_joinConversationRoomsWithRetry`, retry borné,
  join AVANT `_registerUser` pour fermer la fenêtre de perte silencieuse). Le
  `useEffect [conversationId]` de `use-socketio-messaging.ts` ne re-fire PAS au
  reconnect socket, mais le server-side auto-join couvre le gap → pas de bug
  parallèle à l'ancien iOS T1/T2.
- **Dédup message** (`messaging.service.ts` `isDuplicateMessage`) — Map
  `recentMessageIds` LRU (cap 200, évince 50 plus vieux), TTL 300s avec garde
  `get(id) === ts` anti-réintroduction. Correct.
- **Decrypt E2EE** (`decryptMessage`) — avale ses propres erreurs en interne
  (retourne un message `_decryptionFailed`), donc le handler async `MESSAGE_NEW`
  ne throw pas de ce chemin → pas de "Async EventEmitter Hazard" ici.
- **Events "morts" R9/R10** (`reaction:sync`, `conversation:online-stats`) —
  **PAS morts d'un point de vue full-stack** : le web les consomme
  (`presence.service.ts`), et `reaction:sync` est un request/response gateway
  (`ReactionHandler.handleReactionSync`). Le verdict "mort" des notes précédentes
  était spécifique à la non-consommation iOS. **Ne pas supprimer** — casserait le web.

## Backlog / candidats hors-scope de ce cycle (non-défauts aujourd'hui)

- **Landmines `substring`** dans les services de réaction (`postId.substring`/
  `commentId.substring`) — notés "no-longer-reachable but not removed". Cleanup
  dead-code possible mais **exige une preuve d'inaccessibilité** avant retrait ;
  pas un bug de mauvaise-sortie aujourd'hui. Faible valeur, risque non-nul.
- **`CallEventsHandler.ts`** — non balayé par les cycles temps-réel messaging ;
  surface distincte (WebRTC signaling), candidate d'un cycle dédié.
- **Items iOS/SDK** (findings #2–#4 du `-07-05`, R2-app, R3 test-seam) — exigent
  macOS/Xcode, impossibles à traiter dans cet environnement Linux.

## Décision de cycle

Rien à merger sur `main`. Fabriquer un changement marginal pour "avoir quelque
chose à merger" violerait les principes du repo (No Laziness, Minimal Impact) et
la consigne explicite de ne jamais faire de merge automatique pouvant écraser du
travail. Ce trail est committé sur la branche de travail pour économiser le
compute du prochain cycle.
