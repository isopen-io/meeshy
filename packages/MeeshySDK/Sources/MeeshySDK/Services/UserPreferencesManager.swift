import Foundation
import UIKit
import Combine

@MainActor
public final class UserPreferencesManager: ObservableObject {
    public static let shared = UserPreferencesManager()

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

    private let service = PreferenceService.shared
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()
    private var syncTasks: [PreferenceCategory: Task<Void, Never>] = [:]
    private var cancellables = Set<AnyCancellable>()

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

    private static let keyPrefix = "meeshy_prefs_"
    private static let lastSyncKey = "meeshy_prefs_last_sync"
    private static let minSyncInterval: TimeInterval = 5 * 60

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

        observeAuth()
        observeForeground()
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
        guard AuthManager.shared.isAuthenticated else { return }
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
        // NE PAS vider `cancellables` : il ne porte QUE les abonnements
        // process-lifetime posés une seule fois à l'init (`observeAuth` /
        // `observeForeground`). Les vider au premier logout tuait
        // définitivement le re-fetch des préférences au login suivant et la
        // re-sync au retour foreground.

        for category in PreferenceCategory.allCases {
            UserDefaults.standard.removeObject(forKey: Self.keyPrefix + category.rawValue)
        }
        UserDefaults.standard.removeObject(forKey: Self.lastSyncKey)
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

        guard AuthManager.shared.isAuthenticated else { return }
        try? await service.resetPreferences(category: category)
    }

    // MARK: - Private: Local Persistence

    private func persist<T: Encodable>(_ value: T, category: PreferenceCategory) {
        guard let data = try? encoder.encode(value) else { return }
        UserDefaults.standard.set(data, forKey: Self.keyPrefix + category.rawValue)
    }

    private static func load<T: Decodable>(_ category: PreferenceCategory) -> T? {
        guard let data = UserDefaults.standard.data(forKey: keyPrefix + category.rawValue) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    // MARK: - Private: Debounced Backend Sync

    private func scheduleSyncToBackend(_ category: PreferenceCategory) {
        syncTasks[category]?.cancel()
        pendingCategories.insert(category)
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
        defer { pendingCategories.remove(category) }
        guard AuthManager.shared.isAuthenticated else { return }
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

    // MARK: - Private: Observers

    private func observeAuth() {
        AuthManager.shared.$isAuthenticated
            .dropFirst()
            .removeDuplicates()
            .filter { $0 }
            .sink { [weak self] _ in
                Task { [weak self] in await self?.fetchFromBackend() }
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
}
