import Combine
import Foundation
import MeeshySDK
import MeeshyUI

extension UserProfileDependencies {
    static let live = UserProfileDependencies(
        currentUser: { AuthManager.shared.currentUser },
        relationships: LiveProfileRelationshipState(),
        social: LiveProfileSocialActions(),
        userUpdates: MessageSocketManager.shared.userUpdated.eraseToAnyPublisher(),
        fallbackProfileLoading: UncachedProfileLoading(),
        inCommon: LiveProfileInCommonLoading(),
        acquaintance: LiveProfileAcquaintance(),
        pendingQueue: LiveProfilePendingQueue(),
        reportMessages: LiveProfileReportMessages(),
        directUnread: LiveProfileDirectUnread()
    )
}

/// La pastille d'« Écrire » (#19646) : la liste des conversations telle que son cache la garde — fraîche ou périmée,
/// jamais le réseau. Un cache expiré ou vide ne pose aucune pastille ; la liste la remettra à son prochain passage.
@MainActor
final class LiveProfileDirectUnread: ProfileDirectUnreadProviding {
    nonisolated deinit {}

    func cachedConversationList() async -> [MeeshyConversation] {
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let list, _), .stale(let list, _):
            return list
        case .expired, .empty:
            return []
        }
    }

    /// Chaque réécriture du cache de la liste (`ConversationListPersister`) : la fiche ouverte relit sa pastille.
    func conversationListChanges() -> AsyncStream<Void> {
        ConversationListCacheSignal.shared.changes()
    }
}

/// « Joindre des messages » à un signalement (#19609) : nos messages communs viennent de la base locale des messages
/// du compte actif, lue hors du fil principal ; aucun message chiffré de bout en bout, la base n'en gardant pas le clair.
/// La passerelle n'annonce pas encore `attachedMessageIds` (#19351) : la limite reste `nil` et la section absente.
@MainActor
final class LiveProfileReportMessages: ProfileReportMessagesProviding {
    nonisolated deinit {}

    var attachableLimit: Int? { nil }

    func attachableMessages(from userId: String) async -> [ProfileReportAttachment] {
        let persistence = DependencyContainer.shared.messagePersistence
        return await Self.read(persistence, senderId: userId).map { ProfileReportAttachment(excerpt: $0) }
    }

    @concurrent
    private nonisolated static func read(_ persistence: MessagePersistenceActor,
                                         senderId: String) async -> [ReportableMessageExcerpt] {
        (try? ReportableMessageExcerpts.read(in: persistence, fromSender: senderId)) ?? []
    }
}

/// Hors ligne, ce que la file garde pour la personne (#19465) : ses conversations directes lues dans le cache de la
/// liste (jamais le réseau, qui manque), la file telle que la pastille de synchronisation la lit, et le retrait d'un envoi
/// comme le fil le fait pour un message qui n'est pas parti — la ligne annulée, puis effacée, puis sa bulle retirée.
@MainActor
final class LiveProfilePendingQueue: ProfilePendingQueueProviding {
    nonisolated deinit {}

    private let queue: OfflineQueue

    init(queue: OfflineQueue = .shared) {
        self.queue = queue
    }

    func directConversationIds(with userId: String) async -> Set<String> {
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let list, _), .stale(let list, _):
            let target = userId.lowercased()
            return Set(list.filter { $0.type == .direct && $0.participantUserId?.lowercased() == target }.map(\.id))
        case .expired, .empty:
            return []
        }
    }

    func pendingItems() -> AnyPublisher<[OutboxUIItem], Never> {
        queue.pendingUIItemsPublisher
    }

    func withdraw(_ action: ProfilePendingAction) async -> Bool {
        let messageId = action.clientMessageId
        let persistence = DependencyContainer.shared.messagePersistence
        await queue.cancelPendingSend(clientMessageId: messageId)
        await queue.clearSendMessageRow(clientMessageId: messageId)
        await bestEffort("profile.pending.withdraw", category: .messages) {
            try await persistence.markDeleted(localId: messageId, deletedAt: Date(), origin: .authenticated)
        }
        return true
    }

    func retry(_ actions: [ProfilePendingAction]) async {
        for action in actions {
            try? await queue.retryItem(action.id)
        }
    }
}

/// « En commun » (#19377) : le store chiffré du `CacheCoordinator`, clé = la personne, puis `GET /users/:id/in-common`.
/// Seule la réponse complète se grave : une page d'un seul type de médias ne remplace jamais la fiche entière.
@MainActor
final class LiveProfileInCommonLoading: ProfileInCommonLoading {
    nonisolated deinit {}

    private let service: UserInCommonProviding

    init(service: UserInCommonProviding = UserInCommonService.shared) {
        self.service = service
    }

    func cachedInCommon(with userId: String) async -> CacheResult<[UserInCommon]> {
        await CacheCoordinator.shared.profileInCommon.load(for: userId)
    }

    func fetchInCommon(with userId: String, mediaKind: InCommonMediaKind?) async throws -> UserInCommon {
        try await service.inCommon(with: userId, mediaKind: mediaKind)
    }

    func storeInCommon(_ inCommon: UserInCommon) async {
        await bestEffort("profileInCommon.save", category: .cache) {
            try await CacheCoordinator.shared.profileInCommon.save([inCommon], for: inCommon.id)
        }
    }
}

/// « Faire connaissance » (#19456) : le verdict vient du lien servi (`GET /relations/:userId`, PUBLIC pour un inconnu),
/// la demande part par le chemin unique du partage — directe créée à l'envoi, file durable hors ligne, et rien en clair
/// vers une directe chiffrée (fail-closed). La passerelle range ce premier message dans ses demandes.
@MainActor
final class LiveProfileAcquaintance: ProfileAcquaintanceProviding {
    nonisolated deinit {}

    private let relations: RelationsProviding
    private let dispatcher: () -> ShareDispatching

    init(relations: RelationsProviding = RelationsService.shared,
         dispatcher: @escaping () -> ShareDispatching = { LiveShareDispatcher() }) {
        self.relations = relations
        self.dispatcher = dispatcher
    }

    func writesARequest(to userId: String) async -> Bool? {
        guard let served = try? await relations.link(userId: userId),
              served.userId.lowercased() == userId.lowercased() else { return nil }
        return ProfileRelationAction.writesARequest(at: served.toolLevel)
    }

    func sendMessageRequest(to userId: String, text: String) async -> Bool {
        let request = ShareSendRequest(subject: .text(text), keptMessageIds: [], caption: "", captionPlacement: nil,
                                       grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false)
        let recipient = ShareRecipient(id: "user:\(userId)", kind: .person, conversationId: nil, userId: userId,
                                       title: "", detail: .direct, avatarURL: nil)
        return await dispatcher().deliver(request, to: recipient).conversationId != nil
    }
}
