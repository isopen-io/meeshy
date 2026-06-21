import Foundation
import MeeshySDK

/// Média unique en attente d'envoi avec un commentaire. Porte le fichier local +
/// les métadonnées nécessaires à l'upload TUS et un `FeedMedia` optimiste pour
/// l'affichage inline immédiat (avant confirmation serveur).
///
/// Un commentaire ne porte QU'UN SEUL média (cf. backend `commentId` FK sur PostMedia).
struct PendingCommentMedia: Identifiable, Sendable {
    let id: String
    let fileURL: URL
    let mimeType: String
    let thumbHash: String?
    /// Transcription Whisper produite côté mobile pour un média audio (skip
    /// re-transcription serveur). Nil pour image/vidéo.
    let mobileTranscription: MobileTranscriptionPayload?
    /// Représentation optimiste affichée inline tant que l'upload n'est pas confirmé.
    let optimistic: FeedMedia

    init(id: String = UUID().uuidString,
         fileURL: URL,
         mimeType: String,
         thumbHash: String? = nil,
         mobileTranscription: MobileTranscriptionPayload? = nil,
         optimistic: FeedMedia) {
        self.id = id
        self.fileURL = fileURL
        self.mimeType = mimeType
        self.thumbHash = thumbHash
        self.mobileTranscription = mobileTranscription
        self.optimistic = optimistic
    }
}

/// Upload d'un média de commentaire via le pipeline TUS partagé (même mécanisme
/// que posts/stories), avec `uploadContext: "comment"` → le gateway crée un
/// `PostMedia` pending (postId/commentId = null) que `addComment(mediaId:)` lie
/// ensuite au commentaire. Renvoie l'ID du PostMedia créé.
enum CommentMediaUploader {
    enum UploadError: Error { case missingAuth }

    static func upload(_ media: PendingCommentMedia) async throws -> String {
        guard let baseURL = URL(string: MeeshyConfig.shared.serverOrigin),
              let token = APIClient.shared.authToken else {
            throw UploadError.missingAuth
        }
        let uploader = TusUploadManager(baseURL: baseURL)
        let result = try await uploader.uploadFile(
            fileURL: media.fileURL,
            mimeType: media.mimeType,
            token: token,
            uploadContext: "comment",
            thumbHash: media.thumbHash
        )
        try? FileManager.default.removeItem(at: media.fileURL)
        return result.id
    }
}
