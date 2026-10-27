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

        guard let story = currentStory else { return }
        EngagementTracker.shared.recordAction(.reacted, surface: .storyViewer)
        reactions.react(emoji, storyId: story.id, viewing: { currentStory?.id })
    }
}
