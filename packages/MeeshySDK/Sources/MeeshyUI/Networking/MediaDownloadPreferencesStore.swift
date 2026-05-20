import Foundation
import Combine
import MeeshySDK

/// Singleton @MainActor qui persiste les préférences média en UserDefaults
/// et publie les changements via Combine. Migré au démarrage depuis l'ancien
/// format 6-booleans wifi/cellular s'il est présent.
@MainActor
public final class MediaDownloadPreferencesStore: ObservableObject {
    @MainActor public static let shared = MediaDownloadPreferencesStore()

    @Published public var preferences: MediaDownloadPreferences

    public static let storageKey = "me.meeshy.mediaDownloadPreferences"
    public static let legacyStorageKey = "meeshy_media_download_prefs"

    private var cancellables = Set<AnyCancellable>()

    private init() {
        self.preferences = Self.loadOrMigrate()
        $preferences
            .dropFirst()
            .debounce(for: .milliseconds(100), scheduler: DispatchQueue.main)
            .sink { Self.save($0) }
            .store(in: &cancellables)
    }

    public static func loadOrMigrate(userDefaults: UserDefaults = .standard) -> MediaDownloadPreferences {
        if let data = userDefaults.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(MediaDownloadPreferences.self, from: data) {
            return decoded
        }
        if let legacyData = userDefaults.data(forKey: legacyStorageKey),
           let legacy = try? JSONDecoder().decode(LegacyPreferences.self, from: legacyData) {
            let migrated = MediaDownloadPreferences(
                image: legacy.imagesOnWifi
                    ? (legacy.imagesOnCellular ? .always : .wifiOnly)
                    : .never,
                audio: legacy.audioOnWifi
                    ? (legacy.audioOnCellular ? .always : .wifiOnly)
                    : .never,
                audioTranslation: .wifiOnly,
                video: legacy.videoOnWifi
                    ? (legacy.videoOnCellular ? .always : .wifiOnly)
                    : .never
            )
            save(migrated, userDefaults: userDefaults)
            userDefaults.removeObject(forKey: legacyStorageKey)
            return migrated
        }
        return .defaults
    }

    public static func save(_ prefs: MediaDownloadPreferences, userDefaults: UserDefaults = .standard) {
        guard let data = try? JSONEncoder().encode(prefs) else { return }
        userDefaults.set(data, forKey: storageKey)
    }

    /// Snapshot du format legacy 6-booleans pour la migration uniquement.
    private struct LegacyPreferences: Codable {
        var imagesOnWifi: Bool = true
        var imagesOnCellular: Bool = true
        var audioOnWifi: Bool = true
        var audioOnCellular: Bool = false
        var videoOnWifi: Bool = true
        var videoOnCellular: Bool = false
    }
}
