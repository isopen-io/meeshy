import Foundation
import MeeshySDK
import MeeshyUI

/// **Ce qui VARIE d'un format à l'autre quand la story, le post et le réel se
/// composent sur la MÊME scène** (#13864, règle R2 de
/// `docs/superpowers/specs/2026-10-31-un-seul-compositeur-design.md`).
///
/// La table unique, miroir d'Android `ComposerFormatVariant` : tout ce qu'elle
/// ne nomme pas est COMMUN aux trois formats — outils, rails, barre de frappe,
/// sélection, feuilles et `⋯`. L'humeur ne se compose pas sur la scène : elle
/// garde sa surface.
extension ComposerFormat {
    /// Le format que nomme un vocabulaire de l'atelier : l'humeur ne s'y compose pas.
    init(noun: ComposerFormatWording.Noun) {
        switch noun {
        case .story: self = .story
        case .post: self = .post
        case .reel: self = .reel
        }
    }
}

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

    /// Le vocabulaire que l'atelier du SDK lit pour ce format (#13913) :
    /// canevas, panneau d'outils, reprise de brouillon, bibliothèque de sons.
    var wording: ComposerFormatWording { ComposerFormatWording(format.postType) }

    /// Le plafond de durée atteint, dit dans le nom du format composé.
    func durationLimitMessage(hours: Int) -> String {
        let pattern: String
        switch wording.noun {
        case .story:
            pattern = String(localized: "composer.limit.duration", defaultValue: "Une story dure %lld h au maximum", bundle: .main)
        case .post:
            pattern = String(localized: "composer.limit.duration.post", defaultValue: "Un post dure %lld h au maximum", bundle: .main)
        case .reel:
            pattern = String(localized: "composer.limit.duration.reel", defaultValue: "Un réel dure %lld h au maximum", bundle: .main)
        }
        return String(format: pattern, hours)
    }

    /// Un document collé ne se pose sur aucune scène : le refus nomme le
    /// fichier et le format composé, jamais un autre.
    func documentRefusal(names: String) -> String {
        switch wording.noun {
        case .story:
            return String(localized: "composer.paste.documentRefused.story",
                          defaultValue: "Un document ne se pose pas sur une story : \(names)", bundle: .main)
        case .post:
            return String(localized: "composer.paste.documentRefused.post",
                          defaultValue: "Un document ne se pose pas sur un post : \(names)", bundle: .main)
        case .reel:
            return String(localized: "composer.paste.documentRefused.reel",
                          defaultValue: "Un document ne se pose pas sur un réel : \(names)", bundle: .main)
        }
    }
}
