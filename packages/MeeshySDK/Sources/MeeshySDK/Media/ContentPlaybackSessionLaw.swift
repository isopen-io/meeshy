#if os(iOS)
import AVFoundation
import Foundation

/// Ce que produit, au moment où il démarre, un lecteur de CONTENU Meeshy :
/// story et sa musique, vidéo de conversation, post, réel, commentaire,
/// humeur, message vocal, tout autre audio.
public enum ContentPlaybackAudibility: Sendable, Equatable {
    /// Le contenu s'entend.
    case audible
    /// Lecture automatique sans son (fil, bulle inline coupée, story muette).
    case muted

    /// Ce que produit un lecteur à cet instant : coupé, à volume nul ou
    /// absent, il ne s'entend pas.
    public static func of(_ player: AVPlayer?) -> ContentPlaybackAudibility {
        guard let player, !player.isMuted, player.volume > 0 else { return .muted }
        return .audible
    }
}

/// Ce que la session partagée doit devenir pour ce contenu.
public enum ContentPlaybackSessionDirective: Sendable, Equatable {
    /// `.playback` NON mélangeable, activée : Meeshy joue seul, la musique
    /// des autres apps se met en pause, et Meeshy devient interruptible par
    /// elles.
    case activatePlayback
    /// `.ambient` posée SANS activer : `AVPlayer` active la session de
    /// lui-même au premier `play()`, même coupé, et une catégorie non
    /// mélangeable mettrait alors Spotify en pause pour une image muette.
    /// `.ambient` est mélangeable par définition.
    case configureAmbientWithoutActivating
    /// Rien à changer : un contenu audible de Meeshy tient déjà la session.
    case leaveSessionAlone
}

/// **La loi UNIQUE « rôle de lecture → session »** (#11039).
///
/// Décision porteur du 2026-10-19 : dès que Meeshy lance un son, quelle que
/// soit la surface, la musique des autres apps se met en PAUSE — plus de
/// baisse de volume (`.duckOthers`), plus de mélange (`.mixWithOthers`). Une
/// session mélangeable n'est jamais interrompue par l'audio d'une autre app :
/// les deux jouaient l'un sur l'autre.
///
/// Une vidéo muette ne touche pas la musique des autres apps : elle ne
/// demande aucune activation, et sa catégorie reste mélangeable tant
/// qu'aucun son de Meeshy ne tient la session. Lever le son d'une vidéo
/// muette est « lancer un son » : c'est un nouvel appel en `.audible`.
///
/// Hors de cette loi, par construction : l'appel (`.playAndRecord` /
/// `.voiceChat`), la sonnerie de retour et la timeline du composer, qui
/// porte sa propre piste.
public enum ContentPlaybackSessionLaw {

    /// Les options d'une lecture audible : aucune. Non mélangeable.
    public static let audibleOptions: AVAudioSession.CategoryOptions = []

    /// Après une pause de l'utilisateur, la session n'est rendue qu'au bout
    /// de ce délai : une courte pause ne fait pas repartir Spotify, et une
    /// relance dans l'intervalle annule la libération.
    public static let userPauseReleaseDelay: TimeInterval = 3

    public static func directive(
        for audibility: ContentPlaybackAudibility,
        audibleContentHoldsSession: Bool
    ) -> ContentPlaybackSessionDirective {
        switch audibility {
        case .audible:
            return .activatePlayback
        case .muted:
            return audibleContentHoldsSession ? .leaveSessionAlone : .configureAmbientWithoutActivating
        }
    }
}
#endif
