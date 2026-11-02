import Foundation
import MeeshySDK

/// Issue d'un transfert vers UNE cible, telle que l'UI doit la présenter.
///
/// `sent`/`queuedOffline` transportent le `conversationId` RÉSOLU — celui de
/// la cible telle qu'elle existait déjà, ou celui que la résolution vient de
/// créer pour un contact. Il n'y a qu'UN site de construction pour chacun
/// (le chemin `String` ci-dessous), qui connaît toujours cet id sans
/// l'inventer : l'appelant (le picker) peut donc toujours retrouver la
/// conversation servie, y compris quand elle vient d'être créée.
enum ForwardOutcome: Equatable {
    case sent(conversationId: String)
    case queuedOffline(conversationId: String)
    case failed(reason: String)
}

/// Un enfilage durable VAUT un envoi pour l'affichage — l'outbox garantit la
/// livraison.
extension ForwardOutcome {
    var succeeded: Bool {
        if case .failed = self { return false }
        return true
    }

    var failureReason: String? {
        if case .failed(let reason) = self { return reason }
        return nil
    }
}

/// **Pourquoi un transfert est refusé — une raison, puis sa phrase** (#9573).
///
/// Deux sources la donnent : la loi de sortie, lue AVANT d'envoyer
/// (`Message.exitOffer`), et la passerelle, qui fait foi et répond par la phrase
/// de `describeForwardRefusal` (`services/gateway/.../forwardAdmission.ts`) —
/// sans code machine. La phrase affichée est celle du catalogue, dans la langue
/// du lecteur, jamais celle du serveur.
nonisolated enum ForwardRefusalReason: Equatable, CaseIterable, Sendable {
    case viewOnce
    case afterRead
    case sourceUnavailable
    /// D7 : la passerelle ne recopie rien d'une source chiffrée — la copie se
    /// refait sur l'appareil (`encrypted-source-not-server-copyable`).
    case encryptedSource
    /// La pièce choisie n'est pas du message (`forwarded-attachment-not-in-source`).
    case attachmentNotInSource
    /// La DESTINATION est chiffrée de bout en bout (`E2EE_PLAINTEXT_REFUSED`) :
    /// le serveur n'y reçoit aucun clair, et l'appareil ne sait pas encore y
    /// sceller une pièce ni une copie (#10789, #12978).
    case encryptedDestination

    /// Ce que la loi de sortie refuse pour ce message, ou `nil` s'il se
    /// transfère. Un flouté se transfère (D8).
    static func local(for message: Message) -> ForwardRefusalReason? {
        guard case .refused(let refusal) = message.exitOffer.law.forward else { return nil }
        return refusal == .viewOnce ? .viewOnce : .afterRead
    }

    /// La raison d'un refus du serveur, quel que soit le type que le client lève :
    /// le vrai `APIClient` lève `MeeshyError` (`.server`, `.rejected`), jamais
    /// `APIError` (#12978). Le code du refus E2EE se lit AVANT la phrase, qui dit
    /// « chiffrée » et se lirait sinon comme une source chiffrée.
    static func server(error: any Error) -> ForwardRefusalReason? {
        if EndToEndSendGate.isServerPlaintextRefusal(error) { return .encryptedDestination }
        return server(message: serverMessage(of: error))
    }

    /// La phrase que le serveur a jointe à son refus, ou `nil`.
    static func serverMessage(of error: any Error) -> String? {
        switch error {
        case APIError.serverError(_, let message): return message
        case MeeshyError.server(_, let message): return message
        case MeeshyError.rejected(let rejection): return rejection.message
        default: return nil
        }
    }

    /// La raison que porte la phrase de refus du serveur, ou `nil` si ce n'en est pas une.
    static func server(message: String?) -> ForwardRefusalReason? {
        guard let message = message?.lowercased() else { return nil }
        if message.contains("vue unique") { return .viewOnce }
        if message.contains("après lecture") { return .afterRead }
        if message.contains("plus disponible") { return .sourceUnavailable }
        if message.contains("chiffré") { return .encryptedSource }
        if message.contains("n’appartient pas") || message.contains("n'appartient pas") { return .attachmentNotInSource }
        return nil
    }

    var explanation: String {
        switch self {
        case .viewOnce:
            return String(localized: "forward.refused.view-once",
                          defaultValue: "Un message à vue unique ne peut pas être transféré.", bundle: .main)
        case .afterRead:
            return String(localized: "forward.refused.after-read",
                          defaultValue: "Un message qui disparaît après lecture ne peut pas être transféré.", bundle: .main)
        case .sourceUnavailable:
            return String(localized: "forward.refused.source-unavailable",
                          defaultValue: "Le message d’origine n’est plus disponible.", bundle: .main)
        case .encryptedSource:
            return String(localized: "forward.refused.encrypted-source",
                          defaultValue: "Ce contenu chiffré se copie depuis cet appareil.", bundle: .main)
        case .attachmentNotInSource:
            return String(localized: "forward.refused.attachment-not-in-source",
                          defaultValue: "Cette pièce n’appartient plus au message.", bundle: .main)
        case .encryptedDestination:
            return String(localized: "share.refused.encrypted-destination",
                          defaultValue: "Cette conversation est chiffrée : le partage n’y envoie rien pour l’instant.", bundle: .main)
        }
    }
}

protocol MessageForwardServiceProviding {
    /// - Parameter chosenDurationSeconds: la durée choisie dans la feuille pour
    ///   une flamme à durée ; `nil` ⇒ celle de la source. Ramenée à la source
    ///   par la loi de sortie, ignorée pour un message ordinaire.
    /// - Parameter forwardedAttachmentIds: les pièces CHOISIES (#9914) ; `nil` ⇒ tout le lot.
    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome
    func forward(message: Message, sourceConversationId: String?, to target: ShareRecipient, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome
}

extension MessageForwardServiceProviding {
    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, chosenDurationSeconds: Int? = nil) async -> ForwardOutcome {
        await forward(message: message, sourceConversationId: sourceConversationId, to: targetConversationId,
                      chosenDurationSeconds: chosenDurationSeconds, forwardedAttachmentIds: nil)
    }

    func forward(message: Message, sourceConversationId: String?, to target: ShareRecipient, chosenDurationSeconds: Int? = nil) async -> ForwardOutcome {
        await forward(message: message, sourceConversationId: sourceConversationId, to: target,
                      chosenDurationSeconds: chosenDurationSeconds, forwardedAttachmentIds: nil)
    }
}

/// Chemin UNIQUE du transfert de message (spec 2026-08-19, Volet A.3) : tous
/// les points d'entrée (picker, swipe, rangée quick-reaction) convergent ici.
///
/// Invariants :
/// - Ce que la loi de sortie refuse (vue unique, flamme après lecture) ne
///   part pas ; un flouté part, la passerelle impose son flou (D8) : échec immédiat avec sa phrase, ni requête ni enfilage. La
///   copie d'une flamme à durée porte `ephemeralDuration` — le choix de la
///   feuille, jamais plus que la source —, en ligne comme en file (#9573).
/// - Jamais d'`attachmentIds` ni de re-upload — le gateway copie les
///   attachments de la source (`MessageProcessor.copyForwardedAttachments`),
///   tous, ou les seuls `forwardedAttachmentIds` choisis (#9914).
/// - Une conversation source inconnue s'OMET (`""` cassait l'écriture Prisma
///   `@db.ObjectId` côté serveur).
/// - Un retry APRÈS ÉCHEC vers la même cible rejoue le MÊME `clientMessageId` :
///   l'index unique `(conversationId, clientMessageId)` du gateway dédoublonne.
/// - Un envoi CONFIRMÉ libère au contraire sa clé : re-transférer délibérément
///   le même message vers la même cible doit créer un SECOND message, jamais
///   retomber sur le chemin idempotent du gateway (qui renverrait la ligne
///   existante en succès, sans rien créer).
/// - Hors ligne : enfilage durable dans l'outbox (`OfflineQueue`), rejoué par
///   `OutboxDispatcher` avec le même cid — la clé est donc CONSERVÉE.
/// - Hors ligne + contact SANS conversation : ÉCHEC EXPLICITE immédiat, ni
///   création ni enfilage. L'outbox ne sait rejouer qu'un ENVOI vers une
///   conversation déjà identifiée (`OfflineQueueItem.conversationId`), jamais
///   une CRÉATION de conversation — enfiler quand même forcerait à inventer
///   un identifiant qui n'existe pas encore côté serveur.
@MainActor
final class MessageForwardService: MessageForwardServiceProviding {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    static let shared = MessageForwardService()

    private let api: APIClientProviding
    private let queue: OfflineMessageQueueing
    private let isOnline: () -> Bool
    private let conversationCreator: ConversationCreating
    private let authManager: AuthManaging
    /// La loi du fil, appliquée à la cible (#12985) : mémoire du compte, mode
    /// servi, ligne et fil du cache.
    private let destinationGuard: EndToEndDestinationGuard
    /// La clé de dédoublonnage d'un transfert (`message→cible`) et l'identifiant
    /// client qu'un nouvel essai doit REJOUER. Retirée à l'envoi et au refus ;
    /// gardée après un échec réseau ou une mise en file hors ligne — c'est
    /// elle qui dédoublonne le rejeu. BORNÉE : un transfert jamais rejoué
    /// gardait sa clé toute la session, et la table ne faisait que grossir.
    /// Les plus récentes suffisent à tout rejeu d'une session.
    private var clientMessageIds = BoundedFIFOMap<String, String>(capacity: MessageForwardService.dedupCapacity)
    nonisolated static let dedupCapacity = 256

    init(
        api: APIClientProviding = APIClient.shared,
        queue: OfflineMessageQueueing = OfflineQueue.shared,
        isOnline: @escaping () -> Bool = { NetworkMonitor.shared.isOnline },
        conversationCreator: ConversationCreating = ConversationCreator(),
        authManager: AuthManaging = AuthManager.shared,
        destinationGuard: EndToEndDestinationGuard = EndToEndDestinationGuard()
    ) {
        self.api = api
        self.queue = queue
        self.isOnline = isOnline
        self.conversationCreator = conversationCreator
        self.authManager = authManager
        self.destinationGuard = destinationGuard
    }

    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome {
        await forward(message: message, sourceConversationId: sourceConversationId, to: targetConversationId, served: [],
                      chosenDurationSeconds: chosenDurationSeconds, forwardedAttachmentIds: forwardedAttachmentIds)
    }

    /// **Une cible chiffrée de bout en bout ne reçoit jamais de clair** (#12985).
    /// Un transfert porte sa source (`forwardedFromId`) et son texte : rien
    /// que l'appareil sache sceller. Vers une cible que la garde dit chiffrée
    /// — servie telle, ou vue telle par ce compte —, il est refusé avant toute
    /// requête et ne se met pas en file.
    private func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, served: [String?],
                         chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome {
        if let refusal = ForwardRefusalReason.local(for: message) {
            return .failed(reason: refusal.explanation)
        }
        if await destinationGuard.seals(targetConversationId, served: served) {
            return .failed(reason: ForwardRefusalReason.encryptedDestination.explanation)
        }
        let ephemeralDuration = message.contentExitLaw.forward.requestedDuration(chosen: chosenDurationSeconds)
        let pieces = forwardedAttachmentIds.flatMap { $0.isEmpty ? nil : $0 }
        let dedupKey = "\(message.id)\(pieces.map { "#" + $0.joined(separator: ",") } ?? "")→\(targetConversationId)"
        let clientMessageId = clientMessageIds[dedupKey] ?? ClientMessageId.generate()
        clientMessageIds[dedupKey] = clientMessageId
        let sourceId = (sourceConversationId?.isEmpty == false) ? sourceConversationId : nil

        guard isOnline() else {
            do {
                try await queue.enqueue(OfflineQueueItem(
                    conversationId: targetConversationId,
                    content: pieces != nil ? "" : message.content,
                    clientMessageId: clientMessageId,
                    forwardedFromId: message.id,
                    forwardedFromConversationId: sourceId,
                    sticker: message.sticker?.ifWireWorthy,
                    forwardedAttachmentIds: pieces,
                    protection: MessageProtectionIntent(ephemeralDurationSeconds: ephemeralDuration)
                ))
                return .queuedOffline(conversationId: targetConversationId)
            } catch {
                return .failed(reason: error.localizedDescription)
            }
        }

        do {
            let body = SendMessageRequest(
                // Une PIÈCE seule part sans le texte de son message (V2).
                content: pieces != nil || message.content.isEmpty ? nil : message.content,
                forwardedFromId: message.id,
                forwardedFromConversationId: sourceId,
                ephemeralDuration: ephemeralDuration,
                clientMessageId: clientMessageId,
                sticker: message.sticker?.ifWireWorthy,
                forwardedAttachmentIds: pieces
            )
            let _: APIResponse<SendMessageResponseData> = try await api.post(
                ConversationsEndpoint.byIdMessages(id: targetConversationId),
                body: body
            )
            clientMessageIds.removeValue(forKey: dedupKey)
            return .sent(conversationId: targetConversationId)
        } catch {
            // Un REFUS n'est pas un échec à rejouer : rien n'a été créé, et la
            // clé de dédoublonnage n'a plus rien à protéger.
            if Self.refusal(in: error) != nil { clientMessageIds.removeValue(forKey: dedupKey) }
            return .failed(reason: Self.failureReason(for: error))
        }
    }

    /// Résout la cible AVANT de transférer, puis délègue au chemin unique
    /// ci-dessus — le `clientMessageId` de dédup est donc calculé APRÈS
    /// résolution.
    ///
    /// - Une cible qui porte déjà `conversationId` (issue d'une conversation
    ///   existante) part directement — cette branche gère elle-même le hors
    ///   ligne (enfilage durable, cf. doc de la classe).
    /// - Une cible SANS conversation (un contact) en obtient une via
    ///   `createDirectConversation`, IDEMPOTENTE côté serveur : elle renvoie
    ///   la conversation existante (200) plutôt que d'en recréer une seconde.
    ///   **Hors ligne, cette création n'est JAMAIS tentée** : l'outbox ne
    ///   sait rejouer qu'un envoi vers une conversation déjà identifiée, pas
    ///   la création elle-même — l'échec est donc immédiat et explicite.
    ///
    /// La résolution — et donc toute création de conversation — n'a lieu
    /// QU'ICI, à l'envoi. Sélectionner un contact dans le picker puis fermer
    /// la feuille sans envoyer ne crée jamais de conversation vide.
    func forward(message: Message, sourceConversationId: String?, to target: ShareRecipient, chosenDurationSeconds: Int?, forwardedAttachmentIds: [String]?) async -> ForwardOutcome {
        // Avant toute résolution : un contact ne reçoit pas une conversation
        // créée pour un transfert que la loi refuse.
        if let refusal = ForwardRefusalReason.local(for: message) {
            return .failed(reason: refusal.explanation)
        }
        if let conversationId = target.conversationId {
            return await forward(message: message, sourceConversationId: sourceConversationId, to: conversationId,
                                 served: [target.isEncrypted ? E2EEWire.mode : nil],
                                 chosenDurationSeconds: chosenDurationSeconds, forwardedAttachmentIds: forwardedAttachmentIds)
        }
        guard let userId = target.userId else {
            return .failed(reason: Self.genericFailure)
        }
        guard isOnline() else {
            return .failed(reason: Self.contactUnreachableOffline)
        }
        do {
            let conversation = try await conversationCreator.createDirectConversation(
                with: userId,
                currentUserId: authManager.currentUser?.id ?? ""
            )
            return await forward(message: message, sourceConversationId: sourceConversationId, to: conversation.id,
                                 served: [conversation.encryptionMode],
                                 chosenDurationSeconds: chosenDurationSeconds, forwardedAttachmentIds: forwardedAttachmentIds)
        } catch {
            return .failed(reason: Self.failureReason(for: error))
        }
    }

    private static func refusal(in error: Error) -> ForwardRefusalReason? {
        ForwardRefusalReason.server(error: error)
    }

    private static func failureReason(for error: Error) -> String {
        if let refusal = refusal(in: error) { return refusal.explanation }
        if case let APIError.serverError(_, serverMessage) = error {
            return serverMessage ?? genericFailure
        }
        if let apiError = error as? APIError {
            return apiError.errorDescription ?? genericFailure
        }
        return error.localizedDescription
    }

    private static var genericFailure: String {
        String(localized: "forward.error.generic", defaultValue: "Le transfert a échoué", bundle: .main)
    }

    private static var contactUnreachableOffline: String {
        String(localized: "forward.error.contact-offline", defaultValue: "Cette personne ne peut pas être jointe hors connexion.", bundle: .main)
    }
}
