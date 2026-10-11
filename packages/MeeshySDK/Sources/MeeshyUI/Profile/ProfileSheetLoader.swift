import Foundation
import Combine
import MeeshySDK

// MARK: - Ce que la fiche d'un profil lit, et dans quel ordre (#10093)
//
// La fiche se PEINT d'abord depuis le cache — profil et statistiques — puis se SYNCHRONISE dès l'ouverture, même
// quand le cache est frais : ouvrir une fiche, c'est vouloir la voir à jour. Le squelette ne se montre que sur un
// cache vide ; un échec de synchronisation ne retire jamais ce qui est affiché.

@MainActor
protocol ProfileSheetDataProviding: AnyObject {
    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]>
    func fetchProfile(handle: String) async throws -> MeeshyUser
    func storeProfile(_ user: MeeshyUser, lookupKey: String) async
    func cachedStats(for userId: String) async -> CacheResult<[UserStats]>
    func fetchStats(userId: String) async throws -> UserStats
    func storeStats(_ stats: UserStats, userId: String) async
}

@MainActor
final class ProfileSheetLoader: ObservableObject {
    @Published private(set) var profile: MeeshyUser?
    @Published private(set) var stats: UserStats?
    @Published private(set) var isLoadingProfile = false
    @Published private(set) var isLoadingStats = false
    @Published private(set) var isBlockedByTarget = false

    private let data: ProfileSheetDataProviding

    init(data: ProfileSheetDataProviding? = nil) {
        self.data = data ?? LiveProfileSheetData()
    }

    /// Une deinit isolée au MainActor tue xctest au démontage sur iOS 18.4+/26 (#9694).
    nonisolated deinit {}

    /// Ce que le cache garde, peint sans attendre le réseau.
    func paintFromCache(userId: String?, username: String) async {
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
    func open(userId: String?, username: String) async {
        let userId = Self.known(userId)
        let key = Self.lookupKey(userId: userId, username: username)
        guard !key.isEmpty else { return }
        await paintFromCache(userId: userId, username: username)
        if let id = userId ?? profile?.id {
            async let syncedProfile: Void = synchronizeProfile(key)
            async let syncedStats: Void = synchronizeStats(id)
            _ = await (syncedProfile, syncedStats)
            return
        }
        await synchronizeProfile(key)
        guard let resolved = profile?.id else {
            isLoadingStats = false
            return
        }
        await synchronizeStats(resolved)
    }

    /// Le pair s'est renommé ou a changé de photo pendant que sa fiche est ouverte.
    func repaint(_ user: MeeshyUser) {
        profile = user
    }

    private func synchronizeProfile(_ key: String) async {
        defer { isLoadingProfile = false }
        do {
            let fresh = try await data.fetchProfile(handle: key)
            profile = fresh
            await data.storeProfile(fresh, lookupKey: key)
        } catch let error as APIError {
            if case .serverError(403, _) = error { isBlockedByTarget = true }
        } catch {}
    }

    private func synchronizeStats(_ userId: String) async {
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

// MARK: - Le cache et le réseau réels

@MainActor
final class LiveProfileSheetData: ProfileSheetDataProviding {

    nonisolated deinit {}

    func cachedProfile(for key: String) async -> CacheResult<[MeeshyUser]> {
        let result = await CacheCoordinator.shared.profiles.load(for: key)
        // Chaque visite prolonge la vie de l'entrée (30 jours) : une fiche revisitée ne repart pas à froid.
        await CacheCoordinator.shared.profiles.touch(for: key)
        return result
    }

    func fetchProfile(handle: String) async throws -> MeeshyUser {
        // `presence` POSE la question (#9063) : la passerelle ne sert `isOnline` / `lastActiveAt` qu'à un ami
        // accepté, sous les réglages de la personne regardée.
        let user = try await UserService.shared.getProfile(handle: handle, expand: [.presence]).user
        UserDisplayNameCache.shared.trackFromUser(user)
        return user
    }

    func storeProfile(_ user: MeeshyUser, lookupKey: String) async {
        try? await CacheCoordinator.shared.profiles.save([user], for: user.id)
        // Ouverte par pseudo, la fiche range aussi l'entrée sous ce pseudo : la prochaine ouverture par pseudo
        // se peint depuis le cache au lieu de repartir à froid.
        if lookupKey != user.id {
            try? await CacheCoordinator.shared.profiles.save([user], for: lookupKey)
        }
        await CacheCoordinator.shared.profiles.touch(for: user.id)
        await SearchIndex.shared.indexUsers([user])
    }

    func cachedStats(for userId: String) async -> CacheResult<[UserStats]> {
        await CacheCoordinator.shared.profileStats.load(for: userId)
    }

    func fetchStats(userId: String) async throws -> UserStats {
        try await UserService.shared.getUserStats(userId: userId)
    }

    func storeStats(_ stats: UserStats, userId: String) async {
        try? await CacheCoordinator.shared.profileStats.save([stats], for: userId)
    }
}
