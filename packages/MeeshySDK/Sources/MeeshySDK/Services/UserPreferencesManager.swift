import Foundation
import UIKit
import Combine

@MainActor
public final class UserPreferencesManager: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    public static let shared = UserPreferencesManager()

    /// Injected closure to flush the outbox immediately after a preference mutation
    /// is enqueued. The SDK cannot import app-side OutboxFlushTrigger, so the app
    /// injects this at boot: `{ Task { await OutboxFlushTrigger.flushNow() } }`.
    /// If nil, the outbox drains on the next app boot/foreground transition only.
    public var onSettingsMutationEnqueued: (@Sendable () -> Void)?

    // MARK: - Published Preferences

    @Published public private(set) var privacy: PrivacyPreferences
    @Published public private(set) var audio: AudioPreferences
    @Published public private(set) var message: MessagePreferences
    @Published public private(set) var notification: UserNotificationPreferences
    @Published public private(set) var video: VideoPreferences
    @Published public private(set) var document: DocumentPreferences
    @Published public private(set) var application: ApplicationPreferences

    @Published public private(set) var isSyncing = false
    @Published public private(set) var lastSyncDate: Date?

    // MARK: - Internals

    /// Var (not `let`) so `@testable` test targets can substitute a mock
    /// conforming to `PreferenceServiceProviding` — mirrors the
    /// `AuthManager.authService` injection seam. Needed for integration
    /// tests that drive `fetchFromBackend()`/`applyRemote` end-to-end
    /// without hitting the real network.
    internal var service: PreferenceServiceProviding = PreferenceService.shared
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var syncTasks: [PreferenceCategory: Task<Void, Never>] = [:]
    private var cancellables = Set<AnyCancellable>()

    /// Test-only override for the authentication gate used by
    /// `fetchFromBackend`/`syncCategoryToBackend`/`resetCategory`.
    /// Production always resolves through the live
    /// `AuthManager.shared.isAuthenticated`. `internal` (not `private`) so
    /// `@testable` targets can drive these flows deterministically WITHOUT
    /// touching the real `AuthManager.shared` singleton — flipping that
    /// shared instance's `$isAuthenticated` would also fire
    /// `observeAuth()`'s own `fetchFromBackend()` sink, racing the test's
    /// explicit call and leaking authenticated state across test files.
    internal var isAuthenticatedOverride: (() -> Bool)?

    private var isUserAuthenticated: Bool {
        isAuthenticatedOverride?() ?? AuthManager.shared.isAuthenticated
    }

    /// Catégories avec une modification locale pas encore confirmée par le
    /// backend — depuis `scheduleSyncToBackend` (synchrone, avant le
    /// debounce de 1s) jusqu'à la fin de `syncCategoryToBackend` (PATCH ou
    /// enqueue outbox terminé). `applyRemote` ("server wins") DOIT les
    /// ignorer : sans ça, un `fetchFromBackend()` concurrent (foreground,
    /// login) écrase l'édition locale en attente avec la valeur serveur
    /// périmée, puis le debounce PATCHe cette même valeur périmée — la
    /// modification de l'utilisateur disparaît silencieusement. Accès
    /// `internal` (pas `private`) uniquement pour être observable/réinitialisable
    /// par les tests `@testable import`.
    var pendingCategories: Set<PreferenceCategory> = []

    private nonisolated static let keyPrefix = "meeshy_prefs_"
    private static let lastSyncKey = "meeshy_prefs_last_sync"
    private static let pendingCategoriesKey = "meeshy_prefs_pending_categories"
    /// Suite App Group partagée avec les extensions (NSE, widgets). La clé
    /// miroir des préférences de notification est
    /// `appGroupNotificationPrefsKey` — lue par `NSEPreferencesGate` depuis le
    /// process de la NSE, donc `nonisolated` (constantes immuables Sendable).
    public nonisolated static let appGroupSuiteName = "group.me.meeshy.apps"
    public nonisolated static let appGroupNotificationPrefsKey = keyPrefix + PreferenceCategory.notification.rawValue
    private static let minSyncInterval: TimeInterval = 5 * 60
    /// Fenêtre de regroupement des diffusions de catégorie
    /// (`observeRemotePreferenceBroadcast`). `internal` pour que les témoins
    /// dérivent leur attente de la valeur de production plutôt que d'en
    /// recopier une jumelle.
    static let remoteRefreshCoalescingWindow: TimeInterval = 0.3

    // MARK: - Init

    private init() {
        privacy = (Self.load(.privacy) as PrivacyPreferences?) ?? .defaults
        audio = (Self.load(.audio) as AudioPreferences?) ?? .defaults
        message = (Self.load(.message) as MessagePreferences?) ?? .defaults
        notification = (Self.load(.notification) as UserNotificationPreferences?) ?? .defaults
        video = (Self.load(.video) as VideoPreferences?) ?? .defaults
        document = (Self.load(.document) as DocumentPreferences?) ?? .defaults
        application = (Self.load(.application) as ApplicationPreferences?) ?? .defaults

        if let ts = UserDefaults.standard.object(forKey: Self.lastSyncKey) as? Date {
            lastSyncDate = ts
        }

        if let pending = Self.loadPendingCategories() {
            pendingCategories = pending
        }

        observeAuth()
        observeForeground()
        observeRemotePreferenceBroadcast()
        observeSocketReconnection()
    }

    // MARK: - Typed Update Methods (local-first)

    public func updatePrivacy(_ transform: (inout PrivacyPreferences) -> Void) {
        var copy = privacy; transform(&copy)
        guard copy != privacy else { return }
        privacy = copy
        persist(copy, category: .privacy)
        scheduleSyncToBackend(.privacy)
    }

    public func updateAudio(_ transform: (inout AudioPreferences) -> Void) {
        var copy = audio; transform(&copy)
        guard copy != audio else { return }
        audio = copy
        persist(copy, category: .audio)
        scheduleSyncToBackend(.audio)
    }

    public func updateMessage(_ transform: (inout MessagePreferences) -> Void) {
        var copy = message; transform(&copy)
        guard copy != message else { return }
        message = copy
        persist(copy, category: .message)
        scheduleSyncToBackend(.message)
    }

    public func updateNotification(_ transform: (inout UserNotificationPreferences) -> Void) {
        var copy = notification; transform(&copy)
        // Ré-estampille l'offset UTC du device à chaque écriture (voyage, DST) :
        // le gateway évalue la fenêtre DND dans l'heure locale utilisateur.
        copy.dndUtcOffsetMinutes = TimeZone.current.secondsFromGMT() / 60
        guard copy != notification else { return }
        notification = copy
        persist(copy, category: .notification)
        scheduleSyncToBackend(.notification)
    }

    public func updateVideo(_ transform: (inout VideoPreferences) -> Void) {
        var copy = video; transform(&copy)
        guard copy != video else { return }
        video = copy
        persist(copy, category: .video)
        scheduleSyncToBackend(.video)
    }

    public func updateDocument(_ transform: (inout DocumentPreferences) -> Void) {
        var copy = document; transform(&copy)
        guard copy != document else { return }
        document = copy
        persist(copy, category: .document)
        scheduleSyncToBackend(.document)
    }

    public func updateApplication(_ transform: (inout ApplicationPreferences) -> Void) {
        var copy = application; transform(&copy)
        guard copy != application else { return }
        application = copy
        persist(copy, category: .application)
        scheduleSyncToBackend(.application)
    }

    // MARK: - Convenience: Voice Consent (espace de préférences)

    /// Consentement de définition du profil vocal accordé — lu depuis
    /// l'espace de préférences (`application.voiceProfileConsentAt`), la même
    /// source que le gateway (`ConsentValidationService`, priorité
    /// `UserPreferences.application` > `User`).
    public var voiceConsentGranted: Bool { application.voiceProfileConsentAt != nil }

    /// Traduction vocale utilisant le profil (clonage) consentie.
    public var voiceCloningConsentGranted: Bool { application.voiceCloningConsentAt != nil }

    /// Accorde en un geste, via la MÊME API préférences que le reste
    /// (PATCH `/me/preferences/application` + `/me/preferences/audio`,
    /// synchronisés par l'outbox) :
    /// 1. la chaîne de consentements vocaux (traitement des données →
    ///    données vocales → profil vocal → clonage) ;
    /// 2. les features audio correspondantes (transcription, traduction
    ///    audio, génération TTS, profil vocal).
    /// Idempotent : un timestamp déjà posé n'est jamais réécrit.
    public func grantVoiceAutoTranslationConsent(now: Date = Date()) {
        let iso = ISO8601DateFormatter().string(from: now)
        updateApplication { app in
            if app.dataProcessingConsentAt == nil { app.dataProcessingConsentAt = iso }
            if app.voiceDataConsentAt == nil { app.voiceDataConsentAt = iso }
            if app.voiceProfileConsentAt == nil { app.voiceProfileConsentAt = iso }
            if app.voiceCloningConsentAt == nil { app.voiceCloningConsentAt = iso }
            if app.voiceCloningEnabledAt == nil { app.voiceCloningEnabledAt = iso }
        }
        updateAudio { audio in
            audio.transcriptionEnabled = true
            audio.audioTranslationEnabled = true
            audio.ttsEnabled = true
            audio.voiceProfileEnabled = true
        }
    }

    // MARK: - Backend Sync

    public func fetchFromBackend() async {
        guard isUserAuthenticated else { return }
        isSyncing = true
        defer { isSyncing = false }

        do {
            let remote = try await service.getAllPreferences()
            applyRemote(remote)
            lastSyncDate = Date()
            UserDefaults.standard.set(lastSyncDate, forKey: Self.lastSyncKey)
        } catch {
            // Network failure: local values remain authoritative
        }
    }

    public func resetToDefaults() {
        privacy = .defaults; persist(privacy, category: .privacy)
        audio = .defaults; persist(audio, category: .audio)
        message = .defaults; persist(message, category: .message)
        notification = .defaults; persist(notification, category: .notification)
        video = .defaults; persist(video, category: .video)
        document = .defaults; persist(document, category: .document)
        application = .defaults; persist(application, category: .application)
    }

    // MARK: - Session quiesce (P1 — logout)

    /// Réinitialise les @Published aux defaults ET supprime les clés UserDefaults
    /// pour que la session suivante (autre user sur le même device) ne re-hydrate
    /// pas les préférences du user précédent depuis le disque. Différent de
    /// `resetToDefaults()` qui persiste les defaults — ici on PURGE le disque.
    /// Câblée depuis `AuthManager.logout()`.
    public func resetSession() {
        privacy = .defaults
        audio = .defaults
        message = .defaults
        notification = .defaults
        video = .defaults
        document = .defaults
        application = .defaults
        isSyncing = false
        lastSyncDate = nil

        syncTasks.values.forEach { $0.cancel() }
        syncTasks.removeAll()
        pendingCategories.removeAll()
        persistPendingCategories()
        // NE PAS vider `cancellables` : il ne porte QUE les abonnements
        // process-lifetime posés une seule fois à l'init (`observeAuth` /
        // `observeForeground`). Les vider au premier logout tuait
        // définitivement le re-fetch des préférences au login suivant et la
        // re-sync au retour foreground.

        for category in PreferenceCategory.allCases {
            UserDefaults.standard.removeObject(forKey: Self.keyPrefix + category.rawValue)
        }
        UserDefaults.standard.removeObject(forKey: Self.lastSyncKey)
        UserDefaults.standard.removeObject(forKey: Self.pendingCategoriesKey)
        // Purge du miroir App Group (privacy) : un user B sur le même device
        // ne doit pas hériter du gating notifications du user A dans la NSE.
        UserDefaults(suiteName: Self.appGroupSuiteName)?
            .removeObject(forKey: Self.appGroupNotificationPrefsKey)
    }

    public func resetCategory(_ category: PreferenceCategory) async {
        switch category {
        case .privacy: privacy = .defaults; persist(privacy, category: .privacy)
        case .audio: audio = .defaults; persist(audio, category: .audio)
        case .message: message = .defaults; persist(message, category: .message)
        case .notification: notification = .defaults; persist(notification, category: .notification)
        case .video: video = .defaults; persist(video, category: .video)
        case .document: document = .defaults; persist(document, category: .document)
        case .application: application = .defaults; persist(application, category: .application)
        }

        guard isUserAuthenticated else { return }
        try? await service.resetPreferences(category: category)
    }

    // MARK: - Private: Local Persistence

    private func persist<T: Encodable>(_ value: T, category: PreferenceCategory) {
        guard let data = try? encoder.encode(value) else { return }
        UserDefaults.standard.set(data, forKey: Self.keyPrefix + category.rawValue)
        // Miroir App Group : la NSE (process séparé, app tuée) applique les
        // préférences de notification au moment de la livraison — sons, badge,
        // regroupement, DND, toggles par type. Chokepoint unique : couvre les
        // updates locaux, applyRemote et resetCategory.
        if category == .notification {
            UserDefaults(suiteName: Self.appGroupSuiteName)?
                .set(data, forKey: Self.keyPrefix + category.rawValue)
        }
    }

    private static func load<T: Decodable>(_ category: PreferenceCategory) -> T? {
        guard let data = UserDefaults.standard.data(forKey: keyPrefix + category.rawValue) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    private func persistPendingCategories() {
        let rawValues = pendingCategories.map(\.rawValue)
        UserDefaults.standard.set(rawValues, forKey: Self.pendingCategoriesKey)
    }

    /// `internal` (not `private`) — same rationale as `pendingCategories`:
    /// tests need to re-run the EXACT reload logic `init()` uses to
    /// faithfully simulate a relaunch (a private-init singleton cannot be
    /// re-instantiated from a test target).
    static func loadPendingCategories() -> Set<PreferenceCategory>? {
        guard let rawValues = UserDefaults.standard.stringArray(forKey: pendingCategoriesKey) else { return nil }
        return Set(rawValues.compactMap { PreferenceCategory(rawValue: $0) })
    }

    // MARK: - Private: Debounced Backend Sync

    private func scheduleSyncToBackend(_ category: PreferenceCategory) {
        syncTasks[category]?.cancel()
        pendingCategories.insert(category)
        persistPendingCategories()
        syncTasks[category] = Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            await syncCategoryToBackend(category)
        }
    }

    /// Wave 1 Phase C — route preference sync through the offline outbox
    /// so a change made while offline survives an app kill and replays on
    /// reconnect with `X-Client-Mutation-Id` for gateway-side
    /// `MutationLog` dedup. The category body is encoded once at enqueue
    /// time so the dispatcher can route to `PATCH /me/preferences/:cat`
    /// without re-encoding. On enqueue failure (pool not configured at
    /// app boot, transient GRDB error) we fall back to the direct PATCH
    /// path so we don't drop preference changes silently.
    private func syncCategoryToBackend(_ category: PreferenceCategory) async {
        // Cleared here (not right after the debounce sleep) so the category
        // stays "pending" — and protected from `applyRemote` server-wins —
        // for the full round trip, including the network/outbox call below.
        defer {
            pendingCategories.remove(category)
            persistPendingCategories()
        }
        guard isUserAuthenticated else { return }
        let cmid = ClientMutationId.generate()
        let body: Data?
        do {
            switch category {
            case .privacy: body = try encoder.encode(privacy)
            case .audio: body = try encoder.encode(audio)
            case .message: body = try encoder.encode(message)
            case .notification: body = try encoder.encode(notification)
            case .video: body = try encoder.encode(video)
            case .document: body = try encoder.encode(document)
            case .application: body = try encoder.encode(application)
            }
        } catch {
            // Encoding a preference struct should never fail in practice,
            // but if it does we cannot enqueue a row referencing a body
            // we can't produce — bail out and rely on the next
            // `fetchFromBackend()` to reconcile.
            return
        }

        guard let encodedBody = body else { return }
        let payload = UpdateSettingsPayload(
            clientMutationId: cmid,
            category: category.rawValue,
            body: encodedBody
        )
        do {
            try await OfflineQueue.shared.enqueue(.updateSettings, payload: payload)
            onSettingsMutationEnqueued?()
        } catch {
            // Fall back to the direct PATCH path — outbox enqueue can
            // fail if the pool was never wired (early-boot UI surfaces
            // a preference change before AppDatabase initialises).
            do {
                switch category {
                case .privacy: try await service.patchPreferences(category: .privacy, body: privacy)
                case .audio: try await service.patchPreferences(category: .audio, body: audio)
                case .message: try await service.patchPreferences(category: .message, body: message)
                case .notification: try await service.patchPreferences(category: .notification, body: notification)
                case .video: try await service.patchPreferences(category: .video, body: video)
                case .document: try await service.patchPreferences(category: .document, body: document)
                case .application: try await service.patchPreferences(category: .application, body: application)
                }
            } catch {
                // Sync failure is non-fatal; next fetchFromBackend() will reconcile
            }
        }
    }

    // MARK: - Private: Apply Remote (server wins — except categories pending local sync)

    /// Pure decision: should `category`'s remote value overwrite the local,
    /// in-memory state? Categories with an in-flight/debounced local edit
    /// (`pendingCategories`) keep their local value — "server wins" there
    /// would silently drop the user's own not-yet-confirmed change and then
    /// PATCH the (now overwritten) stale value once the debounce fires.
    /// `nonisolated`: pure Set membership check, no actor-isolated state.
    nonisolated static func shouldApplyRemote(_ category: PreferenceCategory, pendingCategories: Set<PreferenceCategory>) -> Bool {
        !pendingCategories.contains(category)
    }

    private func applyRemote(_ remote: UserPreferences) {
        let localExtras = collectLocalExtras()
        let pending = pendingCategories

        if Self.shouldApplyRemote(.privacy, pendingCategories: pending) {
            privacy = mergeExtras(remote.privacy, localExtras: localExtras[.privacy])
            persist(privacy, category: .privacy)
        }
        if Self.shouldApplyRemote(.audio, pendingCategories: pending) {
            audio = mergeExtras(remote.audio, localExtras: localExtras[.audio])
            persist(audio, category: .audio)
        }
        if Self.shouldApplyRemote(.message, pendingCategories: pending) {
            message = mergeExtras(remote.message, localExtras: localExtras[.message])
            persist(message, category: .message)
        }
        if Self.shouldApplyRemote(.notification, pendingCategories: pending) {
            notification = mergeExtras(remote.notification, localExtras: localExtras[.notification])
            persist(notification, category: .notification)
        }
        if Self.shouldApplyRemote(.video, pendingCategories: pending) {
            video = mergeExtras(remote.video, localExtras: localExtras[.video])
            persist(video, category: .video)
        }
        if Self.shouldApplyRemote(.document, pendingCategories: pending) {
            document = mergeExtras(remote.document, localExtras: localExtras[.document])
            persist(document, category: .document)
        }
        if Self.shouldApplyRemote(.application, pendingCategories: pending) {
            application = mergeExtras(remote.application, localExtras: localExtras[.application])
            persist(application, category: .application)
        }
    }

    private func collectLocalExtras() -> [PreferenceCategory: [String: CodableValue]] {
        [
            .privacy: privacy.extras,
            .audio: audio.extras,
            .message: message.extras,
            .notification: notification.extras,
            .video: video.extras,
            .document: document.extras,
            .application: application.extras,
        ]
    }

    private func mergeExtras(_ remote: PrivacyPreferences, localExtras: [String: CodableValue]?) -> PrivacyPreferences {
        var merged = remote; merged.extras = localExtras ?? [:]; return merged
    }
    private func mergeExtras(_ remote: AudioPreferences, localExtras: [String: CodableValue]?) -> AudioPreferences {
        var merged = remote; merged.extras = localExtras ?? [:]; return merged
    }
    private func mergeExtras(_ remote: MessagePreferences, localExtras: [String: CodableValue]?) -> MessagePreferences {
        var merged = remote; merged.extras = localExtras ?? [:]; return merged
    }
    private func mergeExtras(_ remote: UserNotificationPreferences, localExtras: [String: CodableValue]?) -> UserNotificationPreferences {
        var merged = remote; merged.extras = localExtras ?? [:]; return merged
    }
    private func mergeExtras(_ remote: VideoPreferences, localExtras: [String: CodableValue]?) -> VideoPreferences {
        var merged = remote; merged.extras = localExtras ?? [:]; return merged
    }
    private func mergeExtras(_ remote: DocumentPreferences, localExtras: [String: CodableValue]?) -> DocumentPreferences {
        var merged = remote; merged.extras = localExtras ?? [:]; return merged
    }
    private func mergeExtras(_ remote: ApplicationPreferences, localExtras: [String: CodableValue]?) -> ApplicationPreferences {
        var merged = remote; merged.extras = localExtras ?? [:]; return merged
    }

    // MARK: - Orphaned Pending Sync Resume (cold boot / gateway delivery)

    /// Re-attempts delivery, WITHOUT the 1s debounce, for every category
    /// still marked pending from a PREVIOUS process. `scheduleSyncToBackend`'s
    /// debounce `Task` may never have had the chance to fire before the app
    /// was killed (the user toggles a preference then immediately
    /// backgrounds/kills the app) — in that window the new value AND the
    /// pending flag are already durably persisted synchronously
    /// (`persist`/`persistPendingCategories`), but NOTHING was ever written
    /// to the outbox. Without this, such a category would sit "pending"
    /// forever: permanently blocking `applyRemote` for it (never letting a
    /// legitimate future remote change apply) while the mutation itself
    /// never actually reaches the gateway — the originally reported
    /// symptom ("le PATCH n'a jamais atteint le gateway").
    ///
    /// Wired from `observeAuth()`'s became-authenticated transition, which
    /// is guaranteed-authenticated — unlike calling this from `init()`
    /// directly, where session restoration may still be in flight and the
    /// `isUserAuthenticated` guard inside `syncCategoryToBackend` would
    /// silently clear the pending flag without ever attempting delivery.
    /// `internal` (not `private`) so tests can invoke it directly to
    /// simulate a relaunch without re-instantiating the singleton.
    func resumeOrphanedPendingSyncs(_ categories: Set<PreferenceCategory>) async {
        for category in categories {
            syncTasks[category]?.cancel()
            await syncCategoryToBackend(category)
        }
    }

    // MARK: - Private: Observers

    private func observeAuth() {
        AuthManager.shared.$isAuthenticated
            .dropFirst()
            .removeDuplicates()
            .filter { $0 }
            .sink { [weak self] _ in
                Task { [weak self] in
                    guard let self else { return }
                    await self.resumeOrphanedPendingSyncs(self.pendingCategories)
                    await self.fetchFromBackend()
                }
            }
            .store(in: &cancellables)
    }

    private func observeForeground() {
        NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { [weak self] _ in
                guard let self else { return }
                let elapsed = -(self.lastSyncDate?.timeIntervalSinceNow ?? -Self.minSyncInterval - 1)
                guard elapsed > Self.minSyncInterval else { return }
                Task { [weak self] in await self?.fetchFromBackend() }
            }
            .store(in: &cancellables)
    }

    // MARK: - Private: Remote broadcast (troisième déclencheur)

    /// Le déclencheur VIF, à côté des deux déclencheurs de CYCLE DE VIE
    /// ci-dessus. Les deux répondent à des questions différentes, et aucun ne
    /// couvre l'autre :
    ///
    /// - `observeAuth` / `observeForeground` rattrapent ce qu'on a MANQUÉ
    ///   pendant qu'on était absent — mais ils ne se déclenchent que quand
    ///   l'app change d'état, et le retour au premier plan est de surcroît
    ///   étranglé à `minSyncInterval` (5 min) ;
    /// - une diffusion dit qu'un réglage VIENT de changer ailleurs, pendant
    ///   qu'on est là. Sans elle, un utilisateur qui coupe ses notifications
    ///   depuis le web garde un iPhone qui sonne selon l'ancienne règle tant
    ///   qu'il ne quitte pas puis ne rouvre pas l'app — et un aller-retour
    ///   dans les 5 minutes ne rattrape rien non plus, l'étranglement le
    ///   sautant. Le bloc `notification` est miroité dans l'App Group que lit
    ///   `NSEPreferencesGate` (`appGroupNotificationPrefsKey`), donc « périmé »
    ///   s'entend littéralement.
    ///
    /// L'événement ne PORTE aucune valeur (le gateway émet `{ userId,
    /// category }`, cf. `preferences-broadcast.ts`) : c'est une INVALIDATION,
    /// donc le geste est une relecture, pas une application de charge utile.
    /// `fetchFromBackend()` est réutilisé tel quel — il porte déjà la garde
    /// d'authentification, le veto `pendingCategories` (via `applyRemote`) et
    /// la politique « un échec réseau ne remet rien à zéro ». L'écho que le
    /// gateway renvoie à l'appareil ÉMETTEUR passe donc par le même veto que
    /// le reste : la catégorie qu'on est en train d'éditer n'est pas écrasée.
    ///
    /// L'étranglement de 5 minutes N'EST PAS appliqué ici : il garde un
    /// déclencheur qui se produit sans qu'aucune donnée n'ait bougé (rouvrir
    /// l'app), pas un déclencheur qui est la PREUVE qu'elle a bougé.
    private func observeRemotePreferenceBroadcast() {
        observeRemotePreferenceBroadcast(
            MessageSocketManager.shared.userPreferencesUpdated.eraseToAnyPublisher()
        )
    }

    /// `internal` : seam d'injection pour les tests, qui poussent leur propre
    /// sujet plutôt que le publisher du socket partagé — même couture que
    /// `service` / `isAuthenticatedOverride`.
    func observeRemotePreferenceBroadcast(
        _ publisher: AnyPublisher<UserPreferencesUpdatedEvent, Never>
    ) {
        publisher
            .filter { Self.namesUserLevelCategory($0) }
            // La remise à zéro globale (`DELETE /me/preferences`) émet UNE FOIS
            // PAR CATÉGORIE effacée — sept événements pour un geste. Sans
            // regroupement, c'est sept `GET /me/preferences` complets (il n'y a
            // pas de `GET` par catégorie : `PreferenceServiceProviding` n'expose
            // que `getAllPreferences()`). La fenêtre collapse la rafale en une
            // relecture, et garantit en prime que le `GET` part APRÈS le dernier
            // événement de la rafale.
            .debounce(for: .seconds(Self.remoteRefreshCoalescingWindow), scheduler: DispatchQueue.main)
            .sink { [weak self] _ in
                Task { [weak self] in await self?.fetchFromBackend() }
            }
            .store(in: &cancellables)
    }

    // MARK: - Private: Socket reconnection (quatrième déclencheur — PÉRENNE)

    /// Le second déclencheur PÉRENNE, à côté des deux déclencheurs de CYCLE DE
    /// VIE (`observeAuth` / `observeForeground`) et du déclencheur VIF
    /// (`observeRemotePreferenceBroadcast`) — à parité d'Android (#4197,
    /// `PreferencesSyncCoordinator`) et du web (#4209,
    /// `startMirroredPreferenceRehydration`).
    ///
    /// Une diffusion n'atteint que les appareils PRÉSENTS pour l'entendre, et
    /// rien ne la rejoue à la reconnexion : un abonnement enregistre un écouteur,
    /// il ne demande pas d'arriéré (leçon 310). Quand le socket tombe puis se
    /// reconnecte alors que l'app reste au PREMIER PLAN — redéploiement gateway,
    /// bascule WiFi↔cellulaire, coupure transitoire —, aucun changement de cycle
    /// de vie ne se produit : `observeAuth`/`observeForeground` ne fire pas, et
    /// le bloc reste périmé jusqu'au prochain aller-retour d'app ou à une
    /// nouvelle diffusion. La reconnexion est le déclencheur qui manquait.
    ///
    /// `didReconnect` ne fire qu'après une reconnexion RÉELLE (garde
    /// `hadPreviousConnection` côté `MessageSocketManager`) : pas de relecture au
    /// premier connect (couvert par `observeAuth`/`initialize`), pas sur un état
    /// `CONNECTED` qui se répète. Aucun étranglement de 5 min ici (contrairement
    /// à `observeForeground`) : une reconnexion est la PREUVE d'une fenêtre
    /// pendant laquelle une annonce a pu être manquée — comme la diffusion.
    ///
    /// `fetchFromBackend()` est réutilisé tel quel : il porte déjà la garde
    /// d'authentification, le veto `pendingCategories` (via `applyRemote`, qui
    /// protège un geste local en vol que l'outbox draine encore au moment de la
    /// reconnexion) et la politique « un échec réseau ne remet rien à zéro ».
    private func observeSocketReconnection() {
        observeSocketReconnection(
            MessageSocketManager.shared.didReconnect.eraseToAnyPublisher()
        )
    }

    /// `internal` : seam d'injection pour les tests, qui poussent leur propre
    /// sujet plutôt que le publisher du socket partagé — même couture que
    /// `observeRemotePreferenceBroadcast(_:)`.
    func observeSocketReconnection(_ publisher: AnyPublisher<Void, Never>) {
        publisher
            // `didReconnect` peut être émis depuis un thread de rappel socket ;
            // on livre le sink sur le main, comme le fait `.debounce(scheduler:)`
            // du déclencheur de diffusion.
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                Task { [weak self] in await self?.fetchFromBackend() }
            }
            .store(in: &cancellables)
    }

    /// Décision pure : cet événement annonce-t-il une catégorie USER-LEVEL ?
    ///
    /// `user:preferences-updated` est une UNION de trois scopes (catégorie,
    /// conversation, communauté) sur un seul nom d'événement. Une relecture
    /// des sept blocs user-level ne doit répondre qu'au premier : sans ce
    /// filtre, chaque épinglage ou sourdine venu d'un autre appareil coûterait
    /// un `GET /me/preferences` complet.
    ///
    /// Deux conditions, et la seconde n'est pas redondante. Le scope
    /// conversation est déjà routé vers un publisher SÉPARÉ
    /// (`userPreferencesConversationUpdated`) par le discriminant du décodeur,
    /// donc `conversationId` est toujours `nil` ici EN PRODUCTION — mais un
    /// `category` hors des sept noms gelés reste possible (charge fabriquée,
    /// gateway plus récent, scope à venir), et une catégorie inconnue n'est
    /// pas une raison de relire. On exige donc que le nom TOMBE dans
    /// `PreferenceCategory` plutôt que de faire confiance à l'absence d'un
    /// champ voisin.
    ///
    /// `nonisolated` : lecture de deux champs immuables, aucun état isolé.
    nonisolated static func namesUserLevelCategory(_ event: UserPreferencesUpdatedEvent) -> Bool {
        event.conversationId == nil && PreferenceCategory(rawValue: event.category) != nil
    }
}
