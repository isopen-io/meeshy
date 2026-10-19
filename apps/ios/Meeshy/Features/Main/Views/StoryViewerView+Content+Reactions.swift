import SwiftUI
import MeeshySDK
import MeeshyUI

extension StoryViewerView {

    // MARK: - Story Reactions

    /// `heartBouncePulse` n'est PLUS tiqué ici — il tique à l'ARRIVÉE du vol
    /// (`StoryReactionFlightView.onArrived`, +Canvas.swift Layer 9), c'est
    /// l'impact qui fait rebondir le cœur (spec scrub 2026-08-11).
    func triggerStoryReaction(_ emoji: String, from originFrame: CGRect? = nil) {
        HapticFeedback.medium()

        if showFullEmojiPicker {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                showFullEmojiPicker = false
            }
        }
        // La barre disparaît VITE (~120 ms) pour laisser la scène au vol
        // (spec scrub 2026-08-11) — l'ancien écho de 0.5 s est supprimé.
        withAnimation(.easeOut(duration: 0.12)) {
            showEmojiStrip = false
        }

        // Vol tuile → cœur ; un tap direct (originFrame nil) part du cœur
        // lui-même : le vol dégénère en pop sur place, même chemin de code.
        let origin = originFrame ?? heartFrame
        reactionFlight = StoryReactionFlight(emoji: emoji, from: origin)

        // Snapshot capturé AVANT la mutation optimiste — cible du rollback si
        // le réseau échoue (409 REACTION_LIMIT_REACHED notamment).
        let priorReactions = storyCurrentUserReactions
        let priorCount = storyReactionCount

        if !storyCurrentUserReactions.contains(emoji) {
            storyCurrentUserReactions.append(emoji)
            storyReactionCount += 1
        }
        sendReaction(emoji: emoji, priorReactions: priorReactions, priorCount: priorCount)
    }

    // MARK: - Send & rollback

    /// `priorReactions`/`priorCount` is the snapshot `triggerStoryReaction` took
    /// BEFORE its optimistic emoji append / counter bump — the sole rollback
    /// target. `StoryInteractionService.react` now throws (most notably the
    /// gateway's 409 REACTION_LIMIT_REACHED conflict), so a rejected reaction
    /// restores the exact prior state instead of leaving a phantom emoji and
    /// an inflated counter forever.
    ///
    /// `interactionService` is injectable (defaults to the real service) so
    /// `StoryViewerReactionRollbackTests` can exercise this exact method —
    /// including the swipe-away guard below — against a `MockAPIClientForApp`
    /// instead of re-implementing the snapshot/rollback logic as local
    /// variables in a test that never calls production code.
    ///
    /// Une PANNE DE TRANSPORT ne rembobine plus : la réaction part dans la file
    /// durable, comme le commentaire de story juste au-dessus, et l'optimisme
    /// affiché reste vrai jusqu'au rejeu. Pas de `kind` dédié — le gateway sert
    /// la réaction de story sur `POST /posts/:id/like`, journalisée
    /// `toggleLikePost` comme un like de post, à l'emoji près. Le tri
    /// transport / refus est `StoryReactionRecovery.decide(for:)` ; le rollback
    /// reste réservé au refus du serveur et à une file qui refuse la ligne.
    ///
    /// `offlineQueue` est injectable pour la même raison que le service ; la
    /// tâche est rendue pour qu'un témoin l'attende au lieu de dormir.
    @discardableResult
    func sendReaction(
        emoji: String,
        priorReactions: [String],
        priorCount: Int,
        interactionService: StoryInteractionService = StoryInteractionService(),
        offlineQueue: OfflineQueueing = OfflineQueue.shared
    ) -> Task<Void, Never> {
        guard let story = currentStory else { return Task {} }
        EngagementTracker.shared.recordAction(.reacted, surface: .storyViewer)

        return Task {
            do {
                try await interactionService.react(storyId: story.id, emoji: emoji)
            } catch {
                guard StoryReactionRecovery.decide(for: error) == .queueForReplay else {
                    rollBackReaction(originatingStoryId: story.id,
                                     priorReactions: priorReactions,
                                     priorCount: priorCount)
                    return
                }
                do {
                    try await offlineQueue.enqueue(
                        .toggleLikePost,
                        payload: ToggleLikePostPayload(
                            clientMutationId: ClientMutationId.generate(),
                            postId: story.id,
                            liked: true,
                            emoji: emoji
                        ),
                        conversationId: story.id
                    )
                } catch {
                    rollBackReaction(originatingStoryId: story.id,
                                     priorReactions: priorReactions,
                                     priorCount: priorCount)
                }
            }
        }
    }

    private func rollBackReaction(originatingStoryId: String, priorReactions: [String], priorCount: Int) {
        guard let target = Self.reactionRollbackTarget(
            currentStoryId: currentStory?.id,
            originatingStoryId: originatingStoryId,
            priorReactions: priorReactions,
            priorCount: priorCount
        ) else { return }
        storyCurrentUserReactions = target.reactions
        storyReactionCount = target.count
        HapticFeedback.error()
    }

    /// Pure rollback decision for a rejected reaction — extracted so the
    /// swipe-away guard is directly unit-testable
    /// (`StoryViewerReactionRollbackTests`) without constructing a live view.
    /// Returns `nil` when the viewer has moved to a different story since the
    /// reaction was sent — those `@State` fields already belong to that other
    /// story now and must not be touched.
    nonisolated static func reactionRollbackTarget(
        currentStoryId: String?,
        originatingStoryId: String,
        priorReactions: [String],
        priorCount: Int
    ) -> (reactions: [String], count: Int)? {
        guard currentStoryId == originatingStoryId else { return nil }
        return (priorReactions, priorCount)
    }
}
