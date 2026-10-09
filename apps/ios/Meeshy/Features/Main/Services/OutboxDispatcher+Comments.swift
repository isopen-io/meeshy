import Foundation
import MeeshySDK
import os

/// **La famille « commentaires » du dispatcher** — `POST /posts/:id/comments`,
/// extraite de `OutboxDispatcher.swift` avec ce que le lot #9743 lui apprend :
/// rejouer les PIÈCES d'un commentaire.
///
/// Un commentaire avec média envoyé hors ligne rejoignait la file en texte
/// seul (`CreateCommentPayload` n'emportait ni fichier ni id), et arrivait
/// amputé. La mécanique est celle des publications (`dispatchCreatePost`,
/// #5830), pas une seconde : les fichiers vivent sous
/// `Documents/pending-media/<cmid>/`, chaque téléversement acquis est gravé
/// sur la ligne, et le rejeu ne monte que ce qui manque.
extension OutboxDispatcher {

    func dispatchCreateComment(_ record: OutboxRecord) async throws {
        let payload = try decodePayload(record, as: CreateCommentPayload.self)
        let uploaded = try await uploadedCommentMedia(for: payload, outboxId: record.id)
        let _: APIResponse<[String: AnyCodable]> = try await APIClient.shared.requestWithHeaders(
            PostsEndpoint.byPostIdComments(postId: payload.postId),
            method: "POST",
            body: try CreateCommentBody.encoded(for: payload,
                                                attachmentIds: CommentMediaReplay.attachmentIds(uploaded)),
            queryItems: nil,
            // Le MÊME identifiant client à chaque tentative : un POST abouti
            // dont la réponse s'est perdue est dédoublonné par le serveur.
            headers: ["X-Client-Mutation-Id": payload.clientMutationId]
        )
        // Les fichiers ne partent qu'une fois le commentaire créé : un échec
        // plus haut laisse la ligne avec ses octets.
        for stored in payload.localMediaPaths ?? [] {
            FileManager.default.removeItemLogging(atPath: OfflineQueue.absoluteMediaPath(forStored: stored),
                                                  context: "createComment media envoyé", logger: logger)
        }
        logger.info("createComment dispatched on \(payload.postId, privacy: .public) cmid=\(payload.clientMutationId, privacy: .public) pièces=\(uploaded.count, privacy: .public)")
    }

    /// Les pièces du commentaire, montées. Reprend ce qu'une tentative
    /// précédente a acquis, téléverse le reste, et REPORTE l'envoi tant qu'une
    /// pièce encore sur le disque n'est pas montée : un commentaire ne part
    /// pas amputé d'un média qu'un rejeu obtiendra.
    private func uploadedCommentMedia(for payload: CreateCommentPayload, outboxId: String) async throws -> [UploadedCommentMedia] {
        let paths = (payload.localMediaPaths ?? []).map { OfflineQueue.absoluteMediaPath(forStored: $0) }
        guard !paths.isEmpty else { return [] }
        let plan = CommentMediaReplay.plan(for: payload, now: Date()) { index in
            FileManager.default.fileExists(atPath: paths[index])
        }
        if !plan.missing.isEmpty {
            logger.error("createComment: \(plan.missing.count, privacy: .public) pièce(s) disparue(s) du disque — les octets n'existent plus")
        }
        guard !plan.toUpload.isEmpty else { return plan.acquired }
        guard let baseURL = URL(string: MeeshyConfig.shared.serverOrigin),
              let token = APIClient.shared.authToken else {
            throw NSError(domain: "OutboxDispatcher", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: "No baseURL or auth token to upload comment media"])
        }
        let uploader = TusUploadManager(baseURL: baseURL)
        var uploaded = plan.acquired
        for index in plan.toUpload {
            let url = URL(fileURLWithPath: paths[index])
            let declared = payload.localMediaMimeTypes.flatMap { $0.indices.contains(index) ? $0[index] : nil }
            do {
                let result = try await uploader.uploadFile(
                    fileURL: url,
                    mimeType: declared ?? MimeTypeResolver.mimeType(forExtension: url.pathExtension),
                    credential: .bearer(token),
                    uploadContext: "comment"
                )
                let piece = UploadedCommentMedia(sourceIndex: index, id: result.id,
                                                 uploadedAt: Date().timeIntervalSince1970)
                uploaded.append(piece)
                await OfflineQueue.shared.recordUploadedCommentMedia(outboxId: outboxId, piece)
            } catch {
                throw NSError(domain: "OutboxDispatcher", code: 503, userInfo: [
                    NSLocalizedDescriptionKey: "Pièce \(uploaded.count)/\(paths.count) montée — commentaire reporté : \(error.localizedDescription)",
                    NSUnderlyingErrorKey: error,
                ])
            }
        }
        return uploaded
    }
}
