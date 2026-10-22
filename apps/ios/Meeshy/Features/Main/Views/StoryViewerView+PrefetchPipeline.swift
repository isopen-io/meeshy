import SwiftUI
import MeeshySDK
import MeeshyUI

extension StoryViewerView {

    // MARK: - P3 wire-up : prefetcher + gated timer (internal for tests)

    /// Languages used by the prefetcher to project `StoryItem → StorySlide`
    /// (Prisme Linguistique chain). Mirrors `resolvedViewerLanguageChain`
    /// — both come from `ReaderPrism.resolve(for:)` (#11832) — but exposed
    /// here so the wire-up integration tests can intercept the call without
    /// touching the private accessor.
    var preferredContentLanguagesForReader: [String] {
        ReaderPrism.resolve(for: AuthManager.shared.currentUser)
    }

    /// Stories of the current group, snapshotted via `currentGroup`. Empty
    /// when the index points past the end of `groups`.
    var currentGroupStories: [StoryItem] {
        currentGroup?.stories ?? []
    }

    /// Slide duration used to arm the gated timer. Mirrors the legacy
    /// `computedStoryDuration` path so a slide with bg-loop video / long
    /// foreground media still gets the rounded-up duration. The legacy
    /// `updateStoryDuration()` writes `computedStoryDuration` synchronously
    /// for the non-preview path (only `isPreviewMode` defers to AVURLAsset),
    /// so reading it here after `refreshPrefetchWindowAndTimer()` calls
    /// `updateStoryDuration()` indirectly via `startTimer()` is safe.
    var currentSlideDuration: TimeInterval {
        computedStoryDuration > 0 ? computedStoryDuration : 6.0
    }

    /// Installs the prefetcher host pipeline once per viewer lifecycle. The
    /// `PrefetcherHostView` representable handles the `attach(to:)` call
    /// inside `makeUIView` — this method only wires the timer callbacks
    /// and latches the install flag so re-entrant `.onAppear` cycles are
    /// no-ops.
    ///
    /// Parameters intentionally exposed so the integration tests can pass
    /// in dedicated prefetcher/timer instances without going through
    /// SwiftUI's `@State` storage (which only binds inside body evaluation).
    /// Production callers always use the defaults.
    func installPrefetchPipelineIfNeeded(
        prefetcher: StoryReaderPrefetcher? = nil,
        timer: StoryReaderTimerController? = nil
    ) {
        guard !hasInstalledPrefetchPipeline else { return }
        hasInstalledPrefetchPipeline = true
        // The prefetcher itself is bootstrapped via
        // `PrefetcherHostView.makeUIView` — this method only owns the
        // timer callbacks (which can't be wired from the representable
        // because the representable cannot read SwiftUI state). The
        // `prefetcher` parameter is part of the API for symmetry with
        // `refreshPrefetchWindowAndTimer(prefetcher:timer:)`; the tests
        // pass it through so the install fence is uniform on both seams.
        _ = prefetcher
        let t = timer ?? self.slideTimer
        // Reset the gated timer so a re-entrant `.onAppear` doesn't keep
        // the previous slide's countdown alive across the host re-install.
        t.reset()
        // Lot 2 (2026-06-11) : le timer gated est désormais l'UNIQUE pilote
        // de progression — le display-link legacy `StoryProgressDisplayLinkProxy`
        // est supprimé. La barre, le seuil de prefetch N+1 et l'auto-advance
        // vivent ici ; la pause est asservie à `shouldPauseTimer` via
        // `adaptiveOnChange` (+ `setPaused` initial dans `startTimer()`).
        t.onProgressChange = { [self] p in
            // Le tick n'écrit AUCUN état du lecteur (#9859) : il publie dans
            // l'horloge de la barre, seule à se redessiner.
            progressClock.publish(p)
            // Le compte ne démarre qu'une fois le contenu à l'écran : son
            // premier tic arme les voisines si `isContentReady` ne l'a pas fait.
            if p > 0 && !hasFiredNextPrefetch {
                hasFiredNextPrefetch = true
                prepareNeighborWindow()
            }
        }
        t.onCompletion = { [self] in
            storyDidReachItsEnd()
        }
    }

    /// Re-arms the prefetcher's sliding window AND the gated slide timer
    /// to track `currentStory`. Called on `.onAppear` and on every change
    /// of `currentStoryIndex` / `currentGroupIndex`.
    ///
    /// 1. Updates the prefetch window to `[N-1, N, N+1]`.
    /// 2. Re-wires `onContentReady` on the prefetched canvas of the
    ///    current slide so the gated timer flips to active the moment
    ///    the background image lands in the shared cache. The visible
    ///    `StoryReaderRepresentable` hits the same cache, so this is a
    ///    strong proxy for "user is actually seeing real content".
    /// 3. Calls `setCurrentSlide(id:duration:)` to reset the gated timer.
    ///
    /// `prefetcher` / `timer` parameters default to the view's `@State`
    /// instances. The integration tests pass in dedicated instances so
    /// the assertions can read window state and slide id without going
    /// through SwiftUI's `@State` storage.
    /// - Parameter paused: surcharge de `shouldPauseTimer`. Les `@State` d'une
    ///   `View` non installée dans le graphe SwiftUI ne retiennent pas les
    ///   écritures faites depuis un test — même raison que les paramètres
    ///   `prefetcher`/`timer` ci-dessus. Sans cette entrée, la préservation de
    ///   la pause n'est pas vérifiable. Production : `nil`.
    /// - Parameter currentIndex: surcharge de `currentStoryIndex`, même raison.
    ///   Réclamée de longue date par le `TODO(test-seam)` de
    ///   `test_storyIndexChange_updatesPrefetcherWindow`, resté désactivé faute
    ///   de ce point d'entrée. Production : `nil`.
    func refreshPrefetchWindowAndTimer(
        prefetcher: StoryReaderPrefetcher? = nil,
        timer: StoryReaderTimerController? = nil,
        paused: Bool? = nil,
        currentIndex: Int? = nil
    ) {
        let p = prefetcher ?? self.prefetcher
        let t = timer ?? self.slideTimer
        let stories = currentGroupStories
        let index = currentIndex ?? currentStoryIndex
        guard !stories.isEmpty,
              stories.indices.contains(index) else {
            t.reset()
            return
        }
        let chain = preferredContentLanguagesForReader
        // Prefetch inter-groupes (Lot 3, #10348) : la slide où ATTERRIT un
        // balayage d'auteur — l'entrée du suivant, la DERNIÈRE du précédent.
        let extraWarmItems = authorSwipeWarmItems()

        let resolver = StoryPostMediaResolver.resolver(covering: stories + extraWarmItems)
        let context = StoryReaderContext(
            preferredLanguages: chain,
            mute: isGlobalMuted,
            onCompletion: nil,
            postMediaURLResolver: resolver,
            imageCache: nil
        )
        p.updateWindow(items: stories,
                       currentIndex: index,
                       context: context,
                       preferredLanguages: chain,
                       extraWarmItems: extraWarmItems)

        let current = stories[index]
        // PREFETCHER CANVASES RESTENT EN `.edit` (jamais promus en `.play`).
        //
        // Le promote-au-`.play` du canvas prefetcher du slide courant a été
        // retiré 2026-05-28 : il créait une double-lecture parallèle avec le
        // `StoryReaderRepresentable` visible (qui est, lui, instancié en
        // `.play` par `makeUIView`). Chaque slide visible avait alors DEUX
        // canvases qui démarraient leur AVPlayer bg + leur audio mixer + leurs
        // AVPlayer FG. `PlaybackCoordinator` mutex-stoppait le second audio
        // mixer mais ni les bg/FG AVPlayer ni leur piste audio embarquée
        // (= bleed audio + bleed vidéo bg).
        //
        // Le prefetcher conserve son rôle de **cache chaud** : ses canvases
        // restent en `.edit` à vie pour pré-décoder l'image bg, charger
        // l'asset AVPlayer, etc. Le canvas visible (StoryReaderRepresentable)
        // est la SEULE source de lecture média.
        t.setCurrentSlide(id: current.id, duration: currentSlideDuration)
        // `setCurrentSlide` remet `isPaused = false` par contrat (« a new slide
        // always starts un-paused »). Sans la ligne suivante, tout ré-armement
        // survenant PENDANT une pause la relâche en silence : `startTimer()` se
        // protégeait déjà, mais pas les ré-armements déclenchés par les
        // `adaptiveOnChange` de `currentStoryIndex` / `currentGroupIndex`. Et
        // `adaptiveOnChange(of: shouldPauseTimer)` ne rattrape rien — la valeur
        // n'a pas *changé*, donc SwiftUI ne refire pas le closure.
        //
        // Symptôme mesuré : 3 s d'horloge intégrées sous l'interlude d'identité
        // (la moitié d'une slide de 6 s), et un long-press maintenu pendant un
        // changement de slide qui ne gelait plus rien.
        //
        // La garde vit ICI, au seul point d'appel de `setCurrentSlide`, pour
        // couvrir aussi les appelants futurs.
        t.setPaused(paused ?? shouldPauseTimer)

        // Re-wire `onContentReady` on the prefetched canvas of the
        // CURRENT slide. The prefetcher's canvas reports readiness once
        // its background image bytes land — same cache as the visible
        // canvas, so this is a strong proxy. `[weak t = t]` captures the
        // timer reference weakly so an in-flight onContentReady ping after
        // the viewer is torn down doesn't keep the timer alive.
        if let canvas = p.view(for: current.id) {
            let slideId = current.id
            canvas.onContentReady = { [weak t = t] in
                t?.markContentReady(slideId: slideId)
            }
            // The prefetcher bootstrapped this canvas before we could attach
            // the callback — its `scheduleContentReadyEvaluation` may have
            // already fired (solidColor backgrounds fire on the next runloop
            // tick). When that happens `contentReadyFired == true` and our
            // newly-attached callback would never be invoked. Fast-forward
            // the timer here so the loader doesn't stick on already-settled
            // backgrounds.
            if canvas.contentReadyFired {
                t.markContentReady(slideId: slideId)
            }
        }
    }
}
