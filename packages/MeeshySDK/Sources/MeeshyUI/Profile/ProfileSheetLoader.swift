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
    @Published private(set) var profile: MeeshyUser?
    @Published private(set) var stats: UserStats?
    @Published private(set) var isLoadingProfile = false
    @Published private(set) var isLoadingStats = false
    @Published private(set) var isBlockedByTarget = false
    /// Le profil n'a pas pu se charger et rien du cache ne le remplace : la
    /// fiche propose « Réessayer » (#8025). Un cache peint n'est jamais
    /// recouvert d'une erreur, et un refus (403) n'en est pas une.
    @Published private(set) var profileLoadFailed = false

    init() {}

    /// Une deinit isolée au MainActor tue xctest au démontage sur iOS 18.4+/26 (#9694).
    nonisolated deinit {}

    /// Ce que le cache garde, peint sans attendre le réseau.
    func paintFromCache(userId: String?, username: String, using data: any ProfileLoading) async {
        let userId = Self.known(userId)
        let key = Self.lookupKey(userId: userId, username: username)
        guard !key.isEmpty else { return }
        if let cached = CacheFirst.paintable(await data.cachedProfile(for: key)) {
            profile = cached
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
        profileLoadFailed = false
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
            profileLoadFailed = false
            await data.storeProfile(fresh, lookupKey: key)
        } catch APIError.serverError(403, _) {
            markBlockedByTarget()
        } catch APIError.serverError(404, _) where profile != nil {
            markBlockedByTarget()
        } catch MeeshyError.server(statusCode: 404, message: _) where profile != nil {
            markBlockedByTarget()
        } catch MeeshyError.forbidden {
            // Un refus n'est pas une panne : réessayer ne changerait rien.
        } catch {
            profileLoadFailed = profile == nil
        }
    }

    /// La passerelle sert 404 au BLOQUÉ (#10750) — le transport le lève en `MeeshyError.server` : sur une
    /// fiche déjà peinte, rien du cache (décor, actions, statistiques) ne reste.
    private func markBlockedByTarget() {
        isBlockedByTarget = true
        profile = nil
        stats = nil
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
