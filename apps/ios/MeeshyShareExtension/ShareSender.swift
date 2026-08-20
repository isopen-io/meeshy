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

    private struct Body: Encodable {
        let clientMessageId: String
        let content: String
    }

    static func request(
        conversationId: String,
        clientMessageId: String,
        content: String,
        session: ShareSession
    ) -> URLRequest? {
        guard let url = URL(
            string: "\(session.apiBaseURL)/api/v1/conversations/\(conversationId)/messages"
        ) else { return nil }

        guard let body = try? JSONEncoder().encode(
            Body(clientMessageId: clientMessageId, content: content)
        ) else { return nil }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        return request
    }

    /// Toute réponse non 2xx est différée plutôt que rejetée — y compris un 401.
    /// Un jeton périmé se rafraîchit côté app, et l'outbox rejouera ; abandonner
    /// ici perdrait le contenu sans recours.
    static func outcome(statusCode: Int?, error: Error?) -> ShareOutcome {
        guard error == nil else { return .deferred }
        guard let statusCode, (200...299).contains(statusCode) else { return .deferred }
        return .sent
    }

    /// Tente l'envoi et, à défaut, dépose un relais durable pour l'app.
    /// Ne renvoie `.sent` que sur accusé de réception du gateway.
    static func send(
        content: String,
        to conversationId: String,
        session: ShareSession,
        urlSession: URLSession = .shared
    ) async -> ShareOutcome {
        let clientMessageId = makeClientMessageId()

        guard let request = request(
            conversationId: conversationId,
            clientMessageId: clientMessageId,
            content: content,
            session: session
        ) else {
            ShareLog.logger.error("Requête de partage inconstructible — relais différé")
            return deferSend(clientMessageId: clientMessageId, conversationId: conversationId, content: content)
        }

        do {
            let (_, response) = try await urlSession.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode
            if outcome(statusCode: status, error: nil) == .sent {
                return .sent
            }
            ShareLog.logger.error("Partage refusé par le gateway (statut \(status ?? -1, privacy: .public)) — relais différé")
        } catch {
            ShareLog.logger.error("Partage en échec réseau (\(error.localizedDescription, privacy: .public)) — relais différé")
        }

        return deferSend(clientMessageId: clientMessageId, conversationId: conversationId, content: content)
    }

    /// Dépose la fiche de reprise pour un partage de texte à UNE cible.
    /// Conservé pour le chemin texte historique ; le chemin multi-cibles passe
    /// par `send(share:session:urlSession:)`.
    private static func deferSend(
        clientMessageId: String,
        conversationId: String,
        content: String
    ) -> ShareOutcome {
        SharePendingShare.make(
            shareId: clientMessageId,
            createdAt: Date(),
            content: content,
            media: [],
            conversationIds: [conversationId]
        ).commitLive()
        return .deferred
    }
}
