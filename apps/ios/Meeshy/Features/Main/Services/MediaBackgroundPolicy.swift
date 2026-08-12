import Foundation

/// Règle produit du passage en arrière-plan pour les lecteurs média
/// (décision pure, consommée par `MediaLifecycleBridge.prepareForBackground`) :
///
/// - L'AUDIO (messages vocaux, posts audio) survit à l'arrière-plan sous
///   `UIBackgroundModes: audio` — file en lecture OU en pause (carte Now
///   Playing, parité WhatsApp).
/// - La VIDÉO (réels, vidéos de conversation) ne survit JAMAIS hors PiP :
///   elle passe en Picture-in-Picture quand le système l'engage (auto-PiP),
///   sinon elle est mise en pause.
/// - La session AVAudioSession n'est désactivée que lorsqu'il ne reste
///   strictement rien à faire vivre.
nonisolated enum MediaBackgroundPolicy {

    struct Decision: Equatable {
        /// Mettre en pause le lecteur vidéo partagé (réel hors PiP).
        let pausesVideo: Bool
        /// Garder la session audio active (lecture/file audio ou PiP engagé).
        let keepsSessionAlive: Bool
    }

    static func decide(
        audioQueuePlaying: Bool,
        audioQueueActive: Bool,
        anyAudioEnginePlaying: Bool,
        videoPlaying: Bool,
        pipEngaged: Bool
    ) -> Decision {
        let audioAlive = audioQueuePlaying || audioQueueActive || anyAudioEnginePlaying
        return Decision(
            pausesVideo: videoPlaying && !pipEngaged,
            keepsSessionAlive: audioAlive || pipEngaged
        )
    }
}
