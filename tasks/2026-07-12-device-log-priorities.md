# Priorités issues du log device instrumenté (2026-07-12)

Classification des problèmes révélés par le log device (build instrumentée, sonde
`🩺RENDER` + `_printChanges`). Cause racine du crash **prouvée puis reproduite** :
watchdog scene-update `0x8BADF00D` en arrière-plan pendant un appel.

## Comment utiliser ce fichier avec /loop

Résous **un item par itération**, dans l'ordre (P0 → P1 → P2 → P3). À chaque item :
1. `systematic-debugging` : prouver la cause avant tout fix (log = evidence, ne pas deviner).
2. TDD quand c'est testable (gateway Jest, iOS XCTest, ViewModels). Fix View-only = build + sonde.
3. **Commit propre par item** (conventionnel, FR, **sans** trailer Co-Authored-By).
4. `git checkout -- apps/ios/Meeshy/Localizable.xcstrings` avant chaque commit iOS (churn Xcode).
5. Ne PAS toucher aux fichiers web non créés par la session (travail parallèle user).
6. Cocher l'item ici + noter le hash de commit.
7. iOS : `./apps/ios/meeshy.sh build` doit être vert (grep le log). Gateway : suite Jest verte + `tsc --noEmit` clean.

Verif device réelle (watchdog) = **absence de SIGKILL** pendant un appel backgroundé long.

---

## P0 — Critique (cause du crash / rupture) — ✅ TERMINÉ

- [x] **#1 — RootView/iPadRootView ↔ CallManager (CAUSE DU WATCHDOG)** — `872f7480b`
  Les 4 modifiers d'appel lisaient `CallManager.shared` dans le body → chaque tick
  `callDuration` 1 Hz + stats qualité WebRTC invalidait TOUT le body, même en BG →
  tempête re-layout CoreText → SIGKILL. Fix : `CallPresentationLayer` (ViewModifier
  partagé) porte l'unique observation. Découplage garanti à la compilation.

- [x] **#2 — RootView/iPadRootView ↔ ConversationListViewModel (re-render idle)** — `9e1095751`
  `_conversationViewModel changed` en rafale même sans appel (presence, reloadFromCache).
  Body ne lit aucun @Published du VM. Fix : `ConversationListVMOwner` (ObservableObject
  @MainActor sans @Published) possède le VM ; propriété calculée `conversationViewModel`.

- [x] **#3 — Bulles « Appel … en cours » orphelines (REST end/leave)** — `dcd0f3220`
  Routes REST end/leave finalisaient le CallSession sans poster le summary → bulle live
  jamais finalisée. Fix : `CallService.finalizeCallSummary()` (réutilise le hook reaped
  câblé), appelé par les 2 routes. TDD 3 tests, suite CallService 193/193, tsc clean.

---

## P1 — Majeur (dégradation sévère)

- [x] **#4 — Requêtes réseau catastrophiques (24,7 s / 25 s / 14,6 s)** — investigué : environnemental + volume (→ #5/#6/#8)
  Evidence : `GET /conversations/…/messages network=24717ms`, `GET /conversations?limit=100 network=24913ms`.
  Hypothèse : latence backend prod **OU** contention client (head-of-line : le flood
  presence/engagement sature la pool URLSession et bloque le fetch des messages).
  Fichiers : couche réseau SDK (`packages/MeeshySDK/.../Networking/APIClient*`), le logger « Slow request ».
  Fix piste : `httpMaximumConnectionsPerHost`, timeouts + annulation par requête, prioriser
  messages > presence/engagement. ⚠️ Partiellement **environnemental** — mesurer d'abord
  (le 24 s est-il réseau device ou backend ?) avant de coder. Ne pas chasser un fantôme prod.
  **Conclusion (systematic-debugging, evidence code)** : cause « head-of-line client » **réfutée**.
  (a) `APIClient` est `final class` (pas actor) et appelle `await session.data(for:)` sans
  sérialisation → aucune file applicative bloquable. (b) `assumesHTTP3Capable=true` + HTTP/2
  multiplexent les streams sur 1 connexion/host → pas d'épuisement de pool (le scénario 6-conn
  n'existe qu'en HTTP/1.1, improbable ici). (c) `network=24717ms` est mesuré autour de
  `session.data(for:)` = temps réseau réel de la requête, pas du queuing client. → Le 24 s est
  **backend/réseau device** (le fantôme prod à ne pas chasser), amplifié par le **volume** de
  requêtes. Actionnable **uniquement** via #5 (flush non-bloquant), #6 (backoff 429) et #8
  (chunk presence). Aucun fix client indépendant pour #4 (`httpMaximumConnectionsPerHost` =
  spéculatif, sans effet sous HTTP/2/3). **Aucun code produit — décision volontaire.**

- [x] **#5 — engagement.flush bloque 15-35 s** — `39c0480fe`
  Evidence : `Step engagement.flush took 35.34s / 21.59s / 15.45s`.
  Hypothèse : le batcher d'engagement/impressions poste en série et attend les retries 429.
  Fichiers : batcher engagement/impression iOS (cf. projet `post_view_impression_counters`).
  Fix piste : cap taille de batch, timeout, flush non-bloquant, respect du backoff 429 (#6). Lié à #6.
  **Cause prouvée** : `EngagementOutbox.flush` dispatch ≤50 sessions **en série** (1 POST/session
  sur `/posts/engagement/batch` — le client n'utilise pas le batch !) ; sous 429, chaque session
  bloque ~30 s → 15-35 s à **bloquer la background-task budget** = risque watchdog 0x8BADF00D (P0).
  **Fix** : rows durables (SQLite) + retentées par `EngagementRetryScheduler` → flush NON critique.
  `runBounded(seconds: 8)` (app) borne le step BG ; au-delà, abandon au retry scheduler. Boucle
  `flush` SDK rendue cancellation-aware (break sur `Task.isCancelled`) pour un bound prompt. TDD ×2.
  Build iOS vert. **Reste ouvert (perf, pas watchdog) → #6** : le vrai batching (1 POST/N sessions)
  + backoff 429 réduiront le 35 s réseau lui-même.

- [x] **#6 — 429 rate-limit sur POST /posts/engagement/batch** — `57f76b902`
  Evidence : `Retryable status 429 on POST /posts/engagement/batch retry 1/3 after 30.0s` ×3.
  Hypothèse : le client martèle l'endpoint ; le retry fixe (30 s) ignore `Retry-After`.
  Fichiers : batcher engagement iOS + rate-limit gateway de cette route.
  Fix piste : respecter `Retry-After`, backoff exponentiel + jitter, coalescer/réduire la fréquence.
  **Cause prouvée** : rate-limit gateway `engagement` = **20/min/user** ; le client postait **1 POST
  PAR session** (`EngagementDispatcher.dispatch` → `record([session])`) dans la boucle série de
  l'outbox → ≤50 POST/flush → 429. L'endpoint accepte pourtant un **tableau**. (L'hypothèse
  « ignore Retry-After » est **fausse** : `APIClient.retryDelay` respecte déjà `min(Retry-After,30)`
  + exponentiel `1<<attempt` ; l'outbox a aussi `pow(2,n)*5`.)
  **Fix** : `EngagementOutbox.flush` dispatch TOUTES les sessions prêtes en **UN** POST (1 req ≪ 20/min) ;
  `dispatch([sessions])` filtre le cross-user avant POST. Jitter **non nécessaire** une fois batché
  (les rows partent en 1 POST → pas de thundering herd). TDD ×5. Build iOS vert. Résout aussi le
  35 s réseau résiduel de #5.

- [x] **#7 — « Publishing changes from within view updates is not allowed »** — `1b1e4668b`
  Evidence : warning couplé à `_systemColorScheme changed` → `_theme changed`.
  Hypothèse : `ThemeManager` republie un @Published PENDANT l'évaluation du body (sync
  colorScheme→theme) → comportement indéfini + rendus parasites, sur le chemin de RootView.
  Fichiers : `ThemeManager` (sync systemColorScheme→theme), `MeeshyUI/Theme/`.
  Fix piste : différer la mutation (`Task { @MainActor }` / `DispatchQueue.main.async`) ou
  passer par `adaptiveOnChange(of: colorScheme)` au lieu de calculer dans le body. Testable.
  **Cause prouvée** : `SystemThemeDetector` (chemin RootView, `MeeshyApp`) appelle
  `ThemeManager.shared.syncWithSystem` (via `adaptiveOnChange`/`onAppear`), qui mutait
  `@Published mode` **synchronement** → `objectWillChange` du theme émis DANS la transaction
  SwiftUI déclenchée par le changement de colorScheme (lui-même observé sur RootView).
  **Fix** : la mutation de `mode` est différée sur le tour main-actor suivant (`Task { @MainActor }`,
  re-check preference/mode). Corrige tous les call sites au niveau racine. `ThemeManager` = singleton
  (`init` privé) → pas de TDD propre sans refactor hors-scope ; vérif absence-warning = **sonde device**
  (P0). Build iOS vert.

- [x] **#8 — Presence : 200 ids dans UNE URL géante (5,1 s, fragile)** — `ed0380dcf`
  Evidence : `GET /users/presence?ids=<200 ids> network=5118ms`, `Refreshed presence for 200 ids` en boucle.
  Hypothèse : URL énorme (limite de longueur, fragile) + requête lente.
  Fichiers : `PresenceManager` (fetch presence).
  Fix piste : chunker (ex. 50/req) ou passer en POST body ; borner la fréquence de refresh.
  **Cause prouvée** : `PresenceService.performRefresh` joignait ≤200 ObjectIds en UNE query `?ids=`
  → URL ~5 KB, lente + fragile vs limites header. **Fix** : chunk par 50, fetch **concurrent**
  (`withTaskGroup`) + ingest progressif → URLs ~1,3 KB, 1re salve rafraîchit l'UI sans attendre
  (préserve l'intention « refresh rapide »). `Array.chunked(into:)` pur + testé (200→4×50). Build vert.
  **La FRÉQUENCE « en boucle » relève du churn socket → #11**, pas de ce fix.

---

## P2 — Modéré (signaling appels / socket)

- [x] **#9 — `call:join NOT ACKed` → appel entrant raté (`rawReason=missed`)** — `8a2712e0b` (hardening)
  Evidence : `[CALL_JOIN] call:join NOT ACKed` puis `Call ended by remote … missed`.
  Hypothèse : race de join (ACK manquant/tardif) → l'appel entrant se termine en « manqué ».
  Fichiers : `CallEventsHandler` call:join (gateway), `MessageSocketManager` emit join (iOS).
  Cf. mémoire `reference_android_webrtc_call_signaling_gotchas` (join-with-ACK). Fix : ACK + retry join.
  **Investigation** : reliable-join + ACK + retry **existent déjà** (`joinCallRoomReliably`, fix 2026-07-02).
  Rate-limit `CALL_JOIN` = 20/min = généreux → écarté. Cause prouvable par le code : le gateway n'ACK
  le succès qu'**après** `joinCall` (Prisma tx + génération TURN + `fetchSockets`), or le timeout ACK
  client était **3 s** → un join lent-mais-réussi = false `NOT ACKed` → retry redondant grignotant le
  budget ring → `missed`. **Fix (hardening)** : timeout ACK 3→6 s (≪ ring 45 s). **Preuve définitive
  = repro 2 devices (P0 en attente)** — pas cleanly unit-testable (constante socket). Build vert.

- [x] **#10 — `MessageSocket error: Tried emitting when not connected`** — `fe7bb99f6`
  Evidence : 2× pendant transitions BG.
  Fichiers : `MessageSocketManager` (emit). Fix : garder l'emit sur l'état de connexion / file d'attente.
  **Cause prouvée** : des emits fire-and-forget non-call (heartbeat périodique, `conversation:leave`,
  typing) partaient **sans garde** pendant que la socket se suspendait en BG. `joinConversation`
  gardait déjà `status == .connected`, pas les autres. **Fix** : helper `safeEmit` gardé, appliqué à
  heartbeat/leave/typing (le re-join loop + heartbeat timer reprennent au reconnect). Emits d'appel
  ACK-bearing NON touchés (sous-système délicat, chemins dédiés). Build vert.

- [x] **#11 — Churn socket disconnect/reconnect à chaque transition BG** — `4c87d81d0`
  Evidence : `MessageSocket disconnected` / `reconnected — re-joined 0 room(s)` répétés.
  Fichiers : cycle de vie socket (gestion background). Fix : debounce/grâce avant suspend ;
  vérifier le re-join des rooms (0 room parfois). Note : « Skipping socket suspend — call active » OK.
  **Cause prouvée** : `.active` lançait `forceReconnect` **inconditionnel**. Or `.active` suit aussi un
  `.inactive` transitoire (Control Center, bannière, peek, Face ID) sans `.background` → tear-down +
  rebuild d'une socket saine. **Fix** : flag `didEnterBackground` (posé en `.background`, consommé en
  `.active`) → rearme seulement après un vrai background. N'affaiblit PAS l'invariant « isConnected ment
  après suspension » (ne vaut qu'après un vrai background). Cold launch : `RootView.connect()` fait la
  connexion. **Le « re-joined 0 room(s) » est LÉGITIME** : `suspendTransport` préserve
  `joinedConversations` (seul logout le vide) → 0 rooms = background sans conversation ouverte. La grâce/
  debounce avant suspend est **écartée** (rouvrirait le bug « isConnected ment » : `Task.sleep`
  n'avance pas gelé, downside sévère = socket morte silencieuse). Build vert.

- [x] **#12 — Interaction avec appel déjà terminé** — `c813214ea`
  Evidence : `call:error CALL_ENDED "already ended"`, `call_cancel push ignored — no matching incoming ring`.
  Fichiers : garde client sur états terminaux ; alignement du cancel push. Lié à #3/#9.
  **Cause prouvée** : `call:error CALL_ENDED` tombait au **fallback** du handler → toast d'ERREUR user
  + `failCall` (marque un appel sainement terminé comme « échoué » dans Recents). C'est une race d'état
  terminal bénigne. **Fix** : router `CALL_ENDED` vers `handleRemoteEnd` (canonique, call-scoped, dedup
  `.ended`, mapping CX reason, teardown+CallKit) — plus de toast ni `failCall`. **Le `call_cancel push
  ignored` est une GARDE INTENTIONNELLE bénigne** (`CallReliabilityPolicy.shouldEndRingingOnCancellation` :
  un cancel tardif/rejoué au callId non-courant est ignoré à raison). Build vert.

- [x] **#13 — VoIP token re-registration churn** — `10090ecd2`
  Evidence : `VoIP push unregistered` → `registration started` → `force re-registration triggered`.
  Hypothèse : la garde « same token registered Xs ago » est court-circuitée par le force-re-register.
  Fichiers : enregistrement VoIP push (iOS). Fix : dédupliquer, ne pas forcer si token identique récent.
  **Cause prouvée** : `forceReregister` = `unregister()`+`register()` **inconditionnel** (teardown/rebuild
  PKPushRegistry, nil le token + re-délivre), bypassant la garde cooldown qui ne protège que le POST
  serveur (`registerTokenWithBackend`). D'où le churn sur logins/foregrounds répétés. **Fix** : prédicat
  pur `shouldSkipForceReregister` → skip le cycle PushKit si token **inchangé & dans le cooldown (300 s)** ;
  un token invalidé (`voipToken==nil`) ou stale force toujours un cycle complet. TDD 4 cas. Build vert.

---

## P3 — Mineur / config / bruit

- [x] **#14 — Firebase non configuré (Crashlytics/Analytics NoOp)** — décision : NoOp intentionnel (no-code)
  Evidence : `Firebase not configured … NoOp`, `FirebaseApp not configured: screen_view`.
  Attendu en debug, mais = **pas de crash-reporting** sur cette build. Décider : ajouter
  `GoogleService-Info.plist` (debug) ou documenter le NoOp intentionnel.
  **DÉCISION : garder le NoOp intentionnel — AUCUN code, AUCUN secret ajouté.** Preuve (design
  délibéré, `AppDelegate.bootCrashReporting`) : (1) le plist est **gitignored** (secrets hors repo) ;
  (2) le gate `Bundle.main.path(GoogleService-Info)` → `NoOpCrashReporter` si absent ; (3) **même avec
  le plist, `#if DEBUG` désactive la collecte** (`setCrashlyticsCollectionEnabled(false)` + NoOp) pour
  ne pas polluer le dashboard prod ; (4) **Release** a le vrai `CrashlyticsReporter` + tagging build.
  Ajouter un plist debug **n'activerait pas** le reporting (DEBUG le désactive). **Note opérationnelle** :
  pour capturer les crashs du device-test watchdog, utiliser un **build Release/TestFlight** (Crashlytics
  actif), pas un build Debug. Le design est déjà documenté dans le code (AppDelegate 365-401).

- [ ] **#15 — App Group CFPrefs mal lu**
  Evidence : `Couldn't read values … group.me.meeshy.apps … kCFPreferencesAnyUser … detaching from cfprefsd`.
  Fix : accès App Group via `UserDefaults(suiteName:)` correct (pas AnyUser sur container).

- [ ] **#16 — Hygiène SwiftUI**
  Evidence : `NavigationRequestObserver tried to update multiple times per frame`,
  `Snapshotting … UIKeyboardImpl … afterScreenUpdates:YES`, `RTIInputSystemClient … valid sessionID`,
  `UIContextMenuInteraction … no context menu visible`. Warnings cosmétiques, traiter au cas par cas.

- [ ] **#17 — Bruit système (probablement non actionnable)**
  Evidence : `FigApplicationStateMonitor signalled err=-19431`, `XPC connection interrupted`,
  `nw_connection … on unconnected`, `Result accumulator timeout`. Vérifier qu'aucun ne masque
  un vrai bug ; sinon documenter comme bruit OS et clore.

---

## Journal
- 2026-07-12 : P0 #1/#2/#3 livrés sur `main` (`872f7480b`, `9e1095751`, `dcd0f3220`).
  Sonde `🩺RENDER` retirée. xcstrings reverté. Suite CallService verte, builds iOS verts.
- 2026-07-12 : #4 investigué → **environnemental** (backend/réseau device) + volume. Cause
  client HoL réfutée par le code (APIClient non-actor sans sérialisation ; HTTP/2/3 multiplexé).
  Pas de fix client indépendant ; effort réel basculé sur #8/#6/#5. Doc-only.
- 2026-07-12 : #5 livré `39c0480fe` — flush engagement borné (`runBounded` 8 s) + boucle SDK
  cancellation-aware. Supprime le blocage 15-35 s de la transition BG (anti-watchdog). Build vert.
  Le batching réel (perf réseau) reste pour #6.
- 2026-07-12 : #6 livré `57f76b902` — batch le flush en 1 POST/≤50 sessions (rate-limit 20/min).
  Supprime le martèlement 429 ET le 35 s réseau résiduel de #5. Filtre cross-user pré-POST. Build vert.
- 2026-07-12 : #7 livré `1b1e4668b` — `ThemeManager.syncWithSystem` différé (Task @MainActor) hors
  passe d'update SwiftUI. Supprime le warning « publishing within view updates » + renders parasites
  sur le chemin RootView (P0). Build vert ; vérif finale = sonde device.
- 2026-07-12 : #8 livré `ed0380dcf` — refresh presence chunké (50/req concurrent) au lieu d'1 URL de
  200 ids. Tue la fragilité URL ~5 KB + latence 5,1 s. **P1 (#4-#8) entièrement clos.** Build vert.
  (1er build #8 rouge = 3 erreurs isolation Swift 6 sur `nonisolated fetchChunk` → corrigé.)
- 2026-07-12 : #9 (P2) hardening `8a2712e0b` — timeout ACK `call:join` 3→6 s. L'ACK succès gateway
  arrive après `joinCall` (DB+TURN) ; 3 s trop serré → false `NOT ACKed` + retry gâchant le ring →
  `missed`. Reliable-join/ACK/retry préexistaient. Preuve finale = repro 2 devices.
- 2026-07-12 : #10 livré `fe7bb99f6` — helper `safeEmit` gardé sur `status == .connected` pour les
  emits fire-and-forget (heartbeat/leave/typing). Supprime « Tried emitting when not connected » en BG.
- 2026-07-12 : #11 livré `4c87d81d0` — flag `didEnterBackground` : la socket ne se rearme qu'après un
  vrai `.background`, plus sur les `.inactive→.active` transitoires. Tue le churn évitable. « 0 room(s) »
  jugé légitime. Grâce-avant-suspend écartée (risque « isConnected ment »).
- 2026-07-12 : #12 livré `c813214ea` — `call:error CALL_ENDED` routé vers `handleRemoteEnd` (réconciliation
  terminale) au lieu du toast+`failCall`. `call_cancel push ignored` = garde intentionnelle bénigne.
- 2026-07-12 : #13 livré `10090ecd2` — `forceReregister` dédupliqué sur le cooldown (prédicat pur testé).
  Tue le churn PushKit. **P2 (#9-#13) entièrement clos.**
- 2026-07-12 : #14 (P3) décision no-code — NoOp Firebase intentionnel (plist gitignored ; DEBUG désactive
  la collecte ; Release a Crashlytics). Device-test crash → build Release. Aucun secret ajouté.
