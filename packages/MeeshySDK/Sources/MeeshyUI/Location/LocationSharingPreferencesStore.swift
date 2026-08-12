import Foundation
import Combine
import MeeshySDK

/// Singleton `@MainActor` qui persiste les préférences de partage de position
/// en UserDefaults et publie les changements via Combine.
///
/// Miroir exact de `MediaDownloadPreferencesStore` : même debounce, mêmes
/// statiques injectables. Pas de clé legacy — la fonctionnalité est neuve.
@MainActor
public final class LocationSharingPreferencesStore: ObservableObject {
    @MainActor public static let shared = LocationSharingPreferencesStore()

    @Published public var preferences: LocationSharingPreferences

    public static let storageKey = "me.meeshy.locationSharingPreferences"

    private var cancellables = Set<AnyCancellable>()

    private init() {
        self.preferences = Self.load()
        $preferences
            .dropFirst()
            .debounce(for: .milliseconds(100), scheduler: DispatchQueue.main)
            .sink { Self.save($0) }
            .store(in: &cancellables)
    }

    /// Toute lecture qui échoue — clé absente, données illisibles, valeur
    /// d'enum inconnue laissée par une version future — rend les défauts.
    /// `.exact` est le repli sûr : il ne dégrade rien à l'insu de personne.
    public static func load(userDefaults: UserDefaults = .standard) -> LocationSharingPreferences {
        guard let data = userDefaults.data(forKey: storageKey),
              let decoded = try? JSONDecoder().decode(LocationSharingPreferences.self, from: data)
        else { return .defaults }
        return decoded
    }

    public static func save(
        _ prefs: LocationSharingPreferences,
        userDefaults: UserDefaults = .standard
    ) {
        guard let data = try? JSONEncoder().encode(prefs) else { return }
        userDefaults.set(data, forKey: storageKey)
    }
}
