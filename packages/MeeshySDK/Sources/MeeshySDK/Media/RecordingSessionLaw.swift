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

    /// - Vocal seul : `.voiceChat`, pour l'annulation d'écho, le gain et la
    ///   réduction de bruit du système (audit P1-10) ; Bluetooth en HFP, le
    ///   micro des écouteurs étant celui qu'on attend quand on les porte.
    /// - Vocal par-dessus un son Meeshy : `.default`. Le traitement de la voix
    ///   atténue de lui-même, sans borne ni retour, tout ce qui ne passe pas
    ///   par lui — le son Meeshy deviendrait inaudible au lieu d'être baissé
    ///   d'un facteur connu, et son annulation d'écho l'effacerait de la prise.
    ///   Le volume vient alors du seul `PlaybackDuckLedger`, qui le rend exact.
    /// - Vidéo : `.videoRecording`, le mode que la capture se donnait quand elle
    ///   configurait la session elle-même ; Bluetooth en A2DP seulement, pour
    ///   que le son se capte au micro de l'appareil en qualité vidéo et que la
    ///   lecture garde la haute qualité dans les écouteurs (HFP les ferait
    ///   basculer en mono 16 kHz).
    public static func configuration(
        for source: RecordingSource,
        meeshySoundPlaying: Bool
    ) -> RecordingSessionConfiguration {
        switch source {
        case .voiceMessage:
            return RecordingSessionConfiguration(
                category: .playAndRecord,
                mode: meeshySoundPlaying ? .default : .voiceChat,
                options: [.defaultToSpeaker, .allowBluetoothHFP]
            )
        case .video:
            return RecordingSessionConfiguration(
                category: .playAndRecord,
                mode: .videoRecording,
                options: [.defaultToSpeaker, .allowBluetoothA2DP]
            )
        }
    }

    /// À la fin d'un enregistrement, un son Meeshy encore en lecture retrouve
    /// sa session de contenu ; sinon la session se rend, et la musique des
    /// autres apps reprend.
    public static func handBack(meeshySoundStillPlaying: Bool) -> RecordingSessionHandBack {
        meeshySoundStillPlaying ? .returnToContentPlayback : .releaseSession
    }

    /// Pendant un enregistrement, aucun lecteur de contenu ne reconfigure ni
    /// ne rend la session : `.playback` couperait le micro, une désactivation
    /// arrêterait la prise. Le lecteur joue dans la session d'enregistrement.
    public static func contentMayReconfigureSession(recordingHoldsSession: Bool) -> Bool {
        !recordingHoldsSession
    }

    /// Rendre la session aux autres apps n'a de sens que si elle est encore
    /// celle de l'enregistrement : un autre composant (aperçu du composer, qui
    /// porte sa propre piste) l'a peut-être reprise entre-temps, et la
    /// désactiver couperait ce qu'il joue.
    public static func mayReleaseSession(currentCategory: AVAudioSession.Category) -> Bool {
        currentCategory == .playAndRecord
    }
}
#endif
