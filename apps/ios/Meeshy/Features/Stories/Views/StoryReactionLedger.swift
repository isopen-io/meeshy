import Foundation
import MeeshySDK

/// What the reader shows of the current story's reactions (#13135): the count
/// and this viewer's own emojis (the sidebar heart lights up only when THIS
/// viewer has reacted, bug 2026-05-28), the optimistic append and its rollback.
///
/// A transport failure does not roll back: the reaction joins the durable
/// queue under `toggleLikePost` — the gateway serves the story reaction on
/// `POST /posts/:id/like` and logs it as a post like, emoji included. Only a
/// server refusal (409 REACTION_LIMIT_REACHED…) or a queue that refuses the
/// row restores the snapshot taken BEFORE the optimistic append, and only if
/// the viewer is still on that story (`StoryReactionRecovery.decide(for:)`).
@MainActor
final class StoryReactionLedger: ObservableObject {
    @Published private(set) var count = 0
    @Published private(set) var userReactions: [String] = []
    private let service: StoryInteractionService
    private let queue: OfflineQueueing

    init(service: StoryInteractionService = StoryInteractionService(),
         queue: OfflineQueueing = OfflineQueue.shared) {
        self.service = service
        self.queue = queue
    }

    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466) → double-free au
    // démontage hors d'une tâche. Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    var hasReacted: Bool { !userReactions.isEmpty }

    /// A slide starts, or the served story changed (realtime `story:reacted`).
    func begin(count: Int, userReactions: [String]) {
        self.count = count
        self.userReactions = userReactions
    }

    /// `viewing` reads the story on screen when the answer comes back: a
    /// refusal for a story the viewer has left touches nothing.
    @discardableResult
    func react(_ emoji: String, storyId: String, viewing: @escaping () -> String?) -> Task<Void, Never> {
        let snapshot = (count: count, reactions: userReactions)
        if !userReactions.contains(emoji) {
            userReactions.append(emoji)
            count += 1
        }
        return Task {
            guard await !deliver(emoji, storyId: storyId), viewing() == storyId else { return }
            begin(count: snapshot.count, userReactions: snapshot.reactions)
            HapticFeedback.error()
        }
    }

    /// `true` when the reaction reached the server or the durable queue.
    private func deliver(_ emoji: String, storyId: String) async -> Bool {
        do {
            try await service.react(storyId: storyId, emoji: emoji)
            return true
        } catch {
            guard StoryReactionRecovery.decide(for: error) == .queueForReplay else { return false }
            let payload = ToggleLikePostPayload(clientMutationId: ClientMutationId.generate(),
                                                postId: storyId, liked: true, emoji: emoji)
            return (try? await queue.enqueue(.toggleLikePost, payload: payload, conversationId: storyId)) != nil
        }
    }
}
