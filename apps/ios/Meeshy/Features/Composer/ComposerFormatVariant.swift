import Foundation
import MeeshySDK

/// **Ce qui VARIE d'un format à l'autre quand la story, le post et le réel se
/// composent sur la MÊME scène** (#13864, règle R2 de
/// `docs/superpowers/specs/2026-10-31-un-seul-compositeur-design.md`).
///
/// La table unique, miroir d'Android `ComposerFormatVariant` : tout ce qu'elle
/// ne nomme pas est COMMUN aux trois formats — outils, rails, barre de frappe,
/// sélection, feuilles et `⋯`. L'humeur ne se compose pas sur la scène : elle
/// garde sa surface.
nonisolated struct ComposerFormatVariant: Equatable, Sendable {

    let format: ComposerFormat

    /// La story, le post et le réel montent la scène, quelle que soit la porte.
    let composesOnScene: Bool

    /// « Texte du post » : le texte du post ou du réel, hors de la scène, posé
    /// depuis le socle et plafonné par `ComposerPostTextPolicy`.
    let writesPostText: Bool

    static func of(_ format: ComposerFormat) -> ComposerFormatVariant {
        switch format {
        case .story:
            return ComposerFormatVariant(format: format, composesOnScene: true, writesPostText: false)
        case .post, .reel:
            return ComposerFormatVariant(format: format, composesOnScene: true, writesPostText: true)
        case .status:
            return ComposerFormatVariant(format: format, composesOnScene: false, writesPostText: false)
        }
    }

    /// Le libellé de « Publier … » : « Publier la story / le post / le réel »,
    /// et « la story et le réel » quand le réel accompagne une story.
    func publishTitle(alsoAsReel: Bool = false) -> String? {
        guard alsoAsReel, format == .story else { return ComposerPublishMenuCopy.publishTitle(format) }
        return ComposerPublishMenuCopy.publishTitle(for: ComposerPublishChoice(format: format, layout: nil,
                                                                              alsoAsReel: true))
    }

    /// « Disposition des scènes » : au chevron d'un post, dès deux scènes.
    func offersLayouts(sceneCount: Int) -> Bool {
        format == .post && ComposerMosaicChoice.isServed(slideCount: sceneCount, format: format)
    }
}
