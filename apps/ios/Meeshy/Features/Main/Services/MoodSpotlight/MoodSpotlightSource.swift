import Foundation
import MeeshySDK
import os

/// Ce dont la page plein écran d'une humeur a besoin : l'humeur elle-même et
/// le profil de son auteur (avatar, bannière). Chaque donnée a deux portes —
/// le CACHE, lu d'abord, et le RÉSEAU, qui revalide.
protocol MoodSpotlightSourcing: Sendable {
    func cachedEntry(statusId: String) async -> StatusEntry?
    func fetchEntry(statusId: String) async throws -> StatusEntry?
    func cachedAuthor(userId: String) async -> MeeshyUser?
    func fetchAuthor(userId: String) async throws -> MeeshyUser
    /// Une humeur ouverte est une humeur VUE : la passerelle marque alors lue
    /// la notification « nouvelle humeur » qui y a mené.
    func recordView(statusId: String) async
}

struct MoodSpotlightSource: MoodSpotlightSourcing {
    private let posts: PostServiceProviding
    private let users: UserServiceProviding

    init(posts: PostServiceProviding = PostService.shared, users: UserServiceProviding = UserService.shared) {
        self.posts = posts
        self.users = users
    }

    func cachedEntry(statusId: String) async -> StatusEntry? {
        for key in ["statuses_friends", "statuses_discover"] {
            if let entry = Self.entries(in: await CacheCoordinator.shared.statuses.load(for: key))
                .first(where: { $0.id == statusId }) {
                return entry
            }
        }
        return nil
    }

    func fetchEntry(statusId: String) async throws -> StatusEntry? {
        try await posts.getPost(postId: statusId).toStatusEntry()
    }

    func cachedAuthor(userId: String) async -> MeeshyUser? {
        Self.entries(in: await CacheCoordinator.shared.profiles.load(for: userId)).first
    }

    func fetchAuthor(userId: String) async throws -> MeeshyUser {
        let user = try await users.getProfileById(userId)
        try? await CacheCoordinator.shared.profiles.save([user], for: user.id)
        return user
    }

    func recordView(statusId: String) async {
        do {
            _ = try await posts.recordSocialEvents(
                [.view(postId: statusId, durationMs: nil, surface: .detail)],
                credential: .account
            )
        } catch {
            Logger.moodSpotlight.error("Mood view not registered: \(error.localizedDescription, privacy: .public)")
        }
    }

    private static func entries<T>(in result: CacheResult<[T]>) -> [T] {
        switch result {
        case .fresh(let values, _), .stale(let values, _): return values
        case .expired, .empty: return []
        }
    }
}
