import MeeshySDK

extension MessageAttachment.AttachmentType {
    /// Glyphe SF Symbols d'une pièce jointe en attente — site unique.
    var composerGlyph: String {
        switch self {
        case .image: return "photo.fill"
        case .video: return "video.fill"
        case .audio: return "waveform"
        case .file: return "doc.fill"
        case .location: return "location.fill"
        }
    }
}

/// **Le glyphe CENTRAL d'une pièce en attente** (#9119) : toucher la tuile
/// l'ÉDITE, le centre le dit. `nil` ⇒ rien d'éditable, aucun glyphe promis.
enum ComposerPendingTileGlyph {
    static let edit = "pencil"

    static func center(for type: MessageAttachment.AttachmentType, mimeType: String) -> String? {
        switch type {
        case .image: return ConversationImageRetouche.offersRetouche(mimeType: mimeType) ? edit : nil
        case .video, .audio: return edit
        case .file, .location: return nil
        }
    }
}
