# Lessons

## Leçon 80 — l'épinglage/désépinglage de message ne passait PAS par la file hors-ligne (2026-07-09, routine messaging, iter 150)

Suite directe de la Leçon 79 (qui appliquait la règle « énumérer TOUTES les mutations d'un agrégat message
visibles côté client et vérifier que chacune passe par la file de rattrapage hors-ligne » et bouchait le trou
réactions). Le prochain maillon manquant : **le pin/unpin**. Les routes REST
`PUT/DELETE /conversations/:id/messages/:messageId/pin` (`routes/conversations/messages.ts`) n'émettaient
`message:pinned`/`message:unpinned` QUE vers la room conversation live
(`getManager()?.getIO().to('conversation:...').emit(...)`) — **aucune** dépendance `deliveryQueue`, aucun
enqueue. Un participant hors-ligne au moment de l'épinglage ratait l'emit live et son état de pin restait
périmé jusqu'à un refetch complet sans rapport — exactement le trou déjà bouché pour edit/delete (Leçon 58) et
réactions (Leçon 79), laissé béant sur le jumeau « pin ».

**Scénario de perte** : A épingle le message M ; C (participant, hors-ligne) rate l'emit live. À la
reconnexion, `_drainPendingMessages` ne draine que new/edit/delete/reaction → C ne voit jamais l'épingle.

**Fix** : symétrie stricte. (1) `QueuedMessagePayload.eventType` gagne `'pinned' | 'unpinned'` (shared).
(2) `_drainedEventName` (MeeshySocketIOManager) mappe ces types vers `MESSAGE_PINNED`/`MESSAGE_UNPINNED`.
(3) Nouvelle méthode PUBLIQUE `MeeshySocketIOManager.enqueueOfflineMessageMutation({ conversationId,
actorUserId, eventType, messageId, payload })` — les routes pin/unpin sont REST (pas WS), donc l'enqueue vit
sur le manager (accessible via `getManager()`) plutôt que dans un handler socket. Elle exclut l'acteur **par
userId** (les routes pin tournent sous `requiredAuth` → acteur toujours registered) et saute les pairs en ligne
(`connectedUsers.has(queueKey)`, `queueKey = userId ?? participantId`). Dedup par défaut (messageId) suffisant :
`pinned` et `unpinned` portent des eventTypes distincts donc un pin-puis-unpin garde les deux entrées dans
l'ordre d'enqueue, un toggle répété même-sens supersede en place — pas besoin de `dedupKey` fin comme les
réactions. Les entrées pin ne portent jamais d'accusé (`_emitDeliveryForDrainedMessages` filtre déjà
`eventType === 'new'`). Tests : mapping drain pinned/unpinned + 4 tests `enqueueOfflineMessageMutation`
(exclusion acteur/en-ligne, clé participant pour anonyme, échec lookup avalé) + 2 assertions routes pin/unpin.
464 + 157 tests verts, tsc gateway OK.

**Règle réutilisable (rappel Leçon 79, étendue REST)** : le signal « handler/route qui ne fait que du broadcast
live sans dépendance `deliveryQueue` » vaut AUSSI pour les routes REST, pas seulement les handlers WS. Quand une
mutation d'agrégat message est déclenchée par REST (pin, futur : édition/suppression REST, receipts REST…),
elle doit passer par la MÊME file — via une méthode publique du manager si nécessaire. Reste à auditer côté
même série : `message:read-status` déjà couvert par un chemin dédié ; vérifier au prochain tour si d'autres
mutations REST d'agrégat (mentions résolues, traductions tardives) ont un jumeau hors-ligne manquant.

## Leçon 79 — la file de livraison hors-ligne couvrait send/edit/delete mais PAS les réactions (2026-07-08, routine messaging, iter 147)

`RedisDeliveryQueue` + `_drainPendingMessages` rejouent à la reconnexion les `message:new` (Leçon send),
`message:edited` et `message:deleted` (Leçon 77/78) aux participants hors-ligne. Mais `ReactionHandler`
n'avait **aucune** dépendance `deliveryQueue` : `reaction:added`/`reaction:removed` n'étaient émis QUE vers la
room conversation live (`_broadcastReactionEventWithConversationId` → `io.to(ROOMS.conversation(...))`). Un pair
hors-ligne ne recevait donc jamais la réaction et ses compteurs de réactions restaient périmés jusqu'à un refetch
complet sans rapport — exactement le trou que Leçon 77/78 avaient bouché pour les éditions/suppressions, laissé
béant sur le jumeau « réaction ».

**Scénario de perte** : A réagit 👍 au message de B ; C (participant, hors-ligne) rate l'emit live. À la
reconnexion, `_drainPendingMessages` ne draine que send/edit/delete → C ne voit jamais le 👍 tant qu'il ne
recharge pas toute la conversation.

**Fix** : symétrie stricte avec `MessageHandler`. (1) `QueuedMessagePayload.eventType` gagne
`'reaction-added' | 'reaction-removed'` (shared). (2) `_drainedEventName` mappe ces types vers
`REACTION_ADDED`/`REACTION_REMOVED`. (3) `ReactionHandler` reçoit `deliveryQueue` (setter injecté par
`MeeshySocketIOManager.setDeliveryQueue`, même instance que MessageHandler) + un
`_enqueueOfflineReactionEvent` copié sur `_enqueueOfflineEventForParticipants` — exclut l'acteur par **id
participant** (Leçon 78 : exclure sur l'identité de l'APPELANT, `participantId` du réacteur, jamais sur le
contenu) et saute tout pair en ligne (`connectedUsers.has`). Le swap mono-réaction met aussi en file la
suppression de l'emoji remplacé. Les entrées réaction ne portent jamais d'accusé de livraison
(`_emitDeliveryForDrainedMessages` filtre déjà `eventType === 'new'`). Tests RED→GREEN : 6 tests d'enqueue
`ReactionHandler` + mapping drain `MeeshySocketIOManager` + forward setter. 1130 tests socketio verts, tsc OK.

**Règle réutilisable** : quand une file de rattrapage hors-ligne existe pour un sous-ensemble d'événements de
mutation d'un même agrégat (message : new/edit/delete), énumérer TOUTES les mutations de cet agrégat visibles
côté client (réactions, épinglage, receipts…) et vérifier que chacune passe par la même file. Un handler qui
n'a pas la dépendance `deliveryQueue` du tout est le signal : il ne fait que du broadcast live et perd
silencieusement l'état pour les hors-ligne. La parité « live + rejeu » doit être exhaustive, pas
échantillonnée.

## Leçon 74 — Un audit gateway/web-only "SERVER_EVENTS.X, jamais émis" ne prouve pas que X est mort si iOS n'a pas été grep (2026-07-08)
En auditant `SERVER_EVENTS.CALL_FORCE_LEAVE` (`packages/shared/types/socketio-events.ts`), un agent
d'exploration scopé gateway+web a rapporté "aucun émetteur, aucun consommateur, commentaire source dit
'no emitter yet'" — j'ai supprimé la déclaration TS. Un grep `apps/ios` fait APRÈS coup (pas fait par
l'agent, ni par moi avant d'agir) a révélé `MessageSocketManager.swift:3052`
(`socket.on("call:force-leave")`, publie via un `PassthroughSubject` Combine) + `CallManager.swift:3689`
(abonnement réel) + une suite de tests dédiée (`CallManagerTests.swift:3230-3276`, vérifie le teardown et
le report CallKit) — un récepteur RÉEL et TESTÉ, pas mort du tout côté client, juste jamais déclenché
parce que le serveur ne l'émet jamais. Restauré avant tout commit. **Règle : dans un repo cross-platform
(iOS + web + gateway) où un seul côté définit le contrat serveur→client (`packages/shared`), un audit
"jamais émis" scopé à gateway/web ne peut PAS conclure "mort" — il ne voit que la moitié émettrice. Avant
de supprimer/modifier une déclaration `SERVER_EVENTS.X`/`CLIENT_EVENTS.X` sur la base d'un grep
gateway+web, grep AUSSI `apps/ios` et `packages/MeeshySDK` pour un `socket.on("...")`/`socket.emit("...")`
correspondant** — la vraie conclusion peut être "receiver mort des deux côtés" (à supprimer) OU "gap
d'implémentation serveur avec un client déjà prêt" (à décider : implémenter l'émission, ou supprimer le
récepteur en connaissance de cause), et ces deux verdicts appellent des actions opposées. Corollaire :
quand une suite de tests existe UNIQUEMENT pour un chemin qui semble mort ("pourquoi teste-t-on un
comportement jamais déclenché ?"), c'est un signal fort d'un gap d'implémentation ailleurs plutôt que de
code réellement mort — un vrai mort n'aurait généralement pas justifié l'investissement de 6 tests dédiés
dans une suite existante.

## Leçon 58 — L'offline delivery queue ne savait rejouer que `message:new` (2026-07-03/04)
Suite directe de la Leçon 57 : une fois `MessageHandler`/`MeeshySocketIOManager` capables
d'enqueue les nouveaux messages pour les destinataires hors-ligne, l'audit suivant a montré que
`handleMessageEdit`/`handleMessageDelete` (WS) et leurs équivalents REST (`routes/messages.ts`)
n'enqueuent JAMAIS rien — et plus profondément, `QueuedMessagePayload`/`RedisDeliveryQueue` ne
pouvaient structurellement représenter qu'un `message:new` (`_drainPendingMessages` émettait
`SERVER_EVENTS.MESSAGE_NEW` inconditionnellement). Un edit/delete fait pendant qu'un destinataire
est hors-ligne était donc silencieusement perdu pour lui : son cache garde l'ancien contenu (ou
le message supprimé reste visible) jusqu'à un refetch complet non lié. **Fix scopé au chemin WS
uniquement** (le chemin REST edit/delete a le même trou mais est laissé en suivi documenté, comme
Hotspot B.1 dans `tasks/realtime-hotspots-analysis.md` — élargir le schéma une seconde fois puis
router 4 call sites au lieu de 2 aurait dépassé le "petit changement chirurgical" de cette
passe) : `QueuedMessagePayload.eventType?: 'new'|'edited'|'deleted'` (absent = legacy, 100%
rétrocompatible), `_drainedEventName()` route l'émission du replay selon ce champ, et
`_emitDeliveryForDrainedMessages` ignore désormais les entrées non-`'new'` (une distribution
"delivered" n'a pas de sens pour un edit/delete). **Règle générale (applicable à tout futur ajout
similaire) : quand une queue de replay ne transporte qu'UN type d'événement en dur (ici
`MESSAGE_NEW` hardcodé dans la boucle d'émission), vérifier si d'autres mutations en place du
même objet (edit, delete, réaction...) ont le même besoin de rejeu offline avant de considérer le
sujet clos — le premier fix pour "new" laisse un faux sentiment de complétude.** Tests :
`MeeshySocketIOManager.test.ts` (routage par eventType + exclusion receipt), 2 nouveaux cas dans
`MessageHandlerEditDelete.test.ts`.
## Leçon 62 — Un chemin socket qui hardcode une valeur que son sibling REST calcule (2026-07-04, itération 91)
`NotificationService.createPostLikeNotification` reçoit un `postType` load-bearing (il pilote le TYPE de
notification `story_reaction`/`status_reaction`/`post_like`, le contenu, le sous-titre, `metadata.postType`
REEL vs POST) + un contexte éphémère `postCreatedAt`/`postExpiresAt`/`postPreview`. Le call site REST
(`routes/posts/interactions.ts`) forwardait le vrai `post.type` + le contexte ; le sibling socket
(`PostReactionHandler._createPostReactionNotification`) `select`ait `authorId` seul et **hardcodait**
`postType: 'POST'`. Résultat : toute réaction émise par WebSocket sur une STORY/STATUS/REEL produisait une
notification typée POST, sans contexte d'expiration — divergence directe avec le chemin REST pour la même
action utilisateur. **Règle : quand deux chemins (REST + socket) appellent le MÊME service producteur de
notification/événement, ils doivent forwarder le MÊME jeu d'arguments — un argument hardcodé sur un chemin
alors que son sibling le calcule dynamiquement est une dérive silencieuse. Grep le service producteur
(`createPostLikeNotification(`), énumère TOUS ses call sites, et diff leurs arguments — pas juste le
premier.** Le `select` du `findUnique` doit être élargi en lockstep avec les champs forwardés (ici
`type`/`content`/`createdAt`/`expiresAt`), sinon le champ forwardé est `undefined` silencieusement.

## Leçon 59 — Un widen de regex de langue (639-3) doit couvrir TOUS les schémas de code langue (2026-07-03, itération 89)
L'itération 86-B avait élargi `CommonSchemas.language` (`validation.ts`) de `[a-z]{2}` à `[a-z]{2,3}`
pour accepter `bas/ksf/nnh/dua/ewo` (639-3 camerounais canoniques). Mais un **second** schéma,
`languageCodeSchema` (`attachment-validators.ts`), gardait `[a-zA-Z]{2}` → transcriptions/traductions
`bas` rejetées au trust boundary alors qu'un user peut avoir `systemLanguage: 'bas'`. **Règle : un fix
de validation de langue doit grep TOUS les regex `[a-zA-Z]{2}`/`[a-z]{2}` du monorepo (pas juste le
premier trouvé) — les codes 639-3 supportés traversent transcriptions, maps de traduction, préférences
user, et messages ; chaque schéma est un trust boundary distinct.**

## Leçon 58 — Un invariant lossless documenté sur une méthode n'est pas propagé à son sibling (2026-07-03, itération 89)
`getFeed` (PostFeedService) porte un invariant de pagination **explicitement commenté** : `candidateLimit
= limit + 1`, fenêtre chronologique + sonde, *« We deliberately do NOT over-fetch then drop »* — curseur
pris sur le post chronologiquement le plus ancien AVANT le tri par score. Le sibling `getReels`, écrit
avec le même moteur de scoring, a gardé le pattern inverse (`limit * 4` sur-fetch, score tout, curseur
sur l'item score-trié) → réels sautés/re-servis en scroll infini. **Règle : quand un fix documente un
invariant dans un commentaire load-bearing sur une méthode, grep les siblings à même forme (`getFeed`
vs `getReels` vs `getStories` vs `getStatuses`) et vérifier que l'invariant y est appliqué — un
commentaire précis sur UNE méthode ne prouve rien sur ses jumelles.** Variante #40/#42/#45/#50/#55/#56/#57.
Corollaire validation : un test préexistant peut **encoder le comportement bogué** (ici `take === 20`
= le pool `limit×4`) — le recadrer sur l'invariant corrigé fait partie du fix, ne pas le contourner.

## Leçon 57 — Le sibling REST du chemin socket avait le seul enqueue offline (2026-07-03)
`services/gateway/src/socketio/handlers/MessageHandler.ts#broadcastNewMessage` (le chemin
`message:send`/`message:send-with-attachments`, DOMINANT selon ce même CLAUDE.md) n'appelait
JAMAIS `RedisDeliveryQueue.enqueue()` pour les destinataires hors-ligne — seul le sibling REST
`MeeshySocketIOManager._broadcastNewMessage` (utilisé par `POST /conversations/:id/messages`
et par les messages système de fin d'appel) le faisait. Un commentaire présent dans le code
documentait même le fait sans le signaler comme un bug (« le chemin principal `message:send`
n'enqueue pas offline » — `MeeshySocketIOManager.ts:1852-1858`), ce qui l'a laissé vivre sans
alerte. **Conséquence concrète** : un message envoyé via le composer normal (WS) à un
destinataire hors-ligne n'était jamais rejoué à sa reconnexion (`_drainPendingMessages`) et ne
déclenchait jamais l'avancement du reçu expéditeur de "envoyé" à "distribué" — jusqu'à ce que
le destinataire ouvre spécifiquement cette conversation. Variante du thème Leçon 56 (fonctionnalité
testée+câblée sur UN chemin, mais absente du chemin qui compte le plus) : ici pas un hook non
monté, mais un service partagé (`RedisDeliveryQueue`) jamais injecté dans le second des deux
constructeurs qui en avaient besoin. **Règle : quand un service in-memory/partagé (queue, cache,
compteur) est injecté via un setter post-construction (`setXxx()`) sur une classe qui elle-même
construit un sous-handler dans SON PROPRE constructeur, vérifier que le setter forward bien vers
CE sous-handler — sinon le sous-handler reste sur sa valeur d'init (`null`) pour toute sa vie,
même si le service parent est correctement configuré.** Fix : `MessageHandler` reçoit
`deliveryQueue` (optionnel au constructeur + `setDeliveryQueue()`), et
`MeeshySocketIOManager.setDeliveryQueue()` forwarde désormais la même instance à
`this.messageHandler.setDeliveryQueue()`. Enqueue utilise `broadcastPayload` (déjà
cid-stripped, cohérent avec ce que les autres participants reçoivent en direct). Tests :
`MessageHandler.test.ts` (3 cas) + `MeeshySocketIOManager.test.ts` (forwarding).

## Leçon 56 — Un fix "documenté + testé" peut vivre dans un hook jamais monté (2026-07-03)
`apps/web/hooks/useCallSignaling.ts` (répertoire `components/video-calls/`, PLURIEL) porte une
ré-émission `call:join` au reconnect socket, entièrement testée (`useCallSignaling.reconnect.test.ts`
vert) et créditée dans le backlog comme le miroir web du `didReconnect` iOS — mais n'est importé nulle
part dans l'app réellement rendue. Le composant monté à `app/call/[callId]/page.tsx` est
`components/video-call/CallManager.tsx` (SINGULIER), qui réagit bien à `'connect'` mais ne fait que
ré-attacher des listeners d'événements, jamais ré-émettre `call:join` — rendant tout l'investissement
gateway "résilience restart/reconnect" inopérant côté web malgré un test vert qui semblait le prouver.
**Règle : avant de créditer un fix "hook + test passent" dans un backlog, vérifier que ce hook/composant
est réellement import-atteignable depuis une route rendue (`grep` l'arbre d'imports depuis `app/**/
page.tsx` jusqu'au fichier en question) — un test vert sur du code mort ne prouve rien en production.**
Variante du thème sibling-drift (#5/#40/#42/#45/#50/#51/#55) : ici la divergence n'est pas entre deux
implémentations actives, mais entre une implémentation active et un jumeau non branché au nom de
répertoire trompeur (`video-call` vs `video-calls`).
## 2026-07-02 — Calling-feature routine: REST/socket CallService split + no Swift toolchain in this sandbox

1. **A shared in-memory service constructed twice (once per transport) silently desyncs, and it's easy to miss because each half looks correct in isolation.** `routes/calls.ts` built its own `new CallService(prisma)` while `MeeshySocketIOManager` built another — both correct on their own, but a call initiated via REST never registered its ringing-timeout on the instance `CallEventsHandler`/`CallCleanupService` actually read (and vice versa for cleanup). Same root cause class as this file's `RC-4` entries for `CallCleanupService`, just never extended to the REST routes. **Rule: when a service holds server-lifetime in-memory state (maps/timers, not just DB access), grep every `new ServiceClass(` call site in the codebase, not just the one you're touching — two constructions of a "just a DB wrapper"-looking service is a decoupled-state bug waiting to happen.** Fixed by decorating the Socket.IO layer's instance onto `fastify` (`server.ts` `setupSocketIO()`) and having `routes/calls.ts` consume `fastify.callService ?? new CallService(prisma)` (fallback kept for route-isolation tests / boot-order safety, mirroring the existing `presenceChecker`/`notificationService` decorator pattern).
2. **`markCallAsMissed`'s plain `update()` was the one sibling in `CallService.ts` that never got the version/status-scoped `updateMany` treatment** applied to `updateCallStatus`/`leaveCall`/`endCall` in earlier sessions — same "audit every sibling doing read-then-write" lesson as the entry below this one, different method. Fixed by scoping the write to `status: { in: [initiated, ringing] }` and short-circuiting on `count === 0`, mirroring the ringing-timeout handler's own atomic pattern (which is this method's actual caller).
3. **This remote sandbox has no Swift/Xcode toolchain at all** (`which swift/swiftc/xcodebuild` all empty) — confirmed while trying to act on an iOS audit's dead-code findings (`AudioEffectsPanel` + its ~10-file dead chain, `CallMediaConfig` scaffolding). **Rule: without a compiler, do NOT delete/refactor across multiple Swift files based on a text-search-verified "zero call sites" claim** — a single missed reference (protocol conformance, `#if canImport` branch, a test file) breaks the whole target and there is no way to catch it before `git push`. Reserve iOS changes in this environment to single-file, mechanical, pattern-mirroring edits you can fully verify by reading (e.g. folding a property into an existing `OSAllocatedUnfairLock`-guarded `LockedState` struct that already guards two sibling counters the exact same way, or adding a `.frame`/`.contentShape` modifier for a touch-target fix). Left the larger iOS dead-code removal as a follow-up for a session with real Xcode access (`./apps/ios/meeshy.sh build` must stay the actual gate per `apps/ios/CLAUDE.md`, not a text-search proxy for it).

## 2026-07-02 — Calling-feature routine: sibling-pattern drift strikes again (`endCall` idempotency) + a `#else` fallback stub silently missing 2 protocol requirements

1. **When one function in a class already has the "check ALL terminal statuses" guard, grep every sibling that guards on a single status literal instead of the shared constant.** `CallService.updateCallStatus`/`leaveCall`/`joinCall` all guard with `TERMINAL_STATUSES.includes(call.status)` — `endCall()` alone guarded `call.status === CallStatus.ended`, missing `missed`/`rejected`/`failed`. Concretely exploitable: the ringing-timeout path (`markCallAsMissed`) resolves a `CallSession` to `missed` WITHOUT touching `CallParticipant.leftAt` (by design — it only writes the session), so a delayed/retried `call:end` from the initiator still passes the "am I an active participant" check and silently overwrites `missed`→`ended`, `endReason`→`completed` — reopening the exact "phantom completed call" bug a previous session's C3/C4 fix (pre-answer ordering) had just closed, via a completely different trigger (duplicate invocation instead of event ordering). This is the same class of bug as lessons #40/#42/#45 (fix applied to one sibling, not audited across all siblings) — the fix pattern here was **already present three lines above** in the same file (`updateCallStatus`), just not reused.
2. **A `#if canImport(X) ... #else ... #endif` fallback class conforming to a shared protocol can silently drift out of conformance for months if the fallback branch is never compiled in normal CI** (only exercised when the SPM package fails to resolve). Removing one dead protocol requirement (`setMaxAudioBitrate`, confirmed zero prod callers) from `P2PWebRTCClient`'s `#else` stub surfaced that the SAME stub was already missing two OTHER requirements (`applyAudioEncoding`, `videoFilterPipeline`) that the real (`canImport(WebRTC)`) implementation had long since grown — a pre-existing, unrelated compile break in a branch nobody was building. **Rule: whenever touching one conformer of a multi-conformer protocol (real impl + mock + `#else` stub), diff the conformer's member list against the protocol's full requirement list, not just the one member you're editing** — a stub that "was fine last time you looked" silently rots as the protocol grows.
3. **Centralizing a repeated-but-inconsistent pattern (call CallKit `reportCall` before every `.failed(...)` teardown) is safer as ONE gated block than patching N call sites**, provided you first verify (grep) that no reason value reaching that shared point is *already* reported by its own call site — otherwise the centralization double-reports. (This session's own implementation put the gated block inline in `endCallInternal`; a concurrent session that reached `main` first instead extracted a dedicated `failCall(_:)` wrapper called from the 11 sites, additionally gated on `callUsesCallKit` — functionally equivalent, slightly more defensive. Superseded, see #4.)
4. **Two routine sessions running in parallel on the same backlog (`tasks/calls-fonctionnel-todo.md`) independently found and fixed the SAME 3 iOS bugs this cycle** (CallKit `.failed` teardown report, TURN loss on call-waiting hand-off, banner-not-cleared-on-early-hangup) — nearly identical diagnosis, different implementation shape. The other session reached `main` first (real Xcode toolchain, compiled+tested `MeeshyTests` green); this session's branch, based on an older `main`, collided on `git merge origin/main` in exactly the files both touched (`CallManager.swift`, `P2PWebRTCClient.swift`, `WebRTCService.swift`, 2 test files). Resolved by taking `origin/main`'s version wholesale for every conflicting file (`git checkout --theirs`) rather than attempting a line-level reconciliation of two independently-written fixes for the same bug — a merged Frankenstein of two designs risks compiling to neither author's tested state. **Critically, `git checkout --theirs` blindly discards this session's local test additions for the same area even when they're not literally conflicted (auto-merged) — grep the post-merge source for every string your own new tests assert on and delete/rewrite any that no longer match**, don't just trust a clean `git merge` exit code. Two of this session's own test classes (`CallWaitingPendingCallTests`, `EndCallInternalFailedReasonReportsToCallKitTests`) auto-merged into `CallManagerTests.swift` with zero textual conflict yet asserted on identifiers (`if case .failed = reason` inline in `endCallInternal`, inline `pendingIncomingCall?.callId` checks in the socket sinks) that no longer existed after taking `origin/main`'s `failCall(_:)`/`clearPendingIncomingCall(ifMatching:)` refactor — would have failed CI silently disguised as "my own tests, must be fine." One genuine, still-real bug from this session (the `#else` fallback stub missing `applyAudioEncoding`/`videoFilterPipeline`) had NOT been fixed by the other session and had to be reapplied after the merge — taking "theirs" is a starting point, not a substitute for re-diffing your own findings against the merged result. **Rule for future sessions of this routine: `git fetch origin main` and skim recent commit subjects for this backlog's files BEFORE investing in a large iOS fix pass, not just at the end when pushing.**

## 2026-07-02 — Remote sandbox: `prisma generate` can't download engine binaries, but gateway jest doesn't need it

In a fresh Claude Code on-the-web container, `npx`/local `prisma generate` reliably fails with `ECONNRESET` while streaming `libquery_engine*.gz` / `schema-engine*.gz` from `binaries.prisma.sh` through the agent proxy (the CONNECT tunnel + TLS handshake succeed, the transfer itself resets — `checkpoint.prisma.io` gets an explicit 403 policy denial logged at `$HTTPS_PROXY/__agentproxy/status`, but `binaries.prisma.sh` logs no relay failure, so it's a mid-stream reset, not a clean block). `CHECKPOINT_DISABLE=1` and `NODE_USE_ENV_PROXY=1` don't fix it; retries don't either. **Don't burn time retrying — check `services/gateway/jest.config.json`'s `moduleNameMapper` first**: `@meeshy/shared/prisma/client` is mapped to `src/__tests__/__stubs__/prisma-client.ts` and `@meeshy/shared/*` maps straight to `packages/shared/*.ts` source (not `dist/`) — so `node_modules/.bin/jest --config jest.config.json <path>` runs gateway unit/socketio tests with zero dependency on a generated Prisma client or a `packages/shared` build. Reserve the documented `prisma generate && shared build && bun run test:coverage` flow (CLAUDE.md) for when you actually need bun's coverage numbers or are touching Prisma-typed code paths that the stub doesn't cover (per CLAUDE.md, ~17 suites need it: commentId/PostMediaSelect). Also needed first: `bun install --ignore-scripts` (root `bun install` fails on `grpc-tools`' native postinstall trying to fetch a prebuilt binary from a non-allowlisted S3-fronted host — scripts aren't needed for gateway jest).

**Addendum — if you DO need the real generated client (full `bun run test:coverage` parity), the download is fixable, not just avoidable.** `curl` (through the same `$HTTPS_PROXY`) fetches the exact `.gz` engine files fine — only Prisma's own Node/undici downloader chokes mid-stream. Debug the exact URLs/paths with `DEBUG="prisma:*" npx prisma generate ... 2>&1 | grep -i download`, then `curl -sS -o /tmp/x.gz "<url>" && gunzip -c /tmp/x.gz > "<dest>" && chmod +x "<dest>"` for each engine Prisma wants (it needs copies in TWO places: `node_modules/.bun/@prisma+engines@<ver>/node_modules/@prisma/engines/{schema-engine,libquery_engine}-<target>` for the schema/query engine pair, AND `node_modules/.bun/prisma@<ver>/node_modules/prisma/libquery_engine-<target>.so.node` for every `binaryTargets` entry in `schema.prisma`, one download per target — `generate` only needs the ones matching this container's actual platform (`debian-openssl-3.0.x` on the standard image), the rest (arm64/musl, for docker cross-builds) can be skipped unless generate refuses to proceed without them). Once those files exist on disk, `prisma generate` finds them cached and skips the network entirely — full `bun run test:coverage` (492 suites) then runs clean.

## 2026-07-02 — Read-receipt cursor could regress on out-of-order delivery (sibling of the reaction-summary lost-update fix)

Same day, a separate commit (`c0939a3f`) fixed `ReactionService.updateMessageReactionSummary` for a non-transactional lost-update race. That fix pattern ("audit every sibling doing read-then-write on a shared cursor/counter") pointed at `MessageReadStatusService.markMessagesAsRead`/`markMessagesAsReceived`: both upsert `ConversationReadCursor.lastReadMessageId`/`lastDeliveredMessageId` unconditionally from whatever `messageId` the caller passes, with no check that it's actually newer than what's already recorded. A multi-device user (or a retried/reordered socket event) could roll the cursor **backward** — e.g. device B, still showing an older scroll position, marks-read after device A already advanced further — resurrecting already-read messages as unread. Fixed by comparing MongoDB ObjectId hex strings lexicographically (`isStaleCursorMessageId` in `MessageReadStatusService.ts`): the leading 4 bytes of a Mongo ObjectId are a creation timestamp, so string comparison approximates chronological order without an extra query — reusing the `lastReadAt`/`lastDeliveredAt` `findUnique` that already ran for the freeze-window calculation (just added `lastReadMessageId`/`lastDeliveredMessageId` to its `select`). **Guard the comparison to only fire when both ids match the 24-hex-char ObjectId shape** — plenty of this file's own tests use synthetic non-ObjectId strings (`'msg-1'`, `'provided-message-id'`), and a real fixture audit (`grep 'conversationReadCursor.findUnique.mockResolvedValue'`) showed none of them populate the new cursor-id fields, so the guard is a true no-op for all pre-existing tests — zero risk of silently breaking unrelated coverage while adding the safety net for real (24-hex) ids.

## 2026-07-02 — Gateway call authz: `resolveParticipantIdFromCall` vs `resolveActiveCallParticipantId` sibling drift

1. **A two-tier authz helper pair drifts silently unless every call site is audited together.** `CallEventsHandler` has `resolveParticipantIdFromCall` (conversation membership only) and `resolveActiveCallParticipantId` (active participant of THIS call — the strict one, per its own docstring). Previous audit passes fixed `QUALITY_REPORT` and `RECONNECTING`/`RECONNECTED` to use the strict resolver but left `TRANSCRIPTION_SEGMENT` on the weak one — any conversation member (not just call participants) could inject arbitrary text via `call:transcription-segment`, machine-translated and broadcast live into the call. Fixed at `services/gateway/src/socketio/CallEventsHandler.ts:2108`.
2. **`HEARTBEAT` (line 1961) still uses the weak resolver too** — lower severity (the downstream `updateMany` filters on `callSessionId+participantId+leftAt:null` so a spoofed id just no-ops), left as a follow-up rather than bundled into this fix to keep the diff minimal. **Fixed 2026-07-02** (`CallEventsHandler.ts:1961` → `resolveActiveCallParticipantId`): the real cost wasn't the DB no-op, it was the in-memory `CallService.heartbeats` map — any conversation member (not an active call participant) could plant a phantom entry there, and `CallCleanupService` reads that map (`hasHeartbeatData`/`getStaleHeartbeats`) to decide whether a call is a reapable zombie. While fixing it, found `CallEventsHandler-transcription.test.ts` referenced an undefined `activeCallSession()` helper (only a same-named `ACTIVE_CALL_SESSION` const existed) — a `tsc` compile error that failed the whole suite silently (`Test Suites: 1 failed`, `Tests: 0 total`, easy to miss in a big run). **Grep every `describe.only`-free suite's actual test count in CI output, not just pass/fail** — a suite that fails to compile reports 0 tests, which reads as "nothing to see" unless you check the totals line.
3. **When fixing one handler in this class, grep every `resolveParticipantIdFromCall` call site** (`grep -n resolveParticipantIdFromCall CallEventsHandler.ts`) and check each against the docstring's guidance — writes to call state/stats must use the active-participant resolver, not just conversation membership.
4. **Test-mock gotcha: `jest.clearAllMocks()` clears call history, not `mockResolvedValue` implementations.** Swapping a handler from a prisma-mock-backed resolver to `mockCallServiceGetCallSession`-backed resolver silently breaks sibling tests in the same `describe` block that never set `mockCallServiceGetCallSession` themselves — they inherit whatever the last test in file order left behind. Every test exercising an authz-gated branch must explicitly call `mockCallServiceGetCallSession.mockResolvedValue(makeCallSession({ participants: [...] }))`, mirroring the existing `QUALITY_REPORT`/`RECONNECTING` test pattern — don't assume a fresh default.

## 2026-06-24 — Story reader : démarrage vidéo bg/fg synchronisé

1. **Une vidéo foreground NE DOIT PAS démarrer dès l'attach — elle attend le « GO » du canvas.** `StoryMediaLayer.attachPlayer` jouait `player.play()` inconditionnellement en `.play`, donc une vidéo foreground attachée avant le content-ready démarrait EN AVANCE sur la vidéo de fond + l'audio (désync de démarrage). Le fond avait déjà ce gate (`StoryBackgroundLayer.isPlaybackActive`) ; le foreground ne l'avait pas — asymétrie exposée par le merge qui a fait démarrer le fond sans attendre le foreground (PR #915 / `257493438`).

2. **Invariant : fond, foreground et mixer audio démarrent au MÊME instant (content-ready).** Source de vérité côté canvas : `foregroundVideosPlaybackActive`, tenu en phase avec `backgroundLayer.isPlaybackActive` à chaque transition (GO, pause/resume, lifecycle, start/stopPlayback, préemption). Sticky + re-propagé dans `rebuildLayers()` pour qu'une vidéo dont les octets arrivent APRÈS le GO démarre immédiatement à son tour.

3. **Mirror le pattern background quand on ajoute un média gated.** `isPlaybackActive` (intention sticky) + `handleAppLifecycle(active:)` (pause/reprise transitoire respectant l'intention) doivent exister des DEUX côtés. Un `forEachAVPlayer { play/pause }` direct ne suffit pas : il n'affecte que les players déjà attachés, pas l'intention que consulte le prochain attach.

## 2026-04-17 — iOS background stability

1. **`didReceiveRemoteNotification` must await async work before the completion handler.** Calling `completionHandler(.newData)` synchronously before async subtasks finish lets iOS suspend the process mid-flight. Wrap in `beginBackgroundTask` + a tiny actor that guarantees the handler fires exactly once whether the happy path or the OS expiration wins.

2. **Delivery receipts belong in the push path, not the socket path alone.** Sender-side double-check cursors depend on the recipient calling `markAsReceived`. If the recipient never opens the app, the socket path never fires. The APN pipeline is the correct hook — emit `ack(conversationId:)` from `didReceiveRemoteNotification`.

3. **`fatalError` in singleton init crashes the app on disk-full / permission-change / cold wake from push.** Return a degraded in-memory fallback and expose an `isEphemeral` flag so callers can decide whether to persist. Never `fatalError` on initialisation paths that run during background wakes.

4. **Decryption can return an empty array — `msgArray[0]` is a crash.** When mutating via `decryptMessagesIfNeeded(&:)`, guard `first` before indexing. Force-unwrap on collections that were mutated by background tasks is a guaranteed crash in low-memory scenarios.

5. **`AVAudioSession` interruption / route-change observers must be installed exactly once, centrally.** Four players configuring the session independently with no observer leaves the app in a bad state after a phone call or AirPods disconnect. Centralise in a single actor and fan out events via a `PassthroughSubject`.

6. **`willResignActive` is not enough for cache flushes.** It fires on control-center pulls and transient hand-offs, but NOT reliably on full background → terminate. Also observe `didEnterBackground` and `willTerminate` with a synchronous semaphore wait (≤4s) on terminate.

7. **Timer.scheduledTimer on singletons with `[weak self]` closures never fires `deinit`.** Singletons live forever, so weak captures don't break the retain cycle — but the timer keeps firing in background. Explicitly stop timers in `prepareForBackground()` and rearm in `resumeFromBackground()`.

8. **`MKLocalSearch.start { ... }` strongly retains its closure.** Without `[weak self]`, a dismissed picker leaks, and worse, the completion task may write into a zombie view model. Apple search APIs should always be captured weakly.

9. **Route tasks in `@MainActor { Task { await ... } }` through a small actor state machine when multiple exit points exist.** Otherwise a race between happy-path completion and OS expiration leads to double-call of `completionHandler`.

10. **Backgrounding is a single state transition — orchestrate it.** Multiple `.background` handlers scattered across the app invariably drift out of sync. A single `BackgroundTransitionCoordinator` with explicit ordering (players → cache → push → sockets → BG tasks → widgets) makes the lifecycle auditable.

## Prod debugging — agent/translator (2026-06-01)

11. **Prefer a maintained library over a hand-rolled parser, even if absent from node_modules.** "Pas de lib dispo" is not a reason to reinvent — `npm view <pkg>` first. For repairing loose LLM JSON, `jsonrepair` (CJS+ESM, zero-dep) handles trailing commas, single quotes, unquoted keys AND truncation (LLM hitting maxTokens) — a custom scanner missed truncation entirely. Reuse > creation (matches the standing feedback memory).

12. **Never label a behavior "by design" without proving it from the product intent.** Claimed the agent's reactions-only output in dead conversations was "expected" — wrong. The Animator's whole purpose is to revive dead conversations by impersonating multiple users. The burst mechanism existed in the prompt but was never wired to low activity. Verify intent (CLAUDE.md, product docs) before excusing a gap as design.

13. **A hung process with thread-count 1 + ~0% CPU + frozen logs = deadlock, not load.** The translator held a global `threading.Lock` (synthesis serialization) across a never-returning `_model.generate()`; all 37 workers piled behind it. Fix: per-call `asyncio.wait_for` watchdog so a stuck synthesis exits the `with lock:` and frees everyone. Caveat: `run_in_executor` threads can't be truly killed — the watchdog breaks the deadlock but leaks the stuck thread (real fix = killable subprocess).

14. **Rapid sequential pushes to main can leave service images unbuilt.** docker.yml is change-detecting (builds only services whose files changed) AND has a concurrency group that cancels in-progress runs when a newer push arrives. A burst of small per-service commits → each new push cancels the previous run mid-build → the earlier commit's service image is never pushed (observed: fix(prod) built only `agent`, gateway/translator/web cancelled). After a burst of pushes, ALWAYS verify per-service build success (`gh run view <id> --json jobs`) and, if any were cancelled, dispatch a full rebuild: `gh workflow run docker.yml -f services=all`. Better: batch related fixes into ONE commit, or push, wait for the build, then push again.

## 2026-06-01 — Cleanup / suppression de fichiers

15. **"Absent de `project.yml`" ≠ "non utilisé". Avant de supprimer un fichier, lire son en-tête ET vérifier toutes les voies de build.** J'ai supprimé `apps/ios/WebRTCStubs.swift` en concluant "non compilé" parce qu'il n'était ni dans `project.yml`, ni dans le `project.pbxproj` committé, ni dans les workflows `.github`/`ci_scripts`/`fastlane`. Mais son en-tête disait explicitement : *stubs guardés par `#if !canImport(WebRTC)`, compilés UNIQUEMENT quand le package WebRTC n'est pas résolu (CI sans WebRTC)*. C'est un fallback CI volontaire : inerte quand WebRTC est présent (le `#if` le vide), indispensable quand il est absent. Restauré après correction user. **Règle : un fichier dont l'en-tête décrit une compilation conditionnelle (`#if !canImport(...)`, fallback CI, build variant) ne doit JAMAIS être supprimé sur la seule base "pas trouvé dans la config de build par défaut" — le grep ne voit pas les chemins de build alternatifs.**

## 2026-06-07 — Indicatifs pays & affichage téléphone

16. **Un numéro étranger affiché avec `+33` = `phoneCountryCode` traité comme source de vérité au lieu du numéro lui-même.** Le défaut codé en dur `phoneCountryCode || 'FR'` (admin) et les listes de pays partielles (49 web / 25 iOS / 14 admin) faisaient hériter le +33 à des numéros non-FR. **Règle : la source de vérité du pays d'un numéro est le numéro E.164 parsé (`parsePhoneNumber(n).country`), PAS le champ stocké.** `resolveCountry()` ordonne : numéro parsé → `phoneCountryCode` stocké → locale → FR. Pour rendre un numéro « corrigeable pour de bon », l'édition doit exposer (sélecteur pays autoritaire + saisie nationale) et reconstruire l'E.164 via `toE164(national, pays)` — sinon un E.164 déjà préfixé ignore le changement de pays.

17. **Lister TOUS les indicatifs sans maintenir 240 entrées à la main : dériver.** Web → `libphonenumber-js` (`getCountries()` + `getCountryCallingCode()`) + `Intl.DisplayNames` (nom localisé) + drapeau dérivé du code ISO (indicateurs régionaux Unicode). iOS (pas de lib) → un seul dictionnaire `[ISO: indicatif]` + nom via `Locale.localizedString(forRegionCode:)` + drapeau dérivé. Repli **globe 🌐** quand le code n'est pas un couple de lettres valide / inconnu. Le drapeau est un repère de confiance : toujours l'afficher à côté du numéro et dans les sélecteurs.

18. **Vérif env distant : `npx tsc` s'arrête à la 1re erreur de config (`TS5101 downlevelIteration`) → un grep "0 erreur dans mes fichiers" est un FAUX positif.** De plus `node_modules` est partiel (55k « Cannot find module 'react' »). Pour valider une logique pure dépendant d'une lib, l'installer dans un bac à sable `/tmp` (`npm i libphonenumber-js`) et exécuter un script Node ciblé > se fier à un tsc cassé.

## 2026-06-07 — iOS XcodeGen : nouveaux fichiers Swift

19. **Un nouveau fichier `.swift` n'est PAS compilé tant que le `project.pbxproj` n'est pas régénéré.** Le projet iOS est piloté par **XcodeGen** (`apps/ios/project.yml`, `sources: [{path: Meeshy}]` globbé), mais `meeshy.sh` **ne lance pas** `xcodegen generate` — il build le `project.pbxproj` committé tel quel. Donc créer `Features/.../NewFile.swift` n'ajoute rien au build sans `xcodegen generate` (et éditer le pbxproj à la main est écrasé au prochain generate). **Règle : quand on ne peut pas régénérer/builder soi-même, mettre le nouveau code utilitaire dans un fichier DÉJÀ référencé** (ex. `ContactsShared.swift`) plutôt que créer un fichier — sinon le code ne compile pas et toutes ses références échouent.

## 2026-06-08 — SwiftUI iOS 16 compat

20. **Ne JAMAIS utiliser `.onChange` natif de SwiftUI dans le code app/feature (cible iOS 16).** La forme à 2 paramètres `.onChange(of:initial:){ old, new in }` est **iOS 17+** → erreur de compilation sur iOS 16 ; la forme à 1 paramètre `.onChange(of:){ new in }` compile mais est **dépréciée en iOS 17** (warning). **Règle : toujours `adaptiveOnChange(of:initial:_:)`** (wrapper `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/AdaptiveOnChange.swift`, importer `MeeshyUI`). Le seul `.onChange` natif autorisé est celui confiné dans ce wrapper. Même prudence pour toute API SwiftUI iOS-17-only → `if #available` ou wrapper compat. Violation trouvée+corrigée : `MiniAudioPlayerBar.swift:93`.

## 2026-06-09 — Diagnostic « impossible d'envoyer plusieurs messages à la suite (horloge) »

21. **Distinguer le mécanisme (mutex) du contrat UX (affordance du bouton).** En diagnostiquant « on ne peut pas envoyer plusieurs messages à la suite quand le 1ᵉʳ est en attente (horloge) », j'ai d'abord cadré le défaut comme « le texte tapé est perdu ». Correction user : *envoyer un texte vide sans pièce jointe n'a pas de sens — c'est le BOUTON d'envoi qui devrait être désactivé/masqué pour que ce cas n'arrive jamais.* Le vrai défaut UX est l'affordance, pas la perte de texte en soi. **Règle : pour un bug « impossible de faire X pendant l'état Y », chercher le garde-fou silencieux côté logique ET l'affordance UI qui aurait dû refléter l'état Y. Le fix appartient en général à l'affordance (désactiver/masquer le contrôle), pas seulement au guard silencieux.** Cause racine prouvée par instrumentation (`SendFlow LOCK/BLOCKED/UNLOCK`, trace `apps/ios/logs/sendflow-pending-lock-2026-06-09.log`) : `ConversationViewModel.sendMessage` sérialise via `@Published isSending` (guard l.1784, `defer` l.1786) tenu pendant tout l'`await` du POST REST — **30 s** sur réseau lent (`durationMs=30092`). Pendant ce temps `UniversalComposerBar.actionButton` garde `isReady = effectiveIsRecording || hasContent` (l.775) **sans tenir compte de `isSending`** → bouton tappable → `sendMessageWithAttachments` vide le champ (l.70) puis le ViewModel dépose le 2ᵉ envoi en silence.

22. **Capture de logs simulateur : la fenêtre `timeout` doit COUVRIR les actions, pas démarrer trop tôt.** 1ʳᵉ tentative ratée : stream `timeout 90` démarré à T, mais `navigator find-text --tap` a mis **11 s** par appel (le mapping accessibilité était ralenti par un thrashing `[MessageStore] publish` 20×/s) → les 3 envois sont tombés APRÈS la fin du stream → 0 log d'envoi (faux « instrumentation absente »). **Règle : pour tracer une interaction, lancer le stream live juste AVANT, taper par coordonnées `idb ui tap X Y` (pas `navigator find-text` qui re-mappe), et relire le fichier pendant que le stream tourne encore.** Et `strings` ne trouve PAS les format strings `os_log` (section `__TEXT,__oslogstring` encodée) — vérifier l'instrumentation en runtime, jamais via `strings` sur le binaire.

## 2026-06-09 — Animations d'entrée & recyclage de cellules UIKit

23. **Une animation d'apparition gatée par un `@State` PAR CELLULE se rejoue à chaque scroll-in dans une liste qui recycle ses cellules.** Bug : les réactions rejouaient leur animation « comète » en scrollant, même pour des réactions anciennes. Cause : `BubbleReactionsOverlay` détectait la nouveauté via `@State private var seenEmojis`. La liste de messages est un `MessageListViewController` **UIKit** (UIHostingConfiguration) qui **détruit/recrée** la vue SwiftUI d'une cellule hors-écran → le `@State` repart vide → au 1ᵉʳ rendu, TOUTES les réactions existantes sont « nouvelles ». Le réensemencement dans `.onAppear` du parent arrivait trop tard (l'`onAppear` enfant du `CometPillModifier` se déclenche AVANT celui du parent). **Règle : le signal "nouvellement ajouté" est un ÉVÉNEMENT MODÈLE, pas un événement de vue. Il doit vivre HORS de la cellule recyclée** — ici une table latérale `@MainActor ReactionAnimationGate` marquée uniquement par les vrais ajouts (toggle local dans `toggleReaction` + socket `reaction:added` des autres), avec une fenêtre TTL (1.3 s = durée de l'anim). La vue lit `shouldAnimate(messageId:emoji:)` ; le scroll ne marque jamais rien → aucune animation. Corollaire : `markAdded` est appelé AVANT l'écriture async de persistance, pour que la clé soit présente quand le store observe l'ajout et re-rend la bulle. Tests : `ReactionAnimationGateTests` (non-marqué→false = le cas du bug, marqué→true, expiration→false).

## 2026-06-09 — Readiness vidéo : « fichier local » ≠ « première frame à l'écran »

24. **Gater une UI (progress bar, fin de loader) sur la PRÉSENCE DISQUE d'une vidéo (`url.isFileURL`) ou même sur `AVPlayerItem.status == .readyToPlay` est trop tôt : la frame n'est pas encore composée.** Bug : la progress bar d'une story avançait alors que seul le flou ThumbHash était à l'écran (vidéo BG pas encore rendue). Cause (`StoryCanvasUIView.scheduleContentReadyEvaluation`) : un fast-path `if isLocalFile || status == .readyToPlay { backgroundDidBecomeReady() }` considérait une vidéo locale immédiatement prête — or `isFileURL` ne prouve que la présence disque, et `.readyToPlay` ne prouve que les métadonnées/buffer, PAS que la 1ʳᵉ frame est décodée ET composée. **Règle : le seul signal fiable de « première frame réellement visible » est `AVPlayerLayer.isReadyForDisplay` (KVO, `false→true` une fois la frame composée), strictement postérieur à `.readyToPlay`.** Gater le timer là-dessus, garder le placeholder (ThumbHash) visible pendant le gap (UX inchangée), et CONSERVER un failsafe (forced-fire après 2 s) couvrant TOUS les chemins pour qu'un signal manqué ne bloque jamais la progression à 0%. ⚠️ `isReadyForDisplay` n'est pas reproductible en simulateur/tests unitaires (frame rendue trop vite) → validation = smoke device sur réseau/vidéo lente.

## 2026-06-11 — Incident prod : corps de réponse vides (compression)

21. **`@fastify/compress` global est incompatible avec le pattern de handler du gateway.** Quasi tous les handlers font `async (req, reply) => { sendSuccess(reply, …) }` (la promesse résout `undefined` après `reply.send()`). Le hook onSend de compress remplace le payload par un *stream* ; pendant qu'il est en vol, Fastify voit la promesse du handler résoudre `undefined` avec `reply.sent === false` et émet un **second `reply.send(undefined)`** → le client reçoit `content-encoding` + `content-length: 0` (corps vide, fetch navigateur rejette en `ERR_CONTENT_DECODING_FAILED` = « Erreur de connexion au serveur ») et le stream initial crashe en `ERR_HTTP_HEADERS_SENT` (unhandled rejection). Les hooks onSend async qui retournent un string/Buffer (ETag D6) sont SÛRS ; seuls les hooks qui retournent un *stream* déclenchent la course. **Règle : compression HTTP au niveau Traefik (`compress@file`), jamais in-app — ou alors chaque handler doit `return reply`.** Test verrou : `async-send-contract.test.ts`.

22. **Méthode de debug à distance qui a marché (à réutiliser).** (a) Reproduire l'appel exact du client en curl ; (b) comparer `Accept-Encoding: identity` vs gzip → isole la couche compression ; (c) frapper le conteneur en direct (`docker exec node -e`) → disculpe Traefik ; (d) bisection dans le conteneur avec les modules de `/app/node_modules` + variantes de pattern de route → 4 runs ont suffi à isoler `async+reply.send`. Un `cl=0` explicite (vs `transfer-encoding: chunked`) = le payload final était une chaîne vide, PAS un stream — indice décisif.

23. **Hotfix conteneur = volatil.** Patch `sed` de `/app/dist/src/server.js` + `docker restart` survit aux restarts mais PAS à un `docker compose up` qui re-pull l'image. Tout hotfix in-container doit être suivi d'un rebuild d'image depuis le source corrigé AVANT le prochain déploiement, sinon l'incident revient.

## 2026-06-11 — Story vidéo gelée sur thumbnail (readiness jamais armée)

24. **`AVQueuePlayer.currentItem` est nil juste après l'attach d'un fond loopé** (l'`AVPlayerLooper` enqueue async). Tout code qui gate un armement d'observation sur `player.currentItem != nil` au moment de l'attach RATE la fenêtre. **Règle : armer sur la présence du PLAYER (le KVO `AVPlayerLayer.isReadyForDisplay` ne dépend que du layer) + failsafe temporel toujours armé ; le repli `.status` KVO seulement si l'item existe.**

25. **`displayLinkTick` gated sur `contentReadyFired` = plus aucune ré-évaluation après un armement raté.** Un seul signal manqué fige l'état pour toujours (pas de rebuild → pas de re-`scheduleContentReadyEvaluation`). Tout gate « j'attends X pour avancer » doit avoir un déclencheur évènementiel à l'arrivée de X (hook `onPlayerAttached`) OU un failsafe — jamais un sondage borné (l'ancien 30×50 ms abandonnait silencieusement si le download dépassait 1,5 s).

26. **Méthode de debug qui a gagné : sondes os_log AVANT de théoriser plus.** 3 hypothèses statiques plausibles se sont révélées partielles ; 2 builds instrumentés (catégorie `story-media`) ont montré en 2 itérations le `hasPlayer=true hasItem=false` décisif. Les chemins media/readiness des stories étaient totalement aveugles (3 régressions invisibles en 3 semaines) — les sondes restent en place (.info chemins rares, .debug par-tick).

## 2026-06-11 — Story rejoue au foreground + force-push dev

27. **Reprise foreground d'un média : TOUJOURS gater sur `window != nil` ET sur le drapeau d'autorisation canonique (`isPlaybackActive`), pas seulement sur le mode.** `handleDidBecomeActive` ne vérifiait `window` que pour l'audio mixer → un canvas `.play` retenu hors écran rejouait sa vidéo/audio à la réouverture de l'app. Et `handleAppLifecycle(active: true)` court-circuitait le gate. Preuve/validation : grep CoreMedia `SetRateAndAnchorTime` (rate=1 au foreground avant fix, plus aucun après).

28. **Avant tout `push --force-with-lease` sur `dev` : `git fetch` PUIS vérifier `git log main..origin/dev`** — un agent parallèle peut avoir mergé une PR sur dev uniquement (PR #570 écrasée puis réintégrée par merge `cb3cd8a9e`). Le lease ne protège que contre ce qu'on a déjà VU ; il faut regarder ce qu'on s'apprête à effacer.

## 2026-06-22 — iOS : ne JAMAIS hand-éditer project.pbxproj (XcodeGen)

29. **Le projet Xcode iOS est généré par XcodeGen depuis `apps/ios/project.yml`.** Les `targets` utilisent des globs de répertoire (`sources: - path: Meeshy`), donc **tout nouveau fichier `.swift` posé dans l'arborescence est auto-découvert** à `xcodegen generate`. J'ai édité `Meeshy.xcodeproj/project.pbxproj` à la main pour enregistrer `MediaConsumptionProgressBar.swift` — inutile ET nuisible : le pbxproj est un artefact généré, mes entrées manuelles (UUIDs ad-hoc) sont écrasées à la régénération. **Règle : pour ajouter un fichier à l'app, le créer au bon endroit sous `Meeshy/` (ou un sous-dossier d'un target déclaré) — jamais toucher le pbxproj. Pour le SDK (`packages/MeeshySDK/`), c'est SwiftPM qui découvre aussi par répertoire — pas de pbxproj non plus.** Indice de détection : présence de `apps/ios/project.yml` = XcodeGen actif.

## 2026-06-22 — Gateway test coverage (admin routes)

30. **Fastify response serialization strips response-body fields not declared in the route schema.** When a route handler returns `{ success, data, cacheInvalidation }` but the JSON schema only declares `{ success, data }`, Fastify's `fast-json-stringify` silently drops `cacheInvalidation`. Tests that assert `body.cacheInvalidation.*` will always fail. **Fix:** either add the extra field to the response schema, or (when verifying side-effects) assert on mock.calls instead of the response body.

31. **Mock ordering matters when conditional pipeline calls are skipped.** `aggregateRaw.mockResolvedValueOnce(a).mockResolvedValueOnce(b)` breaks when the first mock value is consumed by a call that only happens conditionally. If the first pipeline is skipped (e.g. `topLangCodes.length === 0` skips the distinct-users aggregation), the second mock value never gets consumed. **Rule:** for conditional pipelines, build mock stacks that match the actual execution path, not the happy-path order.

32. **Node 22 → Node 24 CI coverage gap is ~4–5pp, not a flat 4pp.** Local (Node 22) measured lines: 67.53%, statements: 67.29%; CI (Node 24) measured lines: 62.93%, statements: 62.87% — a 4.36–4.6pp gap. Setting thresholds at `local − 4` was too aggressive and caused a CI failure. **Rule:** use `local − 5` as the safe floor when setting coverage thresholds that must pass in both environments, or measure CI directly before committing thresholds.

## 2026-06-23 — « iOS Tests » CI rouge : repro locale fidèle (XcodeGen)

33. **`meeshy.sh` ne lance PAS `xcodegen` — la CI iOS, si.** Cause racine n°1 des « passe en local, casse en CI » (et l'inverse) : les workflows iOS font `cd apps/ios && xcodegen generate` AVANT de builder, donc compilent le vrai jeu de fichiers de `project.yml` (globbing `sources: - path: Meeshy`, `excludes: "**/*.md"`). `meeshy.sh` build le `project.pbxproj` *committé*, potentiellement périmé. **Pour reproduire un échec CI : régénérer d'abord** — `cd apps/ios && xcodegen generate`, puis `xcodebuild build-for-testing … -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build`, puis `xcodebuild test-without-building … -destination "platform=iOS Simulator,id=<simu 18.2>" -only-testing:MeeshyTests`. Compile = Xcode 26.1.1, run = iOS **18.2** (18.5+/26.x crashent au teardown xctest ; baselines sur 18.2). `build-for-testing` + `test-without-building` = compile une fois, exécute sans recompiler.

## 2026-06-23 — « iOS Tests » CI rouge : repro locale fidèle (XcodeGen)

34. **« TEST FAILED » + exit 65 = échec de COMPILE, pas un test flaky.** `Testing cancelled because the build failed` ⇒ le bundle de tests n'a pas linké. Lire la ligne `error:` juste au-dessus, corriger la compile — ne pas fouiller la logique des tests. Vécu 2026-06-23 : `'composerFocusTrigger' is inaccessible due to 'private' protection level`. **Piège accès cross-file** : un `@State private var` d'une `View` SwiftUI est inaccessible depuis un fichier d'extension frère `View+Xxx.swift` (même module) → retirer `private` (internal par défaut) sur toute propriété stockée touchée par une extension. La compile batch Swift masque les erreurs suivantes : après un fix, recompiler tout (un seul `error:` peut en cacher d'autres).

35. **Nettoyer le churn d'artefacts après une repro CI locale.** `xcodegen generate` réécrit `project.pbxproj` + `Meeshy.xcscheme` ; la résolution SPM réécrit `Package.resolved` (tracké malgré `.gitignore`). Ce sont des artefacts générés → `git checkout --` dessus, **jamais committer** ce churn (worktree partagé, agents parallèles). Vérifier `git status` propre avant/après. Diagnostic clé du jour : le run rouge précédait simplement le fix `c4cb4d76a` déjà dans `main` → toujours vérifier si la « brèche » CI n'est pas déjà corrigée par un commit ultérieur avant de toucher du code.

## 2026-07-01 — Web Socket.IO : listeners dupliqués sur ré-init

36. **`initializeConnection()` appelé plusieurs fois sur le MÊME socket ré-attachait tous les listeners Socket.IO à chaque fois.** `SocketIOOrchestrator.initializeConnection()` appelait inconditionnellement `messagingService/typingService/presenceService/translationService/preferencesSyncService.setupEventListeners(socket)` — or `ensureConnection()` (appelé avant CHAQUE `sendMessage`/`joinConversation`) et `setCurrentUser()` (retry de connexion) rappellent `initializeConnection()` dès que le statut n'est pas strictement `'connected'`, alors que `ConnectionService.getSocket()` renvoie systématiquement la MÊME instance de socket tant qu'aucun `cleanup()` complet n'a eu lieu (`this.state.socket` n'est nullé que là). Aucun des 6 services n'appelait `socket.off()` avant `socket.on()`. Résultat concret : après quelques cycles reconnect-adjacents, un `message:new` déclenchait N handlers → messages/réactions/receipts dupliqués, décryptage E2EE fait N fois, `markAsReceivedDebounced` fires N fois. **Fix minimal : un seul point de garde côté orchestrateur** — `private listenersAttachedSocket: TypedSocket | null`, on ne ré-exécute le bloc `setupEventListeners` que si `socket !== this.listenersAttachedSocket` (reset à `null` dans `cleanup()`). Pas besoin de dissiper `off()` dans les 6 fichiers de service : l'orchestrateur est l'unique point d'entrée qui les appelle tous. Test verrou : `orchestrator.service.test.ts` → « does not re-register event listeners when called again with the same underlying socket » (+ cas contraire : nouvelle instance de socket → ré-attache bien).

## 2026-07-01 — release.yml rouge 3× : `requirements.txt` avec bornes `>=` flottantes sur des libs ML actives

## 2026-07-01 — Web : `gcTime: 0` dans un helper de test partagé = flakiness inter-tests, pas un bug prod

38. **`gcTime: 0` sur un `QueryClient` de test rend TOUTE query alimentée uniquement via `setQueryData` (jamais via `useQuery`, donc 0 observer) éligible à la garbage collection sur le tout prochain macrotask réel — une course avec la chaîne async réelle (non mockée avec fake timers) de la mutation testée.** Un agent d'audit a rapporté un « bug d'idempotence » dans `use-send-message-mutation.ts` (l'`onSuccess` ne remplacerait jamais le message optimiste par le message réel, comparaison `id` cassée) — **faux positif** : `createOptimisticMessage()` pose `id: tempId` ET `_tempId: tempId` (même valeur), donc la comparaison `message.id === context.optimisticMessage.id` matche bel et bien l'entrée optimiste en cache. Vérifié en lisant le code source (pas en confiance aveugle dans le rapport de l'agent) + en ajoutant un test de réconciliation (`mutateAsync` réel jusqu'au bout, assert cache final = message réel, aucune entrée `cid_*` restante). Ce nouveau test, exécuté après un autre test du même fichier, faisait échouer intermittemment un troisième test sans rapport (`should update conversation lastMessageAt on success`, cache retrouvé totalement vide `[]` à l'assertion) — root cause : `createWrapperWithClient()`/`createWrapper()` (helpers locaux au fichier) posaient `gcTime: 0`, et AUCUN test du fichier n'exerçait réellement un comportement de GC (pas de fake timers, pas d'assertion sur la suppression). **Règle : dans un test RTL/React Query qui n'exerce PAS explicitly le GC, ne jamais mettre `gcTime: 0` dans le `QueryClient` — laisser le défaut (5 min) ; sinon la survie d'une entrée de cache entre la résolution d'une promesse réelle et l'assertion dépend de l'ordonnancement des macrotasks du fichier de test entier, pas seulement du test courant.** Repro : lancer le fichier seul (stable) vs avec un test additionnel qui `await mutateAsync(...)` réel juste avant (échoue de façon intermittente) — la suite complète du repo passait avant ce diagnostic uniquement par chance de timing.

37. **Un `Dockerfile` qui installe torch dans une commande `uv pip install` séparée puis `-r requirements.txt` dans une AUTRE commande perd l'ancrage torch pour la 2ᵉ résolution — toute lib ML à borne `>=` non pinnée peut alors dériver vers une release qui exige un torch/numpy plus récent que celui déjà épinglé.** `services/translator/Dockerfile` installe `torch==2.6.0` (étape 1/3) puis `uv pip install --system -r requirements.txt` (étape 2/3) séparément — mais `requirements.txt` avait `pyannote.audio>=3.4.0`. Entre deux runs de `release.yml`, pyannote.audio a publié 4.0.7 qui exige `torch>=2.8.0` ; la résolution de l'étape 2/3 (qui ne connaît pas le pin torch de l'étape 1 puisque torch n'apparaît pas dans requirements.txt) a essayé de satisfaire ce nouveau plancher, entraînant en cascade un numpy incompatible avec le pin `espnet==202412` (`numpy<1.24`) → `× No solution found: numpy>=2.2.6,<2.3.0 vs numpy<2.0.0`. 3 runs consécutifs rouges (`Build translator` / Docker Buildx) avant diagnostic. **Repro sans télécharger torch (index PyTorch bloqué par la policy proxy) : `uv pip compile requirements.txt --python-version 3.11 -o /dev/null` reproduit la résolution EXACTE hors Docker** (uv utilise le même resolver pour `compile` et `install`) — combiner avec `torch==2.6.0` + `torchaudio==2.6.0` en tête d'un fichier de requirements temporaire donne le jeu de versions compatibles à figer. **Fix : épingler en `==` exact toute lib ML à `>=` dans un `requirements.txt` de build Docker** (ici `pyannote.audio`, `speechbrain`, `scikit-learn`, `scipy`, `soundfile`, `accelerate`, `datasets`, `huggingface_hub`, `safetensors`, `einops`, `s3tokenizer`, `soxr` → versions issues de la résolution jointe avec torch==2.6.0). Un `requirements.txt` de prod ne doit JAMAIS avoir de borne flottante sur une lib activement maintenue — seul un lockfile (`uv.lock` via `pyproject.toml`, déjà utilisé par `ci.yml`/`uv sync`) protège durablement contre ce type de dérive ; `requirements.txt` (chemin Docker/release.yml, sans lockfile) n'a que des pins manuels comme garde-fou.

## 2026-07-01 — Dead-code deletion verified with Bash `grep | head -N` instead of the Grep tool → CI regression

39. **`grep -n "A|B|C" file | head -30` silently truncates before reaching a real match if earlier alternation branches (unrelated homonyms) produce >30 hits first.** Before deleting `apps/ios/Meeshy/Features/Main/Services/WebRTC/CallMediaConfig.swift` (part of a 4-file "dead code" cluster), I verified zero real usage of its types (`VideoConfig`, `AudioConfig`, `DataChannelConfig`, `CodecPreferences`) via `grep -n "AudioConfig\|VideoConfig\|DataChannelConfig\|CodecPreferences" P2PWebRTCClient.swift | head -30` — ~30 unrelated matches on `setCodecPreferences`/`applyAudioCodecPreferences` (a different, unrelated libwebrtc API) appear earlier in the file (lines 336–921) and used up the entire `head -30` budget before the search ever reached the REAL hit at line 1259–1263 (`VideoConfig.hd720p30.maxFrameRate`/`.maxResolution` — genuinely used by `selectFormat(for:)` to cap the camera format). Result: merged the deletion, CI's `ios-tests` job failed on `cannot find 'VideoConfig' in scope` (this environment has no Xcode/Swift toolchain to catch it before push). **Rule: for a "zero references before deletion" check, NEVER pipe raw Bash `grep` through `| head -N`. Use the `Grep` tool instead** — call `files_with_matches` first (no truncation risk on file lists), then `content` mode with `head_limit: 0` (unlimited) on each hit file to see every match, not just the first N. If using Bash grep is unavoidable (e.g. inside a larger pipeline), use `grep -c` (count) first per-file to know whether truncation is even possible before trusting a `head`-truncated read. Fix: restored `CallMediaConfig.swift` + `CallMediaConfigTests.swift` byte-identical from git history (`git show HEAD~1:<path>`) while keeping the genuinely-dead 3 files removed (re-verified with the correct method: zero hits repo-wide outside their own cluster/tests).
## 2026-07-01 — Realtime audit : réactions message manquaient le fix P2002 déjà appliqué aux réactions soeurs

40. **Un fix de concurrence appliqué à un service "soeur" ne se propage pas automatiquement — chercher activement les copies non corrigées.** `ReactionService.addReaction` (réactions de MESSAGE) faisait un `findFirst` (pré-check) puis `create()` sans `try/catch` — race TOCTOU classique : si deux `reaction:add` concurrents pour le même `(messageId, participantId, emoji)` arrivent en même temps, le perdant lève `P2002` (contrainte unique DB, donc pas de doublon en base) mais l'erreur Prisma brute remonte jusqu'au client via `ReactionHandler.handleReactionAdd`, qui répond `{success:false}` alors que la réaction existe bel et bien côté serveur — l'UI optimiste annule à tort une réaction qui vient de réapparaître au prochain `reaction:sync`. `CommentReactionService.addReaction` et `PostReactionService.addReaction` avaient DÉJÀ le bon pattern (`try { create() } catch (P2002) { return existing }`), mais `ReactionService` (le plus utilisé, réactions sur messages) et n'avait jamais reçu le backport. **Règle : quand un pattern de fix concurrence/idempotence existe dans un service, grep TOUS les services structurellement similaires (`grep -rn "MAX_REACTIONS_PER_USER\|findFirst.*create" services/`) avant de considérer le risque couvert — un fix qui n'existe que dans 2 services sur 4 quasi-identiques est un fix incomplet.** Fix + tests : `ReactionService.ts` (try/catch P2002 + recovery lookup), `ReactionService.test.ts` (3 cas : concurrent insert résolu, autre erreur DB rethrow, P2002 sans ligne trouvée rethrow).

## 2026-07-02 — Realtime audit cycle : stale-broadcast ordering fixés, 3 pistes à haut impact reportées au prochain cycle

41. **`ConversationStore.applyConversationUpdated` (SDK) et `ConversationSyncEngine.handleNewMessage` (SDK) laissaient `lastMessageId`/`lastMessagePreview` s'appliquer sans garde de fraîcheur alors que `lastMessageAt` avait déjà une garde monotone** — un broadcast en retard pour un message plus ancien laissait la ligne de la liste afficher l'horodatage le plus récent apparié au texte d'un message plus ancien. Un test existant (`test_applyConversationUpdated_staleLastMessageAt_skippedButOtherFieldsApplied`) encodait ce bug comme comportement voulu ("other fields must still be applied") — corrigé pour distinguer les champs liés à l'ordre du message (groupés sous la même garde) des champs indépendants (`title`, `avatar`, ...). Fix : `ConversationStore.swift:425-444`, `ConversationSyncEngine.swift:868-882` + tests. **Cet environnement n'a pas de toolchain Swift (`swift`/`xcodebuild` absents) — ces fixes n'ont pas pu être compilés localement, seulement relus attentivement + vérifiés contre les conventions des tests voisins déjà mergés. Laisser la CI iOS trancher.**

42. **`normalizeConversationId` a DEUX implémentations indépendantes** : la version partagée `services/gateway/src/socketio/utils/socket-helpers.ts` (Map non bornée, utilisée par `MessageHandler`/`StatusHandler`/`ReactionHandler`/`ConversationHandler` — le chemin le plus chaud) et une copie privée dans `MeeshySocketIOManager.ts:157-159,466-489` (bornée à 2000 entrées LRU/FIFO, commentaire explicite "bounded to 2000 entries LRU"). La version partagée n'avait jamais reçu ce bornage → fuite mémoire sur le process gateway long-running. Fix minimal appliqué : même bornage FIFO sur `socket-helpers.ts` (`CONVERSATION_ID_CACHE_MAX = 2000`) + test d'éviction. **Dette non résolue : les deux implémentations restent dupliquées (violation Single Source of Truth) — `MeeshySocketIOManager.normalizeConversationId` pourrait déléguer à la version partagée maintenant qu'elle est bornée, mais ça touche la DI au constructeur (ligne 278) donc reporté par prudence (minimal impact ce cycle).**

43. **Pistes à haut impact identifiées mais NON corrigées ce cycle (prochain audit realtime devrait commencer ici) :**
    - **`OfflineQueue.items[]` (SDK) n'est jamais réconcilié avec `OutboxFlusher`** (`packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue.swift`, `retryAll()` lignes ~2284-2338) — un message offline peut être ré-envoyé à CHAQUE reconnexion pour la durée de vie de l'app, et un message définitivement échoué (`.exhausted`) est réessayé indéfiniment en bypassant `maxAttempts`. HIGH impact, mais correction risquée (deux sources de vérité à unifier) — nécessite plus qu'un cycle de review pour être fait proprement, surtout sans toolchain Swift local pour vérifier.
    - **`StatusHandler.identityCache`** (gateway, `StatusHandler.ts:43`) — même pattern que #42 mais sans bornage ni sweep périodique, peuplé à chaque `typing:start`/`typing:stop`.
    - **Race retraduction sur edit de message** (`MessageTranslationService._processRetranslationAsync`, `services/gateway/src/services/message-translation/MessageTranslationService.ts:550-643`) — deux edits rapprochés peuvent faire gagner la traduction de l'edit le plus ancien si les réponses ZMQ arrivent dans le désordre.
    - Typing indicator iOS keyé par `preferredDisplayName` au lieu de `userId` (`apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift:711-739`) — collision possible entre deux participants au même nom d'affichage (flicker, s'autorépare en ~3s).

## 2026-07-02 — Résolution de mention par préfixe = fausses notifications (iter 78)

44. **Une regex de mention `@DisplayName` sans frontière de fin matche par PRÉFIXE — `@Marie` résout à tort `@Marienne`.** `packages/shared/utils/mention-parser.ts` construisait `new RegExp('@' + escaped, 'gi')` sans borne : `@Marie` matchait `@Marienne`, `@Jean Charles` matchait `@Jean Charleston`, et le fallback username `/@(\w{1,30})/g` (sans borne gauche) matchait le `@marie` interne de `contact@marie.com`. La JSDoc promettait pourtant une « résolution exacte ». Chaque faux positif = une notification push envoyée à un utilisateur NON mentionné. **Fix : frontières Unicode-aware** — `(?<![\p{L}\p{N}_])@…(?![\p{L}\p{N}_])` avec flag `u` (displayName) + `(?<!\w)@` (username). Le flag `u` est sûr ici car `escapeRegex` n'échappe que des caractères de syntaxe (jamais `-`), donc aucun *identity escape* invalide en mode Unicode. Repro avant fix (vitest) : 3 classes de faux positifs confirmées ; +6 tests de régression. **Règle : toute résolution de token par nom d'affichage dans du texte libre DOIT ancrer les deux frontières (gauche+droite), sinon un prénom court est le préfixe/suffixe de mots plus longs.**

45. **Follow-ups caches gateway non bornés (prochain audit mémoire devrait commencer ici)** — même pattern que #42/iter 76 :
    - ~~`services/gateway/src/utils/conversation-id-cache.ts` — `Map` non bornée dans `resolveConversationId`, **3e copie** non bornée du cache déjà borné dans `socket-helpers.ts` + `MeeshySocketIOManager`. Appelée sur ~15 routes REST.~~ **RÉSOLU iter 79** : borne FIFO 2000 (idiome exact de `socket-helpers.ts`) + test d'éviction. Les 3 copies sont désormais toutes bornées ; les unifier en 1 SSOT reste à faire (touche la DI de `MeeshySocketIOManager`).
    - `services/gateway/src/utils/participant-lookup-cache.ts` — TTL lazy sans sweep périodique ni max-size ; peuplé à chaque envoi de message (chemin le plus chaud). Ajouter sweep `unref()` + borne. **← prochaine cible F45.**
45. **Follow-ups caches gateway non bornés (prochain audit mémoire devrait commencer ici)** — même pattern que #42/iter 76, non traités iter 78 :
    - `services/gateway/src/utils/conversation-id-cache.ts` — `Map` non bornée dans `resolveConversationId`, **3e copie** non bornée du cache déjà borné dans `socket-helpers.ts` + `MeeshySocketIOManager` (violation SSOT). Appelée sur ~15 routes REST. Appliquer la borne FIFO 2000 (ou unifier les 3).
    - `services/gateway/src/utils/participant-lookup-cache.ts` — TTL lazy sans sweep périodique ni max-size ; peuplé à chaque envoi de message (chemin le plus chaud). Ajouter sweep `unref()` + borne. **[RÉSOLU iter 80 — voir #46]**

## 2026-07-02 — Dernier cache mémoire non borné de la famille gateway borné (iter 80, F45)

46. **`participant-lookup-cache.ts` (borné iter 80) était le 4e et dernier cache « TTL sans balayage » du gateway.** Même anti-pattern que #42 (socket-helpers), iter 76 (StatusHandler.identityCache), et #1350 (conversation-id-cache) : le TTL (30 s) protège la fraîcheur mais pas la mémoire — une entrée `(participantId, conversationId)` lue une seule fois puis jamais rerelue expire mais reste dans la Map pour la vie du process (les sites `invalidateParticipantLookup` ne couvrent que leave/ban/delete-for-me, pas un départ passif). Peuplé sur CHAQUE envoi de message (chemin le plus chaud). **Fix : idiome canonique déjà établi** — `PARTICIPANT_LOOKUP_CACHE_MAX = 5_000` (même valeur que `IDENTITY_CACHE_MAX_SIZE`, cache voisin comparable) + éviction à l'insertion d'une NOUVELLE clé au plafond (`!cache.has(key)` garde → `evictExpired()` sweep puis FIFO sur la plus ancienne). **Choix : pas de `setInterval` module-level** — un cache fonctionnel sans lifecycle n'a pas de teardown propre ; la borne à l'insertion suffit à garantir la mémoire de façon déterministe ET testable (StatusHandler doit gérer un timer seulement parce qu'il est *classé* avec un `destroy()`). Tests : +3 cas (FIFO au plafond, préférence sweep-expired sur FIFO, no-evict on refresh de clé existante). **Dette DRY restante (candidat prochain cycle) : les 4 caches partagent le MÊME idiome FIFO+sweep dupliqué 4× — un `boundedTtlCache<K,V>({ max, ttlMs })` générique les unifierait (SSOT), mais ça touche 4 fichiers + la DI de `MeeshySocketIOManager`.** **[RÉSOLU iter 81 — voir #47]**

## 2026-07-02 — SSOT du cache borné : `BoundedTtlCache` unifie les 5 copies dupliquées (iter 81)

47. **La dette DRY annoncée par #42/#46 (idiome « Map bornée FIFO+TTL » copié-collé 5×) est résolue par une source de vérité unique `services/gateway/src/utils/bounded-cache.ts`.** Les 5 exemplaires étaient : `conversation-id-cache` + `socket-helpers.normalizeConversationId` + `MeeshySocketIOManager.normalizeConversationId` (variante FIFO pure, données immuables `identifier→ObjectId`, sans TTL) et `StatusHandler.identityCache` + `participant-lookup-cache` (variante FIFO + balayage TTL). Chaque copie réimplémentait à la main `size>=MAX`, l'éviction FIFO (`keys().next().value` + `delete`), et — pour la variante B — le sweep des expirées avant la FIFO + la vérification lazy de `expiresAt`. **Design de la SSOT : `class BoundedTtlCache<K,V>` avec `ttlMs` OPTIONNEL** — `undefined` → borne FIFO pure (`expiresAt = Infinity`, `evictExpired()` no-op) ; défini → FIFO + sweep TTL. Une seule variante gère les deux familles. **Comportement strictement préservé** : sweep-avant-FIFO, garde `!has(key)` (no-evict-on-refresh), lazy-expiry à la lecture. **Interface Map-compatible sur le sous-ensemble utilisé (`get`/`set`/`has`/`delete`/`clear`/`size`/`evictExpired`) mais `keys()` VOLONTAIREMENT non exposé** (fuite d'abstraction pour un cache) — un seul test white-box (`MeeshySocketIOManager.test.ts`) l'appelait pour trouver la clé la plus ancienne ; réécrit pour cibler `key-0` (clé la plus ancienne connue, comportement d'éviction désormais couvert génériquement par `bounded-cache.test.ts`). **Règle : quand un idiome subtil (sweep-avant-FIFO, no-evict-on-refresh, lazy-expiry) est copié ≥3×, l'extraire en SSOT paramétrée par options plutôt que de reborner chaque copie à des dates différentes — la duplication a coûté 4 itérations séparées (42/76/79/80) pour appliquer le MÊME fix.** Validation : 13 tests SSOT + 2351 tests verts sur le périmètre affecté (78 suites), 0 régression.
49. **`participant-lookup-cache.ts` (borné iter 80) était le 4e et dernier cache « TTL sans balayage » du gateway.** Même anti-pattern que #42 (socket-helpers), iter 76 (StatusHandler.identityCache), et #1350 (conversation-id-cache) : le TTL (30 s) protège la fraîcheur mais pas la mémoire — une entrée `(participantId, conversationId)` lue une seule fois puis jamais rerelue expire mais reste dans la Map pour la vie du process (les sites `invalidateParticipantLookup` ne couvrent que leave/ban/delete-for-me, pas un départ passif). Peuplé sur CHAQUE envoi de message (chemin le plus chaud). **Fix : idiome canonique déjà établi** — `PARTICIPANT_LOOKUP_CACHE_MAX = 5_000` (même valeur que `IDENTITY_CACHE_MAX_SIZE`, cache voisin comparable) + éviction à l'insertion d'une NOUVELLE clé au plafond (`!cache.has(key)` garde → `evictExpired()` sweep puis FIFO sur la plus ancienne). **Choix : pas de `setInterval` module-level** — un cache fonctionnel sans lifecycle n'a pas de teardown propre ; la borne à l'insertion suffit à garantir la mémoire de façon déterministe ET testable (StatusHandler doit gérer un timer seulement parce qu'il est *classé* avec un `destroy()`). Tests : +3 cas (FIFO au plafond, préférence sweep-expired sur FIFO, no-evict on refresh de clé existante). **Dette DRY restante (candidat prochain cycle) : les 4 caches partagent le MÊME idiome FIFO+sweep dupliqué 4× — un `boundedTtlCache<K,V>({ max, ttlMs })` générique les unifierait (SSOT), mais ça touche 4 fichiers + la DI de `MeeshySocketIOManager`.**

## 2026-07-02 — Realtime audit : réaction de MESSAGE était le seul sibling encore non transactionnel (lost-update race)

50. **`ReactionService.updateMessageReactionSummary` (réactions de MESSAGE) faisait un `findUnique` → increment JS → `update` sans `$transaction`, alors que `PostReactionService.updatePostReactionSummary` ET `CommentReactionService.updateCommentReactionSummary` avaient déjà le pattern correct (transaction + `reactionCount` autoritaire recalculé depuis la table source).** Deux `reaction:add`/`reaction:remove` concurrents sur le MÊME message (2 participants réagissent à ~la même milliseconde) lisent le même `reactionSummary`/`reactionCount` de départ avant qu'aucun des deux `update` ne commit — le second write écrase intégralement le premier (lost update classique). Les lignes `Reaction` individuelles restent correctes (protégées par le catch `P2002` déjà en place), donc `getMessageReactions`/`reaction:sync` (qui recalculent depuis la table `Reaction`) restent exacts — seul le `reactionCount`/`reactionSummary` dénormalisé affiché dans la liste de messages dérive silencieusement, sans job de réconciliation pour se corriger. Exactement le pattern « fix appliqué à un sibling, pas audité sur tous les siblings » de #40/#42/#45/#5 — cette fois le sibling non corrigé (réactions message) est le PLUS utilisé des trois. **Fix : mirror exact de `CommentReactionService`** — `$transaction` + `tx.reaction.count({ where: { messageId } })` comme compteur autoritaire (auto-réparant, contrairement à l'ancien increment). Tests : 4 cas ajoutés (`updateMessageReactionSummary — uses $transaction` : transaction ouverte sur add, sur remove, PAS ouverte si `deleteMany.count === 0`, `reactionCount` dérivé de `reaction.count` et non d'un increment JS même quand le compteur dénormalisé était déjà faux). Suite `Reaction` complète : 473/473 tests verts (17 suites).

## 2026-07-02 — Itération 82 : durcissement compteur/curseur (round 2) + CI miss sur suite colocée

51. **Continuité du thème #50 (races lost-update/out-of-order sur compteurs & curseurs partagés).** Un audit read-then-write a trouvé les 2 analogues NON corrigés : (A) `AffiliateTrackingService.convertAffiliateVisit` écrivait `currentUses: affiliateToken.currentUses + 1` (valeur JS) → deux conversions concurrentes perdent un increment ET peuvent dépasser le cap `maxUses` ; fix = `{ increment: 1 }` atomique (idiome déjà présent dans `routes/anonymous.ts`). (B) `MessageHandler.handleMessageDelete` réécrivait `lastMessageAt` **inconditionnellement** après recompute → un `message:new` committant entre le `findFirst` et l'`update` fait reculer le curseur ; fix = garde de **concurrence optimiste** via `updateMany({ where: { id, lastMessageAt: <valeur lue au début du handler> } })`. **Subtilité clé : `lastMessageAt` est estampillé `new Date()` à la création (MessagingService), DÉCORRÉLÉ de `message.createdAt`** — une garde basée sur `createdAt` serait donc peu fiable (laisserait un curseur obsolète après suppression du dernier message). La concurrence optimiste (equality sur la valeur lue) ne fait aucune hypothèse d'alignement d'horloge. Résidus documentés F47 (cap TOCTOU affiliation), F48/F49 (ConversationMessageStats / ConversationStats).

52. **CI GATE MISS : un balayage `src/__tests__/…` ne couvre PAS les suites COLOCÉES `src/**/__tests__/`.** J'ai validé localement `src/__tests__/unit/handlers/MessageHandler.core.test.ts` (vert) mais raté `src/socketio/handlers/__tests__/MessageHandlerEditDelete.test.ts` — un SECOND fichier testant `handleMessageDelete`, colocalisé à côté du code. Il mockait `conversation.update` ; après bascule vers `conversation.updateMany`, le mock manquant faisait throw le handler → 10 tests rouges en CI (`test:coverage` tourne TOUTE l'arbo). **Règle : avant de déclarer un changement de handler/service vert, `grep -rln "<methodeModifiée>\|<mock changé>" src --include=*.test.ts` sur TOUTE l'arbo `src` (pas seulement `src/__tests__`), OU lancer le glob du répertoire concerné (`jest src/socketio src/__tests__/unit/handlers`).** Meeshy a DEUX conventions de placement de tests (`src/__tests__/**` centralisé ET `src/**/__tests__/**` colocalisé) — toujours vérifier les deux.
## 2026-07-02 — E2E d'appels pilotés par simulateurs (chaos-tests prod)

53. **Deux simulateurs pilotés par idb suffisent pour des E2E d'appels WebRTC complets contre la prod** — mais cinq pièges : (a) `idb ui tap` prend des POINTS (écran/3 en 3x), pas des pixels de screenshot ; (b) le keychain simulateur SURVIT à la désinstallation de l'app — `xcrun simctl keychain <UDID> reset` sinon la session du compte précédent se restaure silencieusement et on appelle le mauvais compte (vérifier l'identité via l'avatar « Moi »/liste avant d'appeler, le TITRE de conversation est fixe des deux côtés et ne prouve rien) ; (c) les popups premier lancement (notifications, Save Password) volent les frappes idb — les dismiss AVANT toute saisie ; (d) `simctl spawn <UDID> log collect` produit des archives VIDES — utiliser `simctl spawn <UDID> log show --last Xm --predicate 'subsystem == "me.meeshy.app" AND category == "calls"'` (post-hoc, fiable) ; (e) les agents parallèles qui lancent xctest sur le simulateur standard RELANCENT l'app et tuent l'appel E2E en cours — créer des simulateurs dédiés (`simctl create`) pour tout E2E long.

54. **Chaos-engineering d'appels : les bugs sont dans les erreurs « transitoires » traitées comme fatales et les intentions locales jamais matérialisées côté serveur.** Trois espèces trouvées le même jour : call:error TARGET_NOT_FOUND (relay vers un pair momentanément sans socket) qui tuait un appel au média sain ; un teardown local (failCall) qui n'émettait jamais call:end → pair zombie ~48s jusqu'à ses watchdogs ; des grâces serveur à durée fixe que le backoff socket.io dépasse légitimement (étendre si le user garde UN socket vivant, room user:<id>). Règle : côté client, seule une décision serveur explicite (call:ended/missed) ou un échec média constaté (watchdogs) peut tuer un appel établi ; côté serveur, ne jamais conclure « parti » sur la seule absence d'un socket si un autre socket du même user vit.

## 2026-07-02 — Itération 83 : F48 soldé — hooks edit/delete des stats de conversation rendus atomiques

55. **`ConversationMessageStatsService.onMessageEdited`/`onMessageDeleted` écrivaient leurs compteurs scalaires en VALEUR ABSOLUE dérivée d'une lecture (`Math.max(0, existing.totalWords ± diff)`), alors que `onNewMessage` — le hook soeur — écrivait DÉJÀ les mêmes champs en atomique `{ increment }`.** Même famille lost-update que #50 (réactions), #51 (affiliation/curseur), PR #1362 : deux `message:edited`/`message:deleted` concurrents lisent le même `existing` puis le second `update` écrase le premier → les totaux (`totalMessages`, `totalWords`, `totalCharacters`, `textMessages`, compteurs de pièces jointes) dérivent silencieusement à la baisse sur une conversation active. Le fix atomique de `onNewMessage` n'avait jamais été propagé aux deux hooks soeurs (motif « fix appliqué à UN sibling, pas audité sur tous » — #40/#42/#45/#50). **Fix : `{ increment: wordDiff }` (Prisma accepte un increment négatif) pour edit, `{ decrement: n }` pour delete, sur tous les scalaires.** **Arbitrage clé : le plancher `Math.max(0, …)` est ABANDONNÉ au niveau du write DB** — un increment/decrement atomique MongoDB ne peut pas clamper dans la même op ; identique au choix #50 (correctness sous concurrence > garde défensive sur valeur dénormalisée). Justifié car (a) une op équilibrée create↔delete ne descend jamais sous 0, (b) les champs JSON `participantStats`/`dailyActivity`/… GARDENT leur clamp (ils restent en read-modify-write non atomique, corrigé par `recompute()` périodique — commentaire doctrine l.84 mis à jour), (c) toute dérive scalaire résiduelle est corrigée par le même `recompute()`. Tests : suite service réécrite pour attendre les opérateurs atomiques + 2 régressions lost-update (2 edits concurrents → 2 increments indépendants ; delete → decrement indépendant de la lecture) ; 61/61 + MessageHandler 420 + stats 277 verts. **Règle réaffirmée : quand un service a plusieurs hooks écrivant le MÊME champ dénormalisé (create/edit/delete), ils doivent TOUS utiliser le même idiome d'écriture atomique — un seul hook en RMW absolu suffit à réintroduire le lost-update sur le champ partagé.**

## Leçon 53 — Boucle parallèle : le même item de backlog peut être fixé par deux agents en même temps (2026-07-02)
P7-11 (ConversationLockManager au logout) : pendant mon itération TDD, un agent parallèle a poussé le MÊME fix (5aef1abb2) — nos implémentations ont convergé à l'identique (pattern canonique wireAuthLogoutHook + réutilisation removeAllLocks/forceRemoveMasterPin). Le `git pull --rebase --autostash` a absorbé mes hunks devenus vides sans conflit ; seul le todo restait à committer. À FAIRE systématiquement : (1) `git log --oneline -- <fichier>` juste AVANT d'implémenter un item du backlog partagé (pas seulement au début de l'itération) ; (2) après tout rebase, `git log --grep=<item>` pour détecter la convergence — un commit au titre différent peut porter le même contenu ; (3) mes tests RED→GREEN restent utiles même en cas de convergence : ils VALIDENT le code de l'autre agent (leçon build-for-testing ≠ exécuter). Le rebase gère bien la convergence exacte ; le danger réel serait deux implémentations DIVERGENTES du même item — d'où l'importance du pattern canonique documenté (le todo décrivait le fix précis, les deux agents l'ont suivi).

## Leçon 54 — Toute transition TERMINALE d'un appel doit relâcher la claim `Conversation.activeCallId` AU PLUS PRÈS de l'écriture gagnante (2026-07-02)
Bug prod reproduit EN LIVE pendant la validation device (item J) : le ringing-timeout handler gagne l'`updateMany` atomique `[initiated,ringing] → missed`, puis délègue le cleanup à `handleMissedCall → markCallAsMissed` — dont le guard non-ringing early-return AVANT `releaseActiveCallClaim`. La claim reste pointée sur l'appel missed → TOUS les `call:initiate` suivants de la conversation sont rejetés `CALL_ALREADY_ACTIVE` (« lost race to claim »). Observé : une conversation bloquée ~5 min, une autre bloquée 12 HEURES (missed du matin). Triple enseignement : (1) **une claim/lock dénormalisée doit être relâchée dans le MÊME chemin que l'écriture d'état gagnante**, pas déléguée à un chemin qui peut early-return (le guard « déjà missed » raisonnait sur le statut, pas sur le cleanup) ; (2) **un early-return de garde doit exécuter les cleanups idempotents avant de retourner** (clearHeartbeats/clearRingingTimeout/release — jamais pour un statut ACTIF qui détient légitimement la claim) ; (3) **le commentaire promettait un self-heal (« the claim self-heals the next time... ») qui n'existait PAS dans le code** — leçon 'source-guards : lire le code, pas les commentaires' appliquée aux invariants de conception : le self-heal a été implémenté pour de vrai (compare-and-swap depuis un holder terminal, atomique, jamais de clobber d'une claim saine). Diag express : `db.Conversation.find({activeCallId: {$ne: null}})` croisé avec le statut du holder — tout holder terminal = claim fuitée. Fix : b02de2eee.

## Leçon 56 — Helper de polling à fallback : re-vérifier l'état attendu sur le retour, sinon le test « passe » sans prouver (2026-07-03)
`MessageStoreObservationHelper.awaitRecord` retourne le DERNIER record fetché quand le timeout expire, même si le prédicat n'a JAMAIS matché (design voulu pour « asserter sur l'état final »). Conséquence : un test qui fait `let x = await awaitRecord(...) { predicate }` puis seulement `XCTAssertNotNil(x)` + des assertions faibles PASSE alors que le comportement testé n'existe pas — mon test RED « remplacement de réaction » est passé faussement vert (1s pile = timeout brûlé, l'indice), failli me faire conclure « pas de bug » sur un bug réel. RÈGLE : avec tout helper await-avec-fallback, RE-ASSERTER explicitement le prédicat sur la valeur retournée (`XCTAssertEqual(mine, ["thumbsup"])`), jamais juste non-nil. Indice de détection : durée du test == timeout du helper. Corollaire process : sur worktree partagé, un agent parallèle peut committer TES fichiers en cours (add trop large de son côté) — vérifier `git show --stat` des DEUX derniers commits après chaque commit, pas seulement le sien.

## Leçon 55 — `VoiceProfileService.calibrateProfile` : 4e sibling non audité du même lost-update (2026-07-02, itération 84)
Continuité directe du thème #40/#42/#45/#50/#51/#55 (« fix appliqué à UN service, jamais propagé aux siblings structurellement identiques »). `calibrateProfile` lit `voiceModel` (audioCount/totalDurationMs/version) AVANT deux `await` séquentiels — `resolveAudioInput` puis `waitForZmqResponse` (round-trip ZMQ vers le translator pour l'analyse audio, potentiellement plusieurs secondes) — puis écrit `voiceModel.audioCount + 1` etc. calculé en JS. Deux calibrations concurrentes pour le même `userId` (ajout rapide de 2 échantillons audio en onboarding, ou un retry client après timeout apparent pendant que la requête originale est encore en vol) lisent le même snapshot pré-await ; la seconde écriture écrase l'incrément de la première (perte silencieuse, aucune erreur retournée). Fix : mirror exact de l'idiome déjà établi — `audioCount`/`totalDurationMs`/`version` passent en opérateurs Prisma atomiques (`{ increment }`), le seul cas gardant une valeur absolue est le reset explicite `replaceExisting` (action utilisateur volontaire, pas un compteur). **Aucun garde-fou par version (OCC) nécessaire ici** contrairement à `lastMessageAt` (leçon #51/pattern B) : ces trois champs sont de purs compteurs, un `{increment}` atomique MongoDB reste correct quel que soit l'ordre d'arrivée des écritures concurrentes — pas besoin de détecter/rejeter un conflit puisqu'il n'y a rien à rejeter. Piège de test découvert en écrivant le repro : le mock global `crypto.randomUUID` renvoyait la MÊME constante pour tout le fichier de test → deux appels concurrents collisionnaient sur la même clé dans `pendingRequests` (Map interne), un artefact de mock sans rapport avec le vrai bug (en prod `randomUUID()` est unique). Fix du mock : `jest.fn()` avec `mockImplementationOnce` par test au lieu d'une constante figée, pour que les request IDs concurrents restent distincts comme en production. Tests : 1 nouveau (repro concurrence + assertion sur la forme `{increment}`) + 2 tests existants réécrits pour attendre les opérateurs atomiques (mêmes assertions `toHaveBeenCalledWith` mais valeur littérale → objet `{increment}`) ; 78/78 VoiceProfileService verts, 120 suites `services/` vertes (4449 tests). **Règle réaffirmée : avant de considérer un audit de concurrence "couvert", grep `voiceModel\.\w+ +\|user\.\w+ +\|existing\.\w+ +` (accès `.champ +` sur un objet lu avant un `await`) dans TOUS les services qui font lecture→await(réseau/ZMQ)→écriture — le prochain candidat n'est jamais loin du dernier trouvé.**

## Leçon 56 — F47 : increment atomique ≠ cap atomique (TOCTOU de dépassement de quota) (2026-07-02, itération 85)
Continuité #50→#55 (« fix appliqué à UNE face du problème, pas à toutes »). La leçon #51 avait rendu `AffiliateTrackingService.convertAffiliateVisit` **atomique en increment** (`currentUses: { increment: 1 }` au lieu de `currentUses + 1` en JS) — fermant la **perte** d'increment (compteur trop bas). Mais l'increment restait **inconditionnel** : le cap `maxUses` était vérifié séparément par un garde `if (currentUses >= maxUses) return` sur la valeur **lue**. Entre cette lecture et l'increment, N inscriptions concurrentes portant le même token franchissent toutes le garde puis incrémentent toutes → `currentUses` **dépasse** `maxUses` (compteur trop haut). **Deux faces d'une même absence d'atomicité check+write** : l'increment atomique corrige la perte, PAS le dépassement. Fix canonique : **réservation de slot conditionnelle** — `updateMany({ where: { id, currentUses: { lt: maxUses } }, data: { currentUses: { increment: 1 } } })` puis `if (reservation.count === 0) return 'cap atteint'`, effectuée **avant** la création de la relation. MongoDB sérialise les updateMany sur un même document : seuls `maxUses - currentUses` matchent, les perdants renvoient `count 0`. Subtilités : (1) garde `>= maxUses` conservé en **fast-path** (évite findFirst+updateMany quand manifestement épuisé + erreur précise) ; (2) réservation **avant** create → si create échoue, un slot est consommé sans relation = direction **sûre** (sous-attribue, jamais au-delà du cap) ; (3) `existingRelation` reste **avant** la réservation (idempotence : un retry du même user ne consomme pas un second slot) ; (4) `maxUses` falsy (null/0) → pas de condition = increment inconditionnel, identique à la sémantique `maxUses &&` du garde existant. **Règle : quand un compteur atomique est aussi borné par un cap, l'increment atomique NE SUFFIT PAS — le cap doit être dans le `where` du même update (`{ increment }` + `{ field: { lt: cap } }`), sinon le check-then-increment laisse fuir le dépassement.** Tests : mock `updateMany` ajouté, assertions `update`→`updateMany`, +2 cas (réservation cap-guardée `where currentUses < maxUses` ; perte de course `count 0` → aucune relation) ; 34/34 service + 21/21 routes verts.
## Leçon 55 — Un statut TERMINAL d'appel est immuable + les migrations Mongo doivent viser la collection PRISMA réelle (2026-07-03)
Sonde prod : un appel résolu `missed` par le ringing timeout a été réécrit `ended/completed/89s` + 2e summary posté quand le socket du caller a lâché ensuite. Trois trous complémentaires : (1) l'écriture terminale du timeout n'incrémentait pas `version` → tous les version-guards des écrivains terminaux (leaveCall/endCall/idempotent-leave) étaient inopérants contre elle — **règle : TOUTE écriture terminale bump `version`** ; (2) les guards du disconnect (armement l.2893 + expiration l.392) ne couvraient QUE `'ended'` — **règle : tout guard de terminalité utilise la liste complète** (`CALL_TERMINAL_STATUSES` dans @meeshy/shared/types/video-call, ajoutée comme constante runtime — les suites gateway mockent le module CallService, donc une constante partagée doit vivre dans un module NON mocké ; 2 suites mockent AUSSI @meeshy/shared/types/video-call → ajouter la constante à leur factory) ; (3) `leaveCall` recomputait l'issue depuis un statut lu qui pouvait être terminal (`missed` ∉ pre-answer → « completed ») — **règle : un leave sur appel terminal ne touche QUE le leftAt du participant**. BONUS CRITIQUE découvert en validant : l'index unique partiel `(conversationId, clientMessageId)` ciblait `db.messages` — collection VIDE ; le model Prisma `Message` n'a pas de `@@map` → la vraie collection est `db.Message` (majuscule). L'index n'a JAMAIS existé → dédup P2002 (summaries + offline-queue) inopérante → 33 paires de doublons en prod (dédupliquées, index créé, sonde E11000 ✓). **Règle : après toute migration Mongo manuelle, VÉRIFIER l'effet sur la collection réelle (`db.<Collection>.getIndexes()`), et tester la contrainte par une insertion-sonde.** Fix : c00076e6f.

## Leçon 54 — pbxproj stale : tout nouveau .swift APP casse le build local jusqu'au commit du pbxproj (2026-07-03)
Piège récurrent (SyncEngine A5.3/A5.4) : dès qu'un nouveau fichier .swift est ajouté sous apps/ios/Meeshy/, `meeshy.sh build` et `xcodebuild` échouent en local avec « cannot find 'X' in scope » sur TOUS ses call sites (+ souvent un « unable to type-check this expression in reasonable time » en cascade sur un gros body voisin comme ConversationListView:583). Cause : le projet est XcodeGen ; le pbxproj committé est un artefact qui ne globe PAS automatiquement — CI lance `xcodegen generate` mais pas meeshy.sh/xcodebuild. Et comme on `git checkout` le churn pbxproj après chaque commit (règle worktree partagé), le fichier reste hors du pbxproj committé À VIE tant qu'on n'a pas régénéré. Conséquence : l'itération SUIVANTE qui touche ce fichier re-casse le build local au premier essai. PROCÉDURE : (1) nouveau .swift APP → `cd apps/ios && xcodegen generate` AVANT le build, TOUJOURS, même si le fichier a été créé une itération précédente ; (2) après build/test vert, `git checkout -- apps/ios/Meeshy.xcodeproj/project.pbxproj apps/ios/Package.resolved` avant de committer (ne jamais committer le churn) ; (3) les fichiers SDK (packages/MeeshySDK/) NE sont PAS concernés — SPM globe, aucun xcodegen requis. Un « TEST BUILD FAILED » avec « cannot find <NouveauType> » n'est JAMAIS un bug de code : c'est le pbxproj stale — régénérer, ne pas déboguer le type.

## Leçon 56 — Un compteur de rate-limit sécurité doit être CONSOMMÉ atomiquement (check-then-act ≠ increment atomique) (2026-07-03, itération 85)
Continuité de la classe F47 (« le cap peut être dépassé bien que l'increment soit atomique »). `PhonePasswordResetService.verifyCode`/`verifyIdentity` incrémentaient DÉJÀ leurs compteurs de tentatives en atomique (`update({ codeAttempts: { increment: 1 } })`) — le lost-update pur était donc absent — mais la VÉRIFICATION du plafond (`if (token.codeAttempts >= MAX)`) lisait la valeur du `findUnique` (snapshot début de handler), décorrélée de l'increment qui suivait. C'est un **TOCTOU (check-then-act)** : N requêtes concurrentes sur le même `tokenId` lisent toutes `codeAttempts = k`, passent toutes le garde `< MAX`, tentent chacune un code SMS à 6 chiffres différent, puis incrémentent → le plafond de 5 tentatives ne borne plus le nombre RÉEL de codes essayés (amplification de brute-force sur la surface de récupération de compte). **Un compteur atomique ne suffit pas ; c'est la SÉQUENCE check→act qui doit être atomique.** Fix canonique (idiome lesson #51 pattern B / `AffiliateTrackingService`) : **consume atomique conditionnel** — `updateMany({ where: { id, codeAttempts: { lt: MAX } }, data: { codeAttempts: { increment: 1 } } })` placé AVANT la vérification du code ; MongoDB évalue le filtre `$lt` + applique `$inc` en une écriture atomique par document, donc **au plus MAX consommations réussissent** sous concurrence. `consumed.count === 0` ⟹ plafond atteint ⟹ revoke + block. La branche d'échec (code invalide / mismatch) ne ré-incrémente plus (tentative déjà comptée). Arbitrage assumé identique à #50/#55 : le consume compte AUSSI une tentative réussie, sans effet observable car le compteur n'est plus jamais relu après transition d'étape / `usedAt` (une re-tentative échoue sur le garde d'étape). `attemptsRemaining` conserve la formule `MAX - token.<attempts> - 1` (valeur pré-lecture). Tests : 2 régressions concurrence (consume conditionnel `updateMany` code ET identité, `count===0` ⟹ block) + adaptation des tests de plafond (piloter `updateMany → { count: 0 }`) ; 66/66 `PhonePasswordResetService` + 138 (`password-reset`+`AuthService`) verts. **Règle : tout garde de plafond sur un compteur de sécurité (rate-limit, tentatives, quota) DOIT être un consume atomique conditionnel (`updateMany where < MAX` + `count`), jamais un `if (read >= MAX)` suivi d'un increment séparé — même quand l'increment lui-même est atomique. Prochain candidat même classe : F47 `AffiliateTrackingService.convertAffiliateVisit` (cap `maxUses`).**
## Leçon 56 — La règle de visibilité FRIENDS n'était pas appliquée uniformément dans PostFeedService (2026-07-03, itération 85)
Même famille que #40/#42/#45/#50/#55 (« règle/fix appliqué à un sous-ensemble de siblings, jamais audité sur TOUS »), cette fois sur la **visibilité** (autorisation) et non un compteur. `PostFeedService` a une SSOT `buildVisibilityFilter(viewerId, contactIds, communityCoMemberIds)` que `getStories`/`getStatuses`/`getReels` utilisent tous. Mais **`getFeed`** (le home feed classé, surface sociale la plus chaude) utilisait un filtre plat `visibility: { in: ['PUBLIC','FRIENDS'] }` **sans aucune garde auteur/ami** — `friendIds` n'était récupéré qu'APRÈS la requête, pour le scoring uniquement → **tout post FRIENDS de n'importe qui était servi à n'importe quel viewer** (fuite de confidentialité). Et **`getUserPosts`** hard-codait `visibility = 'PUBLIC'` pour tout non-auteur → un **ami** ne voyait jamais les posts FRIENDS de l'auteur sur son profil (sous-diffusion, bug miroir). Fix : les deux passent par `buildVisibilityFilter` (contacts = amis ∪ partenaires DM, comme les siblings), composé sous `AND` avec l'expiry + le curseur ; `getUserPosts` garde `anonyme → PUBLIC` et `self → aucun filtre`. `getFeed` conserve `friendIds` (amis acceptés seulement, distinct des contacts) pour `affinityScore` — la garde de visibilité et le scoring ont des besoins différents (contacts vs amis), les DEUX doivent être satisfaits, pas confondus. Vérification : ces bugs se prouvent **purement en asserttant la forme de la clause `where`** émise (le mock Prisma ne filtre pas — c'est la stratégie déjà documentée en tête de `PostFeedService.visibility.test.ts` : « A mocked Prisma client cannot reproduce the query-engine behaviour, so we assert the query SHAPE instead »). Aucune MongoDB live requise. Tests : `PostFeedService.visibility` 2→7 (3 RED neufs : getFeed gate FRIENDS + sert PUBLIC/own/COMMUNITY, getUserPosts ami voit FRIENDS ; 2 conservés : anonyme→PUBLIC, self→tout) ; 220/220 suites posts-feed vertes. **Règle : un audit de "cohérence de règle métier" (visibilité, ACL, rate-limit, quota) doit énumérer TOUTES les méthodes d'un service qui appliquent la règle et vérifier qu'elles délèguent à la même SSOT — la méthode la plus chaude (`getFeed` ici) est souvent celle qui a divergé, parce qu'elle a été écrite/optimisée en premier, avant l'extraction du helper partagé.**
## 2026-07-02 — Itération 84 : F47 soldé — cap TOCTOU du token d'affiliation (réservation atomique)

56. **Un increment atomique (`{ increment: 1 }`) protège le *comptage* mais PAS la *borne* — un cap `maxUses` gardé par un check-then-act reste un TOCTOU même après le fix lost-update.** `AffiliateTrackingService.convertAffiliateVisit` avait été rendu atomique iter 82 (lesson #51) sur le compteur, mais le pré-check `if (maxUses && currentUses >= maxUses)` et l'increment restaient **découplés** : quand `currentUses === maxUses - 1`, deux conversions concurrentes lisent la même valeur, franchissent toutes deux le check, créent chacune une relation puis incrémentent → `currentUses` finit à `maxUses + 1`, dépassant le cap (résidu F47 explicitement reporté iter 82). **Fix canonique = réservation atomique AVANT matérialisation** : pour un token cappé, `updateMany({ where: { id, currentUses: { lt: maxUses } }, data: { currentUses: { increment: 1 } } })` — la clause conditionnelle + increment est sérialisée côté DB, donc au plus `maxUses` réservations réussissent ; `count === 0` ⇒ cap atteint dans la fenêtre de course → rejet AVANT toute création (donc **pas de rollback** — reserve-then-commit, pas create-then-rollback). Token illimité (`maxUses == null`) : `update` inconditionnel inchangé. Le pré-check est conservé comme fast-path bon marché mais la réservation conditionnelle est l'autorité. **Arbitrage assumé : slot fantôme si `create` échoue après réservation (chemin DB rare) — strictement moins nuisible qu'un dépassement de cap, et évite un delete sur le chemin race-loser chaud.** **Règle : tout enforcement de cap/quota/borne sous concurrence doit se faire par écriture conditionnelle (`updateMany where value < limit`), JAMAIS par `read → check en JS → write` ; un increment atomique ne suffit pas si la borne est vérifiée séparément.** Tests : mock `updateMany` ({count:1} défaut) + 3 régressions (réservation cappée atomique avant relation, rejet race-loser `count===0` sans relation ni friend-request, chemin illimité utilise `update` jamais `updateMany`) ; 35/35 service + 25/25 routes affiliate/devices verts. Clôt le dernier résidu « intégrité de compteur/cap » de la famille lost-update (iter 79→83).

## Leçon 58 — F49 soldé : `ConversationStatsService.updateOnNewMessage` perdait un increment sous course (2026-07-03, itération 87)

Dernier résidu explicitement reporté à l'issue de l'itération 82 (« F48/F49 »), continuité de la famille #40/#42/#45/#50/#51/#55/#56/#57 (« read-then-write partagé sans garde de concurrence »), cette fois sur un cache **en mémoire** plutôt qu'une écriture DB. `updateOnNewMessage` (appelé sur CHAQUE `message:new`, via `MessageHandler.ts`, `ConversationHandler.ts` ET `MessagingService.ts` — donc plusieurs entrées concurrentes possibles pour la même conversation) lit `this.cache.get(conversationId)` de façon synchrone, incrémente `messagesPerLanguage[lang]` sur une COPIE, puis `await this.computeOnlineUsers(...)` avant d'écrire `this.cache.set(...)`. Le point `await` — même quand `computeOnlineUsers` retourne quasi immédiatement (`connectedUserIds.length === 0 → return []`) — suffit à céder la main au microtask suivant : deux messages de la même langue arrivant dans la même milliseconde pour la même conversation (chat de groupe actif) lisent tous deux le MÊME compteur de base, incrémentent chacun leur copie de +1, et le second `cache.set` écrase le premier → un des deux messages n'est jamais compté dans les stats affichées (aucune erreur, dérive silencieuse). Repro déterministe SANS fake timers ni promesses contrôlées manuellement : `Promise.all([updateOnNewMessage(...), updateOnNewMessage(...)])` suffit, l'ordonnancement microtask de V8 garantit l'interleaving. **Fix : sérialisation par clé (conversationId) via une chaîne de promesses auto-nettoyante** (`withConversationLock`), PAS l'idiome `{increment}` atomique Prisma des sièges précédents — il n'y a pas de DB ici, juste une `Map` en mémoire partagée entre callers concurrents du même process. Design : `Map<string, Promise<void>>` où chaque appel chaîne son `fn` après la précédente entrée pour la même clé (`previous.then(fn, fn)` — poursuit même si la précédente a rejeté, pour ne jamais bloquer une conversation à cause d'un échec passé) ; l'entrée est supprimée de la map dès que sa chaîne se vide (comparaison de référence `updateLocks.get(key) === settled` avant delete), donc la map reste bornée par la concurrence RÉELLE (conversations avec une écriture en vol), pas par le nombre total de conversations vues par le process — évite de réintroduire le pattern de fuite mémoire #42/#45/#46 en résolvant celui-ci. **Alternative rejetée : verrou global (une seule chaîne pour TOUT le service)** — aurait sérialisé les mises à jour de conversations sans rapport entre elles, dégradant le débit d'un gateway multi-conversations pour un problème qui n'existe qu'INTRA-conversation. Test RED→GREEN : `Promise.all` de deux `updateOnNewMessage` sur la même conversation, assertion sur le compteur final (12, pas 11) via un `getOrCompute` de suivi qui sert le cache encore valide. 59/59 `ConversationStatsService*.test.ts` verts + 601/601 tests verts sur les 7 suites appelantes (`MessageHandler`, `ConversationHandler`, `MeeshySocketIOManager`) — aucune régression. **Résidu HORS PÉRIMÈTRE découvert en marge (pas ce cycle) : `src/__tests__/unit/services/MessagingService.test.ts` échoue à charger dans cette sandbox (`SequenceService.ts` importe `PrismaClient` depuis `'@prisma/client'` au lieu de `'@meeshy/shared/prisma/client'` — TS2305) ; confirmé PRÉEXISTANT (même échec sur `git stash`, sans mon diff) — pas causé par ce fix, laissé pour un audit d'imports Prisma dédié.**

## Leçon 57 — `routes/messages.ts` DELETE REST était le seul sibling du cursor `lastMessageAt` encore non guardé (2026-07-03, itération 86)

Continuité directe de #51/#55 (« fix appliqué à UN chemin, jamais audité sur le sibling REST vs socket »). `MessageHandler.handleMessageDelete` (socket, `socketio/handlers/MessageHandler.ts:744-752`) avait déjà l'optimistic-concurrency guard sur `conversation.lastMessageAt` (lesson #51/pattern B : `updateMany({ where: { id, lastMessageAt: <valeur lue au début> } })`), mais **`routes/messages.ts` DELETE `/messages/:messageId`** (endpoint REST, ligne 434) faisait toujours un `conversation.update` inconditionnel keyé sur `id` seul — le message est déjà fetché avec `include: { conversation: {...} }` donc `message.conversation.lastMessageAt` était disponible mais jamais utilisé comme garde. **Scénario de course concret** : suppression REST d'un vieux message pendant qu'un nouveau message arrive dans la même conversation (chat de groupe actif, chemin très fréquent) — (1) la lecture `lastNonDeletedMessage` du delete capture l'ancien dernier message ; (2) le nouveau message avance `conversation.lastMessageAt` en parallèle ; (3) le `conversation.update` du delete écrase inconditionnellement `lastMessageAt` en arrière, faisant régresser le curseur au-delà d'un message qui existe toujours — corrompt le tri de la liste de conversations et la pagination par curseur (`routes/conversations/core.ts` `lastMessageAt: { lt: cursor }`). Fix : mirror exact de l'idiome déjà établi côté socket — `conversation.update` → `conversation.updateMany({ where: { id, lastMessageAt: message.conversation.lastMessageAt }, data: {...} })`. Tests : 2 nouveaux dans `messages.test.ts` (guard `updateMany` avec la bonne clause `where`, jamais `update` ; fallback sur `conversation.createdAt` quand tout le fil est supprimé) + mise à jour du mock `conversation` (ajout `lastMessageAt` + `updateMany`) dans `messages.test.ts` ET `messages-extended.test.ts` (2e fichier de test qui monte la même route — un mock Prisma incomplet fait échouer silencieusement TOUT test DELETE existant avec `updateMany is not a function`, pas seulement le nouveau test). **Règle réaffirmée : quand un chemin socket ET REST exposent la même opération d'écriture (delete/edit d'un message), auditer les DEUX — le REST est souvent le jumeau oublié parce que le socket est le chemin optimisé/testé en premier.** Suite gateway (Bun, `--ignore-scripts`, cette sandbox n'a pas de toolchain grpc-tools) : `messages.test.ts` 31/31, `messages-extended.test.ts` 17/17, aucune régression trouvée sur les suites `routes/` restantes (un crash runtime bun sans rapport — `panic: unsupported uv function: uv_async_init` sur `admin-anonymous-users.test.ts` — a interrompu le balayage complet ; isolé et non lié à ce diff, hors périmètre de ce cycle).

## Leçon 58 — Route sans schema de réponse strict = fuite de champs Prisma bruts (2026-07-03, routine calling-feature)

`GET /conversations/:conversationId/active-call` (`services/gateway/src/routes/calls.ts`) contournait un
bug connu `fast-json-stringify` (`oneOf: [schema, {type:'null'}]` crashe quand la valeur est `null`) en
supprimant TOUT schema sur `data` (`additionalProperties: true`) au lieu de corriger la vraie cause. Effet
de bord non anticipé : les 5 routes soeurs (`callSessionSchema` en whitelist stricte) filtrent déjà tout
champ non déclaré côté serializer Fastify, mais celle-ci sérialisait le document Prisma brut — quand un
nouveau champ privé (`CallParticipant.analytics`, télémétrie WebRTC) a été ajouté au schema Prisma des
mois plus tard, il a fuité silencieusement vers n'importe quel membre de la conversation (authz =
membership, pas participation à CET appel précis) sans qu'aucun diff ne touche cette route. **Règle : un
contournement de bug de sérialisation qui désactive le filtrage de champs (`additionalProperties: true`,
schema absent sur une branche `oneOf`) est une dette de sécurité latente — elle ne fuite rien AU MOMENT du
contournement, mais fuite automatiquement le prochain champ sensible ajouté ailleurs dans le modèle, sans
qu'aucun reviewer ne relise cette route.** Fix correct pour `oneOf`+`null` : `nullable: true` directement
sur le schema objet (pas de `oneOf`) — évite le bug fast-json-stringify tout en gardant le filtrage.
Vérifié par script Node autonome sur `fast-json-stringify` avant d'écrire le test Jest (plus rapide que
d'itérer sur un test complet pour valider le comportement d'une lib de sérialisation).

**Piège de test associé** : un test qui boote un VRAI Fastify + `.inject()` (nécessaire ici — les tests
existants du fichier, `calls-routes.test.ts`, mockent `sendSuccess` ET
`@meeshy/shared/types/api-schemas` en stubs `{type:'object'}`, donc ne peuvent PAS attraper un bug de
sérialisation) exige que CHAQUE mock de hook `preValidation`/`onRequest` soit une vraie fonction
`async (request) => {...}`, jamais un `jest.fn()` nu à 0 argument — sous dispatch Fastify réel (pas
l'extraction-et-appel-direct des tests `getRoute`), un stub nu fait `.inject()` **hang indéfiniment**
(pas d'erreur, pas de timeout explicite avant celui de Jest) sans qu'aucun mock en aval (prisma, service)
ne soit jamais invoqué — symptôme distinctif à chercher en premier sur tout futur test `.inject()`-based.

## Leçon 60 — F52 soldé : `triggerStoryTextTranslation` (caption) n'excluait pas la langue source, contrairement à son sibling `triggerStoryTextObjectTranslation` (2026-07-04, itération 90)

Résidu explicitement reporté à l'issue de l'itération 89 (« F52 »), même famille sibling-drift que
#40/#42/#45/#50/#55/#56/#57/#59 (« garde/règle appliquée à UNE méthode mais pas à son sibling
structurellement identique »). `PostService` a deux pipelines de traduction de story qui partagent
`resolveAudienceTargetLanguages(authorId)` : le pipeline `textObjects` (overlays,
`triggerStoryTextObjectTranslation`) filtre déjà `allTargetLanguages.filter(l => l !== sourceLanguage)`
avant d'envoyer le job ZMQ ; le pipeline `content` (légende, `triggerStoryTextTranslation`) ne le
faisait PAS — il passait la liste d'audience brute (source incluse) à
`zmqClient.translateToMultipleLanguages`. Conséquence concrète : un auteur francophone dont l'audience
inclut au moins un contact `systemLanguage: 'fr'` déclenchait un aller-retour NLLB `fr→fr` sur CHAQUE
story avec légende, et le handler de résultat (`$runCommandRaw` sur `translations.fr`) écrasait le champ
avec une **paraphrase** de la légende originale au lieu de la laisser intacte — violation directe de la
règle Prisme « le contenu déjà dans la langue préférée du viewer doit rester l'original, jamais une
resucée machine ». Fix : recalculer `sourceLanguage` AVANT de résoudre l'audience (au lieu d'après), puis
filtrer `allTargetLanguages.filter(l => l !== sourceLanguage)` — mirror exact du sibling, mêmes noms de
variables (`allTargetLanguages` / `targetLanguages`) pour que la divergence future soit visuellement
évidente en diff. Aucune signature changée, zéro requête supplémentaire, comportement inchangé pour toute
audience ne partageant pas la langue source. Tests : nouveau fichier
`PostService.storyCaptionSourceFilter.test.ts` (3 cas : filtre appliqué, plus aucun call ZMQ quand
l'audience entière == source, comportement inchangé quand aucune langue cible ne matche) — RED prouvé
(le mock capture `targetLanguages: ['fr','es']` non filtré avant le fix), GREEN après. Suites
`posts|Post` : 1128/1128 tests verts (51/52 suites ; le seul échec, `core.story-translation.test.ts`,
est un TS2305 préexistant sur `SequenceService.ts` important `PrismaClient` depuis `'@prisma/client'` —
confirmé identique sur `git stash`, même classe que le résidu documenté Leçon 58/itération 87). **Piège
de test à noter : `triggerStoryTextTranslation` enregistre un listener ZMQ (`zmqClient.on`/`.off`) et un
`setTimeout(60_000)` de cleanup — contrairement à son sibling fire-and-forget
`triggerStoryTextObjectTranslation`, le mock `ZMQSingleton.getInstanceSync` doit donc fournir `on`/`off`
(sinon l'appel jette et le test observe silencieusement 0 call — pas une erreur explicite), et le test
doit activer `jest.useFakeTimers()` pour ne pas laisser un timer réel de 60s ouvert après la fin du test
(sinon Jest force-exit après un délai, `--detectOpenHandles` visible dans les logs CI).**

## Leçon 61 — F51 soldé : suppression du sender FCM mort `FirebaseNotificationService`, supplanté par `PushNotificationService` (2026-07-04, itération 92)

Report explicite parké 5 itérations (87→91). Le gateway hébergeait **deux** implémentations d'envoi
de push FCM : la vivante `services/PushNotificationService.ts` (909 l., multicast `sendEachForMulticast`
+ APNs + routing d'env, instanciée dans `MeeshySocketIOManager` et injectée via
`setPushNotificationService()`, faisant l'objet du commit HEAD `6cd1a3c4`) et la morte
`services/notifications/FirebaseNotificationService.ts` (242 l., ancien sender minimal). Preuve de mort :
`grep "new FirebaseNotificationService"` hors tests = 0 ; seuls référents = ré-export `index.ts` + son
test unitaire dédié + une assertion de ré-export dans `NotificationService.uncovered-paths.test.ts`.
Retiré : la classe, son test unitaire (492 l.), la ré-export, l'assertion, et `FILES.txt` (cruft
machine-spécifique `/Users/smpceo/…` référençant un module fantôme `NotificationServiceExtensions.ts`).
**Piège évité : `notifications-firebase.test.ts` (770 l.) NE teste PAS la classe morte** — il monte le
chemin VIVANT `NotificationService`/APNs et ne référence jamais `FirebaseNotificationService` ; il est
donc CONSERVÉ. Toujours vérifier le SUJET réel d'un test « firebase » avant de le supprimer avec la
classe : ici l'homonymie de nom (`FirebaseNotificationService.test.ts` = mort vs `notifications-firebase.test.ts`
= vivant) est un piège de suppression.

Docs de dossier (`README/SUMMARY/ARCHITECTURE/MIGRATION.md`) = instantané historique périmé décrivant
une **composition** `FirebaseNotificationService` qui n'existe plus (le réel est INJECTÉ, pas composé) +
un module `NotificationServiceExtensions.ts` inexistant. Choix : bannière « obsolète » bornée pointant
vers `PushNotificationService`, PAS de réécriture complète (dette pré-existante orthogonale, reportée
F51b). **Règle : supprimer une classe référencée par des docs impose au minimum de neutraliser les
références pendantes (sinon la doc pointe un fichier supprimé = pire dette) — mais ne pas se laisser
entraîner dans une réécriture doc complète non bornée pour un cycle de suppression de code mort.**

**Gotcha d'environnement de validation (sandbox) réutilisable** : le schema Prisma override l'output
vers `./client`, donc `@prisma/client` (que `SequenceService.ts` importe) n'est jamais généré → baseline
TS2305 qui bloque le CHARGEMENT de toute suite important la chaîne `NotificationService` (documenté
it.87-91, faussement pris pour « suites non exécutables »). Pour un signal vert RÉEL : injecter un
générateur `client_default` (output par défaut) **transitoire** dans le schema, `npx prisma generate`,
puis **restaurer le schema immédiatement** (`git diff` schema == vide) — ça peuple
`node_modules/.prisma/client` (gitignored). Résultat : les 28 suites `[Nn]otification` du runner par
défaut passent (619 tests), dont la suite éditée `uncovered-paths` (53/53). Effet de bord à connaître :
avec DEUX clients générés (le `./client` + le default transitoire), ts-jest peut lever un TS2321
« Excessive stack depth » sur `new SequenceService(prisma)` (`NotificationService.ts:419`) dans les
suites `@ts-nocheck` hors runner par défaut (`notifications-firebase.test.ts`) — artefact du double
client aux types divergents, JAMAIS un signal de régression du diff. Ne pas chasser cette erreur si le
fichier concerné n'est pas dans le diff.

## Leçon 63 — une entrée de backlog "FIXED" n'est une preuve de rien sans grep contre `HEAD` (2026-07-06, routine calling-feature)

`tasks/calls-fonctionnel-todo.md` documentait (Vagues 13-16) plusieurs fixes calling comme "CONFIRMÉ +
CORRIGÉ", tests inclus — mais ces sections du fichier avaient elles-mêmes été effacées de `main` par la
régression `8ebd497b` (même commit qui avait aussi silencieusement supprimé le code qu'elles décrivaient),
et ne survivaient que dans deux PR ouvertes non mergées (#1558, #1563). Une session qui aurait fait
confiance au fichier tel qu'il existait sur sa propre branche (avant divergence) sans re-vérifier `HEAD`
aurait pu croire ces fixes présents alors qu'ils ne l'étaient pas. Pire : la PR #1558 elle-même a bâti un
nouveau fix (web, `call-store.ts` + `CallManager.tsx` initiator-timeout) sur l'hypothèse que le P0 du jour
(`682c35279`, "l'initiateur voit sa propre UI d'appel") était déjà sur `main` — il ne l'était pas (supprimé
par la même régression) — donnant une **couverture de test illusoire** : les tests de #1558 passent
(ils posent l'état directement via un helper de test) mais le vrai chemin de production qu'ils sont censés
protéger était cassé d'une façon différente et plus grave, jamais exercée par ces tests.
**Règle** : avant de s'appuyer sur une entrée de backlog pour décider qu'une zone du code est "déjà
traitée", `grep` la primitive technique citée (nom de fonction/champ/constante) directement dans le
fichier source sur `HEAD` — jamais seulement dans les docs. Avant de construire un nouveau fix par-dessus
un fix antérieur documenté, vérifier par lecture du code réel (pas de la doc, pas du diff de la PR qui le
cite) que ce fix antérieur est bien présent sur la base de travail actuelle.
## Leçon 62 — `MessageReadStatusService` : le curseur delivered/read pouvait régresser sous course (TOCTOU read-then-write) (2026-07-04, itération 93)

Audit expert (agent Explore, 56 tool-uses) sur la synchronisation temps réel du gateway : parmi 7
findings, celui retenu (isolé, testable, faible risque — cf. finding #1 sur `AuthHandler`, plus sévère
mais touchant tout le cycle de vie de connexion, différé). `markMessagesAsReceived`/`markMessagesAsRead`
(`MessageReadStatusService.ts`) lisaient le curseur (`findUnique`), décidaient "stale ou non" via
`isStaleCursorMessageId` sur ce snapshot, puis écrivaient sans condition via `upsert` — classique
check-then-act. Deux appels concurrents pour des messages différents (ex. burst `message:new`
déclenchant `_autoDeliverToOnlineRecipients` pour chaque message, ou deux devices qui livrent/lisent en
parallèle) pouvaient tous deux lire le même curseur "pas encore avancé" ; celui dont l'écriture atteint
Mongo EN DERNIER gagne, même si son message est plus ANCIEN — régression silencieuse du curseur
delivered/read, resurrection de messages déjà livrés/lus comme non livrés/non lus.

Fix : `upsert` ne peut pas porter de condition de garde au-delà de la clé unique — impossible de rendre
la décision atomique en gardant `upsert`. Remplacé par un `updateMany` gardé (`WHERE lastDeliveredMessageId
IS NULL OR lastDeliveredMessageId < messageId`, exactement le motif déjà utilisé par
`MessageHandler.handleMessageDelete` pour `lastMessageAt`) — la fraîcheur est évaluée par MongoDB AU
MOMENT de l'écriture, jamais sur un snapshot antérieur. Si `updateMany` ne matche rien : soit aucun
curseur n'existe encore (`create`), soit le curseur existant est déjà à jour (stale, `false`). Le
"existe déjà" est déduit du `findUnique` best-effort déjà fait par l'appelant pour borner la fenêtre de
gel (`prevDeliveredAt`/`prevReadAt`) — zéro requête supplémentaire dans le cas commun. Un `create` qui
échoue en P2002 (row créée entre-temps par un appel concurrent) retente le `updateMany` gardé une fois —
auto-guérison sans jamais faire confiance au hint d'existence pour la décision finale. Un helper privé
partagé `_advanceCursor` (idField/atField/resetUnreadCount paramétrés) sert les deux méthodes
symétriquement — `markMessagesAsReceived` ne remet PAS `unreadCount` à 0 sur l'`update` (contrairement à
`markMessagesAsRead`), seule divergence intentionnelle entre les deux sinon jumelles.

**Piège relevé pendant l'implémentation** : `cursorExists = prevCursor !== null` est FAUX quand le mock
Jest de `findUnique` n'est pas configuré (retourne `undefined`, pas une Promise résolue à `null`) —
`undefined !== null` vaut `true`, donc un curseur inexistant serait à tort traité comme existant. Fix :
`!= null` (égalité faible, capture `undefined` ET `null`). Prouvé nécessaire par un test préexistant qui
ne mockait pas `findUnique` du tout.

**Piège de suppression** : `isStaleCursorMessageId` (+ son test associé) devient mort dans
`MessageReadStatusService.ts` une fois les deux call sites retirés — supprimé. Une COPIE quasi-identique
existe dans `routes/conversations/messages.ts` (endpoint `mark-unread`, commentaire explicite « mirrors
the isStaleCursorMessageId guard ») mais avec une sémantique différente (déplace le curseur EN ARRIÈRE
intentionnellement) — PAS touchée, hors scope, TOCTOU résiduel noté mais non corrigé cette itération
(risque plus faible : action manuelle utilisateur, fenêtre de course étroite).

**Piège de test** : changer `upsert` → `updateMany`/`create` casse ~35 assertions dispersées dans TOUT
`MessageReadStatusService.test.ts` (pas seulement les describe blocks `markMessagesAsReceived`/
`markMessagesAsRead` — aussi Idempotency, Concurrency, Bulk Operations, dedup cache, error paths) PLUS
2 fichiers de tests de routes (`delivery-receipt.test.ts`, `mark-conversation-status.test.ts`) qui
montent le vrai service derrière `app.inject()`. Toujours `grep -rn "conversationReadCursor.upsert"`
au-delà du seul fichier de test unitaire avant de considérer un refactor de ce type terminé. Un test de
non-régression stateful (fake `updateMany`/`create` simulant le WHERE-guard réel de Mongo) prouve le fix
end-to-end : RED confirmé par `git stash` du fichier service seul (row reste `undefined`, l'ancien code
n'appelle jamais le fake), GREEN après restauration.

Suite `MessageReadStatusService.test.ts` : 148/148 (147 existants adaptés + 1 nouveau). Suites
adjacentes vérifiées non régressées : `MessageHandler.core/autoDeliver`, routes messages/conversations,
`delivery-receipt`, `mark-conversation-status` — 786/786 tous confondus. `MessagingService.test.ts`
échoue isolément sur le TS2305 baseline documenté Leçon 61 (confirmé identique via le workaround
`client_default` transitoire, restauré immédiatement) — non lié au diff.

## Leçon 63 — `handleMessageEdit` (WS + REST) pouvait ressusciter un message supprimé avec du contenu édité (2026-07-04, itération 94)

Audit expert (agent Explore, 27 tool-uses) sur la synchronisation temps réel du gateway, suite directe
de la Leçon 62. Parmi 4 findings (le plus fort — max-1-réaction-par-user TOCTOU sur `PostReaction`/
`CommentReaction` — nécessite une migration de schéma, différé pour un cycle isolé sans migration),
retenu : `MessageHandler.handleMessageEdit` (socket) et la route `PUT /messages/:messageId` (REST,
`routes/messages.ts`) lisaient le message avec `deletedAt: null`, décidaient l'autorisation sur ce
snapshot, puis écrivaient sans condition via `prisma.message.update({ where: { id } })` — classique
check-then-act. Un `message:delete` (ou `DELETE /messages/:messageId`) atterrissant entre la lecture et
l'écriture de l'edit n'empêche PAS ce `update` par id de réussir (il ne filtre pas sur `deletedAt`) : la
ligne soft-supprimée ressuscite avec le contenu édité, et le gateway diffuse quand même
`MESSAGE_EDITED` — un client ayant déjà retiré le message de son cache le voit réapparaître édité.

Fix, exactement le même motif que `handleMessageDelete`/`MessageReadStatusService` (Leçon 62) : remplacer
le `update` inconditionnel par un `updateMany({ where: { id, deletedAt: null }, data: {...} })` gardé,
puis brancher sur `count`. Socket handler : `count === 0` → erreur générique, aucune diffusion ; le
payload broadcasté est reconstruit localement (`{ ...champs déjà lus, content, isEdited, editedAt }`)
plutôt que depuis le retour d'`updateMany` (qui ne renvoie que `{ count }`), zéro requête
supplémentaire. Route REST : même garde, mais la réponse HTTP a toujours renvoyé la ligne complète
(toutes les colonnes scalaires, via l'`include` d'origine) — reconstruire ce payload à la main aurait
risqué d'omettre un champ (mentions, chiffrement, view-once, etc.) et de changer silencieusement le
contrat API. Choix plus sûr : après le `updateMany` gardé, un `findUniqueOrThrow` réhydrate la ligne à
jour avec le même `include: { sender: {...} }` que l'ancien `.update()` — un aller-retour DB
supplémentaire dans le cas commun, mais fidélité de contrat garantie plutôt qu'une énumération de champs
fragile.

**Piège de test répété (3 fichiers)** : chaque test qui stubait `prisma.message.update(...).mockResolvedValue(fullRow)`
et assertait dessus a dû être réécrit en `updateMany(...).mockResolvedValue({ count: 1 })` — le retour
n'est plus un message complet, donc les helpers `makeUpdatedMessage()` qui construisaient ce retour
deviennent morts une fois tous les call sites migrés (supprimés dans
`MessageHandler.core.test.ts`). Repéré par grep `prisma\.message\.update\b` scindé entre le describe
`handleMessageEdit` (à migrer) et `handleMessageDelete` (inchangé — sa propre écriture reste
volontairement non gardée, seul son recompute de `lastMessageAt` l'est, cf. Leçon précédente) : ne pas
migrer tout le fichier en aveugle. RED confirmé sur les deux fixes (`git stash` du fichier prod seul) :
le test "concurrent delete race" échoue avec `success: true`/`200` sur l'ancien code, prouvant le bug
avant le fix.

Suites vérifiées : `MessageHandlerEditDelete.test.ts` 36/36, `MessageHandler.core.test.ts` (fichier
complet) inchangé sauf edit block, `unit/routes/messages.test.ts` 32/32 (+2), `messages-extended.test.ts`
migré (mock prisma partagé). Suite complète gateway (bun, workaround `client_default` transitoire pour
lever le TS2305 baseline Leçon 61, schema restauré immédiatement après, `git diff` vide) :
506/506 suites, 13680/13681 tests (1 skip pré-existant).

## Leçon 63 — F58 soldé : la notif de réaction-commentaire s'effondrait le postType vers un booléen `isStory` (2026-07-04, itération 96)

Même classe de bug que le fix post-reaction déjà accepté (« Hardcoding 'POST' here dropped that
typing on every socket-path reaction »). `createCommentReactionNotification` prenait
`isStory?: boolean` et posait `metadata.postType: isStory ? 'STORY' : 'POST'` — un REEL/STATUS
portant un commentaire réagi produisait `metadata.postType: 'POST'` + un corps « … sur le post de X ».
La sœur `createPostLikeNotification`, sur le même contenu, portait déjà le vrai
`postType?: 'POST'|'STORY'|'MOOD'|'STATUS'|'REEL'` sans collapse. Fix en 3 points miroir : (1) shared
`COMMENT_CONTEXT` élargi de `{story, post}` à un `ObjMap` complet (5 `NotificationPostKind` × 8
langues), en réutilisant les choix de noms des tables voisines (`INDEF_OBJ`/`LOC_OBJ`) pour la
cohérence de genre/casse ; (2) `createCommentReactionNotification` prend `postType` (mirror de la
sœur), body + metadata sans collapse ; (3) `CommentReactionHandler` forwarde `post?.type` au lieu de
`isStory = post?.type === 'STORY'`. **Garde-fou legacy conservé** : la branche `reaction.commentVerbose`
résout `kind = params.postType ?? (params.isStory ? 'STORY' : 'POST')` — `postType` prime, `isStory`
reste un repli inerte quand `postType` est fourni → les 2 tests `isStory:true/false` existants restent
verts sans réécriture. Zéro changement iOS/web/DB : la sœur post-reaction émettait déjà REEL/STATUS
en `metadata.postType`, donc les clients gèrent déjà ces valeurs.

**Ménage de backlog fait ce cycle (règle réutilisable)** : toujours VÉRIFIER dans le code qu'un item
listé « parké » l'est encore avant de le retenir. Les reports it.90→94 listaient F53/F54 (HIGH) comme
parkés alors qu'ils étaient soldés en it.89 et présents sur `main` (lecture directe de
`PostFeedService.ts` + `attachment-validators.ts`) — un report se périme si l'itération qui solde ne
nettoie pas la liste en aval. **Note F57** : ce cycle avait pré-évalué F57 comme inerte côté
consommateurs de prod (`hasMentions`/`extractMentions` référencés uniquement par des tests, chemins
d'extraction de prod sur usernames ASCII-validés `/^[a-z0-9_]{1,30}$/`) ; une itération parallèle
(it.95 sur `main`) l'a néanmoins durci défensivement — les deux constats coexistent, F57 est clos.
Leçon transverse : toujours grep les call-sites non-test AVANT d'inscrire (ou de clore) un item comme
dette — et vérifier `origin/main` juste avant de statuer, un cycle parallèle peut l'avoir traité.


## Leçon 64 — F61 soldé : le fallback `@username` de `parseMentions` gardait une frontière gauche ASCII, jumelle résiduelle de F57 (2026-07-04, itération 96)

Suite de la Leçon 44 (mention par préfixe) et de F57 (it.95, `hasMentions` ASCII→Unicode). Le module
`mention-parser.ts` déclare `NAME_BOUNDARY_LEFT = (?<![\p{L}\p{N}_])` comme **source de vérité unique**
de la frontière de nom. Le path `@DisplayName` (l.40) la réutilise avec le flag `u` ; mais le fallback
`@username` réimplémentait la frontière gauche à la main en ASCII (`/(?<![\w])@(\w{1,30})/g`, sans flag
`u`). Or `\w` ASCII = `[A-Za-z0-9_]` : dès que le caractère précédant le `@` est une lettre Unicode
(`é`, `à`, cyrillique…), le lookbehind ASCII échoue silencieusement et le `@` interne d'une adresse
e-mail est capturé comme mention. Repro vitest : `parseMentions('écris à André@atabeth.com',
[{username:'atabeth'}])` retournait `['u1']` (mauvais user notifié) alors que `Andre@atabeth.com`
(ASCII) rendait `[]` — même entrée, une lettre accentuée d'écart, résultat opposé. **Fix (1 ligne) :
réutiliser la constante — `new RegExp(\`${NAME_BOUNDARY_LEFT}@(\\w{1,30})\`, 'gu')`.** Le flag `u`
n'upgrade que la frontière gauche en Unicode ; `\w{1,30}` reste ASCII (usernames ASCII par validation —
intentionnel). Comportement strictement plus restrictif (rejette des faux positifs e-mail), aucun cas
de mention légitime affecté. RED→GREEN + suite `packages/shared` 1258/1258 + `tsc` 0 erreur. **Règle :
quand un module déclare une constante « source de vérité unique » pour une frontière/charset, AUCUN
chemin voisin ne doit réimplémenter la même frontière à la main — auditer TOUS les paths du module
(F57 avait unifié `hasMentions` + `@DisplayName` mais oublié le fallback `@username` : un seul path
oublié réintroduit la dérive ASCII↔Unicode).**


                                               
## Leçon 65 — Un nouveau `NotificationType` non câblé dans `isTypeEnabled` contourne la préférence via `default:true` (F59, it.97)
`isTypeEnabled(prefs, type)` mappe chaque `NotificationType` → son champ booléen de préférence. Son
`default: return true` est destiné aux types système/toujours-actifs (`login_new_device`,
`translation_ready`…). **Piège** : quand on ajoute un nouveau type gouverné par une préférence
utilisateur existante et qu'on oublie de l'ajouter au `switch`, il tombe silencieusement sur
`default:true` — il IGNORE l'opt-out utilisateur. C'était le cas de `comment_reaction` (chemin socket)
alors que son sibling REST `comment_like` était bien gaté sur `commentLikeEnabled`. Résultat : couper
« like de commentaire » n'éteignait que le REST, la réaction socket passait quand même.

**Règle réutilisable** : deux chemins/transports du MÊME geste produit (ici réagir à un commentaire)
DOIVENT honorer la même préférence. À chaque nouveau type de notif, se demander « quelle préférence
existante le gouverne ? » et l'ajouter explicitement au `switch` — ne jamais le laisser au `default`
sauf s'il est intentionnellement toujours-actif (sécurité/système). Audit rapide : lister l'union
`NotificationType` et cross-check vs les `case` — les types tombant sur `default` doivent être
soit système, soit sans champ de préférence à créer (décision produit), jamais un type qui a déjà un
toggle câblé pour son sibling.


                                               

## Leçon 66 — F62 soldé : `resolveUserLanguage` renvoyait les préférences in-app en casse brute, `resolveUserLanguagesOrdered` les lowercasait — drift de casse live sur le Prisme (2026-07-04, itération 98)
Deux résolveurs sœurs du même module (`packages/shared/utils/conversation-helpers.ts`) répondaient à
la même question « quelle langue pour cet utilisateur ? » avec deux politiques de casse divergentes :
`resolveUserLanguagesOrdered` lowercasait chaque préférence in-app (`c.toLowerCase()`) — c'est elle
qui produit les **cibles de traduction** (stockées minuscules) et les `resolvedLanguages` du socket ;
`resolveUserLanguage` renvoyait `user.systemLanguage` **verbatim** — c'est elle qui produit
`meta.userLanguage` (l'indice de langue d'affichage du client) et la langue des notifications. Cause
racine : `isSupportedLanguage` valide de façon insensible à la casse (`code.toLowerCase()` avant
lookup) mais **ne transforme pas** — les écritures (`register`, `PreferencesService`) persistent
`'EN'` verbatim, la casse n'est donc **pas garantie minuscule en base**. Conséquence live : un
`systemLanguage: 'EN'` → `meta.userLanguage: 'EN'` → le client cherche une traduction `'EN'`, ne
trouve que la clé `'en'` → **retombe sur l'original** (violation Prisme règle #1) ; notification dans
la mauvaise langue ; `getRequiredLanguages` produit `['EN','en']` (doublon, requête translator
gaspillée). **Fix (6 `.toLowerCase()`) : normaliser à la LECTURE dans les deux résolveurs** — parité
stricte avec `resolveUserLanguagesOrdered`, répare aussi les données déjà stockées en casse mixte,
sans migration, se propage à tous les consommateurs (dont le web qui délègue). RED→GREEN + suite
`packages/shared` 1265/1265 + `tsc` 0 erreur. **Règle : quand la validation d'un champ est
insensible à la casse mais ne normalise pas la valeur stockée, la casse en base n'est PAS garantie —
le résolveur de lecture (source de vérité) DOIT normaliser, et TOUS les résolveurs sœurs du même
champ doivent partager la même politique de casse (auditer le module entier, pas la seule fonction
touchée).**

## Leçon 67 — Le broadcast présence temps réel ignorait le blocage que `GET /users/presence` enforce (2026-07-05, itération 99)

Sibling drift entre le chemin REST et le chemin socket de la présence. `GET /users/presence`
(`routes/users/presence.ts:111`) résout la visibilité via `PresenceVisibilityService.resolveForTargets`,
qui masque `isOnline`/`lastActiveAt` (retourne `HIDDEN`) dès que l'un des deux users a bloqué l'autre
(`isBlockedEitherWay`, doc `2026-06-30-profile-last-seen-visibility-design.md`). Les DEUX chemins temps
réel jumeaux ne connaissaient QUE `showOnlineStatus`/`showLastSeen` (préférences globales) et n'appelaient
jamais cette vérification de blocage : `_applyPresencePrefs`/`_emitPresenceSnapshot`
(`MeeshySocketIOManager.ts:563-640`, snapshot initial envoyé au socket à la connexion) et
`_broadcastUserStatus` (`:1587-1667`, fan-out à chaque connexion/déconnexion vers toutes les rooms de
conversation de l'utilisateur). Concrètement : A bloque B, les deux restent co-participants d'un groupe
(bloquer ne retire jamais des conversations partagées) ; quand B se connecte, A reçoit quand même son
`isOnline`/`lastActiveAt` réels par socket — alors que `GET /users/presence` pour la même paire les
aurait masqués. Fuite de vie privée silencieuse sur le canal qui reste ouvert en permanence.

**Fix** : nouveau helper batché `getBlockedUserIdsAmong(prisma, userId, candidateIds)` dans
`utils/blocking.ts` (2 requêtes groupées, miroir de `PresenceVisibilityService.resolveForTargets`'s
calcul de blocage, réutilisable). (1) `_applyPresencePrefs` prend maintenant `viewerId` et masque
`isOnline`/`lastActiveAt` (mêmes valeurs que `HIDDEN`) pour tout contact bloqué avec le viewer — les
deux call-sites dans `_emitPresenceSnapshot` passent le `userId` du socket qui se connecte. (2)
`_broadcastUserStatus` calcule l'ensemble des viewers actuellement connectés (`this.connectedUsers`)
en relation de blocage avec le broadcaster, résout leurs socket ids via `this.userSockets`, et utilise
`io.to(rooms).except(blockedSocketIds)` — un `socket.id` est aussi une room Socket.IO auto-join, donc
`.except(socketId)` exclut précisément ce viewer du fan-out sans affecter les autres participants de la
même room. Pas de query DB supplémentaire quand personne d'autre n'est connecté (fast-path `[].length
=== 0`). RED→GREEN : `utils/__tests__/blocking.test.ts` (+7 cas sur le nouveau helper) +
`MeeshySocketIOManager.test.ts` (+3 cas : snapshot masque un contact bloqué, broadcast exclut le socket
d'un viewer bloqué, broadcast n'appelle PAS `.except()` en l'absence de blocage). Suite gateway complète
(workaround `client_default` transitoire Leçon 61, schema restauré immédiatement après, `git diff` vide) :
506/506 suites, 13707/13708 tests (1 skip pré-existant).

**Règle réutilisable** : quand une règle de visibilité/privacy (blocage, visibilité de post, etc.) est
enforced sur un endpoint de lecture ponctuelle (REST), auditer SYSTÉMATIQUEMENT le canal temps réel
jumeau (snapshot de connexion + broadcast incrémental) — un canal qui reste ouvert en permanence est
un vecteur de fuite plus grave qu'un endpoint interrogé à la demande, et c'est précisément le genre de
sibling que ce backlog a déjà trouvé divergent à plusieurs reprises (mentions, postType, casse de
langue, cursor read/delivered).

## Leçon 68 — Le broadcast `typing:start`/`typing:stop` ignorait aussi le blocage, alors que la présence (Leçon 67) venait d'être corrigée (2026-07-05, itération 100)

Sibling drift direct de la Leçon 67, sur un canal encore plus sensible : `_broadcastUserStatus`
(présence) enforce désormais le blocage bidirectionnel, mais `StatusHandler.handleTypingStart`/
`handleTypingStop` (`services/gateway/src/socketio/handlers/StatusHandler.ts`) diffusaient
`typing:start`/`typing:stop` via `socket.to(room).emit(...)` sans AUCUNE vérification de blocage —
seule la préférence globale `shouldShowTypingIndicator` (booléen, sans notion de viewer) était
consultée. Or bloquer ne retire jamais des conversations partagées (fait déjà établi en Leçon 67) :
A bloque B, les deux restent co-participants d'un groupe ; quand B tape dans ce groupe, A voit
« B est en train d'écrire… » en direct alors que `GET /users/presence` masquerait `isOnline`/
`lastActiveAt` pour cette même paire. La frappe est un signal plus sensible que la présence
(prouve un engagement actif, instant par instant) — c'était donc une régression de couverture
laissée ouverte par la Leçon 67 elle-même (fix scopé à `_broadcastUserStatus`, `StatusHandler` non
audité). Un troisième chemin jumeau avait le même trou : `handleSocketDisconnecting` (broadcast
`typing:stop` de secours à la déconnexion, via un `broadcastFn` injecté par
`MeeshySocketIOManager.ts`).

**Fix** : nouveau helper privé `StatusHandler._getBlockedSocketIdsInRoom(userId, conversationId)` —
requête les participants actifs et enregistrés (`userId: { not: null }`, les anonymes ne peuvent ni
bloquer ni être bloqués) de la conversation, filtre ceux actuellement en ligne
(`connectedUsers.has`), puis réutilise `getBlockedUserIdsAmong` (même helper que Leçon 67) pour
résoudre l'ensemble bloqué, et `userSockets` (nouvelle dépendance optionnelle de
`StatusHandlerDependencies`, câblée depuis `MeeshySocketIOManager`) pour mapper vers des socket
ids. Les 3 call sites (`handleTypingStart`, `handleTypingStop`, `handleSocketDisconnecting`) font
`socket.to(room).except(blockedSocketIds).emit(...)` quand la liste est non vide — identique au
pattern déjà validé sur la présence. `handleSocketDisconnecting` devient `async` (await du helper) ;
son `broadcastFn` gagne un 4e paramètre optionnel `exceptSocketIds`. RED→GREEN :
`StatusHandler.test.ts` (×2 fichiers) +5 cas (exclusion sur start/stop/disconnect, no-op quand
personne n'est bloqué, filtre les participants anonymes) + fixtures `makePrisma` étendues
(`participant.findMany`/`user.findMany` par défaut vides, non-régressif). Suite complète
StatusHandler (73/73) + blocking.ts (283/283 avec MeeshySocketIOManager) verte ; le seul échec
tsc/jest restant (`SequenceService.ts` → `@prisma/client` sans export `PrismaClient`) est
pré-existant sur `main`, confirmé par `git stash` avant relance — sans lien avec ce fix.

**Règle réutilisable** : une correction de sibling drift (Leçon 67) doit elle-même être auditée pour
d'autres siblings du MÊME concept produit avant d'être considérée close — ici « présence » et
« frappe » sont deux facettes du même signal (« cet utilisateur est actif maintenant »), et corriger
l'une sans l'autre laisse un vecteur de fuite ouvert, parfois plus grave que celui qu'on vient de
fermer. Lister explicitement TOUS les canaux qui exposent un signal de présence/activité (présence,
frappe, dernière vue, indicateurs de lecture en direct…) et vérifier qu'ils partagent tous la même
politique de blocage avant de clore un correctif de ce type.
## Leçon 68 — Un fix de sibling-drift peut lui-même en introduire un nouveau s'il ne couvre que les chemins terminaux qu'il possède (2026-07-05, itération 100, Vague 14 appels)

`a813b31` (gateway/calls, plus tôt le même jour) a ajouté `CallEventsHandler.clearQualityDegradedStreaks`
et l'a câblé sur les 3 chemins terminaux **que `CallEventsHandler` possède lui-même**
(`broadcastCallEnded`, disconnect-leave à 0 participant, disconnect-force-cleanup). Un **4e** chemin
terminal existe pour le même appel — `CallCleanupService.forceEndCall` (le tier GC cron 60s) — mais vit
dans une classe séparée sans référence à l'instance `CallEventsHandler`, donc n'a reçu ni l'ancien
bug (déjà documenté) ni son fix. Piège spécifique à ce cas : le fix a été écrit et testé en ne regardant
QUE les call-sites internes à la classe qu'on modifie déjà — la recherche de siblings s'est arrêtée à la
frontière de fichier au lieu de suivre "tous les chemins qui terminent un `CallSession`" (grep
`callSession.updateMany.*status` ou équivalent, à travers TOUT `services/gateway/src`, pas juste le
fichier en cours d'édition). Une classe séparée qui termine la même entité (ici via son propre GC/cron)
compte comme sibling au même titre qu'une méthode sœur dans le même fichier.

**Règle réutilisable** : quand on répare un sibling-drift ("chemin X était couvert, chemin Y ne l'était
pas"), avant de committer, lister EXHAUSTIVEMENT tous les chemins qui écrivent le même état terminal
sur la même entité — via un grep structurel sur le nom de la table/du champ concerné dans tout le
service, pas seulement dans le fichier qu'on est en train d'éditer — et vérifier explicitement que
chacun reçoit le fix, pas seulement ceux qui vivent dans la même classe. Un fix de sibling-drift qui
ne couvre que 3 des 4 chemins réels n'est qu'un sibling-drift déplacé, pas résolu.
## Leçon 68 — F71 soldé : `community-preferences.ts` était une copie figée de `conversation-preferences.ts`, sans la diffusion socket ajoutée après-coup au sibling (2026-07-05, itération 104)

Nouvelle variante de la famille « deux chemins jumeaux répondant à la même question produit divergent »
(#57/#62/Leçon 65/Leçon 67), cette fois entre deux ROUTE FACTORIES quasi identiques plutôt qu'entre deux
fonctions pures. `conversation-preferences.ts` (`PUT`/`DELETE /user-preferences/conversations/:id`)
diffuse `USER_PREFERENCES_UPDATED` vers `ROOMS.user(userId)` (multi-device sync, payload versionné)
depuis un cycle antérieur. `community-preferences.ts` implémente EXACTEMENT le même pattern de route
(mêmes champs `isPinned`/`isMuted`/`isArchived`/`customName`/`categoryId`/`orderInCategory`, plus
`isHidden`/`notificationLevel` propres aux communautés) mais n'avait **aucun** appel `broadcastToUser`/
`io.emit` (grep repo-wide confirmé nul) : la copie initiale du fichier a divergé du fix suivant, jamais
rétro-porté sur son sibling. Effet live : pin/mute/archive/hide/rename d'une communauté depuis un
onglet ou un appareil restait invisible pour toute autre session ouverte du même utilisateur jusqu'à un
refetch manuel — exactement la classe de bug déjà corrigée côté conversation.

**Fix** : nouveau type `UserPreferencesCommunityUpdatedEventData` (discriminant `communityId`, SANS
`version` — `UserCommunityPreferences` n'a pas ce champ en base, pas de migration Prisma nécessaire ;
le consommateur web réagit en invalidant son cache React Query plutôt qu'en réconciliant un snapshot
optimiste versionné) ajouté à l'union `UserPreferencesUpdatedEventData`. `PUT`/`DELETE` de
`community-preferences.ts` diffusent désormais via le même helper `broadcastToUser` que le sibling.
Web : `use-socket-cache-sync.ts` discrimine la nouvelle branche `'communityId' in data` et invalide
`queryKeys.communities.preferences.detail/list`. RED→GREEN : nouveau
`community-preferences-broadcast.test.ts` (3 cas, 2/3 rouges avant fix) + 2 cas web dans
`use-socket-cache-sync.test.tsx`. Suites ciblées vertes : gateway `preferences` 394/394,
web `community` 70/70 ; `packages/shared` `bun run build` 0 erreur ; `tsc --noEmit` gateway/web sans
nouvelle erreur (bruit préexistant documenté, non lié : `SequenceService.ts` TS2305, itération 86).

**Règle réutilisable** : quand un fix (diffusion socket, garde de concurrence, check de blocage…) est
ajouté à UNE route factory, grep immédiatement les routes SŒURS qui partagent la même forme
(`grep -rn "PUT.*preferences" routes/`, ou plus généralement chercher les fichiers dont le nom suit le
même gabarit — ici `*-preferences.ts`) — une copie de code initiale figée avant le fix ne le reçoit
jamais automatiquement, et rien ne le signale (pas d'erreur, pas de test qui casse, juste un
comportement silencieusement différent entre deux entités qui devraient se comporter pareil).


                                               
                                               
## Leçon 69 — Une liste blanche de langues codée en dur diverge de la source de vérité des bundles (2026-07-05, itération 108)

`detectBestInterfaceLanguage` (`apps/web/utils/language-detection.ts`) sélectionnait la langue de l'UI
au montage via une liste blanche codée en dur `['en', 'fr', 'pt']`. L'espagnol y manquait alors que
`locales/es/` est un bundle complet et que `es` est une entrée first-class de `INTERFACE_LANGUAGES`
(`types/frontend.ts`), placée AVANT `fr`/`pt` qui, elles, étaient auto-détectées. Résultat : tout
navigateur hispanophone recevait une UI anglaise — violation du Prisme Linguistique sur la surface
chrome, exactement le genre de friction que le produit promet d'éliminer. La fonction jumelle
`getUserPreferredLanguage` (même fichier, langue de contenu) gérait `es` correctement via
`isSupportedLanguage` : divergence entre deux détecteurs du même module.

**Fix** : `['en', 'es', 'fr', 'pt']` = exactement les 4 langues avec bundle complet ; `de`/`it` restent
exclues (sans bundle, repli `en` intentionnel documenté). RED→GREEN : 3 tests (`['es-ES','en-US'] → 'es'`,
`['es-419'] → 'es'`, garde-fou `['it-IT','de-DE'] → 'en'`). `language-detection.test.ts` 35/35,
`use-language.test.tsx` (callers) 24/24.

**Règle réutilisable** : quand une capacité produit (langue, thème, feature-flag) a une **source de
vérité déclarative** (ici `INTERFACE_LANGUAGES` + présence du dossier `locales/<code>`), toute liste
blanche codée en dur qui la re-liste ailleurs est un point de dérive garanti. Auditer systématiquement
que chaque valeur « expédiée » (bundle présent, entrée dans le sélecteur) apparaît dans TOUS les chemins
qui la filtrent — et distinguer l'omission-défaut (valeur expédiée mais absente : `es`) de
l'omission-intentionnelle (valeur non expédiée, repli documenté : `de`/`it`). Un test garde-fou sur le
cas intentionnel empêche un futur « fix » de casser l'exclusion voulue.
## Leçon 68 — F72 soldé : `capitalizeName` ne re-capitalisait qu'après un espace, mutilant Jean-Pierre/O'Brien à l'inscription (2026-07-05, itération 105)

**Contexte** : `services/gateway/src/utils/normalize.ts` normalise les champs d'inscription
(`normalizeUserData` → `AuthService.registerUser`). `capitalizeName` faisait `.split(' ')` — un seul
séparateur de segment. Or `AuthSchemas.register` autorise `[\p{L}\s'.-]` dans firstName/lastName : tout
nom composé à tiret ou apostrophe (omniprésent en clientèle francophone) passait la validation puis se
faisait forcer en minuscules après le séparateur : `'Jean-Pierre' → 'Jean-pierre'`, `"O'Brien" →
"O'brien"`. Preuve d'incohérence : sur un même enregistrement, `firstName` ressortait `'Jean-pierre'`
tandis que `displayName` (via `normalizeDisplayName`, qui ne touche pas la casse) restait
`'Jean-Pierre'`. Jumeau du même fichier : `normalizeDisplayName` promettait un rendu mono-ligne mais sa
classe `[\n\t]` **omettait `\r`**, laissant survivre le CR des fins de ligne Windows (`\r\n`) et Mac
historiques.

**Fix** : `capitalizeName` = `.trim().toLowerCase().replace(/(^|[\s'.-])(\p{L})/gu, (_, sep, l) => sep +
l.toUpperCase())` — capitalise la 1ʳᵉ lettre après début-de-chaîne OU tout séparateur de nom autorisé
(`[\s'.-]`, exactement le charset non-lettre de la validation), préserve les accents (`\p{L}`), les
multi-espaces et les préfixes numériques (`'3john'` inchangé). `normalizeDisplayName` = `replace(/[\r\n\t]/g,
'')`. Deux tests **codifiaient le défaut** (`'Jean-pierre'`, `'Test\rUser'`) alors que leurs intitulés
décrivaient le comportement correct — corrigés vers l'intention. Mock `normalize` d'`AuthService.test.ts`
réaligné sur l'impl réelle. RED→GREEN : `normalize.test.ts` 126/126 (+7 cas tiret/apostrophe/accent/`\r`
seul + 1 assertion d'intégration corrigée), `AuthService.test.ts` 115/115, `profile-extended.test.ts`
36/36.

**Règle réutilisable** : quand un helper de normalisation/formatage découpe sur UN séparateur (`split(' ')`,
`[\n\t]`, `lastIndexOf('.')`), vérifier l'**ensemble complet** des séparateurs que sa couche d'entrée
autorise réellement — ici le charset de la Zod schema qui garde l'endpoint. Le charset de validation EST
la source de vérité des séparateurs à traiter ; toute divergence entre « ce que la validation laisse
entrer » et « ce que le normalizer sait découper » est un bug latent (même classe que F65
`truncateFilename` sans point, F69 `sanitizeFileName`). Et un test dont l'intitulé décrit le
comportement correct mais dont l'assertion fige la sortie buggée est un signal fort de défaut, pas
d'intention.

## Leçon 70 — F73 soldé : `PATCH /messages/:messageId` (route Android) éditait le message sans jamais diffuser `message:edited` ni retraduire (2026-07-06, itération 110)

Nouvelle variante de la famille « deux routes REST jumelles répondant à la même action produit
divergent » (Leçon 65/67/68). Trois routes gateway éditent un message par ID :
`PUT /conversations/:id/messages/:messageId` (`messages-advanced.ts`), `PUT /messages/:messageId`
(`messages.ts`) et `PATCH /messages/:messageId` (`messages-advanced.ts`, décrite dans son propre
schéma OpenAPI comme « alternative to PUT /conversations/:id/messages/:messageId »). Les deux `PUT`
invalident les traductions en base, déclenchent `_processRetranslationAsync` et diffusent
`SERVER_EVENTS.MESSAGE_EDITED` sur `ROOMS.conversation`. Le `PATCH` — utilisé par le client Android
(`MessageApi.kt` : `@PATCH("messages/{id}")`) — ne faisait qu'un `prisma.message.update` puis
`sendSuccess`, avec un commentaire fantôme (« Le service de traduction sera notifié si nécessaire via
WebSocket ») ne correspondant à aucun code. Effet live : un utilisateur Android éditant un message,
toute autre session (web, iOS, autre appareil Android) dans la même conversation ne recevait jamais
la mise à jour tant qu'aucun refetch complet n'était déclenché ; les traductions déjà en cache
restaient alignées sur l'ancien contenu — violation directe du Prisme Linguistique sur ce chemin
précis. Aucun test existant ne couvrait le socket/la retraduction pour cette route (le describe
`PATCH /messages/:messageId` n'assertait que `sendSuccess`/`sendForbidden`/`sendNotFound`).

**Fix** : le handler `PATCH` inclut désormais `translations: null` dans son unique
`prisma.message.update` (une seule requête, pas de round-trip séparé comme le sibling
`messages-advanced.ts`), déclenche `fastify.translationService._processRetranslationAsync` dans un
try/catch qui n'échoue jamais l'édition, transforme `translations` en tableau via
`transformTranslationsToArray` (contrat client), et diffuse `SERVER_EVENTS.MESSAGE_EDITED` vers
`ROOMS.conversation(message.conversationId)` — strictement le même pattern que
`PUT /messages/:messages.ts`. RED→GREEN : 5 nouveaux cas dans
`conversation-messages-advanced.test.ts` (broadcast, retraduction déclenchée, retraduction en échec
n'empêche pas le succès, `socketIOManager` null → pas de broadcast mais succès) ; suite ciblée
95/95 verte. `tsc --noEmit` gateway : aucune nouvelle erreur (bruit préexistant inchangé :
`SequenceService.ts` TS2305, itération 86).

**Règle réutilisable** : quand TROIS routes (pas seulement deux) répondent à la même question
produit, l'audit de parité doit comparer les trois entre elles, pas seulement la paire la plus
visible — ici la troisième route porte dans son propre schéma OpenAPI la mention explicite d'être
une "alternative" à une autre, ce qui est un signal fort qu'elle doit être auditée pour la même
parité comportementale (pas seulement la même forme de payload). Un commentaire du type "sera notifié
si nécessaire via WebSocket" sans aucun appel `emit` associé est un marqueur quasi certain de
sibling-drift non résolu — grep `via WebSocket` / `WebSocket si nécessaire` dans les commentaires du
repo pour trouver d'autres promesses non tenues du même genre.
## Leçon 69 — F77 soldé : `SERVER_EVENTS.NOTIFICATION` (sans suffixe) était du code mort en miroir des deux côtés (gateway émetteurs + web listener), et masquait un vrai bug d'import Prisma qui cassait 26 suites (2026-07-05, itération 106)

**Contexte** : `tasks/socketio-events-cleanup.md` item #4 demandait un audit de
`SERVER_EVENTS.NOTIFICATION` (sans `:action`, à ne pas confondre avec `NOTIFICATION_NEW`) pour
décider deprecate/rename/remove. Grep des émetteurs réels : `MeeshySocketIOHandler.sendNotificationToUser()`
(définie, jamais appelée par aucun caller) et `SocketNotificationService.emitNotification()` (classe
jamais instanciée hors de son propre fichier de test — toute diffusion réelle de notifications passe
par `NotificationService` qui émet directement sur `this.io`). Le seul "consommateur" restant était
un listener web `notification-socketio.singleton.ts` commenté "Legacy support" — mais comme les deux
émetteurs étaient déjà morts, ce n'était pas un vrai chemin de compat, juste un miroir de code mort
côté client (iOS avait déjà indépendamment choisi de ne pas s'y abonner, commentaire à l'appui).
Classe de bug adjacente à celle de la Leçon 68/#57/#62/#67 (chemins jumeaux qui divergent) mais ici
les DEUX jumeaux étaient morts simultanément plutôt qu'un vivant/un mort.

**Fix** : suppression complète (constante + entrée `ServerToClientEvents`, méthode + import
`SERVER_EVENTS` devenu inutile sur `MeeshySocketIOHandler`, classe `SocketNotificationService` entière
+ son export, listener + tests web). Le principe CLAUDE.md « si tu es certain que c'est inutilisé,
supprime complètement, ne renomme pas en `_unused` » s'applique : pas de période de dépréciation
nécessaire puisqu'aucun code vivant n'émettait ni ne dépendait de cet event.

**Trouvaille annexe** : en lançant la suite complète gateway pour vérifier l'absence de régression,
26 suites échouaient à la compilation avec `TS2305: Module '"@prisma/client"' has no exported member
'PrismaClient'` — documenté dans plusieurs itérations précédentes comme "bruit préexistant non lié"
(ex. Leçon 68/F72) mais jamais élucidé. Cause réelle : `schema.prisma` ne déclare qu'UN seul generator
avec `output = "./client"` (donc `@meeshy/shared/prisma/client`) — le package `@prisma/client` par
défaut n'a jamais de client généré à cet emplacement dans ce repo. Trois fichiers
(`SequenceService.ts`, `__tests__/helpers/consent-test-helper.ts`, `migrations/migrate-from-legacy.ts`)
importaient `PrismaClient` depuis `@prisma/client` au lieu de `@meeshy/shared/prisma/client` (convention
suivie partout ailleurs dans `services/gateway/src`). Corrigé : alignement des 3 imports, suite complète
508/508 (contre 482/508 + 26 échecs de compilation avant).

**Règle réutilisable** : un item de backlog "à élucider" ne doit pas rester en l'état à chaque
itération — l'audit demandé (`grep` des émetteurs réels) est souvent rapide et donne une réponse
définitive (ici : mort des deux côtés → suppression, pas juste un renommage cosmétique). Et une erreur
de compilation répétée dans plusieurs comptes-rendus d'itérations sous l'étiquette "bruit préexistant,
non lié" mérite d'être élucidée au moins une fois plutôt que reconduite indéfiniment — le fait que ~26
suites échouent à charger n'est jamais vraiment "sans rapport", même quand isolé du diff de la session
en cours ; ici la cause était un import cassé trivial à corriger, pas un problème d'environnement.

## Leçon 70 — F84c soldé : le durcissement `reactionSummary` était asymétrique entre les 3 services de réaction — vérifier l'état RÉEL de chaque jumeau avant de « propager » (2026-07-06, itération 115)

**Contexte** : F84c (reporté par l'itération 113) décrivait la carte `reactionSummary` des posts/commentaires
comme maintenue par delta read-modify-write et proposait de « propager le durcissement groupBy déjà
appliqué aux réactions de message ». En vérifiant l'état réel de `main`, les trois services étaient dans
**trois états différents** : `ReactionService` (message) recompute carte+total depuis `groupBy`
(le plus dur) ; `PostReactionService`/`CommentReactionService` recomputent le **total** via `count()`
(autoritaire) mais laissent la **carte par emoji** en delta. La PR ouverte #1560 (même numéro d'itération
114, session parallèle) « durcissait » au contraire `ReactionService` en le RAMENANT à un delta + `count()`
— soit une régression vis-à-vis du `groupBy` déjà présent sur `main` (patch écrit contre un `main` plus
ancien). **Règle** : ne jamais faire confiance à la description d'un backlog reporté sur « quel jumeau est
déjà durci » — `grep`/lire les 3 implémentations avant de choisir la cible et la direction. Ici la bonne
direction était d'aligner post/commentaire sur le `groupBy` du message (le meilleur patron), pas l'inverse.

**Fix** : `updatePostReactionSummary`/`updateCommentReactionSummary` réécrites sur
`groupBy({ by:['emoji'], where, _count:{emoji:true} })` → carte ET total autoritaires ; `likeCount`
conservé synchronisé sur le total. Signature privée simplifiée `(id)` (drop `emoji/action/count`), 4 sites
d'appel adaptés. Une requête de MOINS par mutation (`groupBy` remplace `findUnique + count`). 142/142 sur
les 2 suites, 352/352 sur 7 suites voisines, tsc vert. RED prouvé par `git stash` du seul source.

**Trouvaille annexe (env)** : `bun install` déclenche un postinstall `turbo run generate --filter=@meeshy/shared`
qui est resté **bloqué >35 min** sans jamais produire le client Prisma. `prisma generate --generator client`
lancé **directement** dans `packages/shared` a réussi en **643 ms**. Le blocage venait du daemon/orchestration
turbo, pas de Prisma. **Règle** : si le `generate` via turbo/bun postinstall traîne anormalement, le tuer et
lancer `npx prisma generate` + `bun run build` directement dans `packages/shared` (les 2 prérequis de parité
CI documentés dans CLAUDE.md) — beaucoup plus rapide et observable.

## Leçon 71 — `getConversationReadStatuses` (batch) ne consultait que les curseurs, ses jumelles mono-message consultent l'UNION curseurs + reçus figés — sous-comptage après `cleanupObsoleteCursors` (2026-07-07, routine messaging)

**Contexte** : trois méthodes de `MessageReadStatusService` calculent le statut livré/lu par message
pour la même conversation. `getMessageReadStatus` et `getMessageStatusDetails` énumèrent l'UNION des
participants ayant un curseur ET de ceux ayant un `MessageStatusEntry` figé (write-once) pour CE message —
précisément pour survivre à `cleanupObsoleteCursors`, qui supprime un `ConversationReadCursor` dont le
`lastReadMessageId` pointe vers un message effacé mais **ne touche jamais** le reçu figé. La jumelle batch
`getConversationReadStatuses` (route `GET /conversations/:id/read-statuses`) ne bouclait QUE sur les curseurs
actifs → après nettoyage d'un curseur, un reçu de livraison/lecture figé toujours valide disparaissait du
comptage. Résultat client-observable : l'endpoint batch renvoyait `receivedCount`/`readCount` **strictement
inférieurs** à l'endpoint mono-message pour EXACTEMENT les mêmes données.

**Fix** : mirroring de la logique d'union. `getConversationReadStatuses` fetch désormais
`messageStatusEntry.findMany({ messageId: { in }, conversationId })`, indexe `messageId → participantId →
entry`, et boucle sur l'union `{curseurs actifs} ∪ {reçus figés de participants actifs}` (sender exclu, figé
d'un participant inactif ignoré — parité exacte avec le `if (!participant) continue` de `getMessageReadStatus`).
Par participant : `receivedAt = frozen.receivedAt ?? frozen.deliveredAt ?? cursorDelivered`,
`readAt = frozen.readAt ?? cursorRead` — copie littérale des lignes 944-955 de la jumelle mono-message.
158/158 sur la suite du service + 188/188 avec la suite de route, tsc gateway 0 erreur. RED prouvé par
`git stash` du seul source : le test "union parity" tombe à `receivedCount:1` au lieu de 2.

**Règle réutilisable** : quand une famille de méthodes calcule la MÊME grandeur (ici statut par message),
toute variante batch/agrégée doit être vérifiée contre la source de vérité mono-message — un durcissement
(ici l'union curseur+figé introduite pour `cleanupObsoleteCursors`) appliqué aux jumelles mono-message mais
oublié sur la variante batch est la signature exacte du sibling-drift que ce backlog trouve à répétition.

## Leçon 72 — un bug de type (`tsc` TS2353 sur un champ inexistant) n'implique pas automatiquement l'impact runtime dramatique qu'il semble suggérer — tracer la fenêtre temporelle avant d'écrire le scénario (2026-07-07, routine calling-feature, Vague 25)

Un agent d'audit web a rapporté `apps/web/hooks/use-adaptive-degradation.ts` : les branches catch de
`suspend()`/`resume()` écrivaient `poorStreak: 0`/`goodStreak: 0` — deux champs qui n'existent PAS sur
`DegradationState` (seuls `poorSince`/`goodSince` existent). Le rapport affirmait un scénario dramatique :
un rejet de `resume()` (ex. `getUserMedia()` refusé) laisserait `goodSince` à sa valeur périmée, provoquant
un re-déclenchement immédiat de `resume-video` au tick suivant — martèlement de `getUserMedia()` toutes les
~2s. `tsc --noEmit` confirmait bien 2 erreurs TS2353 réelles (isolées par `git stash` du seul fichier
source : présentes avant, absentes après le fix, aucune erreur nouvelle ailleurs sur le reste du projet).
Mais un test noir reproduisant exactement le scénario proposé **passait identiquement sur le code bogué et
corrigé** — aucune différence de comportement observable. Cause : chaque transition optimiste
(`suspend-video`/`resume-video`) dans `reduceDegradation` met déjà `poorSince`/`goodSince` à `null` de façon
SYNCHRONE avant même l'appel async, et le flag `state.sending` (déjà basculé à sa valeur optimiste au moment
où l'action async démarre) fait que tout tick reçu PENDANT la fenêtre d'attente retombe systématiquement
dans la branche du FSM qui NE touche PAS le champ que le catch tente de réinitialiser (sending=true pendant
l'attente de `resume()` → seule la branche qui manipule `poorSince` est atteignable, jamais celle qui
manipule `goodSince`, et inversement pour `suspend()`). Le champ mal nommé est donc, dans la structure
ACTUELLE du FSM, un no-op runtime pur — un vrai bug de type/dette de code (fragile si `reduceDegradation`
change un jour sa logique de reset optimiste) mais PAS le bug comportemental décrit.

**Règle réutilisable** : une preuve `tsc`/lecture statique ("un champ n'est jamais réinitialisé") ne suffit
pas à valider un scénario de reproduction runtime — tracer explicitement TOUTE la fenêtre temporelle entre
la transition optimiste et le moment où le catch s'exécute (quels ticks/événements peuvent survenir entre
les deux, et dans quelle branche du FSM ils tombent étant donné l'état DÉJÀ optimistement modifié) avant
d'écrire un scénario de reproduction dans un rapport d'audit. Mieux : falsifier empiriquement avec un test
qui s'exécute sur le code bogué ET corrigé (`git stash` du seul fichier source, comme pour n'importe quelle
preuve RED/GREEN) — si le test passe des deux côtés, le scénario n'est pas confirmé, même si le bug de type
sous-jacent est réel et vaut d'être corrigé. Les deux affirmations (bug de type statique / impact runtime
dynamique) sont indépendantes et doivent être vérifiées et rapportées séparément — ne jamais assumer que la
seconde découle automatiquement de la première. Le fix reste justifié (dette de type réelle, corrige un
TS2353, prépare le terrain si le FSM change), mais le rapport final doit refléter la gravité réelle, pas
la gravité initialement supposée par l'agent d'audit.

## Leçon 73 — le durcissement union curseur+reçu figé (Leçon 71) avait UNE quatrième jumelle non traitée : le calcul INLINE des compteurs dans la route liste `GET /messages` — la plus chaude de toutes (2026-07-07, routine messaging)

**Contexte** : Leçon 71 a corrigé le sous-comptage de `getConversationReadStatuses` (batch) en l'alignant
sur l'union `{curseurs actifs} ∪ {reçus figés actifs}` déjà présente dans `getMessageReadStatus` /
`getMessageStatusDetails`. Mais le calcul des `deliveredCount`/`readCount` par message existe AUSSI en
quatrième exemplaire : inliné dans le handler `GET /conversations/:id/messages`
(`routes/conversations/messages.ts:988-1022`), pas dans le service. Ce quatrième site ne bouclait QUE sur
`conversationReadCursor.findMany` — jamais `messageStatusEntry`. Après `cleanupObsoleteCursors` (supprime un
curseur dont le `lastReadMessageId` pointe vers un message effacé, sans toucher le reçu figé write-once), la
liste rendait `deliveredCount:0`/`readCount:0` (aucun tick ✓✓) alors que `GET /messages/:id/read-status` et
`GET /conversations/:id/read-statuses` renvoyaient `1` pour EXACTEMENT le même message — incohérence sur le
chemin le plus fréquenté (chaque ouverture de conversation).

**Fix** : mirroring littéral de la boucle union de `getConversationReadStatuses` dans la route — troisième
`Promise.all` fetch `messageStatusEntry.findMany({ conversationId, messageId: { in: messageIds } })`, index
`messageId → participantId → entry`, union `evaluatedParticipantIds` (sender exclu, figé d'un participant
inactif ignoré), puis `deliveredAt = frozen?.receivedAt ?? frozen?.deliveredAt ?? cursorDelivered`,
`readAt = frozen?.readAt ?? cursorRead`. 172/172 route + 210/210 suites read-status siblings. RED prouvé par
`git stash` du seul source : le test "union parity" tombe à `deliveredCount:0` au lieu de 1.

**Règle réutilisable** : quand une leçon corrige une « jumelle oubliée » d'une famille de méthodes, GREPPER
tous les sites qui recalculent la même grandeur — pas seulement les méthodes du service. Un calcul INLINE
dans une route (ici un handler de 30 lignes qui n'appelle même pas le service partagé) est un site jumeau
invisible pour une recherche par nom de méthode ; ici la même grandeur (statut livré/lu par message) était
implémentée QUATRE fois — trois dans `MessageReadStatusService`, une inlinée dans la route. Le durcissement
appliqué aux trois du service mais oublié sur l'inline-route est la signature exacte du sibling-drift, et le
site inline est souvent le PLUS chaud (rendu direct de la liste). Idéalement : déléguer la route au service
plutôt que dupliquer la logique — mais à défaut, tout durcissement d'une grandeur doit balayer les copies
inline autant que les méthodes nommées.
## Leçon 73 — deux garde-fous « corrects isolément » sur le même champ partagé peuvent s'annuler mutuellement : `endCurrentAndAnswerPending()` ne répondait JAMAIS à l'appel en attente (2026-07-07, routine calling-feature, Vague 26)

`CallManager.endCurrentAndAnswerPending()` (iOS, "End & Answer" sur la bannière de mise en attente) appelle
`endCall()` puis, après 0.5s, revalide `pendingIncomingCall?.callId == pending.callId` avant de router vers
`handleIncomingCallNotification`. Ce garde a été ajouté (audit 2026-07-02, "bug 3 follow-up") spécifiquement
pour éviter de répondre à un appel déjà raccroché/répondu ailleurs pendant le sleep — correct en isolation,
et testé par une assertion string-search qui vérifie juste la PRÉSENCE de la condition dans le corps de la
fonction. Mais `endCall()` (appelé 3 lignes plus haut, dans la MÊME fonction) déclenche synchronement
`endCallInternal()`, qui neutralise inconditionnellement `pendingIncomingCall = nil` — pour une raison sans
rapport (audit P2-iOS-1 : effacer une bannière "busy" pointant vers une room fantôme quand l'appel ACTIF se
termine pour SES propres raisons). Résultat : le garde de revalidation comparait toujours `nil ==
pending.callId`, donc toujours faux — "End & Answer" ne répondait JAMAIS à l'appelant en attente, à chaque
invocation, silencieusement (pas de crash, pas de log d'erreur, l'appelant en attente restait à sonner
jusqu'au timeout gateway ~60s). Aucun test ne l'a détecté car toute la suite `CallManagerTests.swift` est
faite d'assertions par recherche de sous-chaîne dans le source (le manager est un singleton trop lourd à
instancier avec de vraies dépendances) — chaque garde individuel testait sa PROPRE présence, jamais
l'interaction entre `endCall()` et le guard qui s'exécute après. Fix : un token dédié
(`answeringPendingCallId`), armé AVANT `endCall()`, qui survit à son effet de bord et sert seul de source de
vérité pour la revalidation — `pendingIncomingCall` reste réservé à son rôle originel (état de la bannière).

**Règle réutilisable** : quand deux correctifs distincts (souvent d'audits différents, à des dates
différentes) touchent le MÊME champ mutable partagé pour des raisons différentes dans le même fichier —
l'un l'annule pour raison A, l'autre le relit pour raison B quelques lignes plus loin — leur composition
n'est PAS garantie même si chacun est correct isolément et même si chacun a son propre test. Tracer l'ordre
d'exécution RÉEL (pas juste la présence syntaxique) de toute fonction qui (a) appelle une autre fonction
connue pour muter un champ partagé, PUIS (b) relit ce même champ quelques lignes/un `Task.sleep` plus tard
pour une décision différente. Quand une suite de tests ne peut instancier le système réel (singleton lourd,
dépendances réseau) et se rabat sur des assertions string-search par fonction, chaque garde testé
individuellement donne un FAUX sentiment de couverture — la seule protection réelle contre ce genre de
collision inter-correctifs est un champ de revalidation DÉDIÉ (jamais réutiliser un champ que d'autres
chemins de code ont le droit de muter pour leur propre compte) plutôt qu'un test qui vérifierait
l'interaction (impossible à écrire dans ce style de test sans instancier le vrai objet).

## Leçon 74 — le chemin `add` d'une paire add/remove n'exposait pas le no-op que `remove` signale déjà : `reaction:add` re-broadcastait + re-notifiait sur une ré-réaction identique (2026-07-08, routine messaging, iter 134)

`ReactionService.removeReaction()` retourne un `boolean` (`false` = rien supprimé) et TOUS ses consommateurs
(handler socket, route REST, DELETE conversation) respectent ce faux pour court-circuiter avant le broadcast
`REACTION_REMOVED` — garde idempotente explicite, testée. Mais `addReaction()` retournait
`{ reaction, replacedEmojis }` où le no-op (le participant a DÉJÀ exactement cet emoji, ligne 102) renvoyait
`replacedEmojis: []` — **strictement indiscernable** d'une première réaction authentique (elle aussi
`replacedEmojis: []`). Les 4 consommateurs (`ReactionHandler.handleReactionAdd`, `handleAgentReaction` dans
`MeeshySocketIOManager`, `routes/reactions.ts`, `routes/conversations/messages-advanced.ts`) broadcastaient
donc `REACTION_ADDED` à toute la room ET (3 d'entre eux) firaient `notifyReactionAdded` à chaque ré-envoi
d'un emoji déjà posé — un cas de routine (double-fire optimiste, retry socket après ACK perdu, second device
qui écho le même tap). Effet net : fan-out redondant à tous les participants + (une fois la fenêtre anti-spam
écoulée) seconde notif « X a réagi 👍 » pour une seule réaction logique qui n'a jamais changé d'état.

**Fix** : rendre le service seule source de vérité du « rien n'a changé » — ajouter `unchanged: boolean` à
`AddReactionResult` (`true` sur le retour no-op, `false` sur l'upsert réel), et une garde dans les 4
consommateurs qui répond succès mais saute broadcast + notif quand `unchanged` (miroir exact de la garde
`removed === false`). REST : 200 (pas 201, rien n'a été créé) sur le no-op.

**Règle réutilisable** : quand une opération et son inverse (add/remove, subscribe/unsubscribe,
acquire/release) forment une paire et que l'un des deux expose déjà un signal « no-op / rien fait » respecté
par ses appelants, VÉRIFIER que l'autre l'expose aussi — l'asymétrie (un côté durci contre l'idempotence,
l'autre non) est une signature de sibling-drift (cf. Leçon 72). Le piège spécifique ici : le no-op renvoyait
la MÊME forme de données qu'un succès réel (`replacedEmojis: []` des deux côtés), donc aucun appelant ne
POUVAIT distinguer les deux même en le voulant — un no-op silencieux doit toujours être rendu observable par
le type de retour, jamais laissé se confondre avec le cas nominal. Corollaire test : une garde d'idempotence
n'est prouvée que par un test qui compte les effets de bord (broadcast/notif appelés exactement 0 fois sur le
no-op) — vérifié RED ici en retirant la garde (io.to appelé 1× au lieu de 0×).

## Leçon 75 — `drain()` concaténait la queue mémoire AVANT Redis : un `edited` retombé en mémoire rejouait avant son `new` resté dans Redis (2026-07-08, routine messaging, iter 136)

`RedisDeliveryQueue.drain()` retournait `[...memoryEntries, ...redisEntries]` en s'appuyant sur un commentaire
affirmant que les entrées mémoire « prédatent toujours » ce que Redis contient (elles n'y arrivent que par
fallback pendant une panne Redis). Vrai UNIQUEMENT si Redis était down dès le départ. Faux sur un blip Redis
EN MILIEU de séquence : (1) Redis sain → `enqueue('new', M)` va dans Redis ; (2) blip transitoire →
`enqueue('edited', M)` throw dans `redis.eval`, catché, retombe en MÉMOIRE ; (3) Redis récupère → `drain()`
renvoie `[edited (mémoire), new (redis)]`. `_drainPendingMessages` (MeeshySocketIOManager) rejoue les events
au client dans CET ordre → le client reçoit `MESSAGE_EDITED` AVANT `MESSAGE_NEW` → l'edit cible un message
qu'il n'a pas encore → edit perdu, contenu pré-edit figé. Violation directe de l'invariant FIFO documenté sur
`ENQUEUE_DEDUP_LUA` (« edit/delete après un `new` offline ne doivent pas être perdus, rejeu FIFO »).

**Fix** : chaque entrée porte déjà un `enqueuedAt` monotone (ISO, stampé à l'enqueue par les 3 appelants). Trier
la fusion par `enqueuedAt` croissant au lieu de concaténer mémoire-d'abord. `Array.prototype.sort` étant stable,
les égalités de timestamp gardent l'ordre mémoire-avant-Redis — le test de réconciliation panne-totale (mémoire
enqueuée plus tôt en wall-clock) reste vert, et l'ordre up→down→up est corrigé. Bonus : `_emitDeliveryForDrainedMessages`
qui dérive le « dernier message » de l'ordre d'itération devient correct lui aussi.

**Règle réutilisable** : un commentaire qui justifie un ordre par « X précède toujours Y » cache souvent une
hypothèse temporelle non testée (« la panne a commencé au début »). Dès qu'un buffer de repli (mémoire, retry,
dead-letter) peut recevoir des entrées PENDANT une séquence déjà partiellement écrite dans le canal principal,
son contenu peut être plus RÉCENT que le canal — ne jamais présumer l'ordre par la source, toujours trier par la
clé temporelle monotone que les entrées portent déjà. Test : reproduire le blip milieu-de-séquence (channel sain
→ channel qui throw → channel récupéré) avec des `enqueuedAt` explicitement ordonnés, et asserter l'ordre de rejeu
(RED = ['edited','new'], GREEN = ['new','edited']).

## Leçon 76 — détection UA par `includes` : un token spécifique avalé par un token générique testé plus tôt (2026-07-08, routine messaging, iter 142)

`detectOS` / `detectBrowser` / `detectDevice` (`services/gateway/src/routes/tracking-links/types.ts`) classent le
User-Agent persisté sur CHAQUE clic de lien de tracking (chemin redirect `GET /l/:token` + chemin manuel
`POST .../click`), puis agrégé en `clicksByOS` / `clicksByBrowser` / `clicksByDevice` dans
`TrackingLinkService.getTrackingLinkStats`. Les trois helpers testaient des sous-chaînes `includes()` dans un ordre
naïf « du plus courant au plus rare » — mais les UA réels sont **imbriqués** : un token spécifique est presque
toujours un sur-ensemble d'un token générique testé plus tôt, donc la branche spécifique n'était JAMAIS atteinte.

- `detectOS` : tout UA Android contient `Linux` (`Linux; Android 13; …`) et tout UA iPhone/iPad contient `Mac OS X`
  (`like Mac OS X`). `Linux` étant testé avant `Android` et `Mac OS` avant `iOS`, **tout le trafic Android était
  compté comme Linux-desktop et tout l'iPhone/iPad comme macOS** — les deux OS mobiles dominants faux dans chaque
  rapport.
- `detectBrowser` : Opera moderne est Chromium (`… Chrome/104 … OPR/90`), sans `Edg`. La branche Chrome
  (`Chrome && !Edg`) l'attrapait avant la branche Opera → Opera compté comme Chrome.
- `detectDevice` : Safari iPad porte le token `Mobile` (`Mobile/15E148`). La branche `Mobile` renvoyait `mobile`
  avant que la branche `iPad` soit évaluée → tout iPad compté comme mobile ; le bucket `tablet` était de fait
  inatteignable.

**Fix** : ordonner chaque chaîne du **plus spécifique au plus générique** — mobile avant desktop dans `detectOS`
(Windows → Android → iOS → macOS → Linux), Opera/Edge avant Chrome dans `detectBrowser`, tablette avant mobile dans
`detectDevice` (+ heuristique Android-sans-`Mobile` = tablette). Aucun test préexistant ne couvrait ces helpers
(RED = 6 assertions fausses avant fix, GREEN après). 12 suites tracking (243 tests) restent vertes, `tsc --noEmit` OK.

**Règle réutilisable** : une cascade de `str.includes(token)` avec `return` au premier match n'est correcte QUE si
les tokens sont mutuellement exclusifs. Dès que le domaine réel est imbriqué (UA, MIME, chemins, langues avec
sous-tags), un token « fin » (Android, iPhone, iPad, OPR, Edg) est presque toujours contenu dans une chaîne qui
porte aussi un token « large » (Linux, Mac OS, Chrome, Mobile) — le spécifique DOIT être testé avant le générique,
sinon il est mort. Signature du bug : la branche générique n'a pas de garde d'exclusion (`&& !contientLeSpécifique`)
alors qu'une branche plus bas teste précisément ce spécifique. Balayer chaque fonction de classification par
sous-chaîne et se demander pour chaque paire (générique, spécifique) : « un input du type spécifique contient-il
aussi le token générique ? » Si oui et que le générique est testé d'abord → le spécifique est inatteignable.

## Leçon 77 — présence : le court-circuit modérateur batch bypassait la désactivation, divergeant du chemin single-target (2026-07-08, routine messaging, iter 144)

`PresenceVisibilityService` a DEUX chemins qui doivent rendre le même verdict (SSOT = helper pur
`resolvePresenceVisibility`, `packages/shared/utils/presence-visibility.ts`) : `resolveForTarget` (profil unique)
et `resolveForTargets` (batch, consommé par `/users/presence` + recherche). Le helper pur place
`targetIsDeactivated || isBlockedEitherWay → HIDDEN` **avant** le check de privilège `isSelf || isGlobalModerator`
(invariant design §8 : « Compte désactivé → présence masquée **en amont** »).

`resolveForTarget` respecte l'invariant : `if (target.deactivatedAt) return HIDDEN;` est la TOUTE PREMIÈRE ligne,
donc un modérateur regardant un compte désactivé voit HIDDEN. Mais `resolveForTargets` court-circuitait les
modérateurs AVANT même de charger `deactivatedAt` :
```ts
if (viewer && isGlobalModerator(viewer.role)) {
  for (const id of uniqueIds) result.set(id, FULL);   // désactivés → FULL, fuite
  return result;
}
const targetRows = await prisma.user.findMany({ ... select: { deactivatedAt: true } }); // trop tard
```
**Scénario de fuite** : un modérateur parcourant une LISTE de présence voyait `showOnline/showLastSeen = true`
pour un compte désactivé, alors que la vue PROFIL unique du même compte masquait correctement (last-seen d'un
compte désactivé exposé). Divergence directe entre les deux chemins d'un même SSOT.

**Fix** : remonter le fetch `deactivatedAt` (un seul `findMany` batché, pas une requête par-id) AVANT le
court-circuit modérateur, et y masquer les cibles désactivées : `result.set(id, deactivated.has(id) ? HIDDEN : FULL)`.
Aligne le batch sur `resolveForTarget` et sur le helper pur. Le check block-pour-modérateur reste inchangé
(les deux chemins concordent déjà — `resolveForTarget` retourne FULL avant le check block pour un modérateur ;
§4.2 « pas de requête » l'assume ; pas de divergence interne, donc hors scope de ce correctif conservateur).
Test RED ajouté : `resolveForTargets(moderator, [désactivé]) → HIDDEN` (échouait FULL avant, vert après ;
16/16 suite service + 49/49 sur 6 suites présence + 22/22 communities members).

**Règle réutilisable** : quand deux méthodes d'un même service (unique vs batch) doivent partager un SSOT, un
court-circuit « fast-path » (privilège, cache, rôle) placé AVANT de charger un flag de garde (désactivation,
blocage, suppression) va bypasser ce flag sur ce seul chemin. Signature du bug : la méthode single-target teste
le flag en PREMIER, mais la méthode batch teste le privilège en premier et ne charge le flag qu'ensuite. Vérifier
que TOUT fast-path d'un chemin batch charge et honore les mêmes gardes « en amont » que son jumeau single-target —
sinon la liste fuite ce que le détail masque.

## Leçon 78 — enqueue offline du delete : on excluait l'AUTEUR au lieu du SUPPRESSEUR (2026-07-08, routine messaging, iter 144)

`MessageHandler.handleMessageDelete` rejoue les suppressions aux destinataires hors-ligne via
`_enqueueOfflineEventForParticipants(conversationId, senderParticipantId, 'deleted', …)`, dont la boucle saute
`p.id === senderParticipantId` (l'ACTEUR de l'action) — plus les participants en ligne. L'appel delete passait
`message.senderId`, c.-à-d. l'**id participant de l'AUTEUR** du message. C'est correct sur `message:send`/`message:edit`
(seul l'auteur édite → auteur == acteur), mais `handleMessageDelete` autorise aussi admins/modérateurs (de conversation
OU globaux) à supprimer le message d'AUTRUI. Sur ce chemin auteur ≠ suppresseur.

**Scénario de perte** : auteur A (hors-ligne), modérateur B (en ligne) supprime le message de A. L'emit live
`message:deleted` part vers la room conversation → A hors-ligne le rate. La boucle d'enqueue atteint A mais
`p.id === message.senderId` (id participant de A) → `continue` → **A n'est jamais mis en file**. À la reconnexion
(`_drainPendingMessages`) A ne reçoit pas la suppression et continue d'afficher un message retiré par un modérateur,
jusqu'à un refetch complet sans rapport. Le `senderParticipantId` était de toute façon **redondant** pour sa raison
d'être (l'acteur vient d'agir via sa socket → il est en ligne → déjà exclu par `connectedUsers.has`), et donc
uniquement NUISIBLE quand auteur ≠ acteur.

**Fix** : passer l'id participant du **suppresseur**, pas de l'auteur. Sa ligne participant conversation-scoped est
déjà chargée (`message.conversation.participants` filtré par `where: { userId, isActive }` = l'utilisateur courant) ;
ajouter `id` à ce `select` et passer `message.conversation.participants[0]?.id`. Fallback = `undefined` (PAS
`message.senderId`) : quand le suppresseur est un admin GLOBAL non-participant, `participants` est vide → skip personne
(l'admin global n'est pas dans la boucle des participants de la conv, et s'il l'était il serait en ligne donc exclu).
Piège écarté : la proposition initiale `?? message.senderId` réintroduisait le bug pour les deletes d'admin global.
Test RED : admin supprime le message d'un auteur hors-ligne → 0 enqueue avant, 1 enqueue (auteur) après. 430 tests
MessageHandler verts, tsc OK.

**Règle réutilisable** : un paramètre « exclure l'acteur » n'est juste que si la variable passée EST l'acteur sur
TOUS les chemins. Dès qu'une action a plusieurs auteurs possibles (l'auteur du contenu vs. un modérateur agissant
dessus), ne pas dériver l'« acteur à exclure » d'un champ du CONTENU (`senderId`, `ownerId`, `createdBy`) — le dériver
de l'IDENTITÉ de l'appelant (participant/utilisateur authentifié courant). Signature du bug : `skip = entity.authorId`
alors que l'action est autorisée à un tiers. Et si l'exclusion est de toute façon redondante avec une autre garde
(ici « en ligne »), la retirer ou la fonder sur l'identité de l'appelant — jamais sur le contenu.

---

## iter 155 — `mention:created` jamais émis : `validatedMentions` lu comme objets alors que c'est `String[]`

`MeeshySocketIOManager._broadcastNewMessage` (chemin broadcast REST de `broadcastMessage`) castait
`message.validatedMentions` en `Array<{ userId?, participantId?, username? }>` puis lisait `mention.userId`.
Or `validatedMentions` est persisté en **`String[]` de usernames** (`schema.prisma:619` ; producteur
`MessageProcessor` l.926-940 écrit `finalValidatedUsernames: string[]`). Lire `("bob").userId` → `undefined`,
le garde `if (targetUserId && …)` est toujours faux → **`MENTION_CREATED` n'était jamais émis** pour aucun
message réel. Les tests existants masquaient le bug en injectant une forme `{ userId }` fabriquée qui
n'existe jamais en prod.

**Second bug latent (id-space)** sur la même ligne : l'auto-exclusion comparait `targetUserId` (un `User.id`)
à `message.senderId` (un `Participant.id`) — jamais égaux, donc une vraie auto-mention n'aurait pas été exclue.
Même famille que le bug delete de l'iter précédente (Participant.id vs User.id).

**Fix** : résoudre les usernames en `User.id` via `resolveUsernamesToIds(this.prisma, usernames)` (déjà utilisé
ailleurs dans le fichier + par `MessageHandler._resolveMentionUserIds` sur le chemin socket), exclure via
`resolvedSenderId` (le `User.id` de l'expéditeur, déjà calculé l.1815 et utilisé pour le payload `MESSAGE_NEW`),
et wrapper en try/catch pour qu'un échec de lookup ne bloque jamais le broadcast du message. Le champ
`mentionedParticipantId` (optionnel dans `MentionCreatedEventData`) est retiré du payload : on n'a plus que des
usernames, et le socket path ne le posait pas non plus. Bonus : `senderId` passe de Participant.id à User.id,
alignant `MENTION_CREATED` sur `MESSAGE_NEW` (les clients comparent senderId à leur userId).

**Règle réutilisable** : ne jamais caster un champ Prisma vers une forme d'objet sans vérifier son type réel
dans `schema.prisma` — un `String[]` (`@default([])`) n'est PAS un tableau d'objets. Signature du bug : un cast
`as unknown as Array<{…}>` sur un champ scalaire, suivi d'un accès `.prop` qui est toujours `undefined` et d'un
garde qui du coup ne s'ouvre jamais (branche morte que les tests couvrent avec une forme fabriquée). Tester avec
la forme RÉELLE persistée, pas la forme pratique pour le test.

---

## Leçon 79 — un sibling-drift peut se cacher dans une classe entièrement différente de celle qu'on vient de corriger (routine calling-feature, Vague 31, 2026-07-09)

Les Vagues 25/27/30 ont corrigé 3 fois le même bug — `duration` persisté comme `now - startedAt`
(temps de sonnerie + conversation) au lieu de `answeredAt ? now - answeredAt : 0` (temps de conversation
réel) — à chaque fois en supposant avoir traité le dernier writer terminal restant, et à chaque fois en
cherchant les siblings **dans le même fichier/classe** (`CallCleanupService.ts`, ses 4 tiers de GC).
La Vague 31 en a trouvé 2 de plus, mais dans `CallService.ts` — une classe différente, avec une
responsabilité de terminaison d'appel qui LUI APPARTIENT AUSSI (le phantom-cleanup et le zombie-cleanup
que `initiateCall()` exécute lui-même avant de créer un nouvel appel). Rien ne les reliait
syntaxiquement aux writers déjà corrigés — même `grep -n "duration" CallCleanupService.ts` ne les
aurait jamais fait apparaître.

**Règle réutilisable** : quand un bug de type « writer terminal incohérent » (anchor de date, garde de
version, fanout de room, etc.) est trouvé et corrigé dans une classe, chercher les siblings par
**responsabilité** (grep du champ concerné — ici `duration`/`answeredAt`/`startedAt` — sur TOUT le
répertoire `services/`, pas seulement le fichier corrigé), pas par proximité de fichier. Une
responsabilité de terminaison de session peut légitimement être dupliquée entre le service métier
principal (`CallService`) et un service de nettoyage dédié (`CallCleanupService`) sans que ce soit un
défaut d'architecture en soi — mais ça veut dire qu'un correctif doit être recherché aux DEUX endroits,
systématiquement, avant de déclarer un bug family clos.

---

## Leçon 80 — un objet partagé par référence entre N instances d'un service "par pair" transforme un cleanup local en effet de bord global (routine calling-feature, Vague 32, 2026-07-09)

`use-webrtc-p2p.ts` (web) garde une instance `WebRTCService` **par participant distant** dans un appel de
groupe (`webrtcServicesRef`, une `Map`) — l'intention claire du design est que chaque instance possède SON
PROPRE état de connexion, isolé des autres. Mais `addLocalMedia(stream, …)` leur passe à toutes la MÊME
référence `MediaStream` (celle du store `useCallStore.localStream`, jamais clonée), et
`WebRTCService.close()` faisait `this.localStream.getTracks().forEach(track => track.stop())`
inconditionnellement. `close()` sur UNE instance (`removeParticipant()`, appelé par un vrai
`participant-left` en cours d'appel de groupe, ou par le cleanup d'un échec de négociation limité à UN
pair) stoppait donc les tracks matérielles **utilisées par toutes les autres instances encore actives** —
un participant qui raccroche coupait le micro/caméra de tout le monde, alors que leurs connexions
respectives restaient `connected`. Le vrai propriétaire du cycle de vie du stream partagé existait déjà
ailleurs dans le code (`call-store.ts`'s `reset()`, qui stoppe les tracks UNE SEULE FOIS au vrai teardown
de fin d'appel) — le `close()` par-instance était un second stoppeur, redondant sur le chemin correct
(fin d'appel réelle) et actif-destructeur sur le chemin incorrect (un seul pair qui part).

**Règle réutilisable** : quand une collection tient N instances d'une classe "par pair/par ressource"
(`Map<participantId, Service>`), vérifier si un champ qu'elles reçoivent en construction/attachement est
un objet passé **par référence partagée** (pas cloné, pas recréé par instance) plutôt qu'une ressource
réellement possédée par l'instance. Si oui, toute méthode de cleanup de CETTE instance qui mute cet objet
partagé (`.stop()`, `.close()`, `.clear()`, toute API qui altère l'état plutôt que de simplement cesser de
le référencer) doit soit (a) ne jamais le faire depuis un cleanup "à la portée d'une seule instance", soit
(b) recevoir un paramètre explicite (`{ stopLocalTracks: boolean }`) distinguant "je me détache de la
ressource" de "je termine la ressource pour de bon", avec le vrai teardown final réservé au seul
propriétaire légitime (ici, le store qui a créé le stream). Signature du bug : `close()`/`dispose()`/
`teardown()` sans paramètre, appelé à la fois sur un seul élément d'une collection ET sur la collection
entière, mutant un champ qui s'avère être le MÊME objet dans tous les éléments — un test qui ne construit
qu'UNE instance à la fois ne peut jamais détecter ce genre de fuite inter-instance (c'est exactement
pourquoi aucun des tests `close()` existants ne l'avait attrapé : chacun testait une seule instance avec
son propre stream mocké, jamais deux instances partageant la même référence).

---

## Leçon 80 — le MÊME event socket peut être émis en deux id-spaces selon le transport ; vérifier que tous les writers d'un champ comparé côté client résolvent pareil (routine messaging, iter 157, 2026-07-09)

`message:new.senderId` était résolu vers le `User.id` par le writer REST/ZMQ
(`MeeshySocketIOManager.broadcastMessage`, avec un commentaire explicite « les clients comparent
senderId avec leur userId ») mais émis en `Participant.id` **brut** par le writer du chemin WS
`message:send` (`MessageHandler._buildMessagePayload`). `Message.senderId` est un `Participant.id`
(relation Prisma `MessageSender` → `Participant`), donc les deux writers d'un même wire event
mettaient des id-spaces différents. Côté client web, `use-socket-cache-sync.ts` compare
`message.senderId === currentUser.id` (un `User.id`) pour détecter ses propres messages et promouvoir
l'optimistic bubble multi-device — sur le chemin WS le test échouait toujours (Participant.id ≠
User.id), donc l'auteur voyait son propre message en double / rendu comme entrant. Le bug était
**invisible sur le chemin REST** (qui résolvait correctement) : seul le transport WS était atteint.

**Signature du bug** : un champ de payload socket comparé côté client à un id utilisateur, construit
par ≥2 writers (un par transport : WS vs REST vs ZMQ), dont un seul applique la résolution
`participant.userId ?? participant.user?.id ?? message.senderId`. Le writer « correct » porte souvent
un commentaire justifiant la résolution — mais ce commentaire ne protège PAS les writers siblings qui
n'ont jamais reçu le même traitement.

**Règle réutilisable** : quand un writer d'un event socket résout un id (Participant→User) avec une
justification « les clients comparent à leur userId », grep IMMÉDIATEMENT le nom de l'event
(`MESSAGE_NEW`/`message:new`) ET le champ (`senderId: message.senderId`) sur TOUT le service pour
trouver les autres writers du même event qui n'ont pas la résolution — un par transport. Ne jamais
supposer qu'un seul chemin construit un event : le send a au moins WS + REST, souvent + un
re-broadcast ZMQ (traduction). Le champ `sender.id` (Participant.id) reste disponible séparément pour
les rares consommateurs qui en ont besoin ; ne PAS toucher les events où les deux writers sont
cohérents entre eux (`CONVERSATION_UPDATED` garde le Participant.id brut des deux côtés — consommateur
distinct, pas de divergence).

---

## Leçon 81 — un fanout « écran liste » ajouté sur le chemin d'envoi doit l'être AUSSI sur edit/delete/recall — chercher les mutations siblings du même agrégat de liste (routine messaging, iter 158, 2026-07-09)

Le chemin d'envoi (`broadcastNewMessage`) fanne `CONVERSATION_UPDATED` (aperçu `lastMessageId`/
`lastMessagePreview`) vers **chaque salle `user:<id>`** des participants, avec un commentaire explicite :
sinon un membre posé sur la **liste de conversations** (qui a quitté `conversation:<id>` mais reste dans
`user:<id>`) ne reçoit jamais le signal et sa ligne reste figée. Mais **édition et suppression** — qui
changent aussi l'aperçu de la liste quand elles touchent le dernier message — n'émettaient que
`MESSAGE_EDITED`/`MESSAGE_DELETED` vers `conversation:<id>`, jamais `CONVERSATION_UPDATED` vers les salles
user. Le handler delete recalculait pourtant déjà `lastMessageAt` : le serveur *savait* que l'aperçu avait
changé, mais ne le disait qu'aux sockets dans la salle conversation. Faille auto-réparée par SWR à la
réouverture → fenêtre invisible = « rester sur la liste sans rouvrir la conversation », donc facile à rater
en test manuel.

**Signature du bug** : un agrégat affiché sur un écran de LISTE (aperçu de dernier message, compteur non-lus,
badge, ordre de tri) est rafraîchi en temps réel par UN chemin de mutation (create) via un fanout vers les
salles `user:` — mais les AUTRES mutations du même agrégat (edit, delete, recall, réaction qui change le
preview, pin/unpin) n'émettent que vers la salle `conversation:`, que l'observateur liste-seule ne rejoint
pas.

**Règle réutilisable** : quand un fanout vers les salles `user:` est ajouté sur une mutation « parce que
l'écran liste doit se rafraîchir même sans la conversation ouverte », énumérer IMMÉDIATEMENT **toutes** les
mutations qui touchent le même agrégat de liste et vérifier qu'elles fannent pareil. Extraire un **helper
partagé** (ici `emitConversationPreviewUpdate`) plutôt que dupliquer l'emit inline sur N sites (ici 7 : WS +
2 routes REST) — la duplication inline est exactement ce qui laisse un transport dériver (cf. Leçon 80). Le
helper recalcule l'agrégat depuis la source de vérité (dernier message non supprimé) pour rester
auto-cohérent : appliqué à une mutation d'un élément **non-dernier**, il ré-émet l'aperçu inchangé (no-op
idempotent client) plutôt que d'exiger une détection « est-ce le dernier ? » fragile. Best-effort strict :
un fanout side-channel ne doit JAMAIS faire échouer la mutation primaire déjà réussie (try/catch interne,
`onError` optionnel pour la traçabilité).

---

## Leçon 82 — un garde de sécurité/annulation placé AVANT une opération qui peut encore throw protège moins que prévu ; le placer une fois le succès confirmé (routine calling-feature, Vague 33, 2026-07-09)

`CallEventsHandler.ts`'s `call:join` handler appelait `cancelDisconnectGrace(callId, userId)` juste après
la validation Zod du payload, mais AVANT `resolveParticipantIdFromCall` et `callService.joinCall(...)` —
deux opérations qui peuvent encore throw (DB transitoire, race). Le commentaire au-dessus de l'appel
("a (re)join cancels any pending disconnect grace timer... the participant's signaling socket is back")
décrivait l'intention correcte, mais le PLACEMENT trahissait cette intention : le code annulait la grâce
sur la base de "une tentative de join a été REÇUE", pas "le join a RÉUSSI". Si le join échouait ensuite
pour une raison sans rapport avec l'état réel de l'appel, le participant perdait à la fois son socket actif
(le join a échoué) ET son timer de grâce (déjà annulé) — exactement le double filet que ce mécanisme
existe pour fournir. Le `catch` du handler n'avait aucune ré-armement compensatoire.

**Règle réutilisable** : quand un commentaire dit "X annule/confirme Y parce que l'opération a réussi",
vérifier que l'annulation/confirmation est physiquement placée APRÈS le `await` qui peut encore échouer,
pas avant par convenance de lisibilité (ex. grouper toute la logique "post-validation" en haut du handler).
Un signal d'alarme : l'annulation est suivie d'AUTRES opérations asynchrones qui peuvent throw avant la
fin du handler — si l'une d'elles échoue, l'annulation a déjà eu lieu sans jamais être compensée dans le
`catch`. Le fix est presque toujours un simple déplacement de ligne (pas une réécriture), mais il faut
ensuite auditer les tests existants qui pourraient avoir été écrits pour caractériser l'ANCIEN comportement
plutôt que l'intention réelle — ici, un test nommé "re-join... cancels the pending end" mockait en réalité
un join qui échoue TOUJOURS (config par défaut du test harness), avec un commentaire inline documentant
explicitement "bails after cancel, but the cancel already ran" comme si c'était le comportement voulu. Le
titre du test décrivait l'intention (rejoin réussi → annulation) mais le corps testait l'accident (rejoin
échoué → annulation quand même) — un signe qu'un test a dérivé pour suivre l'implémentation plutôt que la
spec. Toujours relire le TITRE du test contre son CORPS quand on modifie le comportement qu'il pin.

---

## Leçon 83 — un fast-path "perf" qui diffuse un effet observable AVANT le contrôle d'autorisation reste risqué même quand le contrôle d'autorisation lui-même est correct (routine calling-feature, Vague 35, 2026-07-10)

`CallEventsHandler.ts`'s `call:end` handler avait un fast-path de perf (2026-07-04) qui diffusait
`call:ended` à la room dès que `socket.rooms.has(ROOMS.call(callId))` était vrai, avec le commentaire
« l'appartenance à la room EST l'autorisation — rejoindre a exigé un `call:join` vérifié en DB ». Cette
affirmation était vraie AU MOMENT du join, pas un invariant permanent : rien n'évince un socket de la call
room si l'autorisation sous-jacente est révoquée plus tard (retrait de la conversation en cours d'appel).
Un fix sécurité du même jour (2026-07-10) avait déjà corrigé le SYMPTÔME visible côté écriture DB
(`resolveParticipantIdFromCall` échouant refuse maintenant de force-end la session) — mais le broadcast
fast-path, place AVANT ce contrôle dans le code, avait déjà notifié la room par le temps que le rejet
s'exécute. Le contrôle d'autorisation lui-même était correct ; seul son PLACEMENT après un effet de bord
déjà émis le rendait inefficace pour ce cas précis.

**Signature du bug** : un commentaire justifie un fast-path/raccourci par "X a déjà été vérifié à l'étape Y
(join/login/attribution initiale)", mais le fast-path s'exécute à une étape Z ultérieure sans revalider —
et rien dans le système ne garantit que la condition vraie en Y reste vraie en Z (pas d'éviction de room,
pas de TTL, pas de re-check périodique). Un fix de sécurité qui corrige le contrôle d'autorisation
LUI-MÊME sans auditer TOUT ce qui s'exécute avant lui dans le même handler laisse le trou ouvert pour
n'importe quel effet de bord placé plus tôt (broadcast, écriture cache, notification push, etc.) — cf.
Leçon 82 (garde placé avant un `await` qui peut throw) pour le même symptôme côté écriture, mais ici
côté diffusion réseau observable par un tiers, pas côté état interne.

**Règle réutilisable** : quand un fix corrige un contrôle d'autorisation dans un handler, lire le handler
ENTIER de haut en bas et lister chaque effet de bord observable par un tiers (broadcast socket, écriture
DB, notification push, log visible côté client) qui s'exécute AVANT ce contrôle — pas seulement APRÈS,
là où le contrôle corrigé s'applique déjà. Un fast-path "perf" ajouté pour la latence perçue est le
site le plus probable d'un tel effet de bord prématuré, précisément parce qu'il existe pour COURT-CIRCUITER
le chemin qui contient le contrôle d'autorisation complet.

---

## Leçon 84 — une émission qui ÉNUMÈRE `adapter.rooms` (ou lit `connectedUsers`/`socketToUser`) ne voit QUE le nœud local ; sur un déploiement multi-nœud (Redis adapter) elle perd silencieusement tous les destinataires connectés à un autre nœud (routine messaging, Vague 36, 2026-07-10)

`_emitMessageNewByLanguage` (présent en DEUX exemplaires : `MessageHandler.ts` chemin WS `message:send`,
et `MeeshySocketIOManager.ts` chemin REST/ZMQ + rediffusion des traductions) construisait le fan-out
`message:new` en énumérant `this.io.sockets.adapter.rooms.get(room)` puis en résolvant la langue de chaque
socket via les maps mémoire `connectedUsers`/`socketToUser`, avant d'émettre `io.to(socketId)` par groupe de
langue. Les trois sources — `adapter.rooms`, `connectedUsers`, `socketToUser` — ne contiennent QUE les
sockets du nœud courant. Sur la topologie horizontale documentée (100k+ msg/s via le Socket.IO Redis
adapter), un destinataire connecté à un AUTRE nœud gateway n'apparaît dans aucune des trois → il n'était
jamais énuméré, jamais émis, et le early-return `if (!socketIds || socketIds.size === 0) return;` court-
circuitait même l'envoi lorsque le nœud émetteur (celui de l'expéditeur) n'avait aucun socket local dans la
room. Résultat : sous `SOCKET_LANG_FILTER=true` en multi-nœud, `message:new` n'atteignait plus les
destinataires distants EN TEMPS RÉEL (récupérés seulement au prochain `/sync` ou refetch). Les chemins NON
filtrés (`io.to(room).emit(...)` / `.except(ROOMS.user(sender))`) n'avaient PAS le bug car le Redis adapter
propage `io.to(room)` à tout le cluster — seul le chemin filtré, qui énumère manuellement, régressait une
diffusion cross-node-correcte en diffusion locale-seulement.

**Signature du bug** : un raccourci/optimisation remplace un `io.to(room).emit(...)` (adapter-propagé,
cluster-wide) par une énumération manuelle de `adapter.rooms` / une lecture des maps de présence en mémoire,
pour émettre socket-par-socket. Toute décision de livraison bâtie sur ces structures est intrinsèquement
locale au nœud. Le bug est INVISIBLE en test unitaire mono-process et en dev mono-nœud — il n'apparaît qu'en
production multi-réplica.

**Règle réutilisable** : `adapter.rooms.get(room)`, `connectedUsers`, `socketToUser`, `userSockets` sont
des vues LOCALES au nœud. Dès qu'une émission dépend d'elles pour décider QUI reçoit, elle doit conserver un
filet cluster-wide pour les destinataires non-locaux : diffuser le payload complet via `io.to(room)`
(adapter-propagé) en `.except([...socketsLocaux, sender])` — les sockets locaux reçoivent la version
optimisée/trimmée, les sockets distants reçoivent le payload complet, chacun exactement une fois ; sur un
seul nœud l'except couvre toute la room et la diffusion cross-node ne touche personne (comportement
inchangé). Ne JAMAIS placer un tel calcul local-seulement AVANT un early-return qui suppriment aussi la
diffusion distante. Corollaire de duplication (SSoT) : ce helper existait en deux copies divergentes (une
via le helper pur `groupSocketsByLanguage`, l'autre en grouping inline) — le même bug logique devait être
corrigé aux DEUX sites ; un audit d'un seul fichier (ici `MessageHandler.ts`) aurait laissé le chemin
REST/ZMQ (le plus emprunté : tout envoi REST + toute rediffusion post-traduction) toujours cassé.

## 2026-07-11 — « Limitation système » = diagnostic non prouvé ; toujours faire le différentiel app minimale

**Correction user** : j'ai présenté « iOS 26 n'affiche pas les icônes des menus contextuels natifs » comme
une limitation système documentée (mémoire d'une session antérieure, "confirmé app-wide"). Le user a
répondu : « faux, ceci est un échec de configuration, recherche comment bien faire ». Il avait raison.

**Vraie cause** : `MeeshyRefreshableScroll` (wrapper SDK de TOUTES les listes) posait `.tint(.clear)` sur
le ScrollView entier pour masquer le spinner natif du `.refreshable`. L'environnement tint se propage au
contenu, et sur iOS 26 les icônes des menus Liquid Glass suivent le tint → icônes transparentes partout
dans l'app (d'où le faux "app-wide = système"). Le spinner était déjà masqué par le proxy
`UIRefreshControl.appearance().tintColor = .clear` (AppDelegate).

**Méthode qui a tranché (à refaire systématiquement)** :
1. Menu contextuel SYSTÈME sur le même simulateur (home screen) → icônes présentes → pas l'OS.
2. App SwiftUI MINIMALE (même Xcode, même runtime, même deployment target, même code Label) → icônes
   présentes → c'est NOTRE app. À partir de là c'est une bissection, pas une spéculation.
3. Sondes .contextMenu déplacées dans la hiérarchie (racine → OK ; sous le wrapper → KO) → l'ancêtre
   coupable se cerne en 2 sondes.

**Règles** :
- « Confirmé app-wide » ne signifie PAS « système » : un wrapper partagé par tous les écrans produit
  exactement la même signature. Un état app-wide doit d'abord faire suspecter un ancêtre COMMUN.
- Ne jamais graver en mémoire « limitation OS » sans le différentiel app-minimale. La mémoire erronée a
  coûté un menu custom entier (ConversationContextMenuView) construit pour contourner un bug qui était
  à nous.
- `.tint(.clear)` (ou tout override d'environnement destructif) ne se pose JAMAIS sur un conteneur qui
  a du contenu — le scoper à l'élément visé ou passer par le proxy UIKit dédié.
- Corollaire crash : un `@ViewBuilder () -> MenuContent` générique stocké sur une row `.equatable()`
  ré-exécute le builder à chaque body pass (mesures LazyVStack) et copie un tuple géant en pleine
  récursion de layout → EXC_BAD_ACCESS PAC au lancement (initializeWithCopy for Button). Résoudre le
  menu UNE fois à la construction et le stocker en AnyView (précédent MeeshyAvatar « single, stable
  array » ; AnyView acceptable pour du contenu de menu — pas d'identité structurelle à préserver).

## 2026-07-11 — zsh n'expanse pas `$VAR` en plusieurs arguments : xcodebuild « TEST SUCCEEDED » avec 0 test

Un run `xcodebuild test` avec les filtres dans une variable (`TESTS='-only-testing:A -only-testing:B'`
puis `xcodebuild ... $TESTS`) a « réussi » en exécutant ZÉRO test : sous zsh, `$TESTS` non quoté reste
UN SEUL argument (pas de word-splitting par défaut, contrairement à bash) → filtre invalide → aucun
test ne matche → exit 0. Les baselines snapshot supprimées n'avaient PAS été ré-enregistrées.

**Règles** :
- Jamais de liste d'arguments dans une variable scalaire sous zsh — flags inline, tableau zsh
  (`tests=(-only-testing:A ...)` puis `"${tests[@]}"`), ou script bash explicite.
- Un résultat de tests se valide sur « Executed N tests » avec N ATTENDU, jamais sur l'exit code ni
  sur « TEST SUCCEEDED » seul (même famille que meeshy.sh exit 0 malgré FAILED, et que le script
  record-snapshot qui listait des PNG périmés).
- Après un record de baselines : compter les PNG frais (`-newermt`), pas les messages du log.

## 2026-07-11 — Mock jest PARTIEL d'un module partagé = régression silencieuse quand la prod consomme un nouvel export

La migration des literals `socket.on('presence:app-state')` vers `CLIENT_EVENTS.PRESENCE_APP_STATE`
a cassé 227 tests en CI (`a7280bcf9`) : la suite legacy `src/socketio/__tests__/CallEventsHandler.test.ts`
mockait `@meeshy/shared/types/socketio-events` en n'exportant QUE `ROOMS` → `CLIENT_EVENTS` undefined
→ `setupCallEvents` crashait au premier `socket.on`. Vérification locale faite uniquement sur
`src/__tests__/unit/socketio/` + tsc : la suite fautive vit dans `src/socketio/__tests__/` (autre dossier).

**Règles** :
- Avant de pousser un changement gateway qui touche un module PARTAGÉ (shared types/utils) : grep
  `jest.mock('@meeshy/shared/...')` sur les deux arbres de tests (`src/__tests__/` ET `src/*/__tests__/`)
  — tout mock partiel du module modifié doit exposer les nouveaux exports (ou `jest.requireActual`).
- « Suite socketio verte » ≠ « gateway vert » : les tests CallEventsHandler existent dans DEUX dossiers.
  Le gate pré-push d'un changement handler = `bun run jest Call` minimum, suite complète si le diff
  touche packages/shared.
- tsc ne voit RIEN ici : le mock est un objet runtime. Seule l'exécution des suites attrape ce trou.

## 2026-07-11 — Item d'audit partagé entre sessions : vérifier les WORKTREES avant de développer

En soldant « listeners #5 » de l'audit appels, j'ai réimplémenté (`62b111b80`) une feature déjà
développée EN MIEUX (avec `translated-segment` en plus) par une session parallèle dans
`.claude/worktrees/feat-calls-audit-5-9-remainders` (`2c3f75afa`, branche non mergée, worktree
verrouillé = session active). Mon check « existing work » s'était limité à `git status` + `git log`
sur main : les branches de worktree n'y apparaissent pas. Doublon reverté (`be30cca29`) pour que le
merge de la branche complète atterrisse sans conflit 15-fichiers entre deux implémentations.

**Règles** :
- Avant d'attaquer un item de backlog partagé (audit, tasks/*.md) : `git worktree list` +
  `git log --all --oneline --grep="<mots-clés de l'item>"` — pas seulement l'historique de main.
- Un worktree `locked` sous `.claude/worktrees/` = session active ; sa branche non mergée fait
  partie du « travail existant » au même titre que main.
- En cas de doublon découvert APRÈS push : garder l'implémentation surensemble, reverter l'autre
  immédiatement (avant que quiconque ne bâtisse dessus), et dire pourquoi dans le message du revert.

## 2026-07-12 — `gh run watch --exit-status` exit 0 ≠ succès (annulé retourne aussi 0)

Annoncé une run CI « verte » sur la foi d'un `gh run watch --exit-status` sorti en 0 : la run était
en réalité CANCELLED (annulée par le push suivant via la concurrency). L'exit-status de `gh run watch`
ne distingue pas success/cancelled dans cette version de gh — seul `failure` est non-zéro.

**Règles** :
- Un verdict CI se lit dans `gh run view <id> --json status,conclusion` (conclusion == "success"),
  jamais dans l'exit code de `gh run watch` seul. Même famille que « meeshy.sh exit 0 malgré FAILED »
  et « un résultat de tests se valide sur le compte attendu ».
- Sur un main à pushes rapprochés, chaque push ANNULE la run précédente (concurrency) : le seul
  verdict significatif est celui de la DERNIÈRE run du tip — attendre qu'elle se termine avant
  d'annoncer quoi que ce soit.

## 2026-07-12 — `grep -v <ClasseÉmettrice>` mange les consommateurs qualifiés — fausse « brèche confirmée »

En cherchant les consommateurs de `EXTRA_CALL_ID`, le filtre `grep -v MeeshyFcmService` (censé
exclure le fichier ÉMETTEUR) a aussi exclu les lignes des CONSOMMATEURS — qui référencent la
constante par son nom qualifié `MeeshyFcmService.EXTRA_CALL_ID`. Résultat : zéro occurrence,
« trou confirmé » annoncé... alors que MainActivity → LaunchRouter → CallRoute.incoming consomme
tout proprement.

**Règles** :
- Pour exclure un FICHIER d'un grep, exclure par CHEMIN (`grep -v "/MeeshyFcmService.kt:"`) ou
  utiliser `--exclude=<fichier>` — jamais par un motif texte qui peut apparaître dans le code des
  autres fichiers (nom de classe = namespace des constantes).
- Une absence de résultat grep n'est pas une preuve d'absence : avant d'annoncer « rien ne consomme
  X », refaire la recherche sans AUCUN filtre d'exclusion.

## 2026-07-12 — Renommer un appel dans CallManager.swift casse les source-guards de CallManagerTests.swift

**Contexte** : le fix reject iOS (`f67c39ac0`, `emitCallEnd` → `emitCallReject` dans
`rejectPendingCall()`) a fait tomber iOS Tests (2/3685) : `RejectPendingCallTests` sont des
source-guards qui lisent CallManager.swift en TEXTE et exigent des sous-chaînes exactes
(`emitCallEnd(callId: pending.callId)`). CI + SDK Tests verts n'ont rien vu — seul iOS Tests
exécute MeeshyTests.

**Règles** :
- Avant tout push qui renomme/déplace un appel dans CallManager.swift (ou tout fichier prod
  couvert par des guards) : `grep -n "<ancien-symbole>" apps/ios/MeeshyTests/` et adapter les
  guards DANS LE MÊME commit.
- Un source-guard cassé se répare en ré-encodant le NOUVEAU contrat (jamais en dégradant la
  prod) et en le RENFORÇANT si la substitution ouvre un trou (ex : verrou SDK
  `emitCallReject` doit émettre `call:end` AVEC `reason=rejected`, sinon le guard app
  passerait à vide).
- Ces guards se vérifient sans Xcode : répliquer l'extraction `functionBody` en Python sur
  les vraies sources (10 s au lieu d'un build de 15 min).

## 2026-07-12 — Lire le code d'émission AVANT de qualifier une donnée de prod d'anomalie

**Contexte** : le pipeline analytics live révélait 3 « anomalies » dans les données prod
(endReason="in_progress", averageRtt=0.489ms, durationSeconds float). J'ai d'abord documenté
les 3 comme des bugs d'émission iOS. Après lecture du code d'émission (CallManager:3182-3239,
WebRTCTypes:232), **2 sur 3 étaient du comportement CORRECT** :
- `in_progress` = snapshot périodique 60s délibéré (anti-perte de télémétrie sur appel long
  killé mid-call), pas un statut qui « leake ».
- `averageRtt` bas = conversion `*1000` correcte + quirk des stats WebRTC, pas un bug de code.

**Règle** :
- Une donnée qui « semble » anormale n'est pas une anomalie tant qu'on n'a pas lu le code qui
  la produit. Avant de documenter un « bug » à partir de données observées, ouvrir le site
  d'émission et vérifier l'intention.
- Un faux rapport de bug coûte plus cher qu'un silence : il envoie l'équipe chasser un
  comportement voulu. Corriger publiquement un finding erroné dès qu'on le découvre.
- L'accuracy prime sur le volume : 1 insight actionnable vérifié (ici : ~20% des appels
  répondables échouent réellement) vaut mieux que 3 « anomalies » dont 2 fausses.

## Parité cross-platform : certifier la RÈGLE ne suffit pas — vérifier les MAPPINGS d'entrée (2026-07-12)
En livrant retry-on-failure sur web/iOS/Android, j'avais certifié que les 3 `CallRetryPolicy`
encodaient une règle byte-identique (failed/connectionLost → retryable). Vrai mais insuffisant :
la même règle nourrie par des MAPPINGS d'entrée différents produit un comportement différent.
Android `CallSignalMapper.endedEvent` collapsait toute fin distante non-`missed` en `Remote`
(non-retryable), tandis qu'iOS/web mappaient `failed`/`connectionLost` serveur vers du retryable
→ divergence reachable côté appelant. **Règle : après avoir prouvé qu'une décision partagée est
identique, tracer TOUS les chemins qui alimentent son entrée sur chaque plateforme (décodage
socket, détection locale, valeurs par défaut) et vérifier qu'ils produisent des entrées
équivalentes. La parité d'une fonction pure est vide si ses arguments divergent en amont.**
