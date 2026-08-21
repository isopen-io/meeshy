import Foundation
import MeeshySDK

/// Le pont PUR entre le fil d'une conversation (`MeeshyMessage`) et la loi de
/// la Rivière (`RiverLaneResolver`) — chantier Rivière iOS, lot 1
/// (2026-08-21). Zéro pixel, zéro singleton : tout est injecté.
///
/// Règle produit relayée le 2026-08-20 : les messages SYSTÈME (avis
/// d'arrivée, résumés d'appel — `messageSource == .system`) ne sont la voix
/// de personne — sinon l'arrivant obtenait une lane fantôme et l'avis un rang
/// dans sa colonne.
///
/// **Lot 2 (2026-08-21) — ils ne sortent plus de la loi, ils y entrent
/// MARQUÉS.** Le lot 1 les écartait AVANT `resolveRiverLanes` : la lane
/// fantôme disparaissait, mais l'avis avec elle — un lecteur en Rivière ne
/// voyait jamais « X a rejoint la conversation ». La loi partagée sait faire
/// mieux depuis `RiverMessageInput.isSystem` : un avis marqué descend l'axe du
/// TEMPS avec les autres (il garde son rang, il est servi dans
/// `geometry.bubbles`) et n'entre dans AUCUN des deux autres axes — ni voix,
/// ni couloir, ni connecteur, ni groupe (`RiverLaneResolver.spokenOnly`). La
/// peau le rend alors GRAVÉ, pleine largeur, heure en tête
/// (`RiverSystemNotice`, `RiverBubbleView`, `RiverStreamHost`) : exactement ce
/// que le Fil et Focal en font, avec les mêmes vues et les mêmes clés i18n.
nonisolated enum RiverConversationMapping {

    /// Le libellé du lecteur — EXACTEMENT celui de l'en-tête de couloir
    /// (`RiverLaneHeaderStrip`, clé `riviere.header.you`).
    @MainActor
    static var viewerLabel: String {
        String(localized: "riviere.header.you", defaultValue: "Toi", bundle: .main)
    }

    /// Ce que la loi doit voir : TOUT ce qui a un rang dans le temps — les
    /// voix ET les avis, ces derniers MARQUÉS `isSystem` (lot 2). Seuls les
    /// messages supprimés restent dehors : une bulle vide ferait un rang vide.
    ///
    /// Les participants, eux, sont les VOIX seules — dérivés des expéditeurs
    /// (dernier nom connu), jamais d'un second fetch. Un auteur d'avis qui
    /// n'a jamais parlé n'y figure donc pas : la loi ne lui fera naître
    /// aucune branche, et sa graine de couleur n'aurait servi à rien.
    static func lanesInput(messages: [MeeshyMessage], viewerId: String) -> RiverLaneResolver.ResolveRiverLanesInput {
        let ranked = messages.filter { !$0.isDeleted }
        var namesById: [String: String] = [:]
        var order: [String] = []
        for message in ranked where isVoice(message) {
            if namesById[message.senderId] == nil { order.append(message.senderId) }
            namesById[message.senderId] = displayName(of: message)
        }
        return RiverLaneResolver.ResolveRiverLanesInput(
            messages: ranked.map {
                RiverLaneResolver.RiverMessageInput(
                    id: $0.id,
                    senderId: $0.senderId,
                    createdAt: .date($0.createdAt),
                    replyToMessageId: $0.replyToId,
                    // La marque que `senderId` ne peut pas porter : l'avis
                    // d'arrivée est écrit avec l'ARRIVANT pour auteur
                    // (`packages/shared/utils/join-notice.ts`).
                    isSystem: $0.messageSource == .system
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
        viewerId: String,
        text: (MeeshyMessage) -> String,
        time: (Date) -> String
    ) -> [RiverBubbleContent] {
        let byId = Dictionary(messages.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return geometry.bubbles.compactMap { bubble in
            guard let message = byId[bubble.messageId] else { return nil }
            let resolvedTime = time(message.createdAt)
            return RiverBubbleContent(
                bubble: bubble,
                senderDisplayName: displayName(of: message),
                // MÊME valeur que `RiverParticipantInput.displayName` ci-dessus
                // — c'est elle que la loi a donnée à la branche
                // (`RiverLane.colorSeed`). `senderName ?? senderId` sautait le
                // repli par pseudo : un auteur sans `senderName` peignait sa
                // bulle d'une couleur et son trait d'une autre.
                colorSeed: displayName(of: message),
                timeString: resolvedTime,
                text: text(message),
                layout: geometry.layout,
                replyPreview: message.replyTo.map { RiverReplyPreview(authorDisplayName: $0.authorName, text: $0.previewText) },
                systemNotice: systemNotice(for: message, viewerId: viewerId, timeString: resolvedTime, text: text)
            )
        }
    }

    /// L'avis, prêt à peindre — non-nil UNIQUEMENT pour un message système.
    ///
    /// Le libellé ne se réécrit PAS ici : `BubbleContent` (le MÊME
    /// constructeur que `ThemedMessageBubble` et `MessageListViewController`)
    /// résout déjà l'arrivée et le résumé d'appel, avec leurs clés i18n et
    /// leur direction par lecteur. La Rivière n'en fait que le décor.
    @MainActor
    static func systemNotice(
        for message: MeeshyMessage,
        viewerId: String,
        timeString: String,
        text: (MeeshyMessage) -> String
    ) -> RiverSystemNotice? {
        guard message.messageSource == .system else { return nil }
        let content = BubbleContent(
            message: message,
            translations: [],
            preferredTranslation: nil,
            currentUserId: viewerId,
            timeString: timeString
        )
        if let joinNotice = content.joinNotice { return .join(joinNotice) }
        if let callNotice = content.callNotice { return .call(callNotice) }
        return .plain(text(message))
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
    /// QUI ONT UN RANG ont changé (ids + compte) — jamais à chaque passe de
    /// body.
    ///
    /// Lot 2 : les avis système en font désormais partie. Tant qu'ils étaient
    /// écartés de la loi, les ignorer ici était juste ; maintenant qu'ils
    /// occupent un rang, une arrivée qui n'aurait pas changé l'empreinte
    /// n'aurait jamais été redessinée.
    static func fingerprint(messages: [MeeshyMessage]) -> String {
        messages.lazy.filter { !$0.isDeleted }.map(\.id).joined(separator: "|")
    }
}
