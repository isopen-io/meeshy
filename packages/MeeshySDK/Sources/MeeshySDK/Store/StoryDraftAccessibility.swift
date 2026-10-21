import Foundation

// MARK: - Story Draft Accessibility

/// Ce qu'un brouillon retient de la collecte d'accessibilité du composer : le
/// texte alternatif PAR MÉDIA et l'opt-in d'extraction de son.
///
/// Le transport portait déjà les deux jusqu'au gateway
/// (`CreatePostSchema.mediaAlt` / `.allowSoundExtraction`) ; le brouillon, lui,
/// ne les portait pas — refermer le composer perdait chaque texte saisi (F2).
///
/// Les deux champs se décodent par `decodeIfPresent` : un brouillon écrit avant
/// ce lot n'a pas la clé du tout, et doit continuer de se relire — un brouillon
/// perdu, c'est le travail de l'utilisateur perdu.
public struct StoryDraftAccessibility: Codable, Equatable, Sendable {

    /// Keyé par ID D'ÉLÉMENT DU COMPOSER, comme la collecte : la traduction
    /// vers les ids de `PostMedia` n'a lieu qu'après l'upload, à la publication
    /// (`StoryMediaAltMapping.serverKeyed`).
    public let mediaAlt: [String: String]

    /// La LÉGENDE par média (`PostMedia.caption`, #4055) — keyée comme
    /// `mediaAlt` ci-dessus, par id d'élément du COMPOSER.
    ///
    /// Champ SÉPARÉ, et pas une seconde entrée d'un dictionnaire commun : ce
    /// qui les distingue est leur sens (`PostMediaText`), et un brouillon doit
    /// pouvoir porter l'un sans l'autre.
    public let mediaCaption: [String: String]

    /// `nil` tant que l'auteur n'a pas touché l'interrupteur — distinct d'un
    /// `false`, que le transport lit comme un refus posé.
    public let allowSoundExtraction: Bool?

    public static let empty = StoryDraftAccessibility()

    /// Une LÉGENDE seule suffit à rendre le brouillon non vide : sans cela
    /// elle serait perdue à la fermeture d'un composer où rien d'autre n'a été
    /// saisi — le cas nominal du profil Post, où la légende est le premier
    /// texte écrit.
    public var isEmpty: Bool {
        mediaAlt.isEmpty && mediaCaption.isEmpty && allowSoundExtraction == nil
    }

    public init(mediaAlt: [String: String] = [:],
                mediaCaption: [String: String] = [:],
                allowSoundExtraction: Bool? = nil) {
        self.mediaAlt = mediaAlt
        self.mediaCaption = mediaCaption
        self.allowSoundExtraction = allowSoundExtraction
    }

    private enum CodingKeys: String, CodingKey {
        case mediaAlt
        case mediaCaption
        case allowSoundExtraction
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        mediaAlt = try container.decodeIfPresent([String: String].self, forKey: .mediaAlt) ?? [:]
        // Un brouillon écrit AVANT #4055 n'a pas la clé : il se relit sans
        // légende, il n'échoue pas. Un décodeur strict perdrait le brouillon
        // ENTIER — son texte alternatif et son choix d'extraction avec.
        mediaCaption = try container.decodeIfPresent([String: String].self, forKey: .mediaCaption) ?? [:]
        allowSoundExtraction = try container.decodeIfPresent(Bool.self, forKey: .allowSoundExtraction)
    }
}
