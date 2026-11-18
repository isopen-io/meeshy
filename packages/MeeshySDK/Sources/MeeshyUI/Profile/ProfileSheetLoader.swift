import Foundation
import Combine
import MeeshySDK

// MARK: - Ce que la fiche d'un profil lit, et dans quel ordre (#10093)
//
// La fiche se PEINT d'abord depuis le cache — profil et statistiques — puis se SYNCHRONISE dès l'ouverture, même
// quand le cache est frais : ouvrir une fiche, c'est vouloir la voir à jour. Le squelette ne se montre que sur un
// cache vide ; un échec de synchronisation ne retire jamais ce qui est affiché.

@MainActor
final class ProfileSheetLoader: ObservableObject {
    /// Un décor d'un pack non embarqué charge son contrat servi : la fiche se repeint à son arrivée (#16264).
    @Published private(set) var profile: MeeshyUser? {
        didSet { loadServedDecor(profile?.profileDecor) }
    }
    @Published private(set) var stats: UserStats?
    @Published private(set) var isLoadingProfile = false
    @Published private(set) var isLoadingStats = false
    /// Introuvable, privé ou il m'a bloqué : la fiche rend « Personne ici », le même écran pour les trois (loi 9).
    @Published private(set) var isUnavailable = false
    /// Pourquoi la dernière synchronisation a échoué ; `nil` quand elle a abouti. Un refus n'en est pas une.
    @Published private(set) var failure: ProfileLoadFailure?
    /// L'âge du profil peint depuis le cache, pour dire de quand date une fiche lue hors ligne (#18873).
    @Published private(set) var cachedAge: TimeInterval?

    /// Le profil n'a pas pu se charger et rien du cache ne le remplace : la
    /// fiche propose « Réessayer » (#8025). Un cache peint n'est jamais
    /// recouvert d'une erreur, et un refus (403) n'en est pas une.
    var profileLoadFailed: Bool { profile == nil && failure != nil }

    /// L'écran que la fiche rend, je l'aie bloqué ou non (#18873).
    func phase(isBlockedByMe: Bool) -> ProfileSheetPhase {
        ProfileSheetPhase.resolve(isBlockedByMe: isBlockedByMe, isUnavailable: isUnavailable, hasProfile: profile != nil,
                                  isLoading: isLoadingProfile, failure: failure, cachedAge: cachedAge)
    }

    private let served: any ServedAppearanceProviding
    private var servedSubscription: AnyCancellable?
    private var servedDecorLoad: Task<Void, Never>?

    init(served: any ServedAppearanceProviding = ServedAppearanceRefresh.store) {
        self.served = served
        servedSubscription = served.changes
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in MainActor.assumeIsolated { self?.objectWillChange.send() } }
    }

    private func loadServedDecor(_ decor: ServedProfileDecor?) {
        let missing = ProfileDecorResolver.missingContracts(decor, served: served)
        guard !missing.isEmpty else { return }
        let served = self.served
        servedDecorLoad?.cancel()
        servedDecorLoad = Task {
            for src in missing { await served.load(src: src) }
        }
    }

    /// Une deinit isolée au MainActor tue xctest au démontage sur iOS 18.4+/26 (#9694).
    nonisolated deinit {}

    /// Ce que le cache garde, peint sans attendre le réseau.
    func paintFromCache(userId: String?, username: String, using data: any ProfileLoading) async {
        let userId = Self.known(userId)
        let key = Self.lookupKey(userId: userId, username: username)
        guard !key.isEmpty else { return }
        let cachedProfile = await data.cachedProfile(for: key)
        if let cached = CacheFirst.paintable(cachedProfile) {
            profile = cached
            cachedAge = Self.age(of: cachedProfile)
        }
        if let id = userId ?? profile?.id, let cached = CacheFirst.paintable(await data.cachedStats(for: id)) {
            stats = cached
        }
        isLoadingProfile = profile == nil
        isLoadingStats = stats == nil
    }

    /// Peint le cache, puis synchronise profil et statistiques.
    func open(userId: String?, username: String, using data: any ProfileLoading) async {
        let userId = Self.known(userId)
        let key = Self.lookupKey(userId: userId, username: username)
        guard !key.isEmpty else { return }
        await paintFromCache(userId: userId, username: username, using: data)
        if let id = userId ?? profile?.id {
            async let syncedProfile: Void = synchronizeProfile(key, using: data)
            async let syncedStats: Void = synchronizeStats(id, using: data)
            _ = await (syncedProfile, syncedStats)
            return
        }
        await synchronizeProfile(key, using: data)
        guard let resolved = profile?.id else {
            isLoadingStats = false
            return
        }
        await synchronizeStats(resolved, using: data)
    }

    /// « Réessayer » : rejoue l'ouverture — le cache d'abord, puis la synchronisation.
    func retry(userId: String?, username: String, using data: any ProfileLoading) async {
        failure = nil
        await open(userId: userId, username: username, using: data)
    }

    /// Le pair s'est renommé ou a changé de photo pendant que sa fiche est ouverte.
    func repaint(_ user: MeeshyUser) {
        profile = user
    }

    private func synchronizeProfile(_ key: String, using data: any ProfileLoading) async {
        defer { isLoadingProfile = false }
        do {
            let fresh = try await data.fetchProfile(handle: key)
            profile = fresh
            failure = nil
            cachedAge = nil
            await data.storeProfile(fresh, lookupKey: key)
        } catch APIError.serverError(403, _), APIError.serverError(404, _) {
            markUnavailable()
        } catch MeeshyError.server(statusCode: 404, message: _), MeeshyError.server(statusCode: 403, message: _) {
            markUnavailable()
        } catch MeeshyError.forbidden {
            markUnavailable()
        } catch {
            failure = ProfileLoadFailure.classify(error)
        }
    }

    /// Introuvable, privé, ou la passerelle sert 404 au BLOQUÉ (#10750, loi 9) : un refus n'est pas une panne,
    /// réessayer ne changerait rien, et rien du cache (décor, actions, statistiques) ne reste peint.
    private func markUnavailable() {
        isUnavailable = true
        failure = nil
        cachedAge = nil
        profile = nil
        stats = nil
    }

    private static func age(of result: CacheResult<[MeeshyUser]>) -> TimeInterval? {
        switch result {
        case .fresh(_, let age), .stale(_, let age): return age
        case .expired, .empty: return nil
        }
    }

    private func synchronizeStats(_ userId: String, using data: any ProfileLoading) async {
        defer { isLoadingStats = false }
        guard let fresh = try? await data.fetchStats(userId: userId) else { return }
        stats = fresh
        await data.storeStats(fresh, userId: userId)
    }

    private static func known(_ userId: String?) -> String? {
        guard let userId, !userId.isEmpty else { return nil }
        return userId
    }

    private static func lookupKey(userId: String?, username: String) -> String {
        userId ?? username
    }
}
