import Foundation

public enum UploadFileStatus: String, Sendable {
    case queued, uploading, complete, error, paused
}

public struct FileUploadProgress: Sendable {
    public let fileId: String
    public let fileName: String
    public let fileSize: Int64
    public let status: UploadFileStatus
    public let percentage: Double
    public let bytesUploaded: Int64
    public let error: String?
    public let attachmentId: String?
}

public struct UploadQueueProgress: Sendable {
    public let files: [FileUploadProgress]
    public let totalFiles: Int
    public let completedFiles: Int
    public let totalBytes: Int64
    public let uploadedBytes: Int64
    public let globalPercentage: Double
}

/// Marker error thrown by `TusUploadManager` when an existing TUS session
/// has been GC'd by the server (404 / 410 on PATCH). The checkpoint store
/// already drops the stale checkpoint before this is thrown ; the caller's
/// retry path will see a fresh state and POST a new session.
public struct TusResumeRetriableError: Error {
    public init() {}
}

/// Le système a retiré le temps d'arrière-plan avant la fin du téléversement
/// (#9875). La tâche est terminée, le PATCH en vol abandonné ; le point de
/// reprise (URL de session, dernier offset accepté) reste en base, et la
/// prochaine tentative repart de cet offset au lieu de tout renvoyer.
public struct TusUploadSuspendedError: Error {
    public init() {}
}

public struct TusUploadResult: Decodable, Sendable {
    public let id: String
    public let fileName: String
    public let originalName: String?
    public let mimeType: String
    public let fileSize: Int
    public let fileUrl: String
    public let thumbnailUrl: String?
    public let thumbHash: String?
    public let width: Int?
    public let height: Int?
    public let duration: Int?

    public func toMessageAttachment(uploadedBy: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: fileName,
            originalName: originalName ?? fileName,
            mimeType: mimeType,
            fileSize: fileSize,
            fileUrl: fileUrl,
            width: width,
            height: height,
            thumbnailUrl: thumbnailUrl,
            duration: duration,
            uploadedBy: uploadedBy,
            createdAt: Date()
        )
    }
}

/// Transcription faite SUR L'APPAREIL d'un audio, transportée avec sa
/// création TUS (clé `transcription` d'`Upload-Metadata`, JSON en base64)
/// pour que le gateway la range dans `MessageAttachment.metadata.transcription`
/// — ce que `MessageProcessor` remet au translator en passthrough. Forme du
/// fil : `text`, `language` (code court), `confidence`, `durationMs`,
/// `segments[{text,startMs,endMs}]` — celle que le translator lit.
public struct TusUploadTranscriptionMetadata: Codable, Sendable, Equatable {
    public struct Segment: Codable, Sendable, Equatable {
        public let text: String
        public let startMs: Int
        public let endMs: Int

        public init(text: String, startMs: Int, endMs: Int) {
            self.text = text; self.startMs = startMs; self.endMs = endMs
        }
    }

    /// Plafond de la charge ENCODÉE (JSON, AVANT base64).
    ///
    /// **Un en-tête HTTP n'est pas un corps, et le budget est celui de la
    /// LIGNE d'en-tête, pas celui du JSON** : le base64 enfle de 4/3, et
    /// `Upload-Metadata` porte déjà `filename`, `filetype`, `uploadcontext` et
    /// `thumbhash`. 4 Kio de JSON tiennent en ~5,5 Kio de base64 — sous le
    /// buffer de 8 Kio d'un frontal nginx et très en deçà des 16 Kio
    /// d'en-têtes que Node accepte par défaut. Un plafond posé sur la taille
    /// du JSON SEUL (16 Kio, la borne défensive du gateway) aurait produit une
    /// ligne de ~22 Kio : l'upload aurait ÉCHOUÉ, alors que la transcription
    /// est facultative et ne doit jamais coûter le vocal.
    ///
    /// Au-delà, les segments cèdent d'abord, puis le texte lui-même ne voyage
    /// pas — le serveur transcrit alors comme avant.
    public static let maxEncodedBytes = 4 * 1024

    public let text: String
    public let language: String
    public let confidence: Double?
    public let durationMs: Int?
    public let segments: [Segment]?

    public init(text: String, language: String, confidence: Double?, durationMs: Int?, segments: [Segment]?) {
        self.text = text; self.language = language; self.confidence = confidence
        self.durationMs = durationMs; self.segments = segments
    }

    /// Valeur base64 prête pour `Upload-Metadata`, `nil` si même sans
    /// segments la charge dépasse `maxEncodedBytes`.
    public func uploadMetadataValue() -> String? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let full = try? encoder.encode(self) else { return nil }
        if full.count <= Self.maxEncodedBytes { return full.base64EncodedString() }
        let withoutSegments = TusUploadTranscriptionMetadata(
            text: text, language: language, confidence: confidence, durationMs: durationMs, segments: nil
        )
        guard let reduced = try? encoder.encode(withoutSegments), reduced.count <= Self.maxEncodedBytes else { return nil }
        return reduced.base64EncodedString()
    }
}

/// Les envois TUS EN VOL dans ce processus, par clé de checkpoint. Un manager naît par envoi : sans ce
/// registre commun, deux envois des mêmes octets reprenaient la même session et croisaient leurs PATCH.
final class TusUploadLeases: Sendable {
    static let shared = TusUploadLeases()
    private let held = Locked(Set<String>())

    /// Vrai si la clé était libre — l'appelant la tient jusqu'à `release`.
    func claim(_ key: String) -> Bool {
        held.mutate { $0.insert(key).inserted }
    }

    func release(_ key: String) {
        held.mutate { _ = $0.remove(key) }
    }
}
