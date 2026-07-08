# Audit 360° — Sous-systeme Appels Audio/Video Meeshy

> **Statut au 2026-07-08** (session `claude/loving-thompson-ccnlsc`, pas d'acces
> Xcode/simulateur ni SSH prod dans cet environnement — memes contraintes que la
> session precedente) :
> - **Premier audit approfondi cote WEB** (jusqu'ici les audits se concentraient
>   sur iOS + gateway ; la colonne "Web" du tableau ci-dessous etait a 0 sans
>   qu'un audit dedie n'ait jamais tourne sur `apps/web/hooks/use-webrtc-p2p.ts`,
>   `stores/call-store.ts`, `components/video-calls/*`). Deux bugs reels trouves
>   et corriges, avec tests :
>   - **P0-WEB-1** — `VideoCallInterface.tsx` : le cleanup différé (2s) sur
>     `CALL_PARTICIPANT_LEFT` fermait la RTCPeerConnection **fraîchement
>     rétablie** si le participant rejoignait dans la fenêtre de grâce (network
>     blip, tab reload) — aucune vérification d'identité de connexion avant de
>     détruire. Fix : snapshot de la connexion au moment du leave, comparaison
>     d'identité au moment du timeout ; si différente (rejoin détecté), on ne
>     touche ni au stream ni à la connexion ni au guard `offersCreatedFor`.
>   - **P1-WEB-2** — `use-webrtc-p2p.ts` : `remoteDescriptionSetRef` /
>     `iceCandidateQueueRef` / `webrtcServicesRef` n'étaient jamais nettoyés par
>     participant (seulement au `cleanup()` global) → un rejoin héritait de
>     l'état signaling du participant précédent (réponse initiale traitée comme
>     renégociation, ICE candidates silencieusement droppés). Fix : nouvelle
>     fonction `removeParticipant(id)` exportée par le hook, appelée par
>     `VideoCallInterface` uniquement quand le rejoin N'est PAS détecté.
>   - **P1-WEB-3** — même fichier : `createOffer`/`handleOffer` ne fermaient pas
>     la RTCPeerConnection déjà enregistrée (`addPeerConnection`) si
>     `createOffer()`/`createAnswer()` levait une exception après coup — fuite
>     silencieuse. Fix : `removeParticipant(id)` dans les deux blocs `catch`.
>   - **P2-WEB-4** (identifié, non corrigé) — `CallControls.tsx`
>     `handleSpeakerToggle` ne fait que flipper un state local, aucun routage
>     audio réel (`setSinkId`). Non corrigé cette session : nécessite de
>     remonter l'état jusqu'aux éléments `<video>` de `VideoStream.tsx` (3
>     fichiers à toucher), `setSinkId` n'est pas supporté par tous les
>     navigateurs, et aucun matériel audio réel n'est disponible dans cet
>     environnement pour vérifier un routage correct — un fix mal vérifié sur ce
>     chemin risquerait de casser l'audio d'appels réels, pire que le no-op
>     actuel (inoffensif). Backlog pour une session avec verification manuelle.
>   - Non retenus (nécessitent un vrai navigateur/device pour verifier sans
>     risque de faux-positif) : focus trap sur les overlays plein-ecran
>     (accessibilite), race `ensureLocalStream`/`createOffer` concurrents
>     (latent, masque par `isCallSupported` limitant a 1 pair), absence de
>     verification `signal.from` contre `participants[]` cote client.
> - **Re-sweep gateway ciblé** (5 fichiers : `CallEventsHandler.ts`,
>   `CallService.ts`, `TURNCredentialService.ts`, `PushNotificationService.ts`,
>   `call-schemas.ts`) contre le code actuel — tous les P0-4/5, P1-20/21/22,
>   P2-GW-1/2/5 confirmes deja fixes (commentaires `Audit P2-GW-*` en place).
>   Trois nouveaux problèmes trouvés et corrigés :
>   - **P1-GW-5** — le guard "zombie-socket" sur `disconnect` bloquait
>     **tout** grace/cleanup pour TOUS les appels de l'utilisateur dès qu'un
>     AUTRE socket (même non lié à l'appel) restait dans `ROOMS.user(userId)`.
>     Un device idle (iPad jamais entré dans l'appel) masquait un device
>     crashé en plein appel → jamais nettoyé, jamais même par le GC 2h (le
>     pair restait heartbeat-frais). Fix : scinder le check par statut d'appel
>     — les appels **répondus** (active/reconnecting) vérifient désormais la
>     présence dans `ROOMS.call(callId)` spécifiquement (mirroring
>     `onDisconnectGraceExpired`'s propre logique) ; les appels **pré-réponse**
>     (ringing/initiated) gardent l'ancien check global sur `ROOMS.user`
>     (aucune room d'appel a checker avant reponse — c'est le scenario exact
>     que le fix zombie-socket 2026-07-02 visait, non regresse).
>   - **P1-GW-6** — `isPushAllowed` bloquait TOUTE push pendant les heures DND
>     de l'utilisateur, y compris la sonnerie VoIP entrante, son annulation
>     silencieuse (`call_cancel`) et le signal `call_answered_elsewhere` —
>     aucun produit d'appel comparable (FaceTime, WhatsApp, Signal) ne
>     bloque les appels via DND. Fix : nouveau flag `bypassDnd` sur
>     `SendPushOptions`, applique aux 3 sites d'appel (jamais a
>     `pushEnabled: false`, qui reste un opt-out explicite total).
>   - **P2-GW-7** — `presence:app-state` restait le seul handler `call:*`-
>     adjacent sans check `getUserId`/rate-limit (tous les autres en ont un
>     depuis les sweeps 2026-07-03/07-05). Impact mineur (flag socket-local,
>     pas d'ecriture DB) mais corrige par coherence : nouveau
>     `SOCKET_RATE_LIMITS.PRESENCE_APP_STATE` (30/min).
>   - Identifies mais **non corriges** (necessitent verification device/prod
>     non disponible ici) : reap GC à un seul participant stale sur 2 en P2P
>     (actuellement `getStaleHeartbeats`/`hasFreshLiveness` exigent que TOUS
>     les participants soient stale), shape d'erreur d'ack `call:initiate`/
>     `call:join` non conforme au type documente (`as unknown as` sur du texte
>     brut au lieu de `{code, message}`), `postCallSummary` retry bloque l'ack
>     de `call:end` de l'ender (~6s worst-case).
> - **Verification complete** : `bun run test:coverage` gateway (510/510
>   suites, 13865/13866 tests, 1 skip pre-existant) + suite Jest complete web
>   (445/445 suites, 11020/11041 tests, 21 skips pre-existants) + `tsc --noEmit`
>   gateway (0 erreur) + `tsc --noEmit` web (1201 erreurs, **identique avant/
>   apres** — dette pre-existante non liee a cette session, verifiee par diff
>   du compte d'erreurs sur `main` vs cette branche).
>
> **Statut au 2026-07-07** (session `claude/loving-thompson-l09qhh`, pas d'acces
> Xcode/simulateur ni SSH prod dans cet environnement) :
> - **Re-sweep complet des P0/P1** via 5 agents Explore paralleles (lifecycle/
>   audio/CallKit iOS, WebRTC/codec/UI/gateway, gateway securite/authz) contre
>   le code actuel de `main`. Resultat identique au 2026-07-04/05 : **tout est
>   FIXED sauf P0-1, P1-11, et P1-13 (partiel)** — aucune regression, aucun
>   nouveau P0/P1 trouve.
> - **P1-16** : confirme deja FIXE sur `main` (commit `c97aa4ed`, poursuivi par
>   un agent concurrent au-dela de mon propre correctif candidat identique —
>   `CallEffectsOverlay` recoit aussi `callManager` du parent desormais, plus
>   nettoyage de code mort `colorScheme`/`isDark`). Mon brouillon de fix
>   local pour ce meme point a ete abandonne (deja present, evite un doublon).
> - **P0-1 — ATTENTION pour les prochaines sessions** : j'ai commence a
>   reimplementer le pattern template+sed (`turnserver.prod.conf` + substitution
>   `TURN_SECRET` a l'entrypoint coturn de `docker-compose.prod.yml`), verifie
>   syntaxiquement (`docker compose config --quiet`) et fonctionnellement (script
>   shell isole, 4 cas testes). **Avant de pousser, j'ai trouve que ce pattern
>   exact avait deja ete tente (commit `71b4b64a`) puis delibarement revert** —
>   voir `docs/superpowers/specs/2026-05-11-docker-compose-prod-reconciliation-design.md`
>   §8.2 : `config/turnserver.prod.conf` **n'existe pas sur le serveur prod reel**,
>   et le chemin relatif y resout incorrectement une fois deploye. Reintroduire
>   ce pattern sans d'abord deposer le fichier template + faire la rotation de
>   secret **cote serveur (SSH)** casserait le demarrage de coturn (pire que
>   l'etat actuel : secret errone silencieux → aujourd'hui calls degradent vers
>   STUN-only ; apres ce "fix" mal coordonne → coturn ne demarre plus du tout).
>   **J'ai annule mon brouillon avant de commiter.** P0-1 reste, comme documente
>   le 2026-07-04/05, une tache necessitant un humain avec acces prod SSH pour
>   coordonner : rotation du secret + depot de `config/turnserver.prod.conf` sur
>   `/opt/meeshy/production/` + ce meme diff compose, en un seul changement
>   atomique cote serveur ET repo.
> - **Aucun changement de code pousse cette session** — rien de surete et non
>   deja fait n'a ete trouve dans le perimetre accessible sans Xcode/SSH prod.
>
> **Statut au 2026-07-04** : verification systematique des 5 P0 + 18 P1
> contre `main` (branche `claude/eager-hamilton-nykzoy`). **4/5 P0 et 28/31
> P1 sont fixes** (deux mois de commits `fix(ios/calls)`/`feat(calls)`
> continus). Restants confirmes :
> - **P0-1 (TURN secret hardcode) reste ouvert EN PRODUCTION** —
>   `docker-compose.prod.yml` monte `turnserver.conf` (secret public en
>   clair), pas `turnserver.prod.conf`. Le pattern template+sed a deja ete
>   tente (commit `71b4b64a`) puis delibarement revert
>   (`docs/superpowers/specs/2026-05-11-docker-compose-prod-reconciliation-design.md`
>   §8.2) car `config/turnserver.prod.conf` n'existe pas sur le serveur prod
>   et le chemin relatif resolvait mal. Le fix reel necessite une
>   coordination ops (rotation du secret + depot du fichier template sur
>   `/opt/meeshy/production/config/` + mise a jour de `.env`) qu'un agent
>   sans acces SSH prod ne peut pas faire en toute securite. **A traiter par
>   un humain avec acces prod.**
> - **P1-11** (CallKit `CXEndCallAction.fulfill()` synchrone avant le
>   teardown async) — laisse en l'etat : le commentaire in-code documente un
>   arbitrage deliberer (eviter un timeout CallKit sur l'action) qui ne peut
>   pas etre valide sans test sur simulateur/device reel.
> - **P1-16** (partiel) corrige dans cette meme branche : `CallView`
>   n'accepte plus `callManager` en default `= CallManager.shared` — injecte
>   par `RootView`/`iPadRootView` qui possedent deja leur propre instance.
>   `IncomingCallView` etait deja corrige.
> - Tous les autres P1 lus dans le code actuel sont FIXED (P0-2/3/4/5,
>   P1-1..10, 12..15, 17..31).
>
> **Statut au 2026-07-05** (branche `claude/eager-hamilton-d5webr`, re-verification
> ciblee gateway — pas d'acces Xcode/simulateur dans cet environnement, cote iOS
> non re-verifie au-dela d'une lecture statique) :
> - **Suite de tests gateway complete** (`bunx jest@30.4.2 --config=jest.config.json
>   --coverage`, apres `prisma generate` + `bun run build` de `packages/shared`
>   comme documente ci-dessus) : **483/509 suites vertes, 13289/13290 tests
>   verts** ; les 26 suites en echec (`sync.test.ts`, `SequenceService.test.ts`,
>   `notifications/*`, etc.) sont **toutes hors-perimetre appels** — meme cause
>   racine partagee (`SequenceService.ts:1` importe `PrismaClient` depuis
>   `@prisma/client` au lieu du client genere `@meeshy/shared/prisma/client`),
>   **zero echec sur un fichier `Call*`**.
> - **P2-GW-1, P2-GW-2, P2-GW-5** (fetchSockets O(N), callType hardcode dans le
>   push missed-call, mismatch participantId) : confirmes FIXED dans le code
>   actuel, chacun porte un commentaire `Audit P2-GW-*` a la ligne concernee
>   (`CallEventsHandler.ts:1363` et `:3358`, `CallService.ts:1644-1669`).
> - **RC-4** (`tasks/calls-fonctionnel-todo.md`, double instance `CallService`) :
>   FIXED — `MeeshySocketIOManager.ts:212-213` cree l'unique instance partagee
>   et l'injecte dans `CallEventsHandler`; `server.ts:816` la decore sur
>   `fastify.callService` (consommee par `routes/calls.ts:80`); `CallCleanupService`
>   la recoit via `setCallService()` (`server.ts:1311`, cf. le commentaire
>   `RC-4` dans `CallCleanupService.ts:86-94`).
> - **Dead code** `CallEventsHandler.ts` `private getSocketUserId()` (releve par
>   un audit exploratoire cette session) : deja supprime entre-temps par un
>   agent concurrent — confirme absent du code actuel (repo multi-agent, `main`
>   force-push plusieurs fois pendant cette session).
> - **CallEventQueue** (`apps/ios/.../Services/CallEventQueue.swift`, actor FSM
>   type avec table de transition complete + `CallEventQueueTests.swift`) reste
>   **construit mais non cable** dans `CallManager.swift` (aucune reference
>   croisee) — c'est l'etape d'integration prevue par
>   `docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md` §2.2/ADR-2,
>   non tentee cette session : cable ce FSM dans un `CallManager` de 4783 lignes
>   sans pouvoir compiler/tester sur simulateur (pas de Xcode dans cet
>   environnement) serait une modification a fort risque sur une feature de prod
>   sans verification possible — a traiter dans une session avec acces build iOS.
> - Aucune regression, aucun nouveau P0/P1/P2 trouve cote gateway. Seuls
>   P0-1 (secret TURN prod, acces SSH requis) et P1-11 (arbitrage CallKit
>   deliberer, non validable sans device) restent ouverts, inchanges depuis
>   hier.

**Date** : 2026-05-11
**Branche auditee** : `fix/audit-2026-05-11-hotfixes`
**Methode** : 12 agents specialises en parallele (read-only) — iOS lifecycle, WebRTC, audio session, CallKit, NSE/VoIP push, UI, Gateway signaling, Gateway security, Web calls, Performance, Edge cases, Type alignment
**Perimetre** : iOS (apps/ios + MeeshySDK), Gateway (services/gateway), Web (apps/web), NSE (MeeshyNotificationExtension), Infrastructure (TURN/coturn)

---

## TL;DR

Le systeme d'appels Meeshy est **fonctionnellement operationnel** et a recu des fixes substantiels en mai 2026 (PR #226 anti-faux-appels, PR #227 e2e real calls + TURN, PR #228 perf -12% battery). Cet audit 360° revele cependant **5 P0 (bloquants/critiques) et 18 P1 (majeurs)** principalement concentres sur :

1. **Securite TURN** : secret hardcode dans le repo (vol de bande passante / amplification possible)
2. **Bridging NSE ⇄ App** : fuites silencieuses (App Group + Keychain mal configures) qui rendent le pre-fetch NSE inoperant
3. **Authz Socket calls** : utilisateurs anonymes peuvent initier des appels, `call:reconnecting`/`force-leave` non rate-limites et sans verification de membership
4. **Performance / Apple guidelines** : video continue d'encoder en background, idle timer jamais desactive, capturer non stoppe sur toggle off
5. **Multi-device** : aucun event `answered-elsewhere` cote iOS ⇒ second device ringe indefiniment

| Severite | iOS | Gateway | Web | Cross-cutting | **Total** |
|---|---|---|---|---|---|
| **P0** | 2 | 3 | 0 | 0 | **5** |
| **P1** | 9 | 4 | 0 | 5 | **18** |
| **P2** | 12 | 6 | 0 | 4 | **22** |
| **P3** | 8 | 3 | 0 | 2 | **13** |
| **Total** | **31** | **16** | **0** | **11** | **58** |

---

## 1. P0 — Hotfixes immediats

### P0-1 — TURN secret hardcode dans le repo (SECURITE)

- **Fichiers** :
  - `infrastructure/config/turnserver.conf:10` → `static-auth-secret=meeshy-turn-secret-CHANGE-IN-PRODUCTION`
  - `services/gateway/src/services/TURNCredentialService.ts:30` → fallback identique
  - `infrastructure/config/turnserver.prod.conf:10` → `__TURN_SECRET__` placeholder mais **aucun script de substitution dans `docker-compose.prod.yml`** ⇒ la prod tourne potentiellement avec le placeholder litteral
- **Impact** : tout attaquant ayant lu le repo peut forger des credentials HMAC valides (`HMAC-SHA1(secret, "<expiry>:<any>")`), relayer du trafic via le serveur TURN (vol de bande passante, amplification, pivot loopback `127.0.0.1:3000` car `network_mode: host` en prod).
- **Repro** : disponible dans le rapport agent 8 (script Python 6 lignes).
- **Fix** :
  1. Rotation immediate du secret en prod
  2. `TURNCredentialService.ts:28-31` → `throw new Error('[SECURITY] TURN_SECRET must be set')` si manquant ou `=== 'meeshy-turn-secret-CHANGE-IN-PRODUCTION'`
  3. Ajouter un entrypoint `sed` dans le service coturn de `docker-compose.prod.yml` qui substitue `__TURN_SECRET__` depuis `${TURN_SECRET}` env var
  4. Ajouter au `turnserver.conf` les denied-peer-ip pour `127.0.0.0/8`, `169.254.0.0/16` (metadata cloud), `::1`, `fc00::/7`

### P0-2 — NSE App Group ID mismatch (orthographe `apps` vs `app`)

- **Fichiers** :
  - `apps/ios/MeeshyNotificationExtension/NSEDataSync.swift:17` → `appGroupId = "group.me.meeshy.apps"` (avec `s`)
  - `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthManager.swift:78` → ecrit `meeshy_active_user_id` dans `UserDefaults(suiteName: "group.me.meeshy.app")` (**sans `s`**)
- **Impact** : `NSEDataSync.readAuthToken()` retourne toujours `nil` ⇒ tout le pre-fetch NSE (sync silencieux du message en cache local) est mort. Le fix SSRF audite le 2026-05-11 dans NSEDataSync est correct mais inatteignable.
- **Verification** : confirme par `grep` (cf. ci-dessous).
- **Fix** : aligner sur `"group.me.meeshy.apps"` partout (correspondance avec entitlements). Ecrire le `meeshy_active_user_id` dans le bon App Group au login.

### P0-3 — Keychain query NSE manque `kSecAttrAccessGroup`

- **Fichier** : `apps/ios/MeeshyNotificationExtension/NSEDataSync.swift:172-185`
- **Impact** : la NSE tourne dans son propre process avec son propre keychain access group par defaut. Sans `kSecAttrAccessGroup` explicite, `SecItemCopyMatching` cherche dans le mauvais groupe et retourne `errSecItemNotFound`.
- **Fix** : ajouter `kSecAttrAccessGroup as String: "$(AppIdentifierPrefix)me.meeshy.app"` dans la query (l'entitlement est correct, c'est juste la query qui doit le nommer explicitement).

### P0-4 — Gateway : `joinCall` accepte les appels en etat `missed`/`rejected`/`failed`

- **Fichier** : `services/gateway/src/services/CallService.ts:428`
- **Detail** : la garde verifie uniquement `CallStatus.ended`. La constante `TERMINAL_STATUSES` (lignes 18-23) liste correctement `ended/missed/rejected/failed` mais n'est jamais consultee ici.
- **Impact** : un callee qui recoit un push pour un appel deja timeout `missed` peut joindre — l'appel passe a `connecting` mais sans initiator en ligne, sans timeout ringing, sans path vers `ended`. Etat zombie permanent.
- **Fix** : remplacer le check par `if (TERMINAL_STATUSES.includes(call.status))`.

### P0-5 — Gateway : `'active' as any` / `'reconnecting' as any` dans 3 sites

- **Fichier** : `services/gateway/src/socketio/CallEventsHandler.ts:990, 1329, 1352`
- **Detail** : `updateCallStatus(data.callId, 'active' as any)` — le `.catch(() => {})` swallow les rejections silencieusement. Marche en dev avec un driver Prisma permissif, mais en prod strict ou apres une migration de schema, la transition `connecting → active` reste indefiniment dans l'etat precedent jusqu'au GC sweep (30s).
- **Fix** : remplacer par `CallStatus.active` / `CallStatus.reconnecting` (l'enum est deja importe ligne 13).

---

## 2. P1 — Bugs majeurs / misalignments

### iOS — Lifecycle & Concurrence

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-1 | `startCall` ignore l'ACK sur appel stale | `CallManager.swift:223-258` | Si user tape end <500ms avant ACK, le Task ressuscite l'appel apres `endCall` (re-arme mic + audio session sur appel deja annule) |
| P1-2 | `providerDidReset` race avec timer 1.5s settle | `CallManager.swift:1476` + `588-603` | Timer settle peut wiper `currentCallId/remoteUserId` mid-ring d'un nouvel appel arrivant <1.5s apres la fin du precedent |
| P1-3 | `WebRTCService.connectionState` mute off-actor | `WebRTCService.swift:32, 297-298` | Class `@unchecked Sendable` sans lock, mutee depuis `DispatchQueue.main.async`. Data race garanti TSAN |
| P1-4 | `qualityMonitorTimer` utilise encore `Timer.scheduledTimer` | `WebRTCService.swift:160` | PERF-011 (Tasks) a oublie ce timer. Inconsistant avec heartbeat/duration migrees |

### iOS — WebRTC & Codecs

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-5 | `setCodecPreferences` lit `rtpReceiverCapabilities` au lieu de sender | `P2PWebRTCClient.swift:250-253, 311` | Spec W3C : doit valider contre `RTCRtpSender.getCapabilities()`. RED a une negociation asymetrique → `setCodecPreferences` peut throw "Invalid codec" |
| P1-6 | `addTransportCC` insertion-point bug + collision extID | `P2PWebRTCClient.swift:746-775` | Insere extmap line **avant** les `a=rtcp-fb:` au lieu d'apres tous les extmap. Strict SDP parser distant rejette l'offer |
| P1-7 | Toggle video OFF n'arrete pas le capturer | `P2PWebRTCClient.swift:444-447` | Camera LED reste allumee, AVCaptureSession continue ~44 MB/s NV12 frames. Encoder recoit black frames mais capturer tourne → 80-150mA gaspilles |

### iOS — Audio Session

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-8 | `AudioPlayerManager.play()` ecrase la category `.playAndRecord` du call | `AudioPlayerManager.swift:59-61` | Ecouter un message vocal pendant un appel coupe completement le micro WebRTC (peer entend silence) |
| P1-9 | `AudioPlayerManager.stop()` `setActive(false)` sans check call active | `AudioPlayerManager.swift:131` | Tear down de la session pendant un appel ⇒ perte audio call jusqu'au prochain route change |
| P1-10 | `AudioRecorderManager` mode `.default` + `.allowBluetoothA2DP` | `AudioRecorderManager.swift:29` | Mauvais mode (pas d'EC/AGC sur les voice messages) + flap A2DP/HFP cause les ~200ms glitches deja audites |

### iOS — CallKit

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-11 | `CXEndCallAction.fulfill()` sync avant le Task d'endCall | `CallManager.swift:1490-1495` | CallKit considere l'appel termine et `didDeactivate` la session AVANT que `webRTCService.close()` ait tourne. Risque de `CXErrorCodeRequestTransactionError` |
| P1-12 | `reportOutgoingCall(connectedAt)` utilise pour incoming aussi | `CallManager.swift:840` | Sur le path callee (apres `CXAnswerCallAction`), CallKit ignore silencieusement → le timer Recents ne demarre jamais. Manque aussi `startedConnectingAt` pour outgoing |
| P1-13 | `toggleMute()` flip `isMuted` AVANT le `CXSetMutedCallAction` | `CallManager.swift:607-618` | Si `callController.request` echoue, etat app et UI systeme divergent permanentement |

### iOS — VoIP Push

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-14 | `sendVoIPPush` (gateway) omet `callerUserId` et `isVideo` | `services/gateway/src/services/PushNotificationService.ts:312-339` | Si ce code path est emprunte (recovery missed-call), tous les appels apparaissent comme audio-only, caller anonyme |
| P1-15 | `VoIPPushManagerTests` tautologique | `MeeshyTests/Unit/Services/VoIPPushManagerTests.swift:16` | `assert(token == nil || token != nil)` — false assurance de couverture. Le test ne couvre rien |

### iOS — UI

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-16 | `@ObservedObject = CallManager.shared` instantiation au declaration | `CallView.swift:10`, `IncomingCallView.swift:9` | Viole regle CLAUDE.md "@ObservedObject when RECEIVED, NEVER for instantiation" — subscription churn pendant ringing |
| P1-17 | Couleurs hex hardcodees (purple/teal/coral deprecated) | `CallView.swift:84,91,98,163,235,240,472,499,522`, `IncomingCallView.swift:59,112` | Doit utiliser `MeeshyColors.indigo*` + `conversation.accentColor`. Background `A855F7`/`08D9D6`/`FF2E63` = palette retiree |
| P1-18 | `UIScreen.main.bounds` pour position drag video preview | `CallView.swift:20, 312-313` | Deprecated iOS 16+, donne valeurs incorrectes en Stage Manager / iPad split view → preview offscreen |

### Gateway — Securite & Authz

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-19 | TURN coturn config ne deny pas loopback / link-local | `infrastructure/config/turnserver.{conf,prod.conf}:13-15` | Avec `network_mode: host`, attaquant valide credentials peut relayer vers `127.0.0.1:3000` (gateway) ou `169.254.169.254` (metadata cloud) |
| P1-20 | Anonymous users peuvent initier des appels via socket | `services/gateway/src/socketio/CallEventsHandler.ts:151-453` | REST `POST /api/calls` a `allowAnonymous: false` mais le handler socket `call:initiate` ne verifie pas `isAnonymous` (verifie seulement `userId != null`) |
| P1-21 | `call:reconnecting`/`reconnected` sans authz check | `CallEventsHandler.ts:1321-1361` | N'importe quel auth user peut flipper le status d'un callId arbitraire vers `reconnecting`/`active` (perturbe les appels en cours, bypass ringing) |
| P1-22 | `call:force-leave` sans rate limit, sans validation, sans membership check | `CallEventsHandler.ts:764-861` | Pas de Zod schema, pas de rate limit, pas de check membership conversation → user authentifie peut terminer tous les appels actifs de toutes les conversations dont il devine l'ID |

### Cross-cutting — Multi-device, Network, Type alignment

| # | Titre | Fichier | Resume |
|---|---|---|---|
| P1-23 | iOS `emitCallJoin` est fire-and-forget — drops TURN credentials ACK | `MessageSocketManager.swift:1241` | Path "callee qui rejoint via socket" construit `RTCPeerConnection` avec **STUN seulement**. Appels via NAT symetrique echouent silencieusement |
| P1-24 | `call:ended` payload drop le champ `reason` cote iOS | `MessageSocketManager.swift:438` | iOS `CallEndData` n'a pas `reason` → tous les remote ends sont indifferenciables (pas de UX distinct missed/rejected/connectionLost) |
| P1-25 | `call:missed` event sans listener iOS | gateway emet, SDK n'enregistre rien | Banner missed-call ne s'affiche jamais pour les utilisateurs en ligne |
| P1-26 | `call:initiated` iOS struct sans `participants[]` | `MessageSocketManager.swift:398` | Liste participants vide pendant ringing — UI affiche un participant blank jusqu'au premier `participant-joined` |
| P1-27 | Multi-device : second device ring indefiniment | `CallEventsHandler.ts:288-309` | Aucun emit/listen `call:already-answered` ou `answeredElsewhere`. iPad + iPhone du meme user → second device bloque sur ringing UI |
| P1-28 | Disconnect handler resout `userId` apres possible cleanup MeeshySocketIOManager | `CallEventsHandler.ts:1434-1437` | Si manager handler delete `socketToUser` en premier, `getUserId()` retourne `undefined` → auto-leave silently skip → calls jamais nettoyes en cas de disconnect abrupt |
| P1-29 | Callee qui leave en ringing → `ended` au lieu de `rejected` | `CallEventsHandler.ts:688-689` | Pas de missed-call push, pas de UX rejection sur l'initiator |
| P1-30 | Socket room `call:${callId}` perdu apres reconnect Socket.IO | `MessageSocketManager` reconnect handler | Audio peut continuer (ICE survit via NWPathMonitor) mais tous les events relayes par gateway (ICE candidates, re-offer, call:ended) sont silently drop |
| P1-31 | Pas d'observer `AVAudioSession.interruptionNotification` | `CallManager` | Apres interruption (appel cellulaire), iOS ne rappelle pas `didActivate`. `RTCAudioSession.isAudioEnabled` reste `false` indefiniment → silence permanent |

---

## 3. P0/P1 absents (verifications positives)

- ✅ **RTCCleanupSSL fix (commit `342c03a6`)** est solide : `RTCInitializeSSL()` une seule fois dans le `WebRTCSharedFactory.factory` static lazy, `P2PWebRTCClient.deinit` vide. Second-call-in-session OK.
- ✅ **iceCandidateBuffer** + `hasRemoteDescription` gate (`WebRTCService.swift:102-114`) : ICE candidates avant remote description correctement queued.
- ✅ **PR #228 verifie merged** dans la branche : PERF-001 (cached factory), PERF-002 (H264 pinned), PERF-003 (iceCandidatePoolSize=4), PERF-004 (ACK-aware answer), PERF-005 (transcription gating), PERF-010 (drop A2DP), PERF-011 (Tasks vs Timers, sauf qualityMonitorTimer), PERF-013/014/015 (video filter) tous presents.
- ✅ **Translator service (NLLB) bypassed pendant les calls** : `grep` confirme zero invocation.
- ✅ **Async EventEmitter handlers** wrapped en `try/catch` partout cote gateway (regle CLAUDE.md respectee).
- ✅ **Atomic `updateMany` pour ringing timeout** (audit 2026-05-11 fix) supprime le TOCTOU race.
- ✅ **Web calls implementation existante et complete** (`apps/web/components/video-calls/` + `video-call/` + `stores/call-store.ts` + `hooks/use-call-quality.ts`). Architecture Zustand + native RTCPeerConnection (P2P mesh). Heartbeat + beforeunload sendBeacon empechent les ghost calls.

---

## 4. P2 — A traiter (backlog)

### iOS

- **P2-iOS-1** `pendingIncomingCall` jamais clear dans `endCallInternal` (`CallManager.swift:1002-1059`) → banner pointe sur callId mort apres busy
- **P2-iOS-2** `applySpeakerRoute()` appelee avant que l'audio engine WebRTC soit pret (`CallManager.swift:1527`) → bouton speaker peut paraitre toggled mais audio reste sur earpiece
- **P2-iOS-3** `MediaSessionCoordinator` utilise `.allowBluetooth` deprecated au lieu de `.allowBluetoothHFP` (`MediaSessionCoordinator.swift:60`)
- **P2-iOS-4** `cancelRecording` ne deactive pas la session (`AudioRecorderManager.swift:79-91`) → micro indicator reste allume
- **P2-iOS-5** `maximumCallGroups = 2` mais `supportsHolding = false` partout (`CallManager.swift:121-123, 275-276`) → contradictoire, mettre `maximumCallGroups = 1`
- **P2-iOS-6** `handleRemoteReject` utilise `.remoteEnded` au lieu de `.declinedElsewhere` (`CallManager.swift:732`) → Recents iOS affiche "Ended" au lieu de "Declined"
- **P2-iOS-7** Mute button VoiceOver label statique (`CallView.swift:558`) → pas d'`accessibilityValue`, user VO ne sait pas l'etat
- **P2-iOS-8** Camera-flip button label "Camera" ambigu (`CallView.swift:434-441`)
- **P2-iOS-9** Animations pulse/ring sans check `accessibilityReduceMotion` (`CallView.swift:465-491`, `IncomingCallView.swift:51-95`)
- **P2-iOS-10** `connectionQuality` track par CallManager mais jamais expose dans la UI (`CallManager.swift:56` vs absence dans `CallView.connectedView`)
- **P2-iOS-11** `CallWaitingBannerView.show()` mute `@State` via struct copy (pattern fragile, autoDismissSeconds non utilise)
- **P2-iOS-12** Stats interval 3s aggressif (`WebRTCTypes.swift:164`) → bumper a 5s steady-state, 2s seulement en `.reconnecting`

### Gateway

- **P2-GW-1** `io.fetchSockets()` O(N) sur tous les sockets a chaque `call:initiate` (`CallEventsHandler.ts:288`) → utiliser `io.in(ROOMS.user(userId)).fetchSockets()`
- **P2-GW-2** `callType` hardcode `'video'` dans missed-call push (`CallEventsHandler.ts:1620` TODO)
- **P2-GW-3** `markCallAsMissed` non-atomic avec ringing timeout (`CallService.ts:789-823`) — peut overwrite `endedAt`/`duration`
- **P2-GW-4** TTL TURN credentials 3600s = fenetre d'abus large (10 min serait plus serre)
- **P2-GW-5** `updateParticipantMedia` recoit `userId` mais Prisma query sur `participantId` (`CallEventsHandler.ts:1057-1061` + `CallService.ts:753-762`) → match jamais → audio/video toggle silently fail
- **P2-GW-6** `call:force-leave` sans membership check (`CallEventsHandler.ts:781-800`)

### Cross-cutting

- **P2-CC-1** Pas de queue d'enregistrement VoIP token si pas encore loggue (`VoIPPushManager.registerTokenWithBackend`)
- **P2-CC-2** Phone-call interruption non geree → ses 5s+ post-cellular silence (P1-31 detaille)
- **P2-CC-3** `AudioRecorderManager.startRecording()` sans interlock avec `CallManager.shared.callState.isActive` → conflit session
- **P2-CC-4** Pas de `seenCallIds` dedup dans `VoIPPushManager` → push duplique = 2 entries CallKit avec UUID differentes

---

## 5. P3 — Polish, code quality

- iOS : `signalOfferCancellable` declare jamais assigne (`CallManager.swift:95`) ; 30s SDP-offer timeout Tasks non stockes (mini-leak) ; logs `Logger.webrtc.info` dans `startLocalMedia` (11 calls par setup, devrait etre `.debug`) ; getStats logs every 3s en release ; H264 codec ordering ne discrimine pas Baseline vs High profile ; `endReasonText` String localized keys non verifiees ; `IncomingCallView` redondant avec CallView background.
- Gateway : `socket.on.bind(socket)` alias inutile et trompeur (`CallEventsHandler.ts:1434`) ; `markCallAsMissed` redondant avec timeout `updateMany` ; `CallCleanupService` GC peut emit duplicate `call:ended`.
- Type alignment : `call:force-leave` non present dans `CALL_EVENTS` constant map.

---

## 6. Matrice d'alignement type SDK ↔ Gateway ↔ iOS

| Event / Type | Gateway | iOS | Statut | Severite |
|---|---|---|---|---|
| `call:initiate` (C→S) | `CALL_EVENTS.INITIATE` | `emitWithAck` ✅ | Aligne | OK |
| `call:initiated` (S→C) | inclut `participants[]` | `CallOfferData` sans `participants` | **Mismatch** | P1-26 |
| `call:join` (C→S) | attend ACK avec `iceServers` | fire-and-forget | **Mismatch** | P1-23 |
| `call:participant-joined` | participant + mode + iceServers | `CallParticipantData` flexible | OK | — |
| `call:participant-left` | event dedie | meme struct reutilisee | OK | — |
| `call:signal` | `CallSignalEvent` | dict manuel decode | OK (opaque pass-through) | — |
| `call:ended` | inclut `reason: CallEndReason` | `CallEndData` SANS `reason` | **Mismatch** | P1-24 |
| `call:missed` | emit | **pas de listener iOS** | **Missing** | P1-25 |
| `call:already-answered` | declare | **pas de listener iOS** | **Missing** | P2-CC-multi |
| `call:media-toggled` | event dedie | aligne | OK | — |
| `call:error` | `CallError` typed | `CallErrorData` widened | OK | — |
| `call:force-leave` | string literal | non present `CALL_EVENTS` | **Constant manquant** | P3 |
| `call:initiate` ACK | `CallInitiateAck` | aligned via sub-decode | OK | — |
| `call:join` ACK | `CallJoinAck` avec iceServers | non await | **Drop ACK** | P1-23 |
| TURN ICE format | `urls: string` | `IceServerURLs` flexible | OK (iOS gere les 2) | — |
| VoIP push payload | `{ type, callId, callerName, callerUserId, callerAvatar, isVideo, iceServers }` | aligned | OK (sauf P1-14) | P1-14 |

---

## 7. Couverture / Gaps de tests

- ❌ `CallManagerTests` couvre 0 tests behavioraux du flow 2nd-call-in-session, 0 pour la P1-1/P1-2 race (settle window, late ACK)
- ❌ `VoIPPushManagerTests` 100% tautologique
- ❌ Aucun test sur `addTransportCC`/`addVideoBitrateHints` SDP parse
- ❌ Aucune verification BG/FG transition (PERF reactive)
- ❌ `CallEventQueue.swift` est un scaffold Phase 0 — actor non wire, donc tous les transitions FSM restent sur `@MainActor` direct sans barriere d'arbitrage
- ❌ Pas d'audit trail persistant pour les call events (logs Pino ephemeral en Docker — GDPR Art. 30)
- ❌ Pas de measurement Energy Log Instruments verifiant la claim PR #228 -12% battery
- ❌ Pas d'adaptation bitrate par network type (cellular vs Wi-Fi — `isExpensive`)

---

## 8. Ordre de remediation recommande

### Sprint immediat (1-2 jours)

1. **P0-1** TURN secret rotation + `throw on default` + ajouter denied-peer-ip loopback/metadata (`infrastructure/config/turnserver.conf`, `TURNCredentialService.ts`, `docker-compose.prod.yml`)
2. **P0-4 + P0-5** Fixes Gateway : `joinCall` guard sur `TERMINAL_STATUSES`, remplacer `'X' as any` par enum (`CallService.ts`, `CallEventsHandler.ts`)
3. **P0-2 + P0-3** Aligner App Group ID a `group.me.meeshy.apps` partout + ajouter `kSecAttrAccessGroup` au keychain query NSE
4. **P1-20 + P1-22** Bloquer anonymous sur `call:initiate`/`call:join` socket + ajouter rate limit + Zod + membership check sur `call:force-leave`

### Sprint S+1 (3-5 jours)

5. **P1-23** Convertir `emitCallJoin` en `emitWithAck`, recuperer iceServers TURN
6. **P1-24 + P1-25 + P1-27** Ajouter `reason` dans `CallEndData`, ecouter `call:missed`, ecouter `call:already-answered` cote iOS + emit cote gateway sur `call:join` multi-device
7. **P1-7** Stopper le capturer dans `toggleVideo(false)` + redemarrer dans `toggleVideo(true)`
8. **P1-8 + P1-9 + P1-10** Interlock `AudioPlayerManager`/`AudioRecorderManager` avec `CallManager.callState.isActive`
9. **P1-11 + P1-13** Reorganiser les `action.fulfill()` apres l'async work + `toggleMute` ne mute qu'apres ack CallKit
10. **P1-30** `MessageSocketManager` reconnect handler doit re-emit `call:join` si `callState.isActive`
11. **P1-31** Observer `AVAudioSession.interruptionNotification` + replay `isAudioEnabled = true` sur shouldResume

### Sprint S+2 (perf + UX)

12. Idle timer disable pendant l'appel (gap quantique : pas de P0/P1 ID assigne mais critique UX)
13. Stop video on background (Apple guideline)
14. Bitrate adaptatif cellular vs Wi-Fi (P1-bitrate-cap : 2.5 Mbps → 800-1200 kbps cellular)
15. Migrer `qualityMonitorTimer` en Task (P1-4)
16. Fixer `setCodecPreferences` sender (P1-5) + `addTransportCC` insertion-point (P1-6) + Opus stereo=0 (P2)
17. Ajouter connectionQuality indicator dans la UI (P2-iOS-10)
18. Couleurs : remplacer hex deprecated par `MeeshyColors.indigo*` + `conversation.accentColor` (P1-17)
19. Accessibility : VoiceOver labels dynamiques + `reduceMotion` checks (P2-iOS-7/8/9)

### Backlog post-launch

- Tous les P3, polish UX (PiP system avec `AVPictureInPictureController`, group calls future, simulcast pour SFU futur)
- Audit trail persistant call events (GDPR)
- Measurement Energy Log Instruments verifiant -12% battery
- Tests complets : VoIPPushManager non-tautologique, CallManager scenarios reels (2nd call, settle race, late ACK)

---

## 9. Notes pour les developpeurs

- **Le sous-systeme calls est globalement solide** apres PR #226/#227/#228. Les hotfixes critiques sont concentres sur la securite TURN et les ponts NSE/App ; le reste du systeme tient bien en charge.
- **Multi-device est le plus gros trou produit** : les utilisateurs avec iPad+iPhone vont avoir une mauvaise experience (second device ringe permanent). Doit etre adresse avant tout marketing visant les power users.
- **Les misalignments d'event types** sont historiques (le SDK a evolue moins vite que le gateway). Une session de cleanup gateway↔SDK alignment est recommandee.
- **La performance** est honnete (PR #228 merged) mais des optimisations evidentes manquent (idle timer, stop capturer en BG, bitrate cellular adaptatif). Ces 3 items meritent un sprint perf dedie.
- **L'absence totale de tests behavioraux solides** est inquietante pour un sous-systeme aussi sensible. Un test `test_secondCall_inSameAppSession_succeeds` aurait detecte le bug de `342c03a6` avant le shipping.

---

**Auditeurs** : 12 agents Claude (ios-architect-expert, feature-dev:code-reviewer, microservice-code-reviewer, security-reviewer, performance-benchmarker, Explore)
**Lecture des fichiers** : ~62 fichiers iOS/Swift, ~14 fichiers gateway TS, ~8 fichiers infrastructure, ~12 fichiers SDK Swift, packages/shared/types/* relevant
**Total tokens consommes** : ~1.07 M (12 agents en parallele)
