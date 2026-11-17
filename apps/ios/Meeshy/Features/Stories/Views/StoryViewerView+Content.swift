import SwiftUI
import Combine
import AVFoundation
import QuartzCore
import os
import MeeshySDK
import MeeshyUI

// MARK: - Extracted from StoryViewerView.swift

extension StoryViewerView {

    // MARK: - Filter Overlay



    /// Fondu entre deux stories d'un auteur : la sortante reste peinte pendant que
    /// l'entrante, qui joue déjà, apparaît dessus (#18509). En rafale, l'échange
    /// est franc (`StoryNavigationCadence`).
    func crossFadeStory(update: @escaping () -> Void) {
        guard transitionLatch.beginChange() == .authored else { return swapStoryFranchement(update) }
        isTransitioning = true
        let ticket = transitionLatch.begin(.crossFade) { settleCrossFade() }

        outgoingStory = currentStory
        outgoingOpacity = 1
        closingScale = 1.0
        entrance = .armed(for: nil)

        let closingEffect = currentStory?.storyEffects?.closing

        update()
        landIncomingStory()
        StoryNavigationTrace.shared?.swapped(to: currentStory?.id, phase: .transition)

        let incomingEffect = currentStory?.storyEffects?.opening

        entrance = .armed(for: incomingEffect)
        let (animDuration, animation) = StoryOpeningEntrance.animation(for: incomingEffect)

        withAnimation(animation) {
            outgoingOpacity = 0
            entrance = .rest(after: incomingEffect)
            if closingEffect == .zoom { closingScale = StoryRenderer.zoomTransitionScale }
        }

        restartTimer()
        delays.run(after: .seconds(animDuration + 0.04)) { transitionLatch.complete(ticket) }
    }

    private func settleCrossFade() {
        StoryNavigationTrace.shared?.phase = .lecture
        outgoingStory = nil
        isTransitioning = false
        closingScale = 1.0
    }

    private func swapStoryFranchement(_ update: () -> Void) {
        StoryTransitionLatch.instantly {
            outgoingStory = nil
            outgoingOpacity = 0
            closingScale = 1.0
            update()
            entrance = .rest(after: currentStory?.storyEffects?.opening)
        }
        landIncomingStory()
        StoryNavigationTrace.shared?.swapped(to: currentStory?.id, phase: .lecture)
        restartTimer()
    }

    private func landIncomingStory() {
        markCurrentViewed()
        playback.interruptNeighbors()
        if let story = currentStory { prefetchAllMedia(for: story) }
    }

    /// Cube entre deux auteurs : la rotation finit à ±90°, puis la vraie carte
    /// remplace la face entrante à l'identité. Un toucher pendant la rotation la
    /// conclut (#18509). L'état de toucher hérité est purgé : un drag préempté
    /// n'a pas eu son `onEnded`.
    func groupTransition(forward: Bool, update: @escaping () -> Void) {
        guard !isDismissing else { return }
        let style = transitionLatch.beginChange()
        resetGestureTracking()
        guard style == .authored else { return StoryTransitionLatch.instantly { landGroupSwap(update) } }
        isTransitioning = true
        neighborPreviewDirection = forward ? 1 : -1

        let exitX: CGFloat = forward ? -screenW : screenW
        withAnimation(StoryGroupCube.commitAnimation) {
            groupSlide = exitX
        }

        let ticket = transitionLatch.begin(.groupCube) { landGroupSwap(update) }
        delays.run(after: .seconds(StoryGroupCube.swapDelay)) { transitionLatch.complete(ticket) }
    }

    /// Le voile sonore se pose AVANT l'échange : le canvas du nouvel auteur naît
    /// muet sous l'interlude (#18516). Le marquage suit la décision d'interlude
    /// (`adaptiveOnChange(of: currentGroupIndex)`).
    private func landGroupSwap(_ update: () -> Void) {
        groupIntro.veilSound()
        update()
        StoryNavigationTrace.shared?.swapped(to: currentStory?.id, phase: .interlude)
        prefetchCurrentGroup()
        groupSlide = 0
        neighborPreviewDirection = 0
        restartTimer()
        isTransitioning = false
    }

    // MARK: - Timer

    /// L'agrégat de pause (`shouldPauseTimer`) et la boucle vivent dans
    /// `StoryViewerView+PlaybackHold.swift` (#9821).
    func startTimer() {
        progressClock.reset()
        isContentReady = false
        playback.slideDidStart()
        // Toutes les surfaces du reader tombent au changement de slide, pas
        // seulement les commentaires : un strip de langues ou une barre d'emojis
        // laissés ouverts se retrouvaient posés sur la story SUIVANTE, à laquelle
        // ils ne se rapportent plus.
        showCommentsOverlay = false
        showLanguageOptions = false
        showFullLanguagePicker = false
        showEmojiStrip = false
        showFullEmojiPicker = false
        // Reset seam for a scrub whose .onEnded never fires (competing
        // recognizer / system interruption drops it, same hazard documented
        // for the drag axis, `StoryReaderDragTracker`): without this, isScrubbingRail could stay
        // stuck true and shouldPauseTimer would freeze the story forever.
        isScrubbingRail = false
        // Slide changed → the previous slide's reply target, rows and hearts
        // fall, and the count is seeded then reconciled for the new one.
        commentSession.begin(storyId: currentStory?.id, payloadCount: currentStory?.commentCount ?? 0,
                             viewing: { currentStory?.id })
        reactions.begin(count: currentStory?.reactionCount ?? 0,
                        userReactions: currentStory?.currentUserReactions ?? [])
        computedStoryDuration = StorySlideDuration.of(currentStory)

        // PROGRESS = StoryReaderTimerController (SDK), unique display-link de
        // progression. Gating : `markContentReady` (canvas visible via
        // `adaptiveOnChange(of: isContentReady)` + canvas préfetché via
        // `refreshPrefetchWindowAndTimer`) empêche le compte avant contenu ;
        // pause : `setPaused` asservi à `shouldPauseTimer`. La barre, le seuil
        // de prefetch N+1 et `goToNext()` vivent dans les callbacks câblés par
        // `installPrefetchPipelineIfNeeded`. Le wall-clock du controller reste
        // l'autorité de la durée slide (cf. plan Lot 2 — l'asservissement au
        // clock canvas clampé bloquerait l'auto-advance sur les pauses UI).
        refreshPrefetchWindowAndTimer()
        slideTimer.setPaused(shouldPauseTimer)
    }

    /// Restart timer AND clear manual pause (e.g., after drag->transition).
    /// Changement de slide ou sortie de transition : on repart en lecture
    /// fraîche. On désarme **les deux** drapeaux de pause :
    /// - `isPaused` (timer-only)
    /// - `isLongPressPaused` (long-press latch — déclenche `.storyPlayerResume`
    ///   au canvas si on était latched-paused au moment du changement).
    private func restartTimer() {
        isPaused = false
        isLongPressPaused = false
        // Filet de récupération de l'axe de geste. Depuis que la pause du drag
        // est ÉTAT-DIRIGÉE (`drag.isInFlight` dans `shouldPauseTimer`), un axe
        // resté collé gèle la lecture — et SwiftUI ne délivre PAS `onEnded`
        // quand un recognizer concurrent (ScrollView du rail en repli
        // `ViewThatFits`, liste de commentaires) emporte la séquence. Avant ce
        // passage à l'état, la pause était portée par `isPaused`, que cette
        // fonction remettait déjà à false : le changement de slide était la
        // voie de récupération naturelle. La rétablir ici la préserve — sinon
        // taper pour avancer changeait bien de slide, mais la lecture restait
        // figée jusqu'à un changement de GROUPE ou la sortie du lecteur.
        drag.releaseAxis()
        startTimer()
    }

    /// Un écran PLEIN recouvre la story (composeur, citer ou republier en post,
    /// lieu plein écran) : elle se fige, rien ne joue derrière (#9821). Les
    /// feuilles posées SUR la story ne l'appellent pas — elles la font boucler.
    func pauseTimer() { isPaused = true }

    /// Manual resume — symétrique de `pauseTimer()`. N'inverse pas le
    /// long-press latch (`isLongPressPaused`) : si l'utilisateur a stoppé
    /// la story via long-press puis ouvert une sheet, la fermeture de la
    /// sheet ne doit pas relancer la story automatiquement.
    func resumeTimer() {
        isPaused = false
    }

    // MARK: - Initial Action (Phase F — notification entry point)

    /// Honours the optional `initialAction` (set when this viewer was launched
    /// from a story notification redirect). The 250 ms delay lets the
    /// fullScreenCover finish its presentation animation and lets the canvas
    /// (media + progress bars) mount one frame, otherwise the comments overlay
    /// or viewers sheet animates in over a half-blank screen on cold start.
    /// Idempotent via `hasTriggeredInitialAction` — repeated `.onAppear` calls
    /// (scene phase, parent re-renders) are no-ops.
    func triggerInitialActionIfNeeded() {
        guard let action = initialAction, !hasTriggeredInitialAction else { return }
        hasTriggeredInitialAction = true
        delays.run(after: .milliseconds(250)) {
            switch action {
            case .showCommentsOverlay:
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showCommentsOverlay = true
                }
                if commentSession.thread.roots.isEmpty {
                    commentSession.loadRoots()
                }
            case .showViewersSheet:
                showViewersSheet = true
            }
        }
    }

    // MARK: - Dismiss Composer

    func dismissComposer() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil, from: nil, for: nil
        )
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            showTextEmojiPicker = false
            showFullEmojiPicker = false
        }
        isComposerEngaged = false
    }

    // MARK: - Actions

    func sendComment(text: String, effectFlags: Int? = nil, parentId: String? = nil, pendingMedia: PendingCommentMedia? = nil, location: SharedPlace? = nil) {
        guard (!text.isEmpty || pendingMedia != nil), let story = currentStory else { return }
        EngagementTracker.shared.recordAction(.commented, surface: .storyViewer)
        let medias = [pendingMedia].compactMap { $0 }
        let payload = commentSession.stage(StoryCommentDraft(
            storyId: story.id, text: text, effectFlags: effectFlags, parentId: parentId,
            media: medias, location: location, language: composerLanguage
        ), author: AuthManager.shared.currentUser)
        Task {
            StoryInteractionService().noteComment(storyId: story.id)
            if await !commentSession.deliver(payload, media: medias, onCommentsClosed: { StoryCommentSettings.noteClosed(storyId: story.id, in: viewModel) }) {
                returnRefusedStoryComment(storyId: story.id, text: text, medias: medias)
            }
        }
        DispatchQueue.main.async {
            HapticFeedback.success()
            self.dismissComposer()
            self.storyDrafts.removeValue(forKey: story.id)
        }
    }

    // Le compte à rebours d'expiration a quitté le header du reader: il n'existe plus de surface qui l'affiche, donc plus
    // de formateur. `story.expiresAt` reste la source de vérité côté logique
    // (`isExpired(at:)` pilote la sélection de slide et le bandeau « Story
    // expirée ») — c'est seulement la relecture permanente du chrono qui part.

    // MARK: - Delete Story

    func deleteCurrentStory(reason: String? = nil) {
        guard let story = currentStory else { return }
        HapticFeedback.light()
        Task {
            let success = PendingStoryMarker.isPending(storyId: story.id)
                ? await StoryWaitingCancellation.cancelQueued(storyId: story.id, on: viewModel)
                : await viewModel.deleteStory(storyId: story.id, reason: reason)
            DispatchQueue.main.async {
                guard success else { return HapticFeedback.error() }
                HapticFeedback.success()
                dismissViewer()
            }
        }
    }

    // MARK: - Mark Viewed

    /// - Parameter isIntroVisible: surcharge de `showGroupIntro`. Les `@State`
    ///   d'une `View` hors graphe SwiftUI ne retiennent pas les écritures d'un
    ///   test ; sans cette entrée la garde n'est pas vérifiable. Production :
    ///   `nil`, sauf `dismissGroupIntro` qui passe `false` — à cet instant
    ///   l'interlude vient d'être retiré et la story est révélée.
    func markCurrentViewed(isIntroVisible: Bool? = nil) {
        // L'interlude d'identité est OPAQUE et occupe tout l'écran : tant qu'il
        // est affiché, la story n'a rien montré. Marquer ici gonflait le
        // compteur de vues de l'auteur et faisait passer l'anneau en « vu »
        // alors que le lecteur n'avait vu qu'un écran d'identité. Le marquage
        // suit la RÉVÉLATION (`dismissGroupIntro`), pas l'indexation.
        guard !(isIntroVisible ?? showGroupIntro) else { return }
        if let story = currentStory {
            viewModel.markViewed(storyId: story.id)
            // C3 : ce slide vient d'être affiché → 1 impression (source "story") pour CE
            // post-slide, en plus de la vue unique. Chaque changement de slide en émet une.
            viewModel.recordStoryImpression(storyId: story.id)
            // Contenu consommé → ses notifications ne doivent plus être non lues,
            // ET toute notification qui arrive PENDANT la lecture naît consommée
            // (`activePostId`). Idempotent : le manager ignore une story déjà
            // déclarée active et coalesce les appels serveur.
            if let postId = PendingStoryMarker.serverId(of: story.id) { NotificationToastManager.shared.onPostOpened(postId) }
        }
    }
}

// `StoryViewersSheet` et `StoryViewerItem` vivent dans `PublicationViewersSheet.swift` (#9727).
