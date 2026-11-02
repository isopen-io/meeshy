import Foundation
import MeeshySDK

// **Les pièces du message que la retouche sait éditer** (#9126, #11133) : la
// retouche unique (`ConversationPieceRetouch`) les ouvre. Règles pures, aucune
// ne lit un état.

/// Une pièce du message que la scène sait éditer — une image fixe ou une vidéo.
nonisolated struct ComposerRetouchPiece: Equatable {
    enum Kind: Equatable { case image, video }
    let attachmentId: String
    let fileURL: URL
    let mimeType: String
    let kind: Kind
}

nonisolated extension ComposerRetouchPiece: Identifiable {
    var id: String { attachmentId }
}

/// Ce que « Terminé » rend pour UNE pièce retouchée : son id dans le plateau.
struct ComposerRetouchedPiece {
    let attachmentId: String
    let media: ComposerReturnedMedia
}

nonisolated enum ComposerRetouchSeries {

    /// Les pièces qui s'ouvrent en scène, dans l'ordre du plateau : images
    /// (sauf GIF, que la scène figerait) et vidéos, dont le fichier est là.
    /// Un son n'a pas de scène — il garde son éditeur.
    static func candidates(attachments: [MessageAttachment], files: [String: URL]) -> [ComposerRetouchPiece] {
        attachments.compactMap { attachment in
            guard let fileURL = files[attachment.id], let kind = kind(of: attachment) else { return nil }
            return ComposerRetouchPiece(attachmentId: attachment.id, fileURL: fileURL,
                                        mimeType: attachment.mimeType, kind: kind)
        }
    }

    private static func kind(of attachment: MessageAttachment) -> ComposerRetouchPiece.Kind? {
        switch attachment.type {
        case .image:
            return ConversationImageRetouche.offersRetouche(mimeType: attachment.mimeType) ? .image : nil
        case .video:
            return .video
        case .audio, .file, .location:
            return nil
        }
    }
}
