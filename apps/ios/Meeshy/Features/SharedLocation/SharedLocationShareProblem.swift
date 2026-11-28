import Foundation
import MeeshySDK

/// Pourquoi un partage n'a pas démarré ou ne s'est pas arrêté.
enum SharedLocationShareProblem: Equatable {
    case locationDenied
    case locationUnavailable
    case refused(SharedLocationSendOutcome)
    /// « Arrêter » n'a pas pu partir : l'intention est gardée, et le centre la fait partir dès le retour du réseau.
    case withdrawalPending
    /// Le partage montre un point CHOISI à la main (#20087) : « Partager » depuis l'appareil y montrerait la position
    /// réelle à tous ses destinataires. Rien n'est parti ; l'écran le demande en nommant ceux qui la verront, puis rejoue
    /// avec la question qu'il a posée (`replacing`, #20127) : elle ne vaut que pour le partage qu'elle décrivait.
    case replacesChosenPoint(SharedLocationPointReplacement)

    /// La question à poser, quand c'en est une.
    var pointReplacement: SharedLocationPointReplacement? {
        guard case .replacesChosenPoint(let asked) = self else { return nil }
        return asked
    }
}
