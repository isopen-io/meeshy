# Plan — Message d'appel vivant (14 tâches TDD + vérification)

Spec : `docs/superpowers/specs/2026-07-11-live-call-message-design.md` (2 revues
adversariales intégrées). Chaque tâche : RED → GREEN → commit pathspec-strict, suites
vertes à chaque commit.

## Règles de coexistence (worktree partagé ACTIF)

Le collègue exécute `2026-07-11-call-transcript-history` (T3 committé au moment de la
rédaction ; vérifier `git log` avant chaque phase iOS). Un harnais e2e gateway NON
TRACKÉ (`services/gateway/src/socketio/__tests__/calls-two-socket-e2e.test.ts`) et des
modifs non-commitées (pbxproj, Info.plist ×4, bun.lock, gateway package.json) lui
appartiennent.

- Interdits absolus : `git add -A`/`-u`, `commit --amend`, committer `project.pbxproj`,
  `Info.plist`, `bun.lock`, `services/gateway/package.json`, le harnais e2e non tracké,
  `CachePolicy.swift`, `CacheCoordinator.swift`, et tout fichier de SES tâches
  (ThemedMessageBubble, MessageListView(Controller), ConversationView, CallManager.swift).
- Fichier partagé UNIQUE : `BubbleCallNoticeView.swift` — ma région :
  `CallNoticePresentation` (~:235-284) + metricsRow ; ses régions : gesture/sheet (T7)
  + `CallSummaryDetailSheet` (T8). Celui qui committe en second relit la région de l'autre.
- AUCUN nouveau fichier Swift (tests inclus) → zéro régénération pbxproj.
- Baseline AVANT T2 : `cd packages/shared && npx prisma generate --generator client &&
  bun run build`, puis `cd services/gateway && bun run test` (bun, pas node) — noter les
  éventuels échecs préexistants (harnais e2e). Gate des tâches gateway = « aucune
  régression vs baseline », pas un compte absolu de suites.

## Phase 1 — packages/shared

### T1 — Représentation `call-live` + `endedByInitiator`
Fichiers : `packages/shared/utils/call-summary.ts`,
`packages/shared/__tests__/call-summary.test.ts`
- RED (table-driven, extension du fichier existant) :
  1. `buildLiveCallMetadata({callId, initiatorId, callType})` → `{kind:'call-live',
     outcome:'completed' (neutre), durationSeconds:0, bytesTotal:null,
     networkQuality:null}` + summary `{contentKey:'call_ongoing_audio|video',
     content:'Appel audio|vidéo en cours'}`.
  2. `buildCallSummaryWithMetadata` inputs `answeredAt?`, `endedById?` →
     `endedByInitiator === true` ssi missed && !answeredAt && endedById === initiatorId ;
     clé ABSENTE sinon.
  3. Terminal → `kind:'call'` toujours (bijection).
  4. Non-régression complète de la table existante.
  5. `buildGarbageCollectedConversion({callType})` → failed (« Appel … interrompu »).
- GREEN : `kind: 'call' | 'call-live'`, `endedByInitiator?: true`, builders,
  `FRENCH_LABELS.call_ongoing_*`. `CallSummaryOutcome` INCHANGÉ. Imports internes
  en `.js` (piège crash-loop ESM). Pas d'export index à toucher (subpath `./utils/*`).
- `cd packages/shared && bun run test && bun run build` (le dist nourrit gateway ET web).
- Commit : `feat(shared/calls): métadonnée call-live + endedByInitiator + conversion GC`

## Phase 2 — gateway (ordre toujours-vert, activation EN DERNIER)

### T2 — `CallService.createLiveCallMessage(callId)`
Fichiers : `services/gateway/src/services/CallService.ts`,
nouveau `services/gateway/src/__tests__/unit/services/CallService.liveMessage.test.ts`
- RED : crée le message live (kind call-live, `clientMessageId =
  callSummaryClientMessageId(callId)`, `CALL_SUMMARY_MESSAGE_INCLUDE`, messageType/
  messageSource 'system') pour un status non-terminal ; null si terminal ; null + warn
  si participant initiateur absent ; P2002 → null.
- Commit : `feat(gateway/calls): création du message d'appel vivant (non branchée)`

### T3 — `MeeshySocketIOManager.broadcastMessageEdited`
Fichiers : `services/gateway/src/socketio/MeeshySocketIOManager.ts`,
`services/gateway/src/socketio/CallEventsHandler.ts` (setter seul),
`services/gateway/src/socketio/__tests__/MeeshySocketIOManager.test.ts` (ancre :535
« wires CallEventsHandler message broadcaster »)
- RED : émet `MESSAGE_EDITED` à `ROOMS.conversation(id)`, payload COMPLET — invariants :
  `metadata` PRÉSENTE, `editedAt = updatedAt`, PAS `isEdited:true`, translations
  transformées comme `_broadcastNewMessage` ; **réutilise `emitConversationPreviewUpdate`**
  (rooms `user:<id>` — émettre sur la room conversation serait un échec silencieux de la
  preview) SANS unread bump ; **enqueue offline `'edited'`** via
  `enqueueOfflineMessageMutation` (:561, mapping :73).
- GREEN : méthode + `setMessageUpdateBroadcaster` câblé au constructeur (pattern :222).
  Code mort jusqu'à T4 : acceptable (vérifié lint/coverage).
- Commit : `feat(gateway/socketio): broadcast message:edited système (payload complet + offline)`

### T4 — Upsert terminal anti-freeze + conversion GC
Fichiers : `CallService.ts`, `CallEventsHandler.ts` +
tests à ADAPTER (retour discriminé) : `CallService.summary.test.ts`,
`CallService.test.ts` (:4681-4909, ~9 assertions), `CallEventsHandler-summary-retry.test.ts`
(:183-208, mock résout fakeMessage → doit devenir `{kind:'created', message}`),
`socketio/__tests__/CallEventsHandler.test.ts` (:2345). Les 8 autres suites handler
résolvent null → intactes.
- RED : (1) live existant → update {content, metadata kind:'call'} → `{kind:'updated'}` ;
  (2) terminal existant → null ; (3) absent → create → `{kind:'created'}` ;
  (4) **P2002 au create → re-findFirst → live → branche update** (anti-freeze) ;
  (5) GC : live existant → update failed, sinon null ; (6) select += `answeredAt`,
  lecture `metadata.endedBy` → `endedByInitiator` émis ; (7) lookup par
  `findFirst({where:{conversationId, clientMessageId}})` (PAS findUnique).
- GREEN : transformation + `postCallSummary` route created → `messageBroadcaster`,
  updated → `messageUpdateBroadcaster`.
- Commit : `feat(gateway/calls): upsert terminal du message d'appel (anti-freeze + GC failed)`

### T5 — `endedBy` dans les DEUX branches terminales de `leaveCall`
Fichiers : `CallService.ts`, `CallService.test.ts`
- RED : branche main (~:1464-1473) ET branche idempotente (~:1311-1324) écrivent
  `metadata.endedBy = userId` (merge du blob, `type` préservé, version-guardé comme
  `endCall` :1685-1688). Les deux branches lisent la session en include complet →
  metadata déjà dispo, pas de select à étendre.
- Commit : `feat(gateway/calls): endedBy stampé sur les deux branches leaveCall`

### T6 — Hook sweeps GC d'`initiateCall`
Fichiers : `CallService.ts`, `services/gateway/src/server.ts`, `CallService.test.ts`
- RED : `setReapedCallCallback(cb)` ; sweeps phantom (~:826-851) et zombie (~:895-910)
  notifient chaque callId reapé, fire-and-forget, jamais bloquant pour initiate.
- GREEN : câblage server.ts via `cleanupManager.getCallService()` (:1313), à côté de
  `setPostSummaryCallback` (:1317) → `postCallSummaryForTerminatedCall`.
- Commit : `fix(gateway/calls): les sweeps GC d'initiateCall postent la conversion du message live`

### T7 — ACTIVATION : `call:initiate` poste le message vivant
Fichiers : `CallEventsHandler.ts` + **10 factories de mocks CallService à compléter**
(`createLiveCallMessage: jest.fn().mockResolvedValue(null)`) :
`CallEventsHandler-{end, disconnect, error-fallbacks, force-leave, initiate-error,
rehydrate, restart-resilience, ringing-timeout-missed, summary-retry}.test.ts` +
`socketio/__tests__/CallEventsHandler.test.ts` (:52). NE PAS toucher le harnais e2e non
tracké — demander au collègue d'ajouter le stub dans SON fichier.
- RED : succès d'`initiateCall` (après l'ack `{success:true}`, handler INITIATE :1428+)
  → fire-and-forget `postLiveCallMessage(callId)` (retry ×3/log, intégralement
  try/catché) → broadcast `messageBroadcaster` (message:new). Un échec n'affecte JAMAIS
  le setup d'appel ni l'ack.
- Gate : `bun run test:coverage` gateway — aucune régression vs baseline.
- Commit : `feat(gateway/calls): message d'appel vivant créé dès call:initiate`
- **Rollback de toute la feature = revert de CE commit** (T2-T6 = fallback inoffensif).

## Phase 3 — web

### W1 — Rendu live + annulé + durcissement
Fichiers : `apps/web/components/common/BubbleMessage.tsx` (routage ~:205),
`apps/web/components/common/bubble-message/CallSystemMessage.tsx`,
nouveau test `apps/web/__tests__/components/common/bubble-message/CallSystemMessage.test.tsx`
(convention prouvée : `BubbleMessage.test.tsx` y vit et mocke déjà les sous-vues).
Rebuilder `packages/shared` avant (jest web mappe vers dist).
- RED : (a) routage `kind === 'call' || kind === 'call-live'` ; (b) live : indicateur
  pulsant, titre « Appel audio/vidéo en cours », bouton « Rejoindre » ssi `direct` ET
  utilisateur NON anonyme (`use-auth` :47 — le gate serveur refuse les anonymes, le
  bouton serait menteur) ; (c) **kind lu AVANT outcome** : `kind:'call-live' +
  outcome:'completed'` ne rend JAMAIS le rendu terminal ; (d) annulé :
  missed+endedByInitiator par-spectateur ; (e) fallback neutre pour kind/outcome inconnu
  (plus de TypeError possible) ; (f) terminal inchangé.
- Gate : jest web (tsc n'est pas un gate propre — ~1108 erreurs préexistantes).
- Commit : `feat(web/calls): bulle d'appel vivante + annulé par-spectateur + fallback durci`

### W2 — Join web par la bulle (réhydratation à froid)
Fichiers : `apps/web/stores/call-store.ts` (+ test existant
`apps/web/__tests__/stores/call-store.test.ts`), `apps/web/components/video-call/CallManager.tsx`,
`CallSystemMessage.tsx`, **nouveau client REST active-call** (aucun n'existe côté web ;
route gateway : `services/gateway/src/routes/calls.ts:817`, auth requise, anonymes
refusés, rate-limit 10/min) via la convention API client du dossier `apps/web/services`.
- RED : `requestJoin({callId, conversationId, callType})` posé par le bouton →
  CallManager consomme : GET active-call → session active de même id →
  `acceptOrJoinCall(session)` extrait d'`handleAcceptCall` (~:420 — getUserMedia adapté,
  `call:join` ack-vérifié, `setCurrentCall`+`setInCall`) ; sinon toast « L'appel est
  terminé ». Sans dépendance à un `incomingCall` reçu (page rechargée mi-appel).
  Garde : déjà en appel → no-op/toast.
- Commit : `feat(web/calls): rejoindre l'appel en cours depuis la bulle`

## Phase 4 — iOS SDK (fichiers exclusifs)

### S1 — `CallSummaryMetadata` : kind live + endedByInitiator
Fichiers : `packages/MeeshySDK/Sources/MeeshySDK/Models/CallSummaryMetadata.swift`,
`packages/MeeshySDK/Tests/MeeshySDKTests/Models/CallSummaryMetadataTests.swift` (existant)
- RED : décode `kind:'call-live'` → `isLive` ; **AVEC et SANS `outcome`** ; encode
  bijectif (l'encode actuel écrit "call" en dur :100) ; `endedByInitiator` optionnel
  (absent → nil) ; clé inconnue ignorée ; kind inconnu → throw (conservé) ;
  `isCancelled(viewerIsInitiator:)` ; `Outcome` INCHANGÉE.
- Gate : suite SDK ciblée (scheme MeeshySDK-Package, simu 18.2, -only-testing).
- Commit : `feat(sdk/calls): CallSummaryMetadata décode call-live + endedByInitiator`

### S2 — Persistance : `applyCallNoticeUpdate` + garde anti-régression
Fichiers : `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessagePersistenceActor.swift`,
`MessagePersistenceActorTests.swift` (existant)
- RED : (a) `applyCallNoticeUpdate(localId:content:callSummaryJson:serverUpdatedAt:)` —
  content + callSummaryJson + updatedAt + changeVersion, isEdited/editedAt INTACTS,
  refresh store ; (b) garde `upsertFromAPIMessages` (~:1698) : callSummaryJson stocké
  TERMINAL jamais remplacé par un live du même callId ; live→terminal passe.
- Commit : `feat(sdk/persistence): mise à jour in-place du message d'appel + garde anti-régression`

## Phase 5 — iOS app (ZÉRO nouveau fichier — pbxproj intact)

### A1 — Routage socket de l'édition d'appel
Fichiers : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift`
(handler messageEdited :574-592), tests dans `ConversationSocketHandlerTests.swift` (existant)
- RED : apiMsg avec callSummary → `applyCallNoticeUpdate` ; sans → `markEdited` (inchangé).
- Commit : `feat(ios/messages): l'édition d'un message d'appel ré-applique la métadonnée`

### A2 — Présentation : bulle vivante + annulé
Fichiers : `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleCallNoticeView.swift`
(MA région : `CallNoticePresentation` ~:235-284, **passée `internal`** pour la
testabilité, + metricsRow), tests dans `BubbleContentMatrixTests.swift` (existant —
teste déjà le call-notice, :502)
- COORDINATION : sync avec le collègue avant édition (ses T7/T8 touchent d'autres
  régions du même fichier) ; le second à committer relit la région de l'autre.
- RED : live → teinte accent, point pulsant (animation SwiftUI repeatForever, PAS de
  Timer), titre « Appel audio/vidéo en cours », sous-titre « Toucher pour rejoindre »,
  ni durée ni data ; missed+endedByInitiator : initiateur « Appel annulé » /
  destinataire « Appel manqué » ; terminal inchangé. (Equatable : les nouveaux champs
  entrent dans l'égalité synthétisée → live→terminal re-rend, vérifié.)
- Commit : `feat(ios/calls): bulle d'appel vivante + rendu annulé par-spectateur`

### A3 — Rejoindre depuis la bulle
Fichiers : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`
(`callBack(for:)` :1877 — non touché par le collègue), tests dans
`ConversationViewModelTests.swift` (existant)
- RED : `summary.isLive` → `joinOngoingCall` : (1) call courant actif même id → ramener
  l'UI ; (2) ce device SONNE sur ce call → surfacer l'accept existant ; (3)
  `ActiveCallService.activeCall(conversationId:)` même id → `rejoinActiveCall(...)`
  (params via `remoteParticipant(currentUserId:)`, CallModels :208) ; (4) toast
  « L'appel est terminé ». Terminal → `startCall` actuel. Guard direct-only conservé.
- Commit : `feat(ios/calls): rejoindre l'appel en cours depuis la bulle`

### A4 — Vérification transversale (pas de commit)
- `./apps/ios/meeshy.sh build` (grep du log — exit 0 menteur possible) + suites ciblées
  simu 18.2 ; gateway `bun run test:coverage` (vs baseline) ; web jest.
- Smoke simu : appel A→B → bulle « en cours » chez B → tap rejoint → raccrocher →
  bulle finale éditée en direct des deux côtés ; cancel pré-answer → « Appel annulé »
  côté A, « Appel manqué » côté B.

## Livraison
- gateway+shared+web : push main → CI (vieux clients sûrs par construction). iOS suit
  son cycle TestFlight. Intérim acceptable : vieil iOS voit la bulle texte pour le live,
  la bulle riche au terminal.
