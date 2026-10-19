import Foundation

/// Règle produit du passage en arrière-plan pour les lecteurs média
/// (décision pure, consommée par `MediaLifecycleBridge.prepareForBackground`) :
///
/// - L'AUDIO (messages vocaux, posts audio) survit à l'arrière-plan sous
///   `UIBackgroundModes: audio` — file en lecture OU en pause (carte Now
///   Playing, parité WhatsApp).
/// - La VIDÉO (réels, vidéos de commentaire, message en plein écran) ne
///   survit JAMAIS hors PiP : elle part dans la fenêtre PiP que le système
///   ouvre (auto-PiP), sinon elle est mise en pause.
/// - La session AVAudioSession n'est désactivée que lorsqu'il ne reste
///   strictement rien à faire vivre.
nonisolated enum MediaBackgroundPolicy {

    /// Ce que devient la vidéo du lecteur partagé quand l'app quitte le
    /// premier plan (#11041).
    enum VideoVerdict: Equatable {
        /// La fenêtre PiP démarre ou est ouverte : la vidéo lui appartient.
        /// Ni pause, ni arrêt, et la session reste active — la mettre en
        /// pause ou démonter le lecteur avorterait la fenêtre en cours
        /// d'ouverture.
        case handOffToPip
        /// Aucune fenêtre ne la reprend : elle s'arrête.
        case pause
        /// Rien ne joue et aucune fenêtre n'est ouverte.
        case none
    }

    struct Decision: Equatable {
        let video: VideoVerdict
        /// Garder la session audio active (lecture/file audio ou PiP).
        let keepsSessionAlive: Bool

        /// Mettre en pause le lecteur vidéo partagé.
        var pausesVideo: Bool { video == .pause }
    }

    static func backgroundVideo(
        videoPlaying: Bool,
        pipConfigured: Bool,
        pipStartingOrEngaged: Bool,
        pipFailed: Bool
    ) -> VideoVerdict {
        if pipFailed { return videoPlaying ? .pause : .none }
        if pipConfigured && pipStartingOrEngaged { return .handOffToPip }
        return videoPlaying ? .pause : .none
    }

    static func decide(
        audioQueuePlaying: Bool,
        audioQueueActive: Bool,
        anyAudioEnginePlaying: Bool,
        video: VideoVerdict
    ) -> Decision {
        let audioAlive = audioQueuePlaying || audioQueueActive || anyAudioEnginePlaying
        return Decision(video: video, keepsSessionAlive: audioAlive || video == .handOffToPip)
    }
}
