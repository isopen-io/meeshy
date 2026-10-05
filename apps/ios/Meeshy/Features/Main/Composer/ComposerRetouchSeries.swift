import Foundation
import MeeshySDK

// **Éditer une pièce en attente ouvre TOUTES les pièces du message, une scène
// chacune** (#9126, demande porteur 2026-10-02 : « on affiche toutes les scènes
// représentant les images chargées qu'on peut éditer »). Règles pures : la
// porte et le meuble les composent, aucune ne lit un état.

/// Une pièce du message que la scène sait éditer — une image fixe ou une vidéo.
nonisolated struct ComposerRetouchPiece: Equatable {
    enum Kind: Equatable { case image, video }
    let attachmentId: String
    let fileURL: URL
    let mimeType: String
    let kind: Kind
}

/// Ce que « Éditer » remet au composer : les pièces, et celle qu'on a touchée.
nonisolated struct ComposerRetouchSeed: Equatable {
    let pieces: [ComposerRetouchPiece]
    let focusId: String

    var focus: ComposerRetouchPiece? { pieces.first { $0.attachmentId == focusId } }
}

/// Ce que « Terminé » rend pour UNE pièce retouchée : son id dans le plateau.
struct ComposerRetouchedPiece {
    let attachmentId: String
    let media: ComposerReturnedMedia
}

/// Une scène que l'auteur a retouchée, et la pièce qu'elle remplacera.
nonisolated struct ComposerRetouchedScene: Equatable {
    let piece: ComposerRetouchPiece
    let slideId: String
}

nonisolated enum ComposerRetouchSeries {

    /// Le plafond de scènes du composer (`canAddSlide`, dix).
    static let sceneCap = 10

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

    /// La fenêtre de pièces montées quand le message en porte plus que le
    /// composer n'a de scènes : elle contient TOUJOURS la pièce touchée.
    static func window(count: Int, focus: Int, cap: Int = sceneCap) -> Range<Int> {
        guard count > cap else { return 0..<max(count, 0) }
        let debut = min(max(focus - cap / 2, 0), count - cap)
        return debut..<(debut + cap)
    }

    /// L'empreinte d'une scène — ce qui dit « elle a changé ».
    static func fingerprint(_ slide: StorySlide) -> Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return try? encoder.encode(slide)
    }

    /// Les scènes retouchées depuis leur état de départ, dans l'ordre des
    /// pièces ; une scène intacte n'y figure pas — sa pièce reste telle quelle.
    /// Sans état de départ (« Terminé » avant la fin des mesures), rien n'a pu
    /// être retouché.
    static func retouchedScenes(pieces: [ComposerRetouchPiece],
                                slideIdByURL: [URL: String],
                                baselines: [String: Data],
                                slides: [StorySlide]) -> [ComposerRetouchedScene] {
        let parId = Dictionary(slides.map { ($0.id, $0) }, uniquingKeysWith: { premiere, _ in premiere })
        return pieces.compactMap { piece in
            guard let slideId = slideIdByURL[piece.fileURL], let slide = parId[slideId],
                  let depart = baselines[slideId], fingerprint(slide) != depart else { return nil }
            return ComposerRetouchedScene(piece: piece, slideId: slideId)
        }
    }

    /// **Une pièce vidéo dure ce que dure sa vidéo** (#9136) — la fenêtre
    /// coupée, jamais la durée minimale d'une story (six secondes) : la scène se
    /// fige sur la durée du fond, que le rognage a écrite (`MediaTrimRule.fields`).
    static func messageVideoSlide(_ slide: StorySlide) -> StorySlide {
        guard let duree = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .video })?.duration,
              duree > 0 else { return slide }
        var figee = slide
        figee.effects.timelineDuration = duree
        return figee
    }

    /// **La taille d'une pièce image rendue** — le cadre RECADRÉ du fond quand
    /// l'auteur l'a recadré (un carré repart carré), sinon celui de la scène.
    static func imageRenderSize(slide: StorySlide, canvasRatio: CGFloat) -> CGSize {
        guard let fond = slide.effects.mediaObjects?.first(where: { $0.isBackground && $0.kind == .image }),
              let cadre = fond.crop, !cadre.isFull, let ratio = fond.measuredAspectRatio else {
            return ComposerReturnImage.renderSize(ratio: canvasRatio)
        }
        return ComposerReturnImage.renderSize(ratio: CGFloat(MediaCropRule.effectiveRatio(sourceRatio: ratio, crop: cadre)))
    }
}
