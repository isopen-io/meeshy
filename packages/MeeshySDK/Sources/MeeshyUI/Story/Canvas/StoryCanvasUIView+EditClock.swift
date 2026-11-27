import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + EditClock

extension StoryCanvasUIView {
    func startEditDisplayLinkIfNeeded() {
        guard EditClockArming.shouldArm(isEditing: mode == .edit,
                                        isInteractive: isUserInteractionEnabled),
              editDisplayLink == nil else { return }
        let link = WeakDisplayLinkTarget.makeLink(frameRateRange: .gesture) { [weak self] link in
            guard let self else {
                link.invalidate()
                return
            }
            self.editTick(link)
        }
        link.add(to: .main, forMode: .common)
        editDisplayLink = link
        // Fresh grace window every time the link is (re)armed — opening the
        // composer, or reattaching after a cover/sheet dismiss — so a screen
        // that just appeared never idles down before the user gets a chance
        // to touch it (issue #3906).
        lastEditInteractionAt = CACurrentMediaTime()
        isEditClockThrottled = false
    }

    func stopEditDisplayLink() {
        editDisplayLink?.invalidate()
        editDisplayLink = nil
        isEditClockThrottled = false
    }

    @objc func editTick(_ link: CADisplayLink) {
        driveEditClock(now: link.timestamp)
    }

    /// Core of `editTick`, extracted so `_driveEditClockForTesting(now:)` can
    /// exercise the idle-throttle decision without spinning a real
    /// `CADisplayLink`.
    ///
    /// Issue #3906 — a screen nobody is touching (no gesture, no keystroke,
    /// no active playback) must not keep the display's high-refresh clock —
    /// nor the ambient edit-mode preview loop it drives — running forever.
    /// Idling down PAUSES `editDisplayLink` itself: once paused, no further
    /// tick arrives, so waking back up is entirely the job of
    /// `noteEditInteraction()`, called from every interaction entry point.
    func driveEditClock(now: CFTimeInterval) {
        let regime = EditClockThrottle.regime(now: now,
                                              lastInteractionAt: lastEditInteractionAt,
                                              isMediaActivelyPlaying: isEditMediaActivelyPlaying)
        guard regime == .full else {
            idleDownEditClock()
            return
        }
        // Gesture handlers drive their own rebuilds; the tick keeps the 120 Hz
        // clock alive on ProMotion while editing AND (WS2.1) re-feeds the glass
        // text backdrop so it tracks a playing video background between rebuilds.
        refreshEditGlassBackdropIfNeeded(now: now)
        // #4999 — et repose la pose des décorations animées sur les couches
        // déjà montées. Aucune reconstruction : la passe ne touche que la
        // transformation et l'opacité, et elle sort au premier `guard` quand la
        // scène ne porte aucune décoration animée — le cas courant.
        refreshStickerMotion(now: now)
    }

    /// `true` while a media clock genuinely needs `editDisplayLink` at full
    /// rate regardless of touch activity — currently only the timeline
    /// preview transport actually PLAYING (`StoryCanvasTimelineBridge
    /// .setPlaying(true)`). Deliberately excludes the ambient
    /// `playsVideoInEditMode` / `playsAudioInEditMode` loop: that loop is
    /// exactly what idling is meant to suspend (see `EditClockThrottle`).
    var isEditMediaActivelyPlaying: Bool {
        isTimelinePreviewActive && timelinePreviewPlaying
    }

    /// Feeds `EditClockThrottle`. Called by every gesture entry point
    /// (`gestureRecognizerShouldBegin`), by inline text edits
    /// (`textViewDidChange`), by the timeline-preview transport
    /// (`setTimelinePreview` / `setTimelinePreviewPlaying`) and by every
    /// real slide mutation while editing (`slide.didSet`). Resets the idle
    /// clock and, if the clock was throttled down, immediately restores full
    /// rate and resumes the suspended preview loop — an interaction must
    /// never wait out any part of the idle delay to feel responsive again.
    func noteEditInteraction() {
        lastEditInteractionAt = CACurrentMediaTime()
        // Un son que quelqu'un d'autre a coupé (une écoute dans une feuille,
        // un lecteur voisin) reprend à la phase de la scène dès qu'on y
        // revient — seul le propriétaire du son le peut (#10362).
        resumeEditAudioIfSilenced()
        guard isEditClockThrottled else { return }
        resumeEditClockFromIdle()
    }

    private func idleDownEditClock() {
        guard !isEditClockThrottled else { return }
        isEditClockThrottled = true
        editDisplayLink?.isPaused = true
        suspendEditModeMediaForIdle()
        onEditClockThrottleChanged?(true)
    }

    private func resumeEditClockFromIdle() {
        isEditClockThrottled = false
        editDisplayLink?.isPaused = false
        resumeEditModeMediaFromIdle()
        onEditClockThrottleChanged?(false)
    }

    /// Suspends the ambient edit-mode preview loop when the edit clock idles
    /// down: background + foreground video (`playsVideoInEditMode`) and the
    /// foreground/background audio mixer (`playsAudioInEditMode`). A SOFT
    /// pause — players stay attached, the mixer's schedule stays intact — so
    /// `resumeEditModeMediaFromIdle()` can restart in place with no reload
    /// and no audible restart-from-zero.
    ///
    /// Le son n'est PAS suspendu (`EditIdleSuspension`, #10362) : la boucle
    /// audio de la scène joue tant qu'on compose, touche ou pas.
    func suspendEditModeMediaForIdle() {
        guard mode == .edit else { return }
        let suspended = EditIdleSuspension.suspended(playsVideo: playsVideoInEditMode,
                                                     playsAudio: playsAudioInEditMode)
        if suspended.contains(.video) {
            backgroundLayer.isPlaybackActive = false
            forEachAVPlayer { $0.pause() }
        }
        if suspended.contains(.audio) {
            audioMixer.pause()
        }
    }

    /// Resumes the ambient edit-mode preview loop suspended by
    /// `suspendEditModeMediaForIdle()`. Reuses `applyEditPlayback()` for the
    /// video branch (idempotent — exactly what re-flipping
    /// `playsVideoInEditMode` already does) and calls `startEditAudioPlayback()`
    /// directly for audio: `reconfigureAudioForPlayback()` (which
    /// `applyEditPlayback()` also calls) is gated on `slideAudioRevision` and
    /// would no-op here since the composition hasn't changed — it would
    /// never actually resume the transport. Both no-op while a timeline
    /// preview owns the transport (`isTimelinePreviewActive`), by the same
    /// guards `applyEditPlayback()`/`startEditAudioPlayback()` already carry.
    func resumeEditModeMediaFromIdle() {
        guard mode == .edit else { return }
        applyEditPlayback()
        if playsAudioInEditMode {
            startEditAudioPlayback()
        }
    }

    /// Test-only seam: drives the idle-throttle decision exactly as
    /// `editTick` does, at an explicit timestamp, without spinning a real
    /// `CADisplayLink`.
    public func _driveEditClockForTesting(now: CFTimeInterval) {
        driveEditClock(now: now)
    }

    /// WS2.1 — keep glass-style text backdrops in sync with a PLAYING video
    /// background while editing. `rebuildLayers()` only re-captures the backdrop
    /// on a model mutation, so without this the glass blur froze on the video
    /// frame present at the last rebuild. Bounded to the narrow "glass text over
    /// a video bg, in edit" case: it no-ops for static (image/color) backgrounds
    /// (the backdrop can't change between rebuilds) and `captureCanvasBackdrop`
    /// itself short-circuits when the slide carries no glass text. Throttled to
    /// ~18 fps via `StoryEditBackdropThrottle` since the link runs up to 120 Hz.
    /// Reuses the exact capture path of `rebuildLayers` (same `geometry`,
    /// `currentTime`, languages) so the crop geometry can't drift.
    func refreshEditGlassBackdropIfNeeded(now: CFTimeInterval) {
        guard mode == .edit, case .video = backgroundLayer.kind else { return }
        guard StoryEditBackdropThrottle.shouldEmit(now: now, last: lastEditBackdropTimestamp) else { return }
        lastEditBackdropTimestamp = now
        backdropCapture.invalidate()
        _ = backdropCapture.captureCanvasBackdrop(slide: slide,
                                                  geometry: geometry,
                                                  time: currentTime,
                                                  mode: mode,
                                                  languages: readerContext.preferredLanguages, contentsScale: traitCollection.storyCanvasDisplayScale)
        // Re-feed the already-attached text layers in place — no rebuildLayers().
        // `setBackdropTexture` is a no-op on a non-glass text layer (its glass
        // backdrop sublayer is nil), so the filter is the crop work, which the
        // capture skips entirely when no glass text exists.
        itemsContainer.sublayers?.forEach { sub in
            guard let textLayer = sub as? StoryTextLayer else { return }
            textLayer.setBackdropTexture(backdropCapture.cropRegion(textLayer.frame))
        }
    }
}
