#if DEBUG
import Foundation
import MeeshySDK

/// Le commentaire vocal de la vitrine (#9810) : témoin rouge, types vides qui compilent.
nonisolated struct VitrineCommentaireVocal: Sendable {
    let fichier: URL
    let urlServie: String
    let duree: TimeInterval
    let transcription: APIAttachmentTranscription?
    let traductions: [String: APIAttachmentTranslation]?

    static func depuis(_ f: VitrineFixtures, dossier: URL) -> VitrineCommentaireVocal? { nil }
}

@MainActor
final class VitrineCommentaireServeur {
    let postId: String
    let jeton = ""

    init(lecteur: MeeshyUser, postId: String, vocal: VitrineCommentaireVocal, montee: Duration) {
        self.postId = postId
    }

    nonisolated deinit {}

    var publieur: CommentPublisher {
        CommentPublisher(prepare: {}, token: { nil }, upload: { _, _ in "" }, create: { _, _, _ in nil })
    }

    func attendreLaCreation() async -> APIPostComment { fatalError("témoin rouge") }
    func transcriptionArrivee() -> SocketCommentMediaUpdatedData? { nil }
    func traductionArrivee() -> SocketCommentMediaUpdatedData? { nil }
}

@MainActor
enum VitrineCommentaire {
    static var publieur: CommentPublisher? { nil }
    static func installer(_ serveur: VitrineCommentaireServeur) {}
    static func retirer() {}
}
#endif
