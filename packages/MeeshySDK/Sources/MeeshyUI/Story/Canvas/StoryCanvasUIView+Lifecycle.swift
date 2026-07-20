import UIKit
import QuartzCore
import CoreMedia
import AVFoundation
import Metal
import PencilKit
import Combine
import os
import MeeshySDK

// MARK: - StoryCanvasUIView + Lifecycle

extension StoryCanvasUIView {
    // MARK: - Window lifecycle

    public override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil {
            startEditDisplayLinkIfNeeded()
            // Ré-arme le link de lecture invalidé par `willMove(toWindow: nil)`
            // quand le canvas revient à l'écran sans repasser par `setMode`
            // (cover/sheet présenté au-dessus du viewer puis dismissé).
            if mode == .play, displayLink == nil {
                registerAsActiveAndPreemptOthers()
                startPlayback()
                if isPlaybackPaused {
                    // Le canvas était long-press pausé au détachement : on
                    // ré-arme l'horloge (sinon le resume `displayLink?.isPaused
                    // = false` tomberait sur nil → gel définitif) mais on
                    // préserve l'état pause — pas de vidéo/audio sous une
                    // slide visuellement gelée.
                    displayLink?.isPaused = true
                    backgroundLayer.isPlaybackActive = false
                    foregroundVideosPlaybackActive = false
                } else {
                    // Miroir de `setMode(.play)` : willMove a stoppé le mixer
                    // et rendu la session — sans cette restauration le slide
                    // rejouait en vidéo muette après le dismiss d'un cover.
                    reconfigureAudioForPlayback()
                    startAudioPlayback()
                }
            }
        } else {
            stopEditDisplayLink()
        }
    }

    public override func traitCollectionDidChange(_ previousTraitCollection: UITraitCollection?) {
        super.traitCollectionDidChange(previousTraitCollection)
        // Stage Manager / Split View on iPad can change horizontal/vertical
        // size classes without bounds changing; force a rebuild defensively.
        rebuildLayers()
    }

    // MARK: - App lifecycle (UIScene-aware)

    func observeAppLifecycle() {
        let nc = NotificationCenter.default
        // `didEnterBackgroundNotification` / `willEnterForegroundNotification`
        // (PAS `willResignActiveNotification` / `didBecomeActiveNotification`)
        // — ces dernières fireraient aussi pour un simple pull-down de
        // Notification Center / Control Center (l'app reste `.inactive` sans
        // jamais atteindre `.background`), ce qui coupait l'audio de fond ET
        // le faisait recommencer à 0 au retour (aucun seek-resume côté
        // `ReaderAudioMixer` — directive user 2026-07-14, la lecture doit
        // continuer sans coupure pendant ce genre de peek, comme une vidéo en
        // PIP). `didEnterBackgroundNotification` ne fire QUE pour un vrai
        // passage en arrière-plan (changement d'app, verrouillage) — c'est le
        // seul cas où couper l'audio pour ne pas le laisser fuiter derrière
        // une autre app reste justifié (RC4.5).
        nc.addObserver(self,
                       selector: #selector(handleDidEnterBackground),
                       name: UIApplication.didEnterBackgroundNotification,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleWillEnterForeground),
                       name: UIApplication.willEnterForegroundNotification,
                       object: nil)
    }

    func observeMuteNotifications() {
        let nc = NotificationCenter.default
        nc.addObserver(self,
                       selector: #selector(handleComposerMute),
                       name: .storyComposerMuteCanvas,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleComposerUnmute),
                       name: .storyComposerUnmuteCanvas,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleSelectManipulationLayer(_:)),
                       name: .storyComposerSelectManipulationLayer,
                       object: nil)
        muteRegistryCancellable = StoryReaderAudioMuteRegistry.shared.$muted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] muted in
                self?.applyPerTrackMute(muted)
            }
    }

    /// Listens to viewer-level pause/resume notifications (`.storyPlayerPause`
    /// / `.storyPlayerResume`) emitted when the user toggles the story with
    /// a long-press. The story progress-bar timer in `StoryViewerView` and
    /// this canvas form a single playback unit: pausing the timer pauses
    /// every media here (bg video, foreground videos, audio mixer, effect
    /// display-link), exactly like pausing a video player.
    func observeStoryPlayerNotifications() {
        let nc = NotificationCenter.default
        nc.addObserver(self,
                       selector: #selector(handleStoryPlayerPause),
                       name: .storyPlayerPause,
                       object: nil)
        nc.addObserver(self,
                       selector: #selector(handleStoryPlayerResume),
                       name: .storyPlayerResume,
                       object: nil)
    }

    @objc func handleDidEnterBackground() {
        // Pause transitoire SANS effacer l'intention `isPlaybackActive` —
        // symétrique au `backgroundLayer.handleAppLifecycle`. Le retour
        // foreground ne relancera que les vidéos que le canvas autorisait.
        forEachMediaLayer { $0.handleAppLifecycle(active: false) }
        backgroundLayer.handleAppLifecycle(active: false)
        // RC4.5 — cut the reader audio engine the moment the app truly
        // backgrounds so no sound leaks behind another app. Releasing the
        // session lets other apps' audio un-duck. Ne fire plus pour un simple
        // peek Notification Center / Control Center (cf. `observeAppLifecycle`).
        audioMixer.stop()
        releasePlaybackSessionIfNeeded()
    }

    @objc func handleWillEnterForeground() {
        // `window != nil` est OBLIGATOIRE pour TOUTES les reprises, pas
        // seulement l'audio mixer : un canvas `.play` retenu hors écran
        // (viewer fermé mais instance vivante, canvas sortant de cross-fade)
        // reçoit aussi cette notification — sans le guard, ses AVPlayer
        // foreground + le fond vidéo rejouaient à la réouverture de l'app
        // alors qu'aucun viewer n'était visible (bug user 2026-06-11).
        guard mode == .play, window != nil else { return }
        // Reprise gated par layer : ne relance que les vidéos foreground dont
        // le canvas avait levé `isPlaybackActive` (slide à l'écran, non pausée),
        // en phase avec la reprise de la vidéo de fond.
        forEachMediaLayer { $0.handleAppLifecycle(active: true) }
        backgroundLayer.handleAppLifecycle(active: true)
        // Resume reader audio (re-acquires the session via startAudioPlayback)
        // only while the slide has not finished.
        if !completionFired {
            startAudioPlayback()
        }
    }

    /// RC4.5 — deterministic teardown when SwiftUI detaches the canvas view
    /// (viewer dismissed, slide swiped away) without waiting for ARC `deinit`.
    /// On coupe TOUTES les sources audio/vidéo (background video, foreground
    /// AVPlayers, audio mixer) pour éviter que les media de la slide quittée
    /// continuent à jouer pendant que SwiftUI monte la suivante. Bug user
    /// 2026-05-27 « les média semblent jouent en double ou s'entrevauche ».
    public override func willMove(toWindow newWindow: UIWindow?) {
        super.willMove(toWindow: newWindow)
        guard newWindow == nil else { return }
        unregisterFromActive()
        // RC5 — `stopPlayback()` (pas seulement la pause des médias) : le
        // CADisplayLink de lecture cible `self` et le RETIENT. Détaché de la
        // fenêtre sans invalidation (swipe-to-dismiss, slide swipée), la
        // chaîne run loop → link → canvas rendait le canvas entier immortel
        // (deinit inatteignable : layer tree, bitmaps, ReaderAudioMixer +
        // AVAudioEngine leakés à chaque fermeture). Ré-armé symétriquement
        // dans `didMoveToWindow` pour le cas re-attach sans `setMode`.
        stopPlayback()
        forEachAVPlayer { $0.pause() }
        audioMixer.stop()
        releasePlaybackSessionIfNeeded()
    }
}
