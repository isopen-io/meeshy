import Foundation

/// **Ce que l'édition d'une vidéo rend à son appelant.**
///
/// L'ancien éditeur vidéo (`MeeshyVideoEditorView`) a quitté le dépôt (#9124) :
/// une vidéo s'édite désormais dans la scène du composer. Son pipeline —
/// document non destructif, constructeur de composition, export — n'avait plus
/// aucun appelant et l'a suivi (#9331), emportant un second `VideoFilterPreset`
/// public qui homonymait les teintes de l'appel. Restent le porteur que la
/// conversation et le fil passent encore (`VideoEditResult`) et la légende
/// qu'il transporte (`VideoCaption`, lue par `StoryVideoCaptionMetadata`).

// MARK: - Caption

public struct VideoCaption: Codable, Sendable, Equatable, Identifiable {
    public var id: UUID
    /// Start in *edited-timeline* seconds.
    public var start: Double
    public var end: Double
    public var text: String

    public init(id: UUID = UUID(), start: Double, end: Double, text: String) {
        self.id = id
        self.start = start
        self.end = end
        self.text = text
    }
}

// MARK: - Result

/// Hand-off payload returned to the caller once editing finishes.
public struct VideoEditResult: Sendable {
    public let url: URL
    public let didEdit: Bool
    public let duration: Double
    public let transcriptionText: String?
    public let captions: [VideoCaption]
    public let captionLanguageCode: String?

    public init(
        url: URL,
        didEdit: Bool,
        duration: Double,
        transcriptionText: String?,
        captions: [VideoCaption],
        captionLanguageCode: String?
    ) {
        self.url = url
        self.didEdit = didEdit
        self.duration = duration
        self.transcriptionText = transcriptionText
        self.captions = captions
        self.captionLanguageCode = captionLanguageCode
    }
}
