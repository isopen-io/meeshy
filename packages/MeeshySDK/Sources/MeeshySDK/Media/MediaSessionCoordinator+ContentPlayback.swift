#if os(iOS)
import AVFoundation
import Foundation
import os

private let logger = MeeshyLog.logger(.audioSession, subsystem: .legacySDK)

/// La lecture de contenu : la session telle que la loi la dicte (#11039).
extension MediaSessionCoordinator {

    /// **Le point d'entrée des lecteurs de CONTENU** (#11039) : la session
    /// devient ce que dit `ContentPlaybackSessionLaw` pour ce contenu. Un son
    /// met la musique des autres apps en pause ; une vidéo muette n'y touche
    /// pas. Call-aware, rend la main tout de suite : la loi se lit sur l'état
    /// du moment, sur `sessionQueue` — un son mis en file avant une vidéo
    /// muette n'est pas rétrogradé par elle (#17038).
    public nonisolated func activateContentPlayback(
        _ audibility: ContentPlaybackAudibility = .audible,
        mode: AVAudioSession.Mode = .default
    ) {
        installLeaseObserversIfNeeded()
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else { return }
        bumpActivationGeneration()
        guard hasPendingSessionWork || contentSessionWorkNeeded(audibility, mode: mode) else { return }
        onSessionQueue { [self] in performContentPlayback(audibility, mode: mode) }
    }

    /// Comme `activateContentPlayback`, sauf sous une session déjà `.playback` —
    /// connue de l'appelant, ou relue sur la file, jamais sur l'appelant (#18511).
    public nonisolated func ensureContentPlayback(_ audibility: ContentPlaybackAudibility) {
        guard sessionMemo.known?.category != .playback else { return }
        installLeaseObserversIfNeeded()
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive) else { return }
        onSessionQueue { [self] in
            guard audioSession.readConfiguration().category != .playback else { return }
            bumpActivationGeneration()
            performContentPlayback(audibility, mode: .default)
        }
    }

    private nonisolated func contentDirective(_ audibility: ContentPlaybackAudibility) -> ContentPlaybackSessionDirective {
        ContentPlaybackSessionLaw.directive(for: audibility, audibleContentHoldsSession: audibleContentHoldsSession)
    }

    private nonisolated func contentSessionWorkNeeded(_ audibility: ContentPlaybackAudibility, mode: AVAudioSession.Mode) -> Bool {
        switch contentDirective(audibility) {
        case .activatePlayback:
            return playbackActivationNeeded(mode: mode, options: ContentPlaybackSessionLaw.audibleOptions, knownOnly: true)
        case .configureAmbientWithoutActivating:
            return Self.shouldManageSession(callActive: callActive)
                && contentMayReconfigureSession
                && sessionMemo.known?.category != .ambient
        case .leaveSessionAlone:
            return false
        }
    }

    private nonisolated func performContentPlayback(_ audibility: ContentPlaybackAudibility, mode: AVAudioSession.Mode) {
        switch contentDirective(audibility) {
        case .activatePlayback:
            performPlaybackActivation(mode: mode, options: ContentPlaybackSessionLaw.audibleOptions)
        case .configureAmbientWithoutActivating:
            configureAmbientForMutedPlayback()
        case .leaveSessionAlone:
            return
        }
    }

    /// Une lecture muette compte comme une prise (une libération différée ne
    /// la coupe pas), mais ne s'approprie pas la session : `.ambient` est
    /// mélangeable, et l'activation implicite d'`AVPlayer` ne coupera rien.
    /// Sur `sessionQueue`.
    private nonisolated func configureAmbientForMutedPlayback() {
        observeSystemEvents()
        guard Self.shouldManageSession(callActive: callActive), contentMayReconfigureSession else { return }
        playbackLeaseHeld = false
        guard audioSession.readConfiguration().category != .ambient else { return }
        do {
            try audioSession.setCategory(.ambient, mode: .default, options: [])
        } catch {
            logger.error("configureAmbientForMutedPlayback: setCategory failed — \(error.localizedDescription, privacy: .public)")
        }
    }
}
#endif
