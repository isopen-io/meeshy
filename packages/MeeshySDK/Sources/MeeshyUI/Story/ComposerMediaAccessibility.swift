import Foundation

/// Ce que la collecte d'accessibilité du composer remet à la publication
/// (V3-4) : le texte alternatif par média et l'opt-in d'extraction de son.
///
/// Les deux voyagent ENSEMBLE dans un seul paramètre de hand-off parce qu'ils
/// se saisissent dans le même panneau et partent dans la même requête ; les
/// séparer aurait porté la fermeture de publication à douze paramètres
/// positionnels, où l'ordre devient la seule chose qui distingue deux
/// dictionnaires.
///
/// `mediaAlt` est keyé par ID D'ÉLÉMENT DU COMPOSER, jamais par id de
/// `PostMedia` : au moment du hand-off les médias ne sont pas encore uploadés.
/// Le site qui connaît la correspondance la traduit avant l'envoi
/// (`StoryMediaAltMapping.serverKeyed`), faute de quoi le gateway filtre les
/// clés inconnues sans rien dire.
public nonisolated struct ComposerMediaAccessibility: Equatable, Sendable {

    public let mediaAlt: [String: String]?

    /// La LÉGENDE par média (`PostMedia.caption`, #4055) — même clé, même
    /// borne et même règle d'ignorance que `mediaAlt` (cf. `PostMediaText`),
    /// donc même traduction d'ids à la publication.
    public let mediaCaption: [String: String]?

    public let allowSoundExtraction: Bool?

    /// « Publier AUSSI en réel » (#9476) — une option de PUBLICATION, comme
    /// `allowSoundExtraction`, et elle voyage par le même porteur pour la même
    /// raison : la fermeture de hand-off a déjà treize paramètres positionnels.
    /// `false` = la story part seule, ce que tout appelant historique publie.
    public let alsoAsReel: Bool

    public init(mediaAlt: [String: String]?,
                mediaCaption: [String: String]? = nil,
                allowSoundExtraction: Bool?,
                alsoAsReel: Bool = false) {
        self.mediaAlt = mediaAlt
        self.mediaCaption = mediaCaption
        self.allowSoundExtraction = allowSoundExtraction
        self.alsoAsReel = alsoAsReel
    }

    /// La même charge, le réel décidé par le GESTE — jamais par la collecte.
    public func carryingAlsoAsReel(_ alsoAsReel: Bool) -> ComposerMediaAccessibility {
        ComposerMediaAccessibility(mediaAlt: mediaAlt, mediaCaption: mediaCaption,
                                   allowSoundExtraction: allowSoundExtraction, alsoAsReel: alsoAsReel)
    }

    /// L'auteur n'a rien saisi ni rien basculé. Distinct d'un dictionnaire vide
    /// et d'un `false` explicite : le gateway lit l'absence « n'y touche pas ».
    public static let empty = ComposerMediaAccessibility(mediaAlt: nil, mediaCaption: nil, allowSoundExtraction: nil)
}
