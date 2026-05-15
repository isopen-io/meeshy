import Foundation

/// Single source of truth for "how does the current user relate to this other
/// user?" — combines friendship status with block state so every profile-
/// rendering surface (Discover, Contacts cells, profile sheet, mentions, …)
/// can show the same state without reimplementing the resolution rules.
public enum UserRelationshipState: Equatable, Sendable {
    /// The userId is the currently authenticated user.
    case current
    /// The currently authenticated user has blocked this user.
    case blocked
    /// Accepted friend.
    case connected
    /// Current user sent a friend request that is still pending.
    case pendingSent(requestId: String)
    /// Current user received a friend request that is still pending.
    case pendingReceived(requestId: String)
    /// No relationship.
    case none

    /// Convenience: does this state represent any kind of pending request?
    public var isPending: Bool {
        switch self {
        case .pendingSent, .pendingReceived: return true
        default: return false
        }
    }
}

/// Resolves a user's relationship state by combining the in-memory friendship
/// cache and the block service. Both are local stores, so resolution is
/// synchronous and cheap — call it on every render.
///
/// The resolver is `@MainActor` because its default `currentUserIdProvider`
/// reads `AuthManager.shared.currentUser` which is itself `@MainActor`. All
/// SwiftUI views and `@MainActor` ViewModels can call `resolve()` directly;
/// callers from other isolation domains must hop to the main actor first.
@MainActor
public final class UserRelationshipResolver {
    private let friendshipCache: FriendshipCache
    private let blockService: BlockServiceProviding
    private let currentUserIdProvider: () -> String?

    public init(
        friendshipCache: FriendshipCache = .shared,
        blockService: BlockServiceProviding = BlockService.shared,
        currentUserIdProvider: @escaping () -> String? = { AuthManager.shared.currentUser?.id }
    ) {
        self.friendshipCache = friendshipCache
        self.blockService = blockService
        self.currentUserIdProvider = currentUserIdProvider
    }

    /// Shared resolver wired to the production singletons. MainActor-isolated
    /// — same access pattern as `AuthManager.shared`.
    public static let shared = UserRelationshipResolver()

    public func resolve(userId: String) -> UserRelationshipState {
        guard !userId.isEmpty else { return .none }
        if let me = currentUserIdProvider(), me == userId { return .current }
        if blockService.isBlocked(userId: userId) { return .blocked }
        switch friendshipCache.status(for: userId) {
        case .friend: return .connected
        case .pendingSent(let id): return .pendingSent(requestId: id)
        case .pendingReceived(let id): return .pendingReceived(requestId: id)
        case .none: return .none
        }
    }
}
