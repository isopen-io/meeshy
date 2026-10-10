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

/// Traduction de l'issue riche vers l'issue PRIMITIVE que `ForwardPickerModel`
/// expose (le modèle est partagé avec l'extension de partage, sans SDK).
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
    case blurred
    case sourceUnavailable

    /// Ce que la loi de sortie refuse pour ce message, ou `nil` s'il se transfère.
    static func local(for message: Message) -> ForwardRefusalReason? {
        let offer = message.exitOffer
        guard !offer.offers(.forward) else { return nil }
        if case .refused(let refusal) = offer.law.forward {
            return refusal == .viewOnce ? .viewOnce : .afterRead
        }
        return .blurred
    }

    /// La raison que porte la phrase de refus du serveur, ou `nil` si ce n'en est pas une.
    static func server(message: String?) -> ForwardRefusalReason? {
        guard let message = message?.lowercased() else { return nil }
        if message.contains("vue unique") { return .viewOnce }
        if message.contains("après lecture") { return .afterRead }
        if message.contains("plus disponible") { return .sourceUnavailable }
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
        case .blurred:
            return String(localized: "forward.refused.blurred",
                          defaultValue: "Un message flouté ne peut pas être transféré.", bundle: .main)
        case .sourceUnavailable:
            return String(localized: "forward.refused.source-unavailable",
                          defaultValue: "Le message d’origine n’est plus disponible.", bundle: .main)
        }
    }
}

protocol MessageForwardServiceProviding {
    /// - Parameter chosenDurationSeconds: la durée choisie dans la feuille pour
    ///   une flamme à durée ; `nil` ⇒ celle de la source. Ramenée à la source
    ///   par la loi de sortie, ignorée pour un message ordinaire.
    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, chosenDurationSeconds: Int?) async -> ForwardOutcome
    func forward(message: Message, sourceConversationId: String?, to target: ForwardTarget, chosenDurationSeconds: Int?) async -> ForwardOutcome
}

extension MessageForwardServiceProviding {
    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String) async -> ForwardOutcome {
        await forward(message: message, sourceConversationId: sourceConversationId, to: targetConversationId, chosenDurationSeconds: nil)
    }

    func forward(message: Message, sourceConversationId: String?, to target: ForwardTarget) async -> ForwardOutcome {
        await forward(message: message, sourceConversationId: sourceConversationId, to: target, chosenDurationSeconds: nil)
    }
}

/// Chemin UNIQUE du transfert de message (spec 2026-08-19, Volet A.3) : tous
/// les points d'entrée (picker, swipe, rangée quick-reaction) convergent ici.
///
/// Invariants :
/// - Ce que la loi de sortie refuse (vue unique, flamme après lecture, flou)
///   ne part pas : échec immédiat avec sa phrase, ni requête ni enfilage. La
///   copie d'une flamme à durée porte `ephemeralDuration` — le choix de la
///   feuille, jamais plus que la source —, en ligne comme en file (#9573).
/// - Jamais d'`attachmentIds` ni de re-upload — le gateway copie les
///   attachments de la source (`MessageProcessor.copyForwardedAttachments`).
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
    private var clientMessageIds: [String: String] = [:]

    init(
        api: APIClientProviding = APIClient.shared,
        queue: OfflineMessageQueueing = OfflineQueue.shared,
        isOnline: @escaping () -> Bool = { NetworkMonitor.shared.isOnline },
        conversationCreator: ConversationCreating = ConversationCreator(),
        authManager: AuthManaging = AuthManager.shared
    ) {
        self.api = api
        self.queue = queue
        self.isOnline = isOnline
        self.conversationCreator = conversationCreator
        self.authManager = authManager
    }

    func forward(message: Message, sourceConversationId: String?, to targetConversationId: String, chosenDurationSeconds: Int?) async -> ForwardOutcome {
        if let refusal = ForwardRefusalReason.local(for: message) {
            return .failed(reason: refusal.explanation)
        }
        let ephemeralDuration = message.contentExitLaw.forward.requestedDuration(chosen: chosenDurationSeconds)
        let dedupKey = "\(message.id)→\(targetConversationId)"
        let clientMessageId = clientMessageIds[dedupKey] ?? ClientMessageId.generate()
        clientMessageIds[dedupKey] = clientMessageId
        let sourceId = (sourceConversationId?.isEmpty == false) ? sourceConversationId : nil

        guard isOnline() else {
            do {
                try await queue.enqueue(OfflineQueueItem(
                    conversationId: targetConversationId,
                    content: message.content,
                    clientMessageId: clientMessageId,
                    forwardedFromId: message.id,
                    forwardedFromConversationId: sourceId,
                    protection: MessageProtectionIntent(ephemeralDurationSeconds: ephemeralDuration)
                ))
                return .queuedOffline(conversationId: targetConversationId)
            } catch {
                return .failed(reason: error.localizedDescription)
            }
        }

        do {
            let body = SendMessageRequest(
                content: message.content.isEmpty ? nil : message.content,
                forwardedFromId: message.id,
                forwardedFromConversationId: sourceId,
                ephemeralDuration: ephemeralDuration,
                clientMessageId: clientMessageId
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
    func forward(message: Message, sourceConversationId: String?, to target: ForwardTarget, chosenDurationSeconds: Int?) async -> ForwardOutcome {
        // Avant toute résolution : un contact ne reçoit pas une conversation
        // créée pour un transfert que la loi refuse.
        if let refusal = ForwardRefusalReason.local(for: message) {
            return .failed(reason: refusal.explanation)
        }
        if let conversationId = target.conversationId {
            return await forward(message: message, sourceConversationId: sourceConversationId, to: conversationId,
                                 chosenDurationSeconds: chosenDurationSeconds)
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
                                 chosenDurationSeconds: chosenDurationSeconds)
        } catch {
            return .failed(reason: Self.failureReason(for: error))
        }
    }

    private static func refusal(in error: Error) -> ForwardRefusalReason? {
        guard case let APIError.serverError(_, serverMessage) = error else { return nil }
        return ForwardRefusalReason.server(message: serverMessage)
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
