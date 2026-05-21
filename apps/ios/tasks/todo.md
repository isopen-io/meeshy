# iOS Hardening Plan — Critical + High priority items

> **Branche** : `claude/analyze-ios-weaknesses-3aXOc`
> **Stratégie** : un commit par phase, push fréquents. TDD strict sur tout nouveau code.
> **Périmètre** : 13 items (5 critiques + 8 élevés) issus de `apps/ios/tasks/IOS_WEAKNESSES_AUDIT.md`.

## Avertissement environnement
- Env Linux : impossible d'exécuter `xcodebuild` / XCTest. Les tests sont **écrits** mais leur exécution doit se faire sur macOS via `./apps/ios/meeshy.sh test`.
- Je m'appuie sur lectures croisées + cohérence des types pour minimiser les bugs de compilation.

---

## Phase 1 — Sécurité hardening (Critique)

### [P1.1] Retirer les credentials démo App Store + ENV vars ✅
- **Cible** : `apps/ios/fastlane/Fastfile:189-191` + `CLAUDE.md` (Test Credentials section)
- **Action** :
  - [x] Remplacer `demo_user: "atabeth"` par `require_env("ASC_DEMO_USER")` (idem password)
  - [x] Mettre à jour `.github/workflows/ios-release.yml` pour injecter les ENV
  - [x] Retirer le bloc `Test Credentials` de `CLAUDE.md`
  - [x] Documenter dans `apps/ios/fastlane/SECRETS.md` quels ENV sont requis
  - [ ] (user) Rotater le password Apple côté ASC + ajouter les secrets GitHub
- **Tests** : N/A (config)

### [P1.2] VoIP token : UserDefaults → Keychain ✅
- **Cible** : `apps/ios/Meeshy/Features/Main/Services/VoIPPushManager.swift:303-326`
- **Plan** :
  - [x] Test rouge : `VoIPPushManagerTests.test_voipToken_isNeverWrittenToUserDefaults` (+ 2 autres)
  - [x] Créer protocole `VoIPTokenStoring` dans `packages/MeeshySDK/.../Security/VoIPTokenStore.swift`
  - [x] Impl `KeychainVoIPTokenStore` avec key `voip.registeredDevice` + `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` (hérité de KeychainManager)
  - [x] Migration douce : `migrateFromUserDefaultsIfNeeded()` idempotent, purge UserDefaults systématiquement
  - [x] DI dans `VoIPPushManager(tokenStore:)` avec default = `KeychainVoIPTokenStore()`
  - [x] `MockVoIPTokenStore` injectable (apps/ios/MeeshyTests/Mocks/)
  - [x] Tests SDK : `packages/MeeshySDK/Tests/.../Security/VoIPTokenStoreTests.swift` (6 tests, skip auto si Keychain sans entitlement)
- **⚠️ Action utilisateur requise (Xcode)** :
  - Drag-drop `apps/ios/MeeshyTests/Mocks/MockVoIPTokenStore.swift` dans le target MeeshyTests via Xcode (les .swift Tests dans le SDK sont pris en compte automatiquement par SPM, mais le bundle MeeshyTests utilise des refs explicites dans project.pbxproj)
- **Risque** : background push doit pouvoir lire le token → `AccessibleAfterFirstUnlock` ✅ (KeychainManager.save l'utilise par défaut)

### [P1.3] Vérifier la chaîne APNs `requestAuthorization` + `registerForRemoteNotifications` ✅
- **Statut** : **VALIDÉ — l'audit était trop prudent**. La chaîne existe et fonctionne.
- **Preuves vérifiées** :
  - Onboarding : `OnboardingView.swift:511-521` → `requestAuthorization([.alert, .badge, .sound])`
  - Boot post-auth : `MeeshyApp.swift:304` + `MeeshyApp.swift:414` → `requestPushPermissionIfNeeded()` qui appelle `pushManager.requestPermission()` → `UIApplication.shared.registerForRemoteNotifications()`
  - Token receipt : `AppDelegate.swift:88-95` → `PushNotificationManager.shared.registerDeviceToken(deviceToken)`
  - Backend POST : `PushNotificationManager.swift:200-239` → `/users/register-device-token` avec cooldown idempotence
- **Test ajouté** : `test_registerDeviceToken_setsPublishedTokenAndPersistsHex` pin l'invariant pour les refactos futurs.
- **Note** : APNs token vit en UserDefaults (`com.meeshy.push.deviceToken`) — moins critique qu'un VoIP token (routing identifier, pas credential), Apple ne demande pas le Keychain.

### [P1.4] Public key pinning sur `APIClient` ✅
- **Cible** : `packages/MeeshySDK/Sources/MeeshySDK/Networking/APIClient.swift:7-27`
- **Plan** :
  - [x] Module `CertificatePinning` avec `spkiSHA256Base64(for:)` + `evaluate(chain:against:)` pur
  - [x] Delegate refactoré : multi-pin, fail-closed sur mismatch, fallback `.unconfigured` quand pinSet vide (backward compat 100%)
  - [x] `MeeshyConfig.certificatePins: Set<String>` (empty default — opérateur configure au boot)
  - [x] Support RSA 2048/4096 et EC 256/384 (préfixes ASN.1 vérifiés)
  - [x] Logging `fault`-level sur mismatch (catégorie `me.meeshy.sdk` / `tls-pinning`)
  - [x] Tests SDK : 5 tests purs (déterminisme hash, mismatch keys, préfixe ASN.1)
  - [x] Documentation opérateur : `apps/ios/Documentation/CERTIFICATE_PINNING.md` avec procédure openssl + stratégie de rotation
- **⚠️ Action utilisateur requise** : calculer les 2 pins (leaf actuel + backup) puis les mettre dans `MeeshyApp.init()` ou via une future ressource bundle. Tant que `certificatePins` reste vide, le comportement est strictement identique à avant (pas de régression).

### [P1.5] Supprimer `fatalError` au boot ✅
- **Cible** : `apps/ios/Meeshy/Core/DependencyContainer.swift:39`
- **Plan** :
  - [x] Refactor : `openWithRecovery()` essaie d'ouvrir, sur échec quarantine `*.corrupted.{ts}` + WAL/SHM + retry, dernier recours `:memory:`
  - [x] `DatabaseInitDiagnostics` struct exposée via `initDiagnostics` pour visibilité Crashlytics
  - [x] AppDelegate forward les diagnostics au crash reporter après Firebase init
  - [x] `quarantineCorruptDatabase()` propre (gère absence du main file, nettoie sidecars)
  - [x] Le `fatalError("Failed to initialize database: ...")` est supprimé. Seul un `preconditionFailure` reste dans le cas réellement impossible (`:memory:` qui échoue deux fois) — avec le message d'erreur GRDB réel cette fois, pas un opaque "Failed to initialize database".
  - [x] 4 tests :
    - `test_openWithRecovery_validPath_returnsPoolWithoutRecovery`
    - `test_openWithRecovery_corruptedFile_quarantinesAndRecovers`
    - `test_quarantineCorruptDatabase_cleansWALAndSHMSidecars`
    - `test_quarantineCorruptDatabase_handlesMissingMainFileGracefully`
- **Risque** : le chemin happy n'est pas affecté (la première ouverture réussit, recovery silencieux). En cas de corruption, l'utilisateur ne perd que son cache local de messages (les messages sont re-fetchables depuis le gateway).

---

## Phase 2 — Reliability real-time

### [P2.1] Buffer + replay des emits Socket.IO pendant disconnect ✅
- **Cible** : `packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketManager.swift`
- **Constat re-vérifié** :
  - `joinedConversations` est DÉJÀ replay-on-reconnect (ligne 1669-1674) — pas de gap pour les joins
  - `message:send` passe par `OfflineQueue` + REST fallback — déjà couvert
  - `typing:start/stop` est ephémère → ne doit PAS être bufferisé (stale = inutile)
  - **Vrai gap : `requestTranslation`** — action utilisateur explicite, aucun auto-retry, drop silencieux si offline
- **Plan livré** :
  - [x] `PendingTranslationRequest` struct + buffer borné (50 items, TTL 60s)
  - [x] Dedup par `(messageId, targetLanguage)` — re-tap rafraîchit l'entrée existante
  - [x] Cap from front : oldest dropped (les plus utiles sont les plus récents)
  - [x] `flushBufferedTranslationRequests(now:)` testable, appelé depuis `.connect` après re-join rooms
  - [x] 4 tests : buffering, dedup, drop-stale, cap+drop-oldest
- **Scope volontairement étroit** : pas de framework générique parce qu'il n'y a qu'un seul vrai consommateur. Si d'autres événements émergent, l'extension est mécanique.

### [P2.2] Re-auth socket sur token refresh ✅
- **Statut** : **VALIDÉ — déjà implémenté correctement**. L'audit était trop prudent.
- **Preuve** : `AuthManager.applySession:389` détecte `isTokenRotation` (même userId déjà authentifié), puis `MessageSocketManager.shared.forceReconnect()` + `SocialSocketManager.shared.forceReconnect()` aux lignes 405-408. `forceReconnect()` lit `APIClient.shared.authToken` frais (déjà MAJ ligne 399), donc reconnecte avec le nouveau JWT.
- **Plan livré (durcissement)** :
  - [x] Extraction de `isTokenRotation(currentlyAuthenticated:currentActiveUserId:newUserId:)` en fonction pure `nonisolated static`
  - [x] Publisher `tokenDidRotate: PassthroughSubject<Void, Never>` exposé pour NSE, widgets, futurs consommateurs
  - [x] 4 tests couvrant les 4 branches du prédicat (same user + auth → true ; cold start → false ; user switch → false ; nil active id → false)
- **Note** : les erreurs socket level ne déclenchent intentionnellement PAS de refresh (false-positive lockouts historiques) — seul l'APIClient 401 path le fait. Cohérent.

---

## Phase 3 — Data flow integrity & Prisme Linguistique

### [P3.1] Coalescing des paginations `loadOlder` / `loadNewer`
- **Cible** : `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift`, `FeedViewModel.swift`
- **Plan** :
  - [ ] Test : `ConversationViewModelTests.test_concurrentLoadOlder_emitsOnlyOneRequest`
  - [ ] Ajouter `private var inflightCursors: Set<String>` (cursor ou pageId selon API)
  - [ ] `loadOlder()` guard early-return si cursor déjà en vol
  - [ ] Pareil pour `loadNewer`
- **Bonus** : ajouter un debounce 200ms côté UI pour absorber les `.onAppear` rapides

### [P3.2] Purger `Locale.current` pour résolution de contenu
- **Cible** : 4 sites identifiés (`ConversationView.swift:339, 346, 353, 397, 725`, `RegistrationViewModel.swift:146, 180, 187`)
- **Plan** :
  - [ ] Test : `LanguageResolverTests.test_resolveContentLanguage_ignoresDeviceLocale`
  - [ ] Créer `ContentLanguageResolver` (struct pure) dans `MeeshySDK/Utils/` qui implémente l'ordre `systemLanguage > regionalLanguage > customDestinationLanguage > "fr"` (cf. CLAUDE.md ligne 38)
  - [ ] Remplacer toutes les utilisations de `Locale.current` pour résolution **de contenu** (pas UI)
  - [ ] Pour le `DateFormatter` dans ConversationView : utiliser `preferredContentLocale()` qui lit AuthManager.currentUser
  - [ ] Pour `RegistrationViewModel` : laisser auto-suggestion mais préciser `editable: true` et ne pas écraser un choix explicite

---

## Phase 4 — Architectural cleanup (Élevé, gros)

### [P4.1] Retirer les appels `APIClient.shared` depuis les Views
- **Cibles** : `NewConversationView.swift`, `SharePickerView.swift`, `ThreadView.swift`, `StoryViewerView+Canvas.swift`
- **Plan par vue** (pattern identique) :
  - [ ] Créer un `*ViewModel` (ou réutiliser celui existant) avec dépendance protocolaire injectée
  - [ ] Déplacer les appels API
  - [ ] Garantir cache-first si applicable
  - [ ] Tests : un par flow critique (search users, send shared message, load thread, react to story)

### [P4.2] Split `ConversationViewModel.swift` (3028 lignes, 42 @Published)
- **Stratégie** : éviter le big-bang. Approche par extraction de composants cohérents :
  - [ ] Extraire `ConversationStateContainer` (struct avec les 42 @Published groupés en `loadingState`, `composerState`, `messagesState`, `overlaysState`)
  - [ ] Extraire `ConversationTranslationCoordinator` (toute la logique d'overrides translation/audio)
  - [ ] Extraire `ConversationPresenceCoordinator` (typing, live location)
  - [ ] Extraire `ConversationMessageSender` (sending, retry, optimistic updates)
  - [ ] Garder `ConversationViewModel` comme façade orchestrant ces 4 sous-composants
  - [ ] Tests : un par sous-composant
- **Risque** : énorme — à séquencer en sous-commits par sous-composant pour faciliter le review

### [P4.3] Éliminer les scripts Ruby de maintenance pbxproj
- **Cibles** : 20 scripts `apps/ios/*.rb`
- **Plan** :
  - [ ] Vérifier que `project.yml` (XcodeGen) couvre tous les targets actuellement gérés par ces scripts
  - [ ] Ajouter au `project.yml` les targets manquants : MeeshyContextMenu, MeeshyIntents, MeeshyShareExtension (s'ils ne sont pas déjà)
  - [ ] Régénérer le `.pbxproj` via XcodeGen et comparer
  - [ ] Si diff acceptable : supprimer les 20 scripts Ruby + ajouter `xcodegen generate` comme step dans `meeshy.sh`
  - [ ] Ajouter check CI : `git diff --exit-code project.pbxproj` après `xcodegen generate` doit être vide
- **Risque** : peut casser le build s'il y a des subtilités non capturées dans `project.yml`. Doit être testé sur macOS.

---

## Phase 5 — Accessibilité

### [P5.1] A11y baseline sur composants chat critiques
- **Cible** : `ThemedMessageBubble`, `BubbleStandardLayout`, `MeeshyAvatar`, `ConversationRow`, boutons sans label
- **Plan** :
  - [ ] Tests via accessibility audit (XCUITest pour VoiceOver flow critique)
  - [ ] Ajouter `.accessibilityLabel`, `.accessibilityValue`, `.accessibilityHint` aux cellules de chat
  - [ ] Remplacer `.font(.system(size: X))` par fonts sémantiques dans `Contacts/`
  - [ ] Audit Dynamic Type : forcer XXXL en preview, vérifier que rien ne casse
- **Note** : périmètre limité aux écrans à fort trafic ; le rest passera en phase ultérieure

---

## Exécution

Chaque phase = 1 ou plusieurs commits. Après chaque commit :
1. Self-review : « est-ce que ça rapproche de la perfection perf/UX/sécurité ? »
2. Mise à jour de ce todo (case cochée)
3. Push

Fin : récapitulatif final dans `tasks/todo.md` avec section « Review » comme demandé par CLAUDE.md.
