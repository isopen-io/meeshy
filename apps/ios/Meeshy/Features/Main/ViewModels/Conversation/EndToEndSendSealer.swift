import Foundation
import MeeshySDK
import os

/// Le texte d'un envoi, scellé ou laissé en clair selon le RÉGIME de la
/// conversation (#11379, directives #9224 et #9229).
///
/// Dans une conversation chiffrée de bout en bout, rien ne quitte l'appareil en
/// clair : sans session Signal, sans pair connu, pour un contenu que l'appareil
/// ne sait pas encore chiffrer, hors ligne (la file durable ne garde que du
/// clair) ou pour une édition, l'envoi est REFUSÉ avant tout transport. La
/// bulle optimiste reste au fil, en échec et renvoyable, et l'interface dit
/// pourquoi. Le refus serveur (#11216) n'est qu'un second verrou : il arrive
/// après que le clair a traversé le réseau.
///
/// Hors E2EE, le texte part en clair, même vers un pair qui a une session : le
/// chiffrement suit le régime, jamais l'opportunité — la passerelle refuse un
/// chiffré dans une conversation en clair (#12562), et ses fonctions serveur
/// (traduction, transcription) y ont besoin du texte.
struct EndToEndSendSealer {
    let conversationId: String
    let encryptionModes: [String?]
    let isDirect: Bool
    let peerUserId: String?
    let encryptor: any DirectMessageEncrypting
    var toast: any FeedbackToastSurfacing = FeedbackToastManager.shared

    static let wireEncryptionMode = "E2EE"

    var requiresSeal: Bool {
        EndToEndSendGate.requiresSeal(conversationEncryptionModes: encryptionModes)
    }

    /// L'édition d'un message chiffré n'a pas encore d'enveloppe (#12541).
    var editRefusal: EndToEndSendRefusal? { requiresSeal ? .editUnsealable : nil }

    /// Une pièce se téléverse EN CLAIR avant même que le message parte : en
    /// E2EE, elle ne se téléverse pas.
    var pieceRefusal: EndToEndSendRefusal? { requiresSeal ? .contentUnsealable : nil }

    /// Hors ligne, rien de chiffré ne peut attendre dans l'outbox.
    func offlineRefusal(for outgoing: OutgoingMessage) -> EndToEndSendRefusal? {
        guard requiresSeal else { return nil }
        return EndToEndSendGate.refusal(for: outgoing, isDirect: isDirect, peerUserId: peerUserId) ?? .outboxUnsealable
    }

    /// Ce qui quitte l'appareil. Ne touche aucun transport.
    func seal(
        _ outgoing: OutgoingMessage,
        context: SendAttemptContext,
        wireEffectFlags: UInt32?
    ) async -> Result<SealedOutgoingPayload, EndToEndSendRefusal> {
        guard requiresSeal else { return .success(plaintext(outgoing, context: context, wireEffectFlags: wireEffectFlags)) }
        if let refusal = EndToEndSendGate.refusal(for: outgoing, isDirect: isDirect, peerUserId: peerUserId) {
            return .failure(refusal)
        }
        guard let peerUserId else { return .failure(.recipientUnsealable) }
        do {
            let ciphertext = try await encryptor.encryptMessage(Data(outgoing.text.utf8), for: peerUserId, conversationId: conversationId)
            let content = ciphertext.base64EncodedString()
            let request = outgoing.wireRequest(
                content: content, isEncrypted: true, encryptionMode: Self.wireEncryptionMode,
                context: context, wireEffectFlags: wireEffectFlags
            )
            return .success(SealedOutgoingPayload(request: request, content: content, isEncrypted: true))
        } catch {
            Logger.messages.warning("E2EE session unavailable, send refused (no plaintext fallback): \(error.localizedDescription, privacy: .public)")
            return .failure(.sessionUnavailable)
        }
    }

    private func plaintext(_ outgoing: OutgoingMessage, context: SendAttemptContext, wireEffectFlags: UInt32?) -> SealedOutgoingPayload {
        let content: String? = outgoing.text.isEmpty ? nil : outgoing.text
        let request = outgoing.wireRequest(
            content: content, isEncrypted: false, encryptionMode: nil,
            context: context, wireEffectFlags: wireEffectFlags
        )
        return SealedOutgoingPayload(request: request, content: content, isEncrypted: false)
    }

    /// La bulle reste au fil, en échec et renvoyable ; l'interface dit pourquoi.
    func refuse(
        _ refusal: EndToEndSendRefusal,
        localId: String,
        coordinator: any ConversationSendCoordinatorProviding
    ) async -> SendFailure {
        Logger.messages.warning("E2EE send refused reason=\(refusal.rawValue, privacy: .public) localId=\(localId, privacy: .public)")
        await coordinator.markFailed(localId: localId, reason: refusal.userMessage)
        toast.showError(refusal.userMessage)
        return .endToEndUnsealed(refusal)
    }
}

extension EndToEndSendSealer {
    /// Le régime se lit à DEUX sources — la ligne qui a ouvert le fil, puis la
    /// conversation relue du cache : il suffit que l'une dise bout en bout.
    init(_ viewModel: ConversationViewModel) {
        self.init(
            conversationId: viewModel.conversationId,
            encryptionModes: [viewModel.encryptionModeAtOpening, viewModel.currentConversation?.encryptionMode],
            isDirect: viewModel.isDirect,
            peerUserId: viewModel.participantUserId,
            encryptor: viewModel.messageEncryptor
        )
    }
}

/// Les pièces d'une conversation chiffrée ne se téléversent pas : chaque bulle
/// passe en échec, un seul message le dit. Rend `true` quand il a refusé.
enum EndToEndPieceGuard {
    static func refuses(
        _ tempIds: [String],
        on host: any AttachmentSendHosting,
        toast: (String) -> Void
    ) async -> Bool {
        guard !tempIds.isEmpty, let refusal = host.endToEndPieceRefusal else { return false }
        Logger.messages.warning("E2EE pieces refused before upload count=\(tempIds.count, privacy: .public)")
        for tempId in tempIds {
            await host.markOptimisticMediaFailed(tempId: tempId, reason: refusal.userMessage)
        }
        toast(refusal.userMessage)
        return true
    }
}

extension EndToEndSendRefusal {
    /// Ce que la bulle en échec et le message d'erreur disent, dans la langue de l'app.
    var userMessage: String {
        switch self {
        case .sessionUnavailable:
            String(localized: "conversation.send.e2ee.sessionUnavailable",
                   defaultValue: "Chiffrement indisponible : le message n’est pas parti. Touchez pour réessayer.", bundle: .main)
        case .recipientUnsealable:
            String(localized: "conversation.send.e2ee.recipientUnsealable",
                   defaultValue: "Cette conversation chiffrée n’accepte pas encore d’envoi depuis cet appareil.", bundle: .main)
        case .contentUnsealable:
            String(localized: "conversation.send.e2ee.contentUnsealable",
                   defaultValue: "Conversation chiffrée : pièces jointes, lieux et stickers ne peuvent pas encore être envoyés.", bundle: .main)
        case .outboxUnsealable:
            String(localized: "conversation.send.e2ee.outboxUnsealable",
                   defaultValue: "Message chiffré non envoyé : réessayez une fois connecté.", bundle: .main)
        case .editUnsealable:
            String(localized: "conversation.send.e2ee.editUnsealable",
                   defaultValue: "Conversation chiffrée : un message ne peut pas encore être modifié.", bundle: .main)
        }
    }
}
