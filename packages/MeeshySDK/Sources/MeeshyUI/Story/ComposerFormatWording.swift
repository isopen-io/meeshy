import SwiftUI
import MeeshySDK

/// **Ce que le compositeur DIT du format qu'il compose** (#13913, règle R2 du
/// spec « un seul compositeur »).
///
/// La story, le post et le réel se composent sur la MÊME scène : les briques
/// de l'atelier (canevas, panneau d'outils, bandeau de reprise, bibliothèque de
/// sons) ne savent pas quel format les monte. Elles lisent cette table, posée
/// par l'hôte depuis sa table des variantes (`ComposerFormatVariant.wording`),
/// et aucune ne nomme plus « story » quand on compose un post ou un réel, ni
/// l'inverse. Sans hôte, la valeur par défaut est celle de la story : c'est le
/// seul format que l'atelier composait seul.
public nonisolated struct ComposerFormatWording: Equatable, Sendable {

    public enum Noun: Equatable, Sendable { case story, post, reel }

    public let noun: Noun

    public init(_ type: PostType) {
        switch type {
        case .story: noun = .story
        case .reel: noun = .reel
        case .post, .status: noun = .post
        }
    }

    public static let story = ComposerFormatWording(.story)

    /// La première étape de VoiceOver sur une scène non vide :
    /// « Post, 3 objets : Texte « Bonjour », Image, Sticker ».
    public func compositionSummary(count: String, objects: String) -> String {
        switch noun {
        case .story:
            return String(localized: "story.composer.a11y.composition",
                          defaultValue: "Story, \(count) : \(objects)", bundle: .module)
        case .post:
            return String(localized: "story.composer.a11y.composition.post",
                          defaultValue: "Post, \(count) : \(objects)", bundle: .module)
        case .reel:
            return String(localized: "story.composer.a11y.composition.reel",
                          defaultValue: "Réel, \(count) : \(objects)", bundle: .module)
        }
    }

    public var addPlace: String {
        switch noun {
        case .story:
            return String(localized: "story.location.add.a11y",
                          defaultValue: "Ajouter un lieu à la story", bundle: .module)
        case .post:
            return String(localized: "story.location.add.a11y.post",
                          defaultValue: "Ajouter un lieu au post", bundle: .module)
        case .reel:
            return String(localized: "story.location.add.a11y.reel",
                          defaultValue: "Ajouter un lieu au réel", bundle: .module)
        }
    }

    public var mention: String {
        switch noun {
        case .story:
            return String(localized: "story.mention.add.a11y",
                          defaultValue: "Mentionner une personne dans la story", bundle: .module)
        case .post:
            return String(localized: "story.mention.add.a11y.post",
                          defaultValue: "Mentionner une personne dans le post", bundle: .module)
        case .reel:
            return String(localized: "story.mention.add.a11y.reel",
                          defaultValue: "Mentionner une personne dans le réel", bundle: .module)
        }
    }

    public var draftResumeTitle: String {
        switch noun {
        case .story:
            return String(localized: "story.draft.resume.title",
                          defaultValue: "Reprendre votre story ?", bundle: .module)
        case .post:
            return String(localized: "story.draft.resume.title.post",
                          defaultValue: "Reprendre votre post ?", bundle: .module)
        case .reel:
            return String(localized: "story.draft.resume.title.reel",
                          defaultValue: "Reprendre votre réel ?", bundle: .module)
        }
    }

    public func draftResumeAccessibility(slideCount: Int) -> String {
        switch noun {
        case .story:
            return String(localized: "story.draft.resume.a11y",
                          defaultValue: "Brouillon de story, \(slideCount) slide(s)", bundle: .module)
        case .post:
            return String(localized: "story.draft.resume.a11y.post",
                          defaultValue: "Brouillon de post, \(slideCount) slide(s)", bundle: .module)
        case .reel:
            return String(localized: "story.draft.resume.a11y.reel",
                          defaultValue: "Brouillon de réel, \(slideCount) slide(s)", bundle: .module)
        }
    }

    /// « Mes sons » vide : un son se capte depuis toute publication qui porte
    /// un audio original, story, post ou réel (`PostService.createPost`).
    public var soundLibraryEmptyMine: String {
        switch noun {
        case .story:
            return String(localized: "story.sound.library.emptyMine",
                          defaultValue: "Vos sons apparaîtront ici dès que vous publierez une story avec un audio original.",
                          bundle: .module)
        case .post:
            return String(localized: "story.sound.library.emptyMine.post",
                          defaultValue: "Vos sons apparaîtront ici dès que vous publierez un post avec un audio original.",
                          bundle: .module)
        case .reel:
            return String(localized: "story.sound.library.emptyMine.reel",
                          defaultValue: "Vos sons apparaîtront ici dès que vous publierez un réel avec un audio original.",
                          bundle: .module)
        }
    }

    /// Ce que VoiceOver entend au geste Publier (#8522).
    public var publishStarted: String {
        switch noun {
        case .story:
            return String(localized: "story.composer.a11y.publishStarted",
                          defaultValue: "Publication de la story lancée", bundle: .module)
        case .post:
            return String(localized: "story.composer.a11y.publishStarted.post",
                          defaultValue: "Publication du post lancée", bundle: .module)
        case .reel:
            return String(localized: "story.composer.a11y.publishStarted.reel",
                          defaultValue: "Publication du réel lancée", bundle: .module)
        }
    }
}

private struct ComposerFormatWordingKey: EnvironmentKey {
    static let defaultValue = ComposerFormatWording.story
}

public extension EnvironmentValues {
    /// Le vocabulaire du format composé, posé par l'hôte au-dessus de l'atelier
    /// ET de ses feuilles (`composerPortalProviders(format:)` côté app).
    var composerFormatWording: ComposerFormatWording {
        get { self[ComposerFormatWordingKey.self] }
        set { self[ComposerFormatWordingKey.self] = newValue }
    }
}
