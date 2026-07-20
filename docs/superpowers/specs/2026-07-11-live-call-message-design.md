# Message d'appel vivant — Design (validé par 2 revues adversariales)

Date : 2026-07-11 · Statut : prêt pour implémentation
Feature : le message système d'appel est créé dès le DÉBUT de l'appel (état « en cours »,
cliquable pour rejoindre), puis mis à jour EN DIRECT vers son état terminal
(« annulé » / « manqué » / « reçu » / « refusé » / « interrompu »).
Aujourd'hui : créé côté serveur uniquement à la fin (`CallService.createCallSummaryMessage`).

Contrainte d'exécution : travail en parallèle, MÊME worktree, avec le plan
`2026-07-11-call-transcript-history` (100 % iOS, en cours d'exécution — T3 committé).
Cette feature possède seule le terrain gateway + packages/shared + web.

## Approches évaluées

- **A. Serveur-autoritaire : upsert in-place + `message:edited` enrichi — RETENUE.**
  Message créé en DB à `call:initiate` (clientMessageId déterministe EXISTANT
  `call-summary:{callId}`), mis à jour in-place au terminal, broadcast `message:edited`
  payload complet. Position chronologique correcte, source de vérité unique,
  multi-device/REST cohérents, flux web gratuit (merge shallow existant), badge non-lu :
  UN bump par appel (déplacé du terminal à l'initiate — parité de volume ; le recompute
  DB rend illusoire toute suppression sélective du bump).
- B. Pseudo-message client éphémère — rejetée (incohérent multi-device/historique,
  logique dupliquée, saut de position, contraire à la demande).
- C. Deux messages start+résumé avec suppression — rejetée (double bump non-lu, churn
  timeline, courses delete/insert).

## Décision structurante : représentation SANS extension des enums

Sortie de la revue #1 (le vieux web CRASH sur un outcome inconnu —
`TINT_BY_OUTCOME[outcome]` TypeError ; le vieil iOS dégrade proprement) :

- **État vivant = `kind: 'call-live'`** (nouveau discriminant), PAS un nouvel outcome.
  Vieux web : `BubbleMessage` ne route vers `CallSystemMessage` que si `kind === 'call'`
  → le live tombe en rendu système texte (content FR « Appel audio/vidéo en cours ») —
  aucun crash. Vieil iOS : decode exige `kind == "call"` → nil → notice texte. Au
  terminal, l'édition réécrit `kind:'call'` canonique → tous les clients re-rendent la
  bulle riche via leurs chemins existants.
- **« Annulé » = `outcome:'missed'` + `endedByInitiator: true`** (champ optionnel), PAS
  un nouvel outcome. Vieux clients (Codable/TS ignorent la clé) rendent « Appel manqué »
  — comportement actuel, sûr. Nouveaux clients : par-spectateur — initiateur → « Appel
  annulé », destinataire → « Appel manqué ». Dérivation serveur :
  `answeredAt == null && metadata.endedBy == initiatorId`.
- `CallSummaryOutcome` (TS et Swift) reste INCHANGÉE → aucun point de décodage cassé.
- La metadata live porte `outcome:'completed'` neutre : il ne pilote JAMAIS le rendu —
  le kind se lit AVANT l'outcome (invariant testé côté web ET iOS).
- `garbageCollected` : silencieux si aucun message n'existe (comportement actuel) ;
  s'il existe un message live → conversion en `failed` (« Appel interrompu »).

## Gateway

- `CallService.createLiveCallMessage(callId)` : garde non-terminal, résolution
  participant initiateur (include existant), `message.create` avec le clientMessageId
  déterministe ; P2002 avalé (le terminal a gagné la course : son fallback create a
  posté le résumé final).
- `createCallSummaryMessage` → **upsert anti-freeze** (revue #1 B1) :
  1. `findFirst({conversationId, clientMessageId})` (le sélecteur composite findUnique
     n'existe PAS dans le client Prisma généré — commentaire du schema trompeur) ;
  2. live trouvé → `update` {content, metadata canonique kind:'call'} → `{kind:'updated'}` ;
  3. terminal trouvé → null (idempotence des 7 chemins) ;
  4. absent → `create` → `{kind:'created'}` ; **sur P2002 : re-findFirst → live → update**
     (élimine le gel « en cours à jamais » si le create live commite pendant la course) ;
  5. GC : live existant → update `failed`, sinon null ;
  6. select session += `answeredAt` ; lecture `metadata.endedBy` → `endedByInitiator`.
- `leaveCall` : écrit `metadata.endedBy` dans SES DEUX branches terminales (main
  :1464-1473 + idempotente :1311-1324) — le decline web passe par `call:leave`, et le
  cancel-par-crash de l'initiateur (disconnect auto-leave) est classé « annulé »
  (sémantiquement juste, assumé).
- **Sweeps GC d'`initiateCall`** (phantom ~:826-851, zombie ~:895-910) : ils écrivent
  `garbageCollected` terminalement SANS poster — `CallService.setReapedCallCallback(cb)`
  (pattern `setPostSummaryCallback`, câblé server.ts à côté de :1317) notifie chaque
  callId reapé → `postCallSummaryForTerminatedCall` → conversion live→failed. Couvre
  aussi la route REST morte `POST /calls`.
- `CallEventsHandler` : à `call:initiate` (succès, après l'ack) → fire-and-forget
  `postLiveCallMessage(callId)` (pattern retry ×3/log de `postCallSummary`, intégralement
  try/catché, jamais bloquant) → broadcast `messageBroadcaster` existant (message:new +
  preview + unread). `postCallSummary` route `created` → broadcaster actuel, `updated` →
  nouveau `messageUpdateBroadcaster`.
- `MeeshySocketIOManager.broadcastMessageEdited(message, conversationId)` (nouveau,
  setter câblé comme `setMessageBroadcaster` :222) : émet `MESSAGE_EDITED` à la room
  conversation avec payload COMPLET — invariants testés : `metadata` TOUJOURS présente
  (le merge shallow web ne remplace la metadata que si la clé existe), `editedAt =
  updatedAt` (garde d'ordre clients), PAS `isEdited:true` ; réutilise
  `emitConversationPreviewUpdate` (rooms `user:<id>`, recompute DB, skip anonymes —
  émettre sur la room conversation serait un échec silencieux) ; enqueue offline
  `'edited'` via `enqueueOfflineMessageMutation` (un callee offline pendant tout l'appel
  DOIT recevoir l'édition au reconnect — c'est LE scénario missed-call).
- Push : AUCUNE nouvelle (la sonnerie a sa push VoIP ; ce chemin broadcast n'a jamais poussé).

## iOS (SDK + app)

- SDK `CallSummaryMetadata.swift` : accepte `kind ∈ {'call','call-live'}`, expose
  `isLive`, encode bijectif ; champ `endedByInitiator: Bool?` optionnel (backward-safe,
  Codable ignore les clés inconnues) ; helper `isCancelled(viewerIsInitiator:)` ;
  décodage live testé AVEC et SANS `outcome`.
- SDK `MessagePersistenceActor` :
  - `applyCallNoticeUpdate(localId:content:callSummaryJson:serverUpdatedAt:)` : met à
    jour content + callSummaryJson + updatedAt + changeVersion, SANS isEdited/editedAt.
  - **Garde anti-régression dans `upsertFromAPIMessages`** (revue #1 I3) : un
    callSummaryJson stocké TERMINAL n'est jamais remplacé par un live du même callId
    (un snapshot REST pris pendant l'appel et atterri après l'édition terminale ne peut
    plus régresser la bulle) ; live→terminal passe toujours.
- App `ConversationSocketHandler` (messageEdited) : apiMsg avec callSummary →
  `applyCallNoticeUpdate` ; sinon `markEdited` (inchangé). Conversation fermée :
  l'hydratation REST ré-upserte callSummaryJson (vérifié) — couvert avec la garde.
- App `BubbleCallNoticeView` / `CallNoticePresentation` (passée `internal` pour la
  testabilité) : live → teinte accent + point pulsant (animation SwiftUI, PAS de Timer
  par cellule), titre « Appel audio/vidéo en cours », sous-titre « Toucher pour
  rejoindre » ; missed+endedByInitiator par-spectateur. Equatable : les nouveaux champs
  entrent dans l'égalité synthétisée de CallSummaryMetadata → la transition
  live→terminal re-rend automatiquement.
- App `ConversationViewModel.callBack(for:)` : `summary.isLive` → `joinOngoingCall` :
  1) call courant actif même id → ramener l'UI d'appel ;
  2) ce device SONNE sur ce call → surfacer l'accept existant (joindre pré-answer =
     répondre, position produit assumée) ;
  3) `ActiveCallService.activeCall(conversationId:)` même id → `rejoinActiveCall(...)` ;
  4) sinon toast « L'appel est terminé ».
  Terminal → rappel actuel inchangé. AUCUNE nouvelle closure dans la chaîne de 5 vues
  (terrain T7 du collègue évité — l'action passe par la closure `onCallBack` existante).

## Web

- `BubbleMessage.tsx` (~:205) : route `kind === 'call' || kind === 'call-live'` →
  `CallSystemMessage`.
- `CallSystemMessage.tsx` : branche live (kind lu AVANT outcome — invariant testé) ;
  branche annulé par-spectateur ; bouton « Rejoindre » ssi `direct` ET utilisateur non
  anonyme (le gate serveur refuse les anonymes ; sans ce masquage l'anonyme aurait un
  bouton menteur) ; durcissement : fallback neutre pour tout kind/outcome inconnu futur.
- **Join par la bulle** : PAS `answerCall` (unwired — n'émet que call:join sans média ni
  UI). Chemin de réhydratation à froid : `useCallStore.requestJoin({...})` → CallManager
  (propriétaire média/UI) consomme, valide via `GET /conversations/:id/active-call`
  (route gateway existante :817 ; le CLIENT web est à créer), puis exécute la logique
  d'`handleAcceptCall` (~:420) extraite en helper `acceptOrJoinCall(session)`. Page
  rechargée mi-appel : couverte (aucune dépendance à un `incomingCall` reçu).

## Périmètre / non-buts

- Android : hors périmètre (ne rend pas les résumés d'appel).
- Join : conversations directes uniquement ; groupes = état affiché sans action.
- Un seul état vivant (pas de ringing/active distincts) ; UNE édition au terminal ;
  pas de timer live dans la bulle (perf).
- Route REST `POST /calls` : pas de message live (route morte sans fanout) ; le terminal
  y retombe sur create — comportement actuel préservé.
- Vieil iOS : `markEdited` s'applique aux messages système par id (vérifié) → le texte
  passe bien de « en cours » au label final ; il posera `isEdited=1` localement —
  cosmétique accepté.

## Erreurs / courses (durcies)

- Création live échoue → terminal retombe sur create (comportement actuel exact).
- Course initiate/terminal : bidirectionnelle couverte (P2002 des deux côtés).
- Chemins terminaux concurrents : upsert convergent (session re-lue), déjà-terminal ⇒ no-op.
- Crash gateway mi-appel : GC (CallCleanupService OU sweeps initiateCall) convertit en failed.
- Offline : `new` ET `edited` enqueued ; refetch REST protégé par la garde anti-régression.
- Vieux clients : AUCUN crash possible par construction (kind inconnu → texte ; champ
  inconnu → ignoré ; enums jamais étendues).
- Rollback : revert du seul commit d'activation (T7 gateway) éteint la feature ; le
  reste est un fallback inoffensif.

## Plan d'implémentation

Voir `docs/superpowers/plans/2026-07-11-live-call-message.md` (14 tâches TDD +
vérification transversale, coordination worktree partagé incluse).
