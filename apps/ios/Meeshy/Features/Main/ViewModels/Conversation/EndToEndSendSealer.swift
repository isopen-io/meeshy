import Foundation
import MeeshyE2EE
import MeeshySDK
import os

/// Le texte d'un envoi, scellé ou laissé en clair selon le RÉGIME de la
/// conversation (#11379, directives #9224 et #9229).
///
/// Dans une conversation chiffrée de bout en bout, le texte part sous
/// libsignal (#3707, spec E2EE libsignal iOS/macOS § 4) : une enveloppe par appareil du
/// correspondant et de mes autres appareils approuvés, un 409 Sesame qui
/// rechiffre. Rien ne quitte l'appareil en clair : sans appareil chiffrant chez
/// le correspondant, pour un contenu que l'appareil ne sait pas encore chiffrer,
/// hors ligne (la file durable ne garde que du clair) ou pour une édition,
/// l'envoi est REFUSÉ avant tout transport. La bulle optimiste reste au fil, en
/// échec et renvoyable, et l'interface dit pourquoi. Le refus serveur (#11216)
/// n'est qu'un second verrou.
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
    let senderUserId: String
    let endToEnd: any EndToEndMessagingProviding
    /// L'époque du régime appris (#12522), déclarée par l'envoi scellé.
    var regimeEpoch: Int?
    /// Le dernier statut servi ne dit pas le bout en bout d'une conversation
    /// que cet appareil a vue chiffrée (#12987) : rien ne part.
    var servedWithoutEndToEnd = false
    /// Le régime a changé côté serveur : le fil le relit, et dit si le serveur
    /// sert désormais sans bout en bout une conversation vue chiffrée.
    var onRegimeStale: @MainActor () async -> Bool = { false }
    var toast: any FeedbackToastSurfacing = FeedbackToastManager.shared

    var requiresSeal: Bool {
        EndToEndSendGate.requiresSeal(conversationEncryptionModes: encryptionModes)
    }

    /// L'édition d'un message chiffré n'a pas encore d'enveloppe (#12541).
    var editRefusal: EndToEndSendRefusal? { requiresSeal ? .editUnsealable : nil }

    /// Un message envoyé chiffré reste chiffré à jamais (#12881, spec § 5.2) :
    /// son clair déchiffré sur l'appareil ne part pas en clair.
    func editRefusal(for message: Message?) -> EndToEndSendRefusal? {
        if let refusal = editRefusal { return refusal }
        guard let message, message.isEncrypted || message.isContentDecryptedOnDevice else { return nil }
        return .sealedMessageUneditable
    }

    /// Une pièce se téléverse EN CLAIR avant même que le message parte : en
    /// E2EE, elle ne se téléverse pas.
    var pieceRefusal: EndToEndSendRefusal? { requiresSeal ? .contentUnsealable : nil }

    /// Hors ligne, rien de chiffré ne peut attendre dans l'outbox.
    func offlineRefusal(for outgoing: OutgoingMessage) -> EndToEndSendRefusal? {
        guard requiresSeal else { return nil }
        return sealRefusal(for: outgoing) ?? .outboxUnsealable
    }

    /// Ce qui interdit de sceller cet envoi avant toute tentative.
    func sealRefusal(for outgoing: OutgoingMessage) -> EndToEndSendRefusal? {
        if servedWithoutEndToEnd { return .servedWithoutEndToEnd }
        if let refusal = EndToEndSendGate.refusal(for: outgoing, isDirect: isDirect, peerUserId: peerUserId) { return refusal }
        return senderUserId.isEmpty ? .recipientUnsealable : nil
    }

    /// Le clair d'une conversation qui n'est pas chiffrée. Ne touche aucun transport.
    func plaintext(_ outgoing: OutgoingMessage, context: SendAttemptContext, wireEffectFlags: UInt32?) -> SealedOutgoingPayload {
        let content: String? = outgoing.text.isEmpty ? nil : outgoing.text
        let request = outgoing.wireRequest(
            content: content, isEncrypted: false, encryptionMode: nil,
            context: context, wireEffectFlags: wireEffectFlags
        )
        return SealedOutgoingPayload(request: request, content: content, isEncrypted: false)
    }

    /// Ce que libsignal chiffre : le texte, sa langue, le message cité, et la
    /// conversation et l'identifiant client qui lient le chiffré à sa place.
    func content(of outgoing: OutgoingMessage, context: SendAttemptContext) -> E2EEContent {
        E2EEContent(
            text: outgoing.text, language: context.language, replyTo: outgoing.relation.replyToId,
            conversationId: conversationId, clientMessageId: context.clientMessageId.rawValue, sentAt: context.startedAt
        )
    }

    /// Scelle pour chaque appareil, remet par `emit`, et range le clair de MON
    /// message sur cet appareil — sous son identifiant client d'abord (l'écho
    /// du serveur peut précéder la réponse), sous son identifiant serveur ensuite.
    /// L'envoi chiffré entier : refus préalable, départ, scellement et remise,
    /// puis l'acquittement, le refus lisible ou la reprise (sans repli ni file).
    func send(
        _ outgoing: OutgoingMessage,
        context: SendAttemptContext,
        wireEffectFlags: UInt32?,
        coordinator: any ConversationSendCoordinatorProviding,
        hooks: EndToEndSendHooks
    ) async -> Result<SentMessageReceipt, SendFailure> {
        let localId = context.clientMessageId.rawValue
        if let refusal = sealRefusal(for: outgoing) {
            return .failure(await refuse(refusal, localId: localId, coordinator: coordinator))
        }
        hooks.departed()
        switch await deliver(outgoing, context: context, wireEffectFlags: wireEffectFlags, emit: hooks.emit) {
        case .delivered(let receipt):
            await hooks.acknowledged(receipt)
            return .success(receipt)
        case .refused(let refusal):
            return .failure(await refuse(refusal, localId: localId, coordinator: coordinator))
        case .transportFailed(let error):
            return await hooks.recover(error)
        }
    }

    func deliver(
        _ outgoing: OutgoingMessage,
        context: SendAttemptContext,
        wireEffectFlags: UInt32?,
        emit: @escaping @MainActor @Sendable (SealedOutgoingPayload) async throws -> SentMessageReceipt
    ) async -> EndToEndDelivery {
        guard let peerUserId else { return .refused(.recipientUnsealable) }
        let content = content(of: outgoing, context: context)
        await endToEnd.remember(content, from: senderUserId, as: [context.clientMessageId.rawValue])
        do {
            let receipt = try await endToEnd.deliver(content, from: senderUserId, to: peerUserId) { sealed in
                let request = outgoing.libsignalWireRequest(
                    context: context, wireEffectFlags: wireEffectFlags, senderDeviceId: sealed.senderDeviceId,
                    envelopes: sealed.envelopes, unapprovedOwnDevices: sealed.unapprovedOwnDevices,
                    regimeEpoch: regimeEpoch
                )
                do {
                    return try await emit(SealedOutgoingPayload(request: request, content: nil, isEncrypted: true))
                } catch let error as MeeshyError {
                    if case .rejected(let rejection) = error, let mismatch = rejection.e2eeMismatch { throw mismatch }
                    throw error
                }
            }
            if case .acknowledged(let serverId, _, _) = receipt.delivery {
                await endToEnd.remember(content, from: senderUserId, as: [serverId.rawValue])
            }
            return .delivered(receipt)
        } catch {
            return Self.classify(error)
        }
    }

    /// Un échec de l'envoi chiffré : un REFUS (rien ne le fera réussir tel
    /// quel) ou une panne de transport, que la reprise traite sans jamais
    /// rejouer en clair.
    static func classify(_ error: any Error) -> EndToEndDelivery {
        switch error {
        case E2EESealError.recipientHasNoDevice: return .refused(.recipientWithoutEncryptedDevice)
        case E2EEEnrollmentError.deviceLimitReached: return .refused(.deviceLimitReached)
        case is URLError: return .transportFailed(error)
        case let meeshy as MeeshyError:
            switch meeshy.e2eeCode {
            case E2EEErrorCode.deviceNotBound: return .refused(.sessionUnavailable)
            case E2EEErrorCode.regimeChanged: return .refused(.regimeChanged)
            case E2EEErrorCode.clientOutdated, E2EEErrorCode.envelopesInvalid:
                return .refused(.envelopeRefusedByServer)
            default: return .transportFailed(meeshy)
            }
        default:
            Logger.messages.warning("E2EE seal failed, send refused (no plaintext fallback): \(String(describing: type(of: error)), privacy: .public)")
            return .refused(.sessionUnavailable)
        }
    }

    /// Ce que la reprise reçoit d'un envoi chiffré : il n'a ni repli socket ni file.
    static let sealedPlaceholderPayload = SealedOutgoingPayload(
        request: SendMessageRequest(content: nil, isEncrypted: true, encryptionMode: E2EEWire.mode), content: nil, isEncrypted: true
    )

    /// La bulle reste au fil, en échec et renvoyable ; l'interface dit pourquoi.
    func refuse(
        _ refusal: EndToEndSendRefusal,
        localId: String,
        coordinator: any ConversationSendCoordinatorProviding
    ) async -> SendFailure {
        let shown = await settled(refusal)
        Logger.messages.warning("E2EE send refused reason=\(shown.rawValue, privacy: .public) localId=\(localId, privacy: .public)")
        await coordinator.markFailed(localId: localId, reason: shown.userMessage)
        toast.showError(shown.userMessage)
        if shown == .deviceLimitReached {
            NotificationCenter.default.post(name: .endToEndDeviceLimitReached, object: nil)
        }
        return .endToEndUnsealed(shown)
    }

    /// **Un refus « régime changé » ne promet un renvoi que s'il peut réussir**
    /// (#12987, #12986). La passerelle refuse le chiffré d'une conversation
    /// qu'elle sert en clair ; l'appareil, qui l'a vue chiffrée, ne lui donne
    /// pas le clair. Le régime relu le dit : l'état final est l'écart, lisible,
    /// jamais une boucle de renvois.
    private func settled(_ refusal: EndToEndSendRefusal) async -> EndToEndSendRefusal {
        guard refusal == .regimeChanged else { return refusal }
        return await onRegimeStale() ? .servedWithoutEndToEnd : refusal
    }
}

/// Ce que l'envoi chiffré demande à son hôte : marquer le départ, émettre le
/// POST (REST seulement : le socket ne porte pas d'enveloppes), finaliser
/// l'acquittement, reprendre une panne de transport.
struct EndToEndSendHooks {
    let departed: @MainActor () -> Void
    let emit: @MainActor @Sendable (SealedOutgoingPayload) async throws -> SentMessageReceipt
    let acknowledged: @MainActor (SentMessageReceipt) async -> Void
    let recover: @MainActor (any Error) async -> Result<SentMessageReceipt, SendFailure>
}

/// L'issue d'un envoi chiffré.
enum EndToEndDelivery {
    case delivered(SentMessageReceipt)
    case refused(EndToEndSendRefusal)
    case transportFailed(any Error)
}

extension Notification.Name {
    /// L'enrôlement de cet appareil a buté sur la limite d'appareils du compte : l'écran de retrait s'ouvre.
    static let endToEndDeviceLimitReached = Notification.Name("me.meeshy.e2ee.deviceLimitReached")
}

extension EndToEndSendSealer {
    /// Le régime se lit à QUATRE sources — la ligne qui a ouvert le fil, la
    /// conversation relue du cache, la mémoire du compte que le registre tient
    /// (`EndToEndRegimeLedger`) et l'avis d'activation affiché dans le fil :
    /// une seule qui dit le bout en bout scelle, et aucune rétrogradation
    /// servie ne rouvre le clair (#12949).
    init(_ viewModel: ConversationViewModel) {
        let ledger = viewModel.collaborators.regimeLedger
        let seals = ledger.seals(
            for: viewModel.conversationId,
            opening: viewModel.encryptionModeAtOpening,
            cached: viewModel.currentConversation?.encryptionMode,
            activationShownAt: EncryptionSwitchNoticeTrail.endToEndShownAt(in: viewModel.messages)
        )
        self.init(
            conversationId: viewModel.conversationId,
            encryptionModes: seals ? [E2EEWire.mode] : [],
            isDirect: viewModel.isDirect,
            peerUserId: viewModel.participantUserId,
            senderUserId: viewModel.currentUserId,
            endToEnd: viewModel.endToEnd,
            regimeEpoch: ledger.epoch(for: viewModel.conversationId),
            servedWithoutEndToEnd: seals && ledger.servesWithoutEndToEnd(viewModel.conversationId),
            onRegimeStale: { [refresher = viewModel.collaborators.regimeRefresher, id = viewModel.conversationId] in
                refresher.refresh(conversationId: id)
                await refresher.settle()
                return ledger.servesWithoutEndToEnd(id)
            }
        )
    }
}

/// L'activation du bout en bout que le fil OUVERT affiche (#12846, #12949) :
/// la ligne système d'activation, rendue depuis sa métadonnée. Un avis de
/// désactivation déjà en base s'affiche comme un historique et ne rouvre rien.
/// Rend l'instant de la première activation affichée.
///
/// **Un message chiffré de bout en bout affiché scelle aussi** (décision du
/// porteur sur #12986, option 2) : un appareil qui n'a jamais vu la
/// conversation chiffrée mais en affiche un message scellé ne croit pas un
/// serveur qui la sert sans mode. Si le serveur la sert vraiment en clair, il
/// refuse le chiffré et l'envoi s'arrête dans l'état lisible de #12987.
enum EncryptionSwitchNoticeTrail {
    /// La première trace du bout en bout dans le fil : un avis d'activation ou
    /// un message chiffré de bout en bout (`DeviceTranslationEligibility.isEndToEnd`,
    /// provenance comprise).
    static func endToEndShownAt(in messages: [Message]) -> Date? {
        activationShownAt(in: messages) // RED-STUB
    }

    static func activationShownAt(in messages: [Message]) -> Date? {
        messages
            .filter { $0.messageSource == .system && $0.encryptionSwitchNotice?.enablesEndToEnd == true }
            .map(\.createdAt)
            .min()
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

nonisolated extension EndToEndSendRefusal {
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
        case .sealedMessageUneditable:
            String(localized: "conversation.send.e2ee.sealedMessageUneditable",
                   defaultValue: "Ce message a été envoyé chiffré : il ne peut pas être modifié.", bundle: .main)
        case .plaintextRefusedByServer:
            String(localized: "conversation.send.e2ee.plaintextRefusedByServer",
                   defaultValue: "Cette conversation est désormais chiffrée : le message n’est pas parti.", bundle: .main)
        case .envelopeRefusedByServer:
            String(localized: "conversation.send.e2ee.envelopeRefusedByServer",
                   defaultValue: "L’envoi chiffré n’est pas encore pris en charge : le message n’est pas parti.", bundle: .main)
        case .recipientWithoutEncryptedDevice:
            String(localized: "conversation.send.e2ee.recipientWithoutEncryptedDevice",
                   defaultValue: "Votre correspondant doit mettre à jour Meeshy pour recevoir des messages chiffrés : le message n’est pas parti.", bundle: .main)
        case .regimeChanged:
            String(localized: "conversation.send.e2ee.regimeChanged",
                   defaultValue: "Le chiffrement de cette conversation vient de changer : le message n’est pas parti. Touchez pour le renvoyer selon le nouveau réglage.", bundle: .main)
        case .deviceLimitReached:
            String(localized: "conversation.send.e2ee.deviceLimitReached",
                   defaultValue: "Votre compte a atteint le nombre maximal d’appareils chiffrés : retirez-en un pour écrire depuis celui-ci.", bundle: .main)
        case .servedWithoutEndToEnd:
            String(localized: "conversation.send.e2ee.servedWithoutEndToEnd",
                   defaultValue: "Cette conversation est chiffrée de bout en bout, mais le serveur la présente sans chiffrement : le message n’est pas parti. Voir la fiche Chiffrement.", bundle: .main)
        case .sealedOnlyInConversation:
            String(localized: "conversation.send.e2ee.sealedOnlyInConversation",
                   defaultValue: "Conversation chiffrée : le message n’est pas parti. Ouvrez la conversation et touchez-le pour l’envoyer chiffré.", bundle: .main)
        }
    }
}

/// Un refus E2EE porté par la file ou un chemin hors du fil se lit dans la
/// bulle en échec avec sa phrase, jamais avec le libellé générique d'une erreur.
nonisolated extension EndToEndSendRefusal: @retroactive LocalizedError {
    public var errorDescription: String? { userMessage }
}
