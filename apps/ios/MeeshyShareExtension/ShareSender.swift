import Foundation
import os

/// Porté par un type `nonisolated` plutôt que déclaré en global de fichier :
/// sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, une globale de fichier
/// hérite de l'isolation MainActor et devient inaccessible depuis le code
/// nonisolated de ce même fichier.
nonisolated enum ShareLog {
    static let logger = Logger(subsystem: "me.meeshy.app", category: "share-extension")
}

/// Issue d'une tentative d'envoi.
///
/// Volontairement binaire : soit le gateway a accusé réception, soit l'envoi est
/// relayé à l'app. Il n'existe pas de troisième cas « perdu » — c'est tout
/// l'objet du relais différé.
nonisolated enum ShareOutcome: Equatable, Sendable {
    case sent
    case deferred
}

/// Envoi d'un message texte depuis l'extension.
///
/// Client REST minimal calqué sur `NSEDataSync` : l'extension ne lie pas le SDK
/// (GRDB + Socket.IO sous un plafond mémoire de ~120 Mo). La construction de la
/// requête et la décision d'issue sont des fonctions pures, donc testables sans
/// réseau ; seule `send(…)` touche `URLSession`.
nonisolated enum ShareSender {

    /// Identifiant de dédoublonnage exigé par le contrat Phase 4. Le gateway
    /// s'appuie dessus via index unique : c'est ce qui rend le rejeu d'un envoi
    /// différé idempotent, y compris quand le POST initial avait abouti et que
    /// seule la réponse s'est perdue.
    static func makeClientMessageId() -> String {
        "cid_\(UUID().uuidString.lowercased())"
    }

    /// Assemble le message à partir de ce que la feuille système a fourni.
    ///
    /// Safari donne souvent le titre de la page ET son URL ; Notes ne donne que
    /// du texte. On conserve les deux quand ils diffèrent — le titre porte le
    /// sens, l'URL la destination — et on évite le doublon quand le « texte »
    /// n'est que l'URL répétée.
    static func composeContent(text: String?, url: URL?) -> String? {
        let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanText = (trimmed?.isEmpty == false) ? trimmed : nil
        let link = url?.absoluteString

        switch (cleanText, link) {
        case let (nil, link?): return link
        case let (text?, nil): return text
        case let (text?, link?): return text == link ? link : "\(text)\n\(link)"
        case (nil, nil): return nil
        }
    }

    /// Toute réponse non 2xx est différée plutôt que rejetée — y compris un 401.
    /// Un jeton périmé se rafraîchit côté app, et l'outbox rejouera ; abandonner
    /// ici perdrait le contenu sans recours.
    static func outcome(statusCode: Int?, error: Error?) -> ShareOutcome {
        guard error == nil else { return .deferred }
        guard let statusCode, (200...299).contains(statusCode) else { return .deferred }
        return .sent
    }
}

/// Le corps d'un envoi de partage.
///
/// **Il n'existe AUCUN champ de transfert sur cette structure, et c'est
/// délibéré.** L'invariant produit (décision user) est qu'aucun destinataire ne
/// voie de marque de transfert : diffuser par `forwardedFromId` ferait afficher
/// « Transféré depuis Famille » aux collègues (`MessageHandler.ts:1187-1195` +
/// `ForwardBadgePolicy.attribution(for:)`). Ne PAS pouvoir l'exprimer est une garantie
/// plus solide que se rappeler de ne pas le faire.
///
/// Les cibles 2..N passent par `copyAttachmentsFromMessageId` : le serveur crée
/// de NOUVELLES pièces jointes pointant les MÊMES fichiers. Réutiliser les
/// `attachmentIds` de la première cible les DÉPLACERAIT
/// (`associateAttachmentsToMessage` est un `updateMany({ data: { messageId } })`,
/// `AttachmentService.ts:161-173`) — le premier destinataire les perdrait.
///
/// L'encodage synthétisé omet les optionnels nil : un champ absent ne part pas
/// en `null`.
nonisolated struct ShareSendBody: Encodable, Equatable, Sendable {
    let clientMessageId: String
    let content: String?
    let attachmentIds: [String]?
    let copyAttachmentsFromMessageId: String?
}

nonisolated extension ShareSender {

    /// Le corps à poster pour UNE cible — ou `nil` quand cette cible doit être
    /// laissée à l'app (média pas encore téléversé, origine pas encore
    /// acquittée, ou index hors bornes). L'extension ne devine rien : elle
    /// décrit.
    ///
    /// Round 1 de revue : le `clientMessageId` posté est celui PERSISTÉ sur la
    /// cible (`Target.clientMessageId`), plus une dérivation recalculée depuis
    /// `share.clientMessageId` — voir la doc de `Target.clientMessageId`.
    static func body(for share: SharePendingShare, targetIndex: Int) -> ShareSendBody? {
        guard share.targets.indices.contains(targetIndex) else { return nil }
        let clientMessageId = share.targets[targetIndex].clientMessageId

        guard !share.media.isEmpty else {
            return ShareSendBody(
                clientMessageId: clientMessageId, content: share.content,
                attachmentIds: nil, copyAttachmentsFromMessageId: nil)
        }

        guard let uploaded = share.uploadedAttachmentIds, !uploaded.isEmpty else {
            return nil
        }

        let origin = share.originTargetIndex ?? 0
        if targetIndex == origin {
            return ShareSendBody(
                clientMessageId: clientMessageId, content: share.content,
                attachmentIds: uploaded, copyAttachmentsFromMessageId: nil)
        }

        guard share.targets.indices.contains(origin),
              let originServerId = share.targets[origin].serverMessageId else {
            return nil
        }
        return ShareSendBody(
            clientMessageId: clientMessageId, content: share.content,
            attachmentIds: nil, copyAttachmentsFromMessageId: originServerId)
    }

    static func request(
        conversationId: String,
        body: ShareSendBody,
        session: ShareSession
    ) -> URLRequest? {
        guard let url = URL(
            string: "\(session.apiBaseURL)/api/v1/conversations/\(conversationId)/messages"
        ) else { return nil }
        guard let payload = try? JSONEncoder().encode(body) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = payload
        return request
    }

    /// L'identifiant serveur du message créé — indispensable aux cibles
    /// suivantes, qui copieront SES pièces jointes.
    static func serverMessageId(fromResponse data: Data) -> String? {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let payload = root["data"] as? [String: Any] else { return nil }
        return payload["id"] as? String
    }

    /// « Envoyé » ne se dit qu'une fois TOUTES les cibles servies : le dire
    /// plus tôt mentirait sur les cibles restantes.
    static func outcome(of share: SharePendingShare) -> ShareOutcome {
        share.isFullyServed ? .sent : .deferred
    }

    /// Téléverse les octets DEPUIS l'extension, mais seulement si le partage
    /// est assez petit pour que ça aboutisse avant la fermeture de la feuille.
    ///
    /// **Tout ou rien.** Un jeu de pièces jointes incomplet n'est pas un
    /// upload réussi : envoyer un message amputé serait pire que de différer.
    /// En cas d'échec, la fiche est inchangée et l'app rejouera avec le vrai
    /// `TusUploadManager` du SDK, qui a checkpoint et reprise.
    static func uploadIfEligible(
        share: SharePendingShare,
        session: ShareSession,
        mediaRoot: URL?,
        urlSession: URLSession
    ) async -> SharePendingShare {
        guard share.uploadedAttachmentIds == nil, !share.media.isEmpty,
              let mediaRoot else { return share }

        let total = share.media.reduce(0) { $0 + $1.bytes }
        guard ShareLimits.isOpportunisticUploadEligible(
            totalBytes: total, fileCount: share.media.count
        ) else { return share }

        var ids: [String] = []
        for descriptor in share.media {
            do {
                ids.append(try await ShareTusClient.upload(
                    file: mediaRoot.appendingPathComponent(descriptor.relPath),
                    media: descriptor, session: session, urlSession: urlSession))
            } catch {
                ShareLog.logger.error(
                    "Upload opportuniste abandonné (\(error.localizedDescription, privacy: .public)) — reprise par l'app")
                return share
            }
        }

        var updated = share
        updated.uploadedAttachmentIds = ids
        return updated
    }

    /// Sert les cibles l'une après l'autre, en COMMITANT la fiche à chaque
    /// transition.
    ///
    /// La fiche est écrite AVANT le premier POST : une extension tuée entre les
    /// deux ne perd rien. Une cible en échec n'interrompt pas les suivantes —
    /// perdre une cible n'est pas perdre le partage.
    static func send(
        share: SharePendingShare,
        session: ShareSession,
        urlSession: URLSession = .shared,
        directory: URL? = SharePendingShare.directoryURL(),
        mediaRoot: URL? = ShareMediaStaging.mediaRootURL()
    ) async -> SharePendingShare {
        var current = share
        commit(current, in: directory)

        // Lot B-2 — les petits partages partent avant la fermeture de la
        // feuille. Les ids sont COMMITÉS avant le premier POST : une extension
        // tuée entre les deux ne re-téléverserait pas les octets (les
        // attachments orphelins ne sont balayés qu'à H+24).
        current = await uploadIfEligible(
            share: current, session: session, mediaRoot: mediaRoot, urlSession: urlSession)
        commit(current, in: directory)

        for index in current.targets.indices where current.targets[index].state != .sent {
            guard let body = body(for: current, targetIndex: index),
                  let request = request(
                    conversationId: current.targets[index].conversationId,
                    body: body, session: session)
            else { continue }

            do {
                let (data, response) = try await urlSession.data(for: request)
                let status = (response as? HTTPURLResponse)?.statusCode
                if outcome(statusCode: status, error: nil) == .sent {
                    current.targets[index].state = .sent
                    current.targets[index].serverMessageId = serverMessageId(fromResponse: data)
                } else {
                    ShareLog.logger.error(
                        "Cible refusée par le gateway (statut \(status ?? -1, privacy: .public)) — reprise différée")
                    current.targets[index].state = .failed
                }
            } catch {
                ShareLog.logger.error(
                    "Cible en échec réseau (\(error.localizedDescription, privacy: .public)) — reprise différée")
                current.targets[index].state = .failed
            }
            commit(current, in: directory)
        }
        return current
    }

    private static func commit(_ share: SharePendingShare, in directory: URL?) {
        guard let directory else {
            ShareLog.logger.error("Conteneur App Group indisponible — fiche de reprise impossible")
            return
        }
        do {
            try share.commit(in: directory)
        } catch {
            ShareLog.logger.error(
                "Écriture de la fiche échouée : \(error.localizedDescription, privacy: .public)")
        }
    }
}
