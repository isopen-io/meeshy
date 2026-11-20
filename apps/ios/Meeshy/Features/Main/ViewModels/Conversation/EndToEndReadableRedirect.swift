import Foundation
import MeeshySDK
import os

/// Le tête-à-tête LISIBLE d'une paire dont le pair n'a aucun appareil chiffré
/// (#20074, #12966) : retrouvé ou créé, vérifié, puis il reçoit le texte qu'un
/// envoi chiffré n'a pas pu remettre, et il s'ouvre.
///
/// Aucun clair n'entre jamais dans le fil chiffré (#12949) : le texte part
/// dans l'AUTRE conversation, que la passerelle sert sans bout en bout et que
/// cet appareil n'a jamais vue chiffrée (`ReadableDirectOpening`). Toute étape
/// qui échoue rend `nil`, et l'appelant retombe sur le refus lisible.
///
/// Ce qui part : le texte, sa langue, sa protection (éphémère, vue unique,
/// flou) et ses effets. Ce qui ne part pas : la citation (le message cité vit
/// dans le fil chiffré), les pièces, le lieu et le sticker, déjà refusés avant
/// tout envoi chiffré (`EndToEndSendGate`, `pieceRefusal`).
struct EndToEndReadableRedirect {
    let fromConversationId: String
    let peerUserId: String
    let peerName: String
    let encryption: any ConversationEncryptionServiceProviding
    let messages: any MessageServiceProviding
    let ledger: EndToEndRegimeLedger
    var isOnline: () -> Bool = { NetworkMonitor.shared.isOnline }
    var navigate: (String) -> Void = { id in
        NotificationCenter.default.post(name: .meeshyNavigateToConversation, object: id)
    }
    var toast: any FeedbackToastSurfacing = FeedbackToastManager.shared

    /// Le corps EN CLAIR de l'envoi redirigé, ou `nil` s'il n'a pas de texte.
    /// Un identifiant client neuf : la ligne chiffrée retirée garde le sien.
    static func request(
        for outgoing: OutgoingMessage, context: SendAttemptContext, wireEffectFlags: UInt32?, clientMessageId: String
    ) -> SendMessageRequest? {
        guard !outgoing.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        return SendMessageRequest(
            content: outgoing.text,
            originalLanguage: context.language,
            ephemeralDuration: context.intent.ephemeralDurationSeconds,
            isViewOnce: context.intent.isViewOnce ? true : nil,
            maxViewOnceCount: context.intent.maxViewOnceCount,
            isBlurred: context.intent.wireIsBlurred,
            effectFlags: wireEffectFlags,
            clientMessageId: clientMessageId
        )
    }

    /// Le tête-à-tête lisible, ouvert puis relu : `nil` hors ligne, en échec,
    /// ou si la passerelle rend un fil chiffré ou celui d'où l'on part.
    func readableDestination() async -> String? {
        guard isOnline(),
              let opened = try? await encryption.openReadableDirect(with: peerUserId),
              let served = try? await encryption.fetchStatus(conversationId: opened)
        else { return nil }
        ledger.learn(served, for: opened)
        return ReadableDirectOpening.destination(
            opened: opened, from: fromConversationId, openedIsEndToEnd: ledger.remembersEndToEnd(opened)
        )
    }

    /// Envoie le texte dans le tête-à-tête lisible, l'ouvre et dit pourquoi.
    /// `nil` : rien n'est parti, l'appelant garde la bulle en échec.
    func deliver(_ outgoing: OutgoingMessage, context: SendAttemptContext, wireEffectFlags: UInt32?) async -> SentMessageReceipt? {
        let clientMessageId = ClientMessageId.generate()
        guard let request = Self.request(
            for: outgoing, context: context, wireEffectFlags: wireEffectFlags, clientMessageId: clientMessageId
        ), let destination = await readableDestination() else { return nil }
        do {
            let sent = try await messages.send(conversationId: destination, request: request)
            Logger.messages.info("E2EE send redirected to the readable direct (#20074) from=\(fromConversationId, privacy: .public)")
            toast.showSuccess(Self.notice(peerName: peerName))
            navigate(destination)
            return SentMessageReceipt(
                clientMessageId: MessageID(clientMessageId),
                delivery: .acknowledged(serverId: MessageID(sent.id), at: sent.createdAt, via: .rest)
            )
        } catch {
            Logger.messages.warning("E2EE readable redirect send failed: \(String(describing: type(of: error)), privacy: .public)")
            return nil
        }
    }

    /// Ouvre le tête-à-tête lisible sans rien envoyer (le bandeau du fil).
    /// `false` : l'ouverture a échoué, l'appelant le dit.
    func open() async -> Bool {
        guard let destination = await readableDestination() else { return false }
        navigate(destination)
        return true
    }

    static func notice(peerName: String) -> String {
        let name = PeerFirstName.of(peerName)
        guard !name.isEmpty else {
            return String(localized: "conversation.send.e2ee.redirectedToReadableAnonymous",
                          defaultValue: "Votre correspondant ne peut pas recevoir de messages chiffrés : message envoyé dans votre conversation non chiffrée.",
                          bundle: .main)
        }
        return String(localized: "conversation.send.e2ee.redirectedToReadable",
                      defaultValue: "\(name) ne peut pas recevoir de messages chiffrés : message envoyé dans votre conversation non chiffrée.",
                      bundle: .main)
    }
}

/// Le prénom qu'une phrase adresse : le premier mot du nom affiché.
enum PeerFirstName {
    static func of(_ name: String?) -> String {
        let trimmed = (name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? ""
    }
}
