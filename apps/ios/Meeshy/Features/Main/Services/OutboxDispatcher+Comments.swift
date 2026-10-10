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
        try await dispatchCreateComment(record, publisher: .live)
    }

    /// Tout rejeu passe ici — retour du réseau, reprise au lancement, relance
    /// manuelle, retour au premier plan : le flusher n'a qu'une porte. Et
    /// cette porte n'envoie rien elle-même : `CommentPublisher` signe chaque
    /// requête d'un jeton vérifié contre l'auteur de la ligne.
    ///
    /// **Un refus ne détruit RIEN** (audit, constat 3). Le flusher tient la
    /// base du compte qui l'a créé : pendant une bascule de compte, il peut
    /// rejouer les lignes de A alors que la session est celle de B, ou de
    /// personne. Ces lignes ne partent pas — et elles ne s'effacent pas non
    /// plus : elles attendent leur auteur, sans consommer leur budget.
    func dispatchCreateComment(_ record: OutboxRecord, publisher: CommentPublisher) async throws {
        let payload = try decodePayload(record, as: CreateCommentPayload.self)
        // **Une ligne sans auteur ne se rejoue jamais d'elle-même.** Gravée
        // avant le champ, elle s'épuise ICI — sans rien envoyer ni supprimer —
        // et reste visible « non envoyée » : c'est la relance MANUELLE de son
        // compte qui lui donnera un auteur (`OfflineQueue.retryCreateComment`).
        guard CommentOwnership.identity(payload.authorId) != nil else {
            throw MeeshyError.server(statusCode: 422, message: "createComment: ligne sans auteur, relance manuelle requise")
        }
        // Les fichiers de la ligne doivent vivre dans le dossier de SON
        // auteur ; une ligne sans auteur lisible n'en a aucun.
        guard let stored = CommentOwnership.ownedMediaPaths(payload) else {
            throw MeeshyError.server(statusCode: 403, message: "createComment: pièces hors du dossier de l'auteur")
        }
        let paths = stored.map { OfflineQueue.absoluteMediaPath(forStored: $0) }
        let plan = CommentMediaReplay.plan(for: payload, now: Date()) { index in
            FileManager.default.fileExists(atPath: paths[index])
        }
        // **Aucun envoi amputé** (constat 5) : une pièce dont les octets ont
        // disparu ne reviendra pas. Le commentaire ne part pas sans elle — la
        // ligne s'épuise avec son motif, et l'auteur la voit « non envoyée ».
        guard plan.missing.isEmpty else {
            throw MeeshyError.server(statusCode: 422, message: "createComment: \(plan.missing.count) pièce(s) disparue(s) du disque")
        }
        let pieces = plan.toUpload.map { index in
            let url = URL(fileURLWithPath: paths[index])
            let declared = payload.localMediaMimeTypes.flatMap { $0.indices.contains(index) ? $0[index] : nil }
            return CommentPublisher.Piece(
                sourceIndex: index, fileURL: url,
                mimeType: declared ?? MimeTypeResolver.mimeType(forExtension: url.pathExtension))
        }
        let outboxId = record.id
        do {
            try await publisher.publish(payload, pieces: pieces, acquired: plan.acquired) { piece in
                await OfflineQueue.shared.recordUploadedCommentMedia(outboxId: outboxId, piece)
            }
        } catch is CommentOwnership.Refusal {
            // Ni envoi, ni suppression : la ligne est REPORTÉE (le flusher ne
            // consomme pas le budget d'une session absente) et reste intacte
            // dans la base de son compte.
            logger.info("createComment reporté : la session courante n'est pas celle de l'auteur")
            throw MeeshyError.auth(.sessionExpired)
        } catch let interrupted as CommentPublisher.Interrupted {
            // **410 = déjà créé** (constat 8) : le serveur a appliqué ce cmid
            // lors d'une tentative dont la réponse s'est perdue. Ce n'est pas
            // un échec à montrer « Réessayer » sans fin.
            guard Self.isAlreadyCreated(interrupted.underlying) else { throw interrupted.underlying }
        }
        // Les fichiers ne partent qu'une fois le commentaire créé.
        for path in paths {
            FileManager.default.removeItemLogging(atPath: path, context: "createComment media envoyé", logger: logger)
        }
        OfflineQueue.removeEmptyParentDirectories(of: stored)
        logger.info("createComment dispatched, pièces=\(paths.count, privacy: .public)")
    }

    static func isAlreadyCreated(_ error: Error) -> Bool {
        if case MeeshyError.server(statusCode: 410, _) = error { return true }
        return false
    }
}
