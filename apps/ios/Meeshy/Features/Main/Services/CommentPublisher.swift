import Foundation
import MeeshySDK
import os

/// **LE SEUL CHEMIN PAR LEQUEL UN COMMENTAIRE SE CRÉE** (#9743).
///
/// Cinq portes créaient un commentaire sur le réseau — l'envoi direct du fil
/// et des réels, celui du détail d'un post, celui d'une story, la réponse
/// depuis une notification, et le rejeu de la file (retour du réseau, reprise
/// au lancement, relance manuelle, retour au premier plan : tous passent par
/// le dispatcher). Chacune lisait le jeton COURANT au moment de sa requête,
/// après une ou plusieurs attentes : vérifier « ce commentaire est celui du
/// compte A » puis envoyer laissait une fenêtre où le compte change et où la
/// requête part sous le jeton de B.
///
/// Elles passent toutes ici, et la règle tient en une ligne : **le jeton qui
/// signe une requête est celui qu'on vient de vérifier.**
/// `CommentOwnership.tokenBound` lit le compte DANS le jeton, le compare à
/// l'auteur déclaré par la charge, et rend ce jeton-là ; il est posé tel quel
/// sur la requête (`APIClient.requestPinned`, téléversement sans
/// rafraîchissement). Aucune seconde lecture, donc aucun décalage. Sans
/// auteur lisible, sans jeton, ou sous un autre compte : rien ne part.
///
/// Garde : `CommentPublisherIsTheOnlyDoorGuardTests` interdit tout autre
/// appel réseau de création de commentaire dans l'application.
struct CommentPublisher {

    /// Une pièce à téléverser, sous son index d'origine dans la zone.
    struct Piece {
        let sourceIndex: Int
        let fileURL: URL
        let mimeType: String
        var thumbHash: String? = nil
    }

    /// La montée s'est arrêtée en chemin : ce qui est acquis voyage avec la
    /// cause, pour que la file ne le re-téléverse pas.
    struct Interrupted: Error {
        let acquired: [UploadedCommentMedia]
        let underlying: Error
    }

    enum Failure: Error { case missingServer }

    /// Amène un jeton frais quand celui de la session a expiré — AVANT la
    /// lecture qui sera vérifiée, jamais après.
    let prepare: @MainActor () async -> Void
    /// Le jeton de la session courante, lu UNE fois par requête.
    let token: @MainActor () -> String?
    let upload: @MainActor (Piece, String) async throws -> String
    let create: @MainActor (CreateCommentPayload, [String], String) async throws -> APIPostComment?

    /// Téléverse ce qui manque, puis crée le commentaire. Chaque requête est
    /// signée par un jeton vérifié À L'INSTANT contre l'auteur de la charge.
    ///
    /// Rend le commentaire servi, ou `nil` quand le serveur a confirmé sans
    /// le décrire (rejeu dédoublonné).
    @discardableResult
    func publish(
        _ payload: CreateCommentPayload,
        pieces: [Piece],
        acquired: [UploadedCommentMedia] = [],
        onUploaded: @MainActor (UploadedCommentMedia) async -> Void = { _ in }
    ) async throws -> APIPostComment? {
        var uploaded = acquired
        for piece in pieces where !uploaded.contains(where: { $0.sourceIndex == piece.sourceIndex }) {
            let id: String
            do {
                id = try await upload(piece, try await boundToken(for: payload))
            } catch let refusal as CommentOwnership.Refusal {
                throw refusal
            } catch {
                throw Interrupted(acquired: uploaded, underlying: error)
            }
            let done = UploadedCommentMedia(sourceIndex: piece.sourceIndex, id: id,
                                            uploadedAt: Date().timeIntervalSince1970)
            uploaded.append(done)
            await onUploaded(done)
        }
        do {
            return try await create(payload, CommentMediaReplay.attachmentIds(uploaded), try await boundToken(for: payload))
        } catch let refusal as CommentOwnership.Refusal {
            throw refusal
        } catch {
            throw Interrupted(acquired: uploaded, underlying: error)
        }
    }

    /// Le jeton sous lequel la PROCHAINE requête part. Lu après toute attente,
    /// vérifié, et rendu : l'appelant le pose tel quel.
    private func boundToken(for payload: CreateCommentPayload) async throws -> String {
        await prepare()
        return try CommentOwnership.tokenBound(to: payload, token: token())
    }

    /// Le compte que la session courante DÉSIGNE — lu dans son jeton, la même
    /// source que celle qui signe les requêtes. `nil` sans session lisible.
    static func currentAccountId() -> String? {
        CommentOwnership.userId(inToken: APIClient.shared.authToken)
    }

    /// Les pièces d'une zone de commentaire, dans leur ordre.
    static func pieces(_ medias: [PendingCommentMedia]) -> [Piece] {
        medias.enumerated().map { index, media in
            Piece(sourceIndex: index, fileURL: media.fileURL, mimeType: media.mimeType, thumbHash: media.thumbHash)
        }
    }
}

// MARK: - Le réseau réel

extension CommentPublisher {

    static let live = CommentPublisher(
        prepare: {
            guard AuthManager.isTokenExpired(APIClient.shared.authToken, now: Date()) else { return }
            _ = try? await AuthManager.shared.refreshSession()
        },
        token: { APIClient.shared.authToken },
        upload: { piece, token in
            guard let baseURL = URL(string: MeeshyConfig.shared.serverOrigin) else { throw Failure.missingServer }
            // Aucun rafraîchissement : un 401 ne fait pas reprendre la montée
            // sous le jeton de la session du moment, qui peut être une autre.
            let uploader = TusUploadManager(baseURL: baseURL, refreshAuthSession: { _ in
                throw CommentOwnership.Refusal.notTheAuthor
            })
            return try await uploader.uploadFile(
                fileURL: piece.fileURL,
                mimeType: piece.mimeType,
                credential: .bearer(token),
                uploadContext: "comment",
                thumbHash: piece.thumbHash
            ).id
        },
        create: { payload, attachmentIds, token in
            let response: APIResponse<ServedComment> = try await APIClient.shared.requestPinned(
                PostsEndpoint.byPostIdComments(postId: payload.postId),
                method: "POST",
                body: try CreateCommentBody.encoded(for: payload, attachmentIds: attachmentIds),
                // Le MÊME identifiant client à chaque tentative : un envoi
                // abouti dont la réponse s'est perdue est dédoublonné.
                headers: ["X-Client-Mutation-Id": payload.clientMutationId],
                bearerToken: token
            )
            return response.data.comment
        }
    )
}

/// Le commentaire servi, quand la réponse le décrit. Un rejeu dédoublonné
/// peut confirmer sans le rendre en entier : ce n'est pas un échec.
nonisolated struct ServedComment: Decodable, Sendable {
    let comment: APIPostComment?

    init(from decoder: Decoder) throws {
        comment = try? APIPostComment(from: decoder)
    }
}
