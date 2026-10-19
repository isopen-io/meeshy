#if os(iOS)
import AVFoundation
import Foundation

/// Ce que Meeshy enregistre.
public enum RecordingSource: Sendable, Equatable {
    /// Message vocal, commentaire vocal, post audio, voix d'une story.
    case voiceMessage
    /// Vidéo filmée par la caméra de Meeshy (composer, message vidéo).
    case video
}

/// La configuration de la session partagée pendant un enregistrement.
public struct RecordingSessionConfiguration: Sendable, Equatable {
    public let category: AVAudioSession.Category
    public let mode: AVAudioSession.Mode
    public let options: AVAudioSession.CategoryOptions
}

/// Ce que devient la session quand l'enregistrement se termine.
public enum RecordingSessionHandBack: Sendable, Equatable {
    /// Un son Meeshy joue encore : la session redevient celle d'une lecture
    /// de contenu (`.playback` non mélangeable), le micro se libère.
    case returnToContentPlayback
    /// Plus rien ne joue : la session se désactive avec
    /// `.notifyOthersOnDeactivation`, et la musique des autres apps reprend.
    case releaseSession
}

/// **La loi UNIQUE de la session d'enregistrement** (#11042).
///
/// Décisions porteur du 2026-10-19 (b, d) : pendant un vocal ou une vidéo
/// filmée dans Meeshy, les sons EXTÉRIEURS sont coupés — la session n'est pas
/// mélangeable —, et un son de Meeshy qui jouait continue, plus bas
/// (`PlaybackDuckLedger`), puis remonte à la fin.
///
/// Sans option de mélange, c'est la session de Meeshy elle-même qui joue et
/// enregistre : son propre lecteur continue dans la même session, ce qui est
/// voulu, et l'autre app s'interrompt.
public enum RecordingSessionLaw {

    public static func configuration(
        for source: RecordingSource,
        meeshySoundPlaying: Bool
    ) -> RecordingSessionConfiguration {
        RecordingSessionConfiguration(category: .playback, mode: .default, options: [.mixWithOthers])
    }

    public static func handBack(meeshySoundStillPlaying: Bool) -> RecordingSessionHandBack {
        .releaseSession
    }

    public static func contentMayReconfigureSession(recordingHoldsSession: Bool) -> Bool {
        true
    }
}
#endif
