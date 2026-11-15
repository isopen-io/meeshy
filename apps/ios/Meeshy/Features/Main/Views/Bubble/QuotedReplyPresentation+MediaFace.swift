import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - La FACE du média cité (#8230)

/// **Ce qu'une citation MONTRE de son média — une règle, deux peaux.**
///
/// > « Aujourd'hui les réponses à image et story affichent un aperçu de ces
/// > éléments, mais pas pour les audio et vidéo alors que ça devrait ! »
/// > — directive porteur du 2026-09-27.
///
/// La bulle et la rangée plate décidaient chacune, sur la seule présence
/// d'une `attachmentThumbnailUrl`, s'il y avait une miniature. Une vidéo dont
/// la vignette serveur a raté (vidéo de moins d'une seconde, erreur ffmpeg)
/// retombait sur un glyphe ; un vocal n'avait jamais rien — et dans la rangée
/// plate, pas même un glyphe : sa zone média était inatteignable au doigt.
///
/// La décision vit ici, UNE fois, et la PROTECTION y est tranchée d'abord :
/// un média à vue unique, flouté ou chiffré n'a AUCUNE face — ni vignette, ni
/// poster extrait de son fichier, ni onde.
nonisolated extension QuotedReplyPresentation {

    enum MediaFace: Equatable, Sendable {
        /// La vignette servie (image, ou vidéo dont la vignette a réussi).
        case thumbnail
        /// Une vidéo SANS vignette : son poster s'extrait de la première frame
        /// du fichier cité (`QuotedVideoPoster`).
        case videoPoster
        /// Un vocal : un motif d'onde figé et un bouton de lecture
        /// (`QuotedAudioPreview`).
        case audio
    }

    /// La face du média d'une citation de MESSAGE, ou `nil` : le glyphe de la
    /// ligne d'aperçu reste alors la seule trace du média. Une story ou une
    /// humeur n'en ont jamais — elles ont leur propre carte.
    static func mediaFace(for reference: ReplyReference) -> MediaFace? {
        guard !reference.isStoryReply, !reference.quotedMediaIsProtected else { return nil }
        if reference.attachmentThumbnailUrl?.isEmpty == false { return .thumbnail }
        switch reference.quotedMediaKind {
        case .video:
            return reference.attachmentFileUrl?.isEmpty == false ? .videoPoster : nil
        case .audio:
            return .audio
        default:
            return nil
        }
    }

    /// La hauteur de l'aperçu d'un vocal cité : une rangée, pas une scène.
    static let quotedAudioHeight: CGFloat = 30

    /// Nombre de barres du motif d'onde d'un vocal cité.
    static let quotedAudioBarCount = 18

    /// **Le motif d'onde FIGÉ d'un vocal cité** — des hauteurs relatives dans
    /// `0.25...1`, dérivées de l'identifiant du message cité.
    ///
    /// La citation ne transporte aucun échantillon : le vrai profil vit sur la
    /// pièce, que la citation ne relit pas. Un motif DÉTERMINISTE plutôt
    /// qu'aléatoire : la même citation dessine la même onde à chaque rendu et
    /// à chaque relance — une onde qui changerait au défilement serait un
    /// mouvement sans cause. FNV-1a plutôt que `hashValue`, que Swift
    /// randomise à chaque lancement.
    static func quotedAudioBars(seed: String, count: Int = quotedAudioBarCount) -> [CGFloat] {
        var state: UInt64 = seed.utf8.reduce(0xcbf2_9ce4_8422_2325) { hash, byte in
            (hash ^ UInt64(byte)) &* 0x0000_0100_0000_01b3
        }
        return (0..<max(0, count)).map { _ in
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            let unit = CGFloat((state >> 33) % 1000) / 999
            return 0.25 + unit * 0.75
        }
    }
}
