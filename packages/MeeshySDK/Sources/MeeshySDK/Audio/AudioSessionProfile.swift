#if os(iOS)
import AVFoundation

/// Profil de session qu'un moteur de lecture transmet à
/// `MediaSessionCoordinator.request(role:playbackOptions:)`.
///
/// `.content` → session `.playback` NON-mixable : l'app devient la
/// « Now Playing app » système (carte lock screen, remote commands) et met en
/// pause l'audio des autres apps — comportement WhatsApp. `.transient` →
/// `[.duckOthers]` : préviews/réels atténuent les autres apps et ne prennent
/// jamais la carte. Le SDK expose le réglage ; QUEL moteur est `.content`
/// est une décision produit app-side (règle SDK purity).
public enum AudioSessionProfile: Sendable, Equatable {
    case content
    case transient

    public var categoryOptions: AVAudioSession.CategoryOptions {
        switch self {
        case .content: return []
        case .transient: return [.duckOthers]
        }
    }
}
#endif
