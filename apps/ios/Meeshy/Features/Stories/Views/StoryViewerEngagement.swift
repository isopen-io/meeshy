import Foundation
import MeeshySDK
import MeeshyUI

/// Ce que le lecteur TIENT côté serveur et côté analytique pour la story
/// affichée : sa salle de publication et sa session d'engagement.
///
/// Un seul collaborateur possède les deux, parce qu'ils suivent le même
/// événement — « la story affichée change » — et qu'ils doivent changer
/// ensemble. Le lecteur lui remet la story ; il n'en lit aucun état.
@MainActor
final class StoryViewerEngagement {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free au démontage hors d'une tâche.
    // Garde : MainActorDeinitSourceGuardTests.
    nonisolated deinit {}

    private var postRoomLedger = StoryPostRoomLedger()

    /// Tient la salle de la story affichée, et elle seule (`StoryPostRoomLedger`) : quitter, c'est quitter
    /// la salle réellement rejointe — jamais une story « précédente » recalculée d'un index.
    func holdPostRoom(of story: StoryItem?) {
        let move = postRoomLedger.hold(story?.id)
        if let leave = move.leave { SocialSocketManager.shared.leavePostRoom(postId: leave) }
        if let join = move.join { SocialSocketManager.shared.joinPostRoom(postId: join) }
    }

    /// Finalizes the open `.storyViewer` engagement session and begins one for
    /// `newStory`. The viewer reuses a single surface, so each story switch ends
    /// the previous session (pushing video watch-time when present) before the
    /// next begins. `end` is idempotent when no session is open.
    func transition(to newStory: StoryItem?) {
        let m = SharedAVPlayerManager.shared
        let watchMs = m.currentTime.isNaN ? 0 : Int(m.currentTime * 1000)
        let durMs = m.duration > 0 ? Int(m.duration * 1000) : nil
        let drained = m.drainWatchSamples()
        let maxPos = max(watchMs, drained.samples.map(\.positionMs).max() ?? 0)
        let completed: Bool = {
            if drained.reachedEnd { return true }
            guard let d = durMs, d > 0 else { return false }
            return maxPos >= Int(Double(d) * 0.95)
        }()
        EngagementTracker.shared.attachWatch(surface: .storyViewer, watchMs: watchMs,
            mediaDurationMs: durMs, completed: completed, samples: drained.samples)
        Task {
            await EngagementTracker.shared.end(surface: .storyViewer)
            if let new = newStory {
                EngagementTracker.shared.begin(postId: new.id, contentType: .story, surface: .storyViewer)
            }
        }
    }
}
