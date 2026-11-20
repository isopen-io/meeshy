import SwiftUI
import Combine
import os
import MeeshySDK
import MeeshyUI

// Sorti de `RootView.swift` : l'orchestration de la révélation liquide du lecteur de réels.

extension RootView {
    // MARK: - Reels Liquid Reveal Orchestration

    /// Opens the reels overlay: animate the wavy disc 0→1 from the feed button.
    /// Two timers fire off the animation: playback starts 0.2s BEFORE the disc is
    /// full (so the reel is already running when revealed), and the mask drops at
    /// full screen (so the live `AVPlayer` surface renders instead of staying
    /// frozen under a persistent `.mask()`). Reduce Motion uses a quick cross-fade.
    /// Le lecteur de réels monté par l'overlay — sorti de `body`, qui portait
    /// ses vingt-cinq lignes d'arguments (cohésion, #15869).
    func reelsPlayer(_ launch: ReelsPresenter.Launch, safeArea: EdgeInsets) -> some View {
        ReelsPlayerView(
            seedPosts: launch.seedPosts,
            startId: launch.startId,
            commentTargetId: launch.commentId,
            commentParentTargetId: launch.parentCommentId,
            revealCompleted: reelsRevealCompleted,
            safeArea: safeArea,
            onClose: { closeReels() },
            onOpenProfile: { userId, username in
                router.deepLinkProfileUser = ProfileSheetUser(userId: userId, username: username)
            },
            onOpenStory: { userId in
                storyViewerCoordinator.present(StoryViewerRequest(
                    id: userId,
                    startAtFirstUnviewed: true,
                    singleGroup: true
                ))
            },
            onOpenDetail: { postId in
                // Ferme le lecteur immersif avant de pousser le détail —
                // sinon la page se pousse SOUS l'overlay (zIndex 60) et
                // reste invisible tant que l'utilisateur ne ferme pas.
                closeReels()
                router.push(.postDetail(postId))
            },
            authorHasStory: { userId in
                storyViewModel.storyRingState(forUserId: userId) != .none
            },
            quoteHost: QuoteComposerHost(storyViewModel: storyViewModel, router: router,
                                         conversationListViewModel: conversationViewModel,
                                         statusViewModel: statusViewModel)
        )
    }

    func openReels() {
        reelsRevealCompleted = false
        reelsRevealClosing = false
        reelsRevealMasked = true
        reelsRevealProgress = 0
        let duration = ReelsRevealMotion.duration(opening: true, reduceMotion: reduceMotionEnabled)
        ReelsRevealMotion.animate(opening: true, reduceMotion: reduceMotionEnabled) {
            reelsRevealProgress = 1
        }
        // Wait for the reveal to FINISH before the first reel plays. Starting
        // earlier played UNDER the (poster-freezing) `.mask()`: those frames were
        // invisible, then dropping the mask snapped the surface to an already-
        // advanced frame — the launch flash. Now, at the animation's end, drop the
        // mask FIRST (the poster / frame 0 shows), THEN start playback from frame 0
        // over the poster that stays underneath (`ReelVideoView` keeps `ReelPoster`
        // behind the surface) → seamless, no flash and no black gap.
        Task {
            guard await cancellableSleep(for: .seconds(duration)) else { return }
            guard reelsPresenter.launch != nil, !reelsRevealClosing else { return }
            reelsRevealMasked = false
            reelsRevealCompleted = true
        }
    }

    var reelsCoverScreen: Bool {
        ReelsCover.isCovered(hasLaunch: reelsPresenter.launch != nil, revealCompleted: reelsRevealCompleted)
    }

    /// Closes the reels overlay with the reverse wave: pause the reel, re-apply
    /// the mask, shrink the disc back toward the feed button (1→0), THEN dismiss.
    /// Reduce Motion cross-fades.
    func closeReels() {
        guard !reelsRevealClosing else { return }
        reelsRevealClosing = true
        reelsRevealCompleted = false
        reelsRevealMasked = true
        SharedAVPlayerManager.shared.pause()
        // Couper aussi tout réel-AUDIO en cours : il est piloté par le moteur
        // externe `@StateObject` de la page (pas par `SharedAVPlayerManager`), et
        // ni `AudioPlayerView.onDisappear` (early-return pour moteur externe) ni
        // `ReelPageView.onChange(isActive)` (la page reste active à la fermeture)
        // ne le stoppent. `stopAllAudio()` coupe les players audio/externes en
        // laissant le moteur vidéo (repris par la surface de fond du feed).
        PlaybackCoordinator.shared.stopAllAudio()
        HapticFeedback.light()
        let duration = ReelsRevealMotion.duration(opening: false, reduceMotion: reduceMotionEnabled)
        ReelsRevealMotion.animate(opening: false, reduceMotion: reduceMotionEnabled) {
            reelsRevealProgress = 0
        }
        Task {
            guard await cancellableSleep(for: .seconds(duration)) else { return }
            reelsPresenter.dismiss()
            reelsRevealClosing = false
        }
    }
}
