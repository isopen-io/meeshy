import Foundation
import Combine
import MeeshySDK

/// « QUI EST PRÉVENU » (#14062) — Réglages › Notifications.
///
/// **Cache-first, par compte** : les derniers crans connus s'affichent tout de suite, sans
/// indicateur ; ceux du serveur les remplacent en silence. Sans cache, un
/// compte qui n'a rien réglé lit les défauts (Proche, Proche, Sang) dès que la
/// lecture répond.
///
/// **Écriture optimiste d'UNE clé** : le cran change au geste, et seul ce cran
/// revient en arrière si la passerelle refuse — jamais un autre réglé entre
/// temps. Hors ligne, rien ne part (pas de file d'écriture pour ce réglage) et
/// le cran ne bouge pas.
@MainActor
final class CircleNotifySettingsViewModel: ObservableObject {
    nonisolated deinit {}

    enum LoadState: Equatable {
        case loading
        case loaded
        case unavailable
    }

    nonisolated static let cachePrefix = "circleNotify.lastKnown"

    @Published private(set) var preferences: CircleNotifyPreferences = .defaults
    @Published private(set) var loadState: LoadState = .loading

    private let service: CircleNotifyServiceProviding
    private let networkMonitor: any NetworkMonitorProviding
    private let defaults: UserDefaults
    private let cacheKey: String?
    private let onRefusal: @MainActor (String) -> Void
    private var pending: [CircleNotifyKey: RelationAudienceChoice] = [:]

    init(
        service: CircleNotifyServiceProviding,
        networkMonitor: any NetworkMonitorProviding,
        defaults: UserDefaults = .standard,
        accountId: String?,
        onRefusal: @escaping @MainActor (String) -> Void
    ) {
        self.service = service
        self.networkMonitor = networkMonitor
        self.defaults = defaults
        self.onRefusal = onRefusal
        self.cacheKey = accountId.map { "\(Self.cachePrefix):\($0)" }
        if let cacheKey, let cached = Self.readCache(defaults, key: cacheKey) {
            preferences = cached
            loadState = .loaded
        }
    }

    func load() async {
        do {
            let served = try await service.load()
            preferences = pending.reduce(served) { $0.setting($1.value, for: $1.key) }
            loadState = .loaded
            writeCache()
        } catch {
            if loadState != .loaded { loadState = .unavailable }
        }
    }

    func choose(_ choice: RelationAudienceChoice, for key: CircleNotifyKey) async {
        let previous = preferences[key]
        guard choice != previous else { return }
        guard networkMonitor.isOnline else {
            onRefusal(String(localized: "circleNotify.offline", defaultValue: "Hors ligne : réessayez une fois connecté.", bundle: .main))
            return
        }
        preferences = preferences.setting(choice, for: key)
        pending[key] = choice
        do {
            let served = try await service.update(key, to: choice)
            guard pending[key] == choice else { return }
            pending[key] = nil
            preferences = preferences.setting(served, for: key)
            writeCache()
        } catch {
            guard pending[key] == choice else { return }
            pending[key] = nil
            preferences = preferences.setting(previous, for: key)
            onRefusal(String(localized: "circleNotify.refused", defaultValue: "Ce réglage n’a pas pu être enregistré.", bundle: .main))
        }
    }

    // MARK: - Cache

    private func writeCache() {
        guard let cacheKey else { return }
        let wire = Dictionary(uniqueKeysWithValues: CircleNotifyKey.all.map { ($0.wireName, preferences[$0].rawValue) })
        defaults.set(wire, forKey: cacheKey)
    }

    private static func readCache(_ defaults: UserDefaults, key: String) -> CircleNotifyPreferences? {
        guard let wire = defaults.dictionary(forKey: key) as? [String: String] else { return nil }
        return CircleNotifyKey.all.reduce(CircleNotifyPreferences.defaults) { prefs, key in
            guard let raw = wire[key.wireName], let choice = RelationAudienceChoice(rawValue: raw) else { return prefs }
            return prefs.setting(choice, for: key)
        }
    }
}
