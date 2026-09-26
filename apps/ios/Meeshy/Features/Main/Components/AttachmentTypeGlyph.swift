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
