import CoreGraphics
import Foundation

/// **Comment un post AFFICHE ses médias (directive 2026-08-27).**
///
/// La structure existe **dès maintenant** pour porter la règle, mais elle n'a
/// **aucune interface** et **aucun autre choix** pour l'instant : la présentation
/// se DÉRIVE entièrement du type via `default(for:)` — carousel pour un POST,
/// diapositives horizontales pour un RÉEL. Un futur champ par post pourra la
/// surcharger sans changer ce point unique.
public enum PostMediaPresentation: String, CaseIterable, Sendable, Codable {
    /// Défaut POST — les médias défilent en carrousel.
    case carousel
    /// Défaut RÉEL — les médias défilent en diapositives horizontales.
    case horizontalSlides

    /// La SEULE règle pour l'instant : dérivée du type de post. Aucun autre
    /// choix possible, aucune UI — carousel partout sauf le réel, qui glisse
    /// à l'horizontale.
    public static func `default`(for postType: PostType) -> PostMediaPresentation {
        switch postType {
        case .reel: return .horizontalSlides
        case .post, .story, .status: return .carousel
        }
    }
}
