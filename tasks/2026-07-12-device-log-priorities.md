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

- [ ] **#6 — 429 rate-limit sur POST /posts/engagement/batch**
  Evidence : `Retryable status 429 on POST /posts/engagement/batch retry 1/3 after 30.0s` ×3.
  Hypothèse : le client martèle l'endpoint ; le retry fixe (30 s) ignore `Retry-After`.
  Fichiers : batcher engagement iOS + rate-limit gateway de cette route.
  Fix piste : respecter `Retry-After`, backoff exponentiel + jitter, coalescer/réduire la fréquence.

- [ ] **#7 — « Publishing changes from within view updates is not allowed »**
  Evidence : warning couplé à `_systemColorScheme changed` → `_theme changed`.
  Hypothèse : `ThemeManager` republie un @Published PENDANT l'évaluation du body (sync
  colorScheme→theme) → comportement indéfini + rendus parasites, sur le chemin de RootView.
  Fichiers : `ThemeManager` (sync systemColorScheme→theme), `MeeshyUI/Theme/`.
  Fix piste : différer la mutation (`Task { @MainActor }` / `DispatchQueue.main.async`) ou
  passer par `adaptiveOnChange(of: colorScheme)` au lieu de calculer dans le body. Testable.

- [ ] **#8 — Presence : 200 ids dans UNE URL géante (5,1 s, fragile)**
  Evidence : `GET /users/presence?ids=<200 ids> network=5118ms`, `Refreshed presence for 200 ids` en boucle.
  Hypothèse : URL énorme (limite de longueur, fragile) + requête lente.
  Fichiers : `PresenceManager` (fetch presence).
  Fix piste : chunker (ex. 50/req) ou passer en POST body ; borner la fréquence de refresh.

---

## P2 — Modéré (signaling appels / socket)

- [ ] **#9 — `call:join NOT ACKed` → appel entrant raté (`rawReason=missed`)**
  Evidence : `[CALL_JOIN] call:join NOT ACKed` puis `Call ended by remote … missed`.
  Hypothèse : race de join (ACK manquant/tardif) → l'appel entrant se termine en « manqué ».
  Fichiers : `CallEventsHandler` call:join (gateway), `MessageSocketManager` emit join (iOS).
  Cf. mémoire `reference_android_webrtc_call_signaling_gotchas` (join-with-ACK). Fix : ACK + retry join.

- [ ] **#10 — `MessageSocket error: Tried emitting when not connected`**
  Evidence : 2× pendant transitions BG.
  Fichiers : `MessageSocketManager` (emit). Fix : garder l'emit sur l'état de connexion / file d'attente.

- [ ] **#11 — Churn socket disconnect/reconnect à chaque transition BG**
  Evidence : `MessageSocket disconnected` / `reconnected — re-joined 0 room(s)` répétés.
  Fichiers : cycle de vie socket (gestion background). Fix : debounce/grâce avant suspend ;
  vérifier le re-join des rooms (0 room parfois). Note : « Skipping socket suspend — call active » OK.

- [ ] **#12 — Interaction avec appel déjà terminé**
  Evidence : `call:error CALL_ENDED "already ended"`, `call_cancel push ignored — no matching incoming ring`.
  Fichiers : garde client sur états terminaux ; alignement du cancel push. Lié à #3/#9.

- [ ] **#13 — VoIP token re-registration churn**
  Evidence : `VoIP push unregistered` → `registration started` → `force re-registration triggered`.
  Hypothèse : la garde « same token registered Xs ago » est court-circuitée par le force-re-register.
  Fichiers : enregistrement VoIP push (iOS). Fix : dédupliquer, ne pas forcer si token identique récent.

---

## P3 — Mineur / config / bruit

- [ ] **#14 — Firebase non configuré (Crashlytics/Analytics NoOp)**
  Evidence : `Firebase not configured … NoOp`, `FirebaseApp not configured: screen_view`.
  Attendu en debug, mais = **pas de crash-reporting** sur cette build. Décider : ajouter
  `GoogleService-Info.plist` (debug) ou documenter le NoOp intentionnel.

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
