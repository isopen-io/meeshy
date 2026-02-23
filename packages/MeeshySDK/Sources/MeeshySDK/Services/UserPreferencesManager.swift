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

    // MARK: - Convenience: Data-Saving Queries

    public var shouldAutoDownloadMedia: Bool { document.autoDownloadEnabled }

    public func shouldAutoDownload(fileSizeMB: Int = 0) -> Bool {
        guard document.autoDownloadEnabled else { return false }
        return fileSizeMB <= 0 || fileSizeMB <= document.autoDownloadMaxSize
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
        syncTasks[category] = Task {
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            guard !Task.isCancelled else { return }
            await syncCategoryToBackend(category)
        }
    }

    private func syncCategoryToBackend(_ category: PreferenceCategory) async {
        guard AuthManager.shared.isAuthenticated else { return }
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

    // MARK: - Private: Apply Remote (server wins)

    private func applyRemote(_ remote: UserPreferences) {
        let localExtras = collectLocalExtras()

        privacy = mergeExtras(remote.privacy, localExtras: localExtras[.privacy])
        audio = mergeExtras(remote.audio, localExtras: localExtras[.audio])
        message = mergeExtras(remote.message, localExtras: localExtras[.message])
        notification = mergeExtras(remote.notification, localExtras: localExtras[.notification])
        video = mergeExtras(remote.video, localExtras: localExtras[.video])
        document = mergeExtras(remote.document, localExtras: localExtras[.document])
        application = mergeExtras(remote.application, localExtras: localExtras[.application])

        persist(privacy, category: .privacy)
        persist(audio, category: .audio)
        persist(message, category: .message)
        persist(notification, category: .notification)
        persist(video, category: .video)
        persist(document, category: .document)
        persist(application, category: .application)
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
