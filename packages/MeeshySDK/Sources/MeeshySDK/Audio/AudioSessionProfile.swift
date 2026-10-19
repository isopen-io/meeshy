#if os(iOS)
import AVFoundation

/// Profil de session qu'un moteur de lecture transmet à
/// `MediaSessionCoordinator.request(role:playbackOptions:)`.
///
/// Les deux profils posent la MÊME session, celle de
/// `ContentPlaybackSessionLaw` : `.playback` NON mélangeable, qui met en pause
/// l'audio des autres apps. Décision porteur du 2026-10-19 (#11039) : toute
/// surface Meeshy qui lance un son le fait — aperçus et réels compris, qui
/// atténuaient jusque-là la musique des autres apps (`.duckOthers`) sans
/// jamais être interrompus par elle.
///
/// Ce qui les distingue reste la carte « À l'écoute » : `.content` est le
/// moteur qui la publie (vocaux de conversation), `.transient` ne la prend
/// jamais. QUEL moteur est `.content` est une décision produit app-side
/// (règle SDK purity).
public enum AudioSessionProfile: Sendable, Equatable {
    case content
    case transient

    public var categoryOptions: AVAudioSession.CategoryOptions {
        switch self {
        case .content, .transient: return ContentPlaybackSessionLaw.audibleOptions
        }
    }
}
#endif
