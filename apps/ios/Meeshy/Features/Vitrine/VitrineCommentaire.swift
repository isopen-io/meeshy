#if DEBUG
import Foundation
import MeeshySDK

/// Le vocal que la scène `interaction-commentaire-audio` envoie en commentaire (#9810). Le micro ne se simule pas : le
/// vocal est FOURNI par le kit, et emprunte ensuite le chemin d'un enregistrement terminé.
///
/// Il vient de la destination de la scène si le kit en décrit une (`scenes["interaction-commentaire-audio"]`, une pièce
/// audio d'un message), sinon de la pièce de la scène « amour » : un vrai fichier rangé dans le cache audio, sa
/// transcription et ses pistes traduites, telles que le pipeline audio les sert.
nonisolated struct VitrineCommentaireVocal: Sendable {
    /// Le fichier déposé par le kit dans `Documents/vitrine/medias/`.
    let fichier: URL
    /// L'URL que la passerelle sert pour ce média : la clé sous laquelle le cache audio le range.
    let urlServie: String
    let duree: TimeInterval
    let transcription: APIAttachmentTranscription?
    let traductions: [String: APIAttachmentTranslation]?

    static func depuis(_ f: VitrineFixtures, dossier: URL) -> VitrineCommentaireVocal? {
        let destination = f.destination(.interactionCommentaireAudio) ?? f.destination(.amour)
        guard let destination, let attachmentId = destination.attachmentId,
              let piece = f.messages[destination.conversationId]?.lazy.compactMap({ $0.attachments?.first { $0.id == attachmentId } }).first,
              let url = piece.fileUrl,
              let media = f.medias.first(where: { $0.url == url && $0.genre == .audio }) else { return nil }
        return VitrineCommentaireVocal(
            fichier: dossier.appendingPathComponent(media.fichier),
            urlServie: url,
            duree: TimeInterval(piece.duration ?? 0) / 1000,
            transcription: piece.transcription,
            traductions: piece.translations
        )
    }
}

nonisolated enum VitrineCommentaireRefus: Error {
    /// Un enrichissement demandé avant que le commentaire existe.
    case aucunCommentaire
}

/// La passerelle des commentaires, en vitrine : elle accepte le téléversement et la création que le VRAI publieur
/// (`CommentPublisher.publish`, garde d'appartenance comprise) lui adresse, puis sert la transcription et la traduction
/// comme le pipeline audio les pousse (`comment:media-updated`).
@MainActor
final class VitrineCommentaireServeur {
    let postId: String
    /// Un JWT inerte (`alg: none`) qui désigne le lecteur : le publieur ne laisse partir que les commentaires de
    /// l'auteur que le jeton nomme, et aucun serveur ne le reçoit.
    let jeton: String

    private let lecteur: MeeshyUser
    private let vocal: VitrineCommentaireVocal
    private let montee: Duration
    private(set) var cree: APIPostComment?
    private var attentes: [CheckedContinuation<APIPostComment, Never>] = []

    init(lecteur: MeeshyUser, postId: String, vocal: VitrineCommentaireVocal, montee: Duration) {
        self.lecteur = lecteur
        self.postId = postId
        self.vocal = vocal
        self.montee = montee
        jeton = Self.jeton(pour: lecteur.id)
    }

    // Deinit isolée synthétisée (SE-0466) : double libération sous iOS 26.1 hors d'une tâche.
    nonisolated deinit {}

    var publieur: CommentPublisher {
        CommentPublisher(
            prepare: {},
            token: { [jeton] in jeton },
            upload: { [montee] piece, _ in
                try? await Task.sleep(for: montee)
                return "vitrine-piece-\(piece.sourceIndex)-\(UUID().uuidString)"
            },
            create: { [weak self] payload, _, _ in
                guard let self else { return nil }
                return try self.creer(payload)
            }
        )
    }

    /// Le commentaire créé — tout de suite s'il l'est déjà.
    func attendreLaCreation() async -> APIPostComment {
        if let cree { return cree }
        return await withCheckedContinuation { attentes.append($0) }
    }

    /// Whisper a transcrit le vocal : le commentaire revient avec sa transcription, sans piste traduite.
    func transcriptionArrivee() -> SocketCommentMediaUpdatedData? {
        try? enrichi(transcription: vocal.transcription, traductions: nil)
    }

    /// NLLB et la synthèse ont produit les pistes : le commentaire revient complet.
    func traductionArrivee() -> SocketCommentMediaUpdatedData? {
        try? enrichi(transcription: vocal.transcription, traductions: vocal.traductions)
    }

    private func creer(_ payload: CreateCommentPayload) throws -> APIPostComment {
        let commentaire = try Self.decoder(APIPostComment.self, commentaire(payload, id: Self.identifiant(), transcription: nil, traductions: nil))
        cree = commentaire
        let attentes = self.attentes
        self.attentes = []
        attentes.forEach { $0.resume(returning: commentaire) }
        return commentaire
    }

    private func enrichi(transcription: APIAttachmentTranscription?, traductions: [String: APIAttachmentTranslation]?) throws -> SocketCommentMediaUpdatedData {
        guard let cree else { throw VitrineCommentaireRefus.aucunCommentaire }
        let payload = CreateCommentPayload(
            clientMutationId: cree.id, postId: postId, parentCommentId: nil,
            content: cree.content, originalLanguage: cree.originalLanguage, authorId: lecteur.id
        )
        let comment = commentaire(payload, id: cree.id, transcription: transcription, traductions: traductions, creeLe: cree.createdAt)
        return try Self.decoder(SocketCommentMediaUpdatedData.self, ["postId": postId, "commentId": cree.id, "comment": comment])
    }

    /// Le commentaire tel que la passerelle le sert (`GET/POST /posts/:id/comments`).
    private func commentaire(
        _ payload: CreateCommentPayload, id: String,
        transcription: APIAttachmentTranscription?, traductions: [String: APIAttachmentTranslation]?, creeLe: Date = Date()
    ) -> [String: Any] {
        var media: [String: Any] = [
            "id": "\(id)-vocal",
            "fileName": vocal.fichier.lastPathComponent,
            "originalName": vocal.fichier.lastPathComponent,
            "mimeType": "audio/mp4",
            "fileUrl": vocal.urlServie,
            "duration": Int(vocal.duree * 1000),
            "order": 0,
        ]
        media["transcription"] = transcription.flatMap { Self.json($0) }
        media["translations"] = traductions.flatMap { Self.json($0) }
        return [
            "id": id,
            "content": payload.content,
            "originalLanguage": payload.originalLanguage.map { $0 as Any } ?? NSNull(),
            "parentId": NSNull(),
            "likeCount": 0,
            "replyCount": 0,
            "createdAt": Self.horodatage.string(from: creeLe),
            "author": [
                "id": lecteur.id,
                "username": lecteur.username,
                "displayName": lecteur.displayName ?? lecteur.username,
                "avatar": lecteur.avatar.map { $0 as Any } ?? NSNull(),
            ] as [String: Any],
            "media": [media],
        ]
    }

    private static let horodatage: ISO8601DateFormatter = {
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format
    }()

    private static func json(_ valeur: some Encodable) -> Any? {
        guard let data = try? JSONEncoder().encode(valeur) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    private static func decoder<T: Decodable>(_ type: T.Type, _ objet: [String: Any]) throws -> T {
        try APIClient.makeAPIPayloadDecoder().decode(type, from: JSONSerialization.data(withJSONObject: objet))
    }

    /// Un ObjectId plausible : 24 caractères hexadécimaux.
    private static func identifiant() -> String {
        String(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(24))
    }

    private static func jeton(pour lecteurId: String) -> String {
        let segment: ([String: Any]) -> String = { objet in
            (try? JSONSerialization.data(withJSONObject: objet, options: [.sortedKeys]))?
                .base64EncodedString()
                .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
                .replacingOccurrences(of: "=", with: "") ?? ""
        }
        return [segment(["alg": "none", "typ": "JWT"]), segment(["userId": lecteurId, "exp": 4_102_444_800]), "dml0cmluZQ"]
            .joined(separator: ".")
    }
}

/// Le publieur de commentaires que l'app appelle (`CommentPublisher.live`), le temps de la scène.
@MainActor
enum VitrineCommentaire {
    private static var serveur: VitrineCommentaireServeur?

    static var publieur: CommentPublisher? { serveur?.publieur }
    static var installe: VitrineCommentaireServeur? { serveur }

    static func installer(_ serveur: VitrineCommentaireServeur) {
        self.serveur = serveur
    }

    static func retirer() {
        serveur = nil
    }
}
#endif
