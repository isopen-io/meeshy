import Foundation
import SwiftUI
import UniformTypeIdentifiers
import PhotosUI
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

/// Helpers partagés de staging d'un média de commentaire — utilisés par TOUTES les
/// surfaces de composer commentaire (feed/reels `CommentsSheetView`, `PostDetailView`,
/// composer stories) pour garantir un comportement identique (un seul média ;
/// image/vidéo/audio ; voix réelle).
enum CommentComposerStaging {
    /// Construit un `PendingCommentMedia` depuis une pièce jointe stagée par le
    /// composer. Renvoie nil pour les types hors périmètre (file/location) ou sans
    /// fichier local. L'`optimistic` pointe sur le fichier local pour l'affichage
    /// inline immédiat. Le mimeType est dérivé de l'extension (fallback par type).
    static func pendingMedia(from attachment: ComposerAttachment) -> PendingCommentMedia? {
        guard let url = attachment.url else { return nil }
        let feedType: FeedMediaType
        let fallbackMime: String
        switch attachment.type {
        case .image: feedType = .image; fallbackMime = "image/jpeg"
        case .video: feedType = .video; fallbackMime = "video/mp4"
        case .voice: feedType = .audio; fallbackMime = "audio/mp4"
        case .file, .location: return nil
        }
        let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? fallbackMime
        let optimistic = FeedMedia(
            type: feedType,
            url: url.absoluteString,
            thumbnailColor: attachment.thumbnailColor,
            duration: attachment.duration.map { Int($0) },
            fileName: attachment.name
        )
        return PendingCommentMedia(
            fileURL: url, mimeType: mimeType, mobileTranscription: nil, optimistic: optimistic
        )
    }

    /// Premier média exploitable (image/vidéo/audio) d'une liste stagée — un
    /// commentaire ne porte qu'un seul média.
    static func firstPendingMedia(in attachments: [ComposerAttachment]) -> PendingCommentMedia? {
        attachments.lazy.compactMap { pendingMedia(from: $0) }.first
    }

    /// Pièce jointe voix portant un VRAI fichier audio (issu d'`AudioRecorderManager`).
    static func voiceAttachment(duration: TimeInterval, url: URL) -> ComposerAttachment {
        var voice = ComposerAttachment.voice(duration: duration)
        voice.url = url
        return voice
    }

    /// `PhotosPickerItem[]` → `ComposerAttachment[]` (image/vidéo), écrits dans des
    /// fichiers temporaires. Un commentaire ne porte qu'un média → bornage à 1 fait
    /// par l'appelant (maxSelectionCount: 1).
    static func photoAttachments(from items: [PhotosPickerItem]) async -> [ComposerAttachment] {
        var result: [ComposerAttachment] = []
        for item in items {
            let isVideo = item.supportedContentTypes.contains { $0.conforms(to: .movie) }
            guard let data = try? await item.loadTransferable(type: Data.self) else { continue }
            let ext = isVideo ? "mov" : "jpg"
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("comment_\(UUID().uuidString).\(ext)")
            guard (try? data.write(to: url)) != nil else { continue }
            if isVideo {
                result.append(ComposerAttachment(
                    id: "video-\(UUID().uuidString)", type: .video,
                    name: "Video", url: url, size: data.count, thumbnailColor: "FF6B6B"))
            } else {
                result.append(ComposerAttachment.image(url: url))
            }
        }
        return result
    }

    /// URLs de fichiers importés → `ComposerAttachment[]` (copie sécurisée en temp).
    static func fileAttachments(from urls: [URL]) -> [ComposerAttachment] {
        var result: [ComposerAttachment] = []
        for url in urls {
            let didAccess = url.startAccessingSecurityScopedResource()
            defer { if didAccess { url.stopAccessingSecurityScopedResource() } }
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent("comment_\(UUID().uuidString)_\(url.lastPathComponent)")
            try? FileManager.default.copyItem(at: url, to: dest)
            let size = (try? FileManager.default.attributesOfItem(atPath: dest.path))?[.size] as? Int
            result.append(ComposerAttachment.file(url: dest, name: url.lastPathComponent, size: size))
        }
        return result
    }
}
