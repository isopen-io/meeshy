import Foundation
import MeeshySDK

/// Le pont PUR entre le fil d'une conversation (`MeeshyMessage`) et la loi de
/// la Rivière (`RiverLaneResolver`) — chantier Rivière iOS, lot 1
/// (2026-08-21). Zéro pixel, zéro singleton : tout est injecté.
///
/// Règle produit relayée le 2026-08-20 : les messages SYSTÈME (avis
/// d'arrivée, résumés d'appel — `messageSource == .system`) ne sont la voix
/// de personne. Ils sortent du calcul des couloirs AVANT la loi — sinon
/// l'arrivant obtenait une lane fantôme et l'avis un rang dans sa colonne.
/// Leur rendu « gravé » pleine largeur dans la Rivière est le lot 2.
nonisolated enum RiverConversationMapping {

    /// Ce que la loi doit voir. Les participants sont les VOIX du fil :
    /// dérivés des expéditeurs (dernier nom connu), jamais d'un second fetch.
    static func lanesInput(messages: [MeeshyMessage], viewerId: String) -> RiverLaneResolver.ResolveRiverLanesInput {
        let voiced = messages.filter { isVoice($0) }
        var namesById: [String: String] = [:]
        var order: [String] = []
        for message in voiced {
            if namesById[message.senderId] == nil { order.append(message.senderId) }
            namesById[message.senderId] = displayName(of: message)
        }
        return RiverLaneResolver.ResolveRiverLanesInput(
            messages: voiced.map {
                RiverLaneResolver.RiverMessageInput(
                    id: $0.id,
                    senderId: $0.senderId,
                    createdAt: .date($0.createdAt),
                    replyToMessageId: $0.replyToId
                )
            },
            participants: order.map { RiverLaneResolver.RiverParticipantInput(id: $0, displayName: namesById[$0] ?? $0) },
            viewerId: viewerId
        )
    }

    /// Un message est une VOIX s'il vient d'un humain ou d'un agent — jamais du
    /// système, jamais supprimé (une bulle vide ferait un rang vide).
    static func isVoice(_ message: MeeshyMessage) -> Bool {
        message.messageSource != .system && !message.isDeleted
    }

    static func displayName(of message: MeeshyMessage) -> String {
        message.senderName ?? message.senderUsername ?? message.senderId
    }

    /// Ce que le lecteur voit dans chaque bulle — texte PRISME (résolu par
    /// l'appelant), heure, nom, graine de couleur, aperçu de la réponse.
    /// `@MainActor` : `RiverBubbleContent` est un modèle de VUE (isolé) ;
    /// la règle reste pure — rien n'est lu hors de ses arguments.
    @MainActor
    static func contents(
        geometry: RiverLaneResolver.RiverGeometry,
        messages: [MeeshyMessage],
        text: (MeeshyMessage) -> String,
        time: (Date) -> String
    ) -> [RiverBubbleContent] {
        let byId = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return geometry.bubbles.compactMap { bubble in
            guard let message = byId[bubble.messageId] else { return nil }
            return RiverBubbleContent(
                bubble: bubble,
                senderDisplayName: displayName(of: message),
                colorSeed: message.senderName ?? message.senderId,
                timeString: time(message.createdAt),
                text: text(message),
                layout: geometry.layout,
                replyPreview: message.replyTo.map { RiverReplyPreview(authorDisplayName: $0.authorName, text: $0.previewText) }
            )
        }
    }

    /// Curseur d'ouverture : la bulle la plus RÉCENTE — là où le lecteur
    /// arrive dans le fil — sinon la rive du lecteur au premier rang.
    static func initialCursor(geometry: RiverLaneResolver.RiverGeometry) -> RiverLaneResolver.RiverCursor {
        guard let last = geometry.bubbles.max(by: { $0.rank < $1.rank }) else {
            return RiverLaneResolver.RiverCursor(laneIndex: 0, rank: 0)
        }
        return RiverLaneResolver.RiverCursor(laneIndex: last.laneIndex, rank: last.rank)
    }

    /// Empreinte du fil pour ne recalculer la géométrie que si les messages
    /// « voix » ont changé (ids + compte) — jamais à chaque passe de body.
    static func fingerprint(messages: [MeeshyMessage]) -> String {
        messages.lazy.filter { isVoice($0) }.map(\.id).joined(separator: "|")
    }
}
