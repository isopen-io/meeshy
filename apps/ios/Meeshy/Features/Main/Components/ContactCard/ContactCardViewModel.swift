import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Lecture du fichier vCard

/// Rend les octets de la pièce jointe vCard : copie locale (`file://`, la
/// bulle optimiste de l'auteur) ou fichier servi, via le cache disque des
/// médias. `cachedCard` répond SANS attendre quand la carte a déjà été lue
/// (mémoire, ou fichier de quelques kilo-octets déjà sur disque).
protocol VCardAttachmentLoading: Sendable {
    func cachedCard(for attachment: MessageAttachment) -> VCard?
    func loadCard(for attachment: MessageAttachment) async -> VCard?
}

final class VCardAttachmentLoader: VCardAttachmentLoading, @unchecked Sendable {
    static let shared = VCardAttachmentLoader()
    nonisolated deinit {}

    private let parsed = NSCache<NSString, CardBox>()

    private final class CardBox {
        nonisolated deinit {}
        let card: VCard
        init(_ card: VCard) { self.card = card }
    }

    init() {
        parsed.countLimit = 200
    }

    func cachedCard(for attachment: MessageAttachment) -> VCard? {
        if let hit = parsed.object(forKey: key(attachment)) { return hit.card }
        guard let url = remoteURL(attachment),
              let file = CacheCoordinator.imageLocalFileURL(for: url.absoluteString),
              let data = try? Data(contentsOf: file),
              let card = VCardParser.parse(data) else { return nil }
        parsed.setObject(CardBox(card), forKey: key(attachment))
        return card
    }

    func loadCard(for attachment: MessageAttachment) async -> VCard? {
        if let hit = cachedCard(for: attachment) { return hit }
        let data: Data?
        if let local = URL(string: attachment.fileUrl), local.isFileURL {
            data = await Task.detached(priority: .userInitiated) { try? Data(contentsOf: local) }.value
        } else if let url = remoteURL(attachment) {
            data = try? await CacheCoordinator.shared.images.data(for: url.absoluteString)
        } else {
            data = nil
        }
        guard let data, let card = VCardParser.parse(data) else { return nil }
        parsed.setObject(CardBox(card), forKey: key(attachment))
        return card
    }

    private func key(_ attachment: MessageAttachment) -> NSString {
        "\(attachment.id)|\(attachment.fileUrl)" as NSString
    }

    private func remoteURL(_ attachment: MessageAttachment) -> URL? {
        guard !attachment.fileUrl.isEmpty, !attachment.fileUrl.hasPrefix("file:") else { return nil }
        return MeeshyConfig.resolveMediaURL(attachment.fileUrl)
    }
}

// MARK: - Actions sur le compte

/// Les deux gestes d'un compte trouvé : se connecter (demande d'amitié par
/// la file durable, comme `ConnectionActionView`) et écrire (conversation
/// directe, comme le répertoire). Rien n'est réécrit : ce sont les voies
/// existantes, rassemblées derrière un protocole testable.
@MainActor
protocol ContactCardActionPerforming {
    func pendingReceivedRequestId(from userId: String) -> String?
    func sendFriendRequest(to userId: String) async -> Bool
    func acceptFriendRequest(requestId: String, from userId: String) async -> Bool
    func openDirectConversation(with userId: String) async -> Conversation?
}

@MainActor
final class ContactCardActionPerformer: ContactCardActionPerforming {
    nonisolated deinit {}

    private let friendshipCache: FriendshipCache
    private let offlineQueue: OfflineQueueing
    private let friendService: FriendServiceProviding
    private let conversationCreator: ConversationCreating

    init(
        friendshipCache: FriendshipCache = .shared,
        offlineQueue: OfflineQueueing = OfflineQueue.shared,
        friendService: FriendServiceProviding = FriendService.shared,
        conversationCreator: ConversationCreating = ConversationCreator()
    ) {
        self.friendshipCache = friendshipCache
        self.offlineQueue = offlineQueue
        self.friendService = friendService
        self.conversationCreator = conversationCreator
    }

    func pendingReceivedRequestId(from userId: String) -> String? {
        guard case .pendingReceived(let requestId) = friendshipCache.status(for: userId) else { return nil }
        return requestId
    }

    func sendFriendRequest(to userId: String) async -> Bool {
        let cmid = ClientMutationId.generate()
        friendshipCache.didSendRequest(to: userId, requestId: cmid)
        do {
            try await offlineQueue.enqueue(.sendFriendRequest, payload: SendFriendRequestPayload(clientMutationId: cmid, targetUserId: userId), conversationId: nil)
            await friendshipCache.invalidatePersistedFriendCaches()
            return true
        } catch {
            friendshipCache.didCancelRequest(to: userId)
            return false
        }
    }

    func acceptFriendRequest(requestId: String, from userId: String) async -> Bool {
        friendshipCache.didAcceptRequest(from: userId)
        do {
            _ = try await friendService.respond(requestId: requestId, accepted: true)
            await friendshipCache.invalidatePersistedFriendCaches()
            return true
        } catch {
            friendshipCache.rollbackAccept(senderId: userId, requestId: requestId)
            return false
        }
    }

    func openDirectConversation(with userId: String) async -> Conversation? {
        guard let currentUserId = AuthManager.shared.currentUser?.id else { return nil }
        return await conversationCreator.openDirectConversation(with: userId, currentUserId: currentUserId)
    }
}

// MARK: - État d'une carte

/// L'état d'UNE carte de visite (bulle + fiche). Cache-first : la carte et
/// les comptes déjà connus sont posés à l'`init`, sans attente ni spinner ;
/// `load()` ne fait que combler ce qui manque et revalider en silence.
@MainActor
final class ContactCardViewModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var card: VCard?
    @Published private(set) var accounts: [PublicContactAccount] = []
    @Published private(set) var didFailToRead = false
    @Published private(set) var busyUserIds: Set<String> = []

    let attachment: MessageAttachment
    private let loader: VCardAttachmentLoading
    private let resolver: ContactResolveServiceProviding
    private let performer: ContactCardActionPerforming
    private let defaultCountry: String?

    init(
        attachment: MessageAttachment,
        loader: VCardAttachmentLoading = VCardAttachmentLoader.shared,
        resolver: ContactResolveServiceProviding = ContactResolveService.shared,
        performer: ContactCardActionPerforming? = nil,
        defaultCountry: String? = Locale.current.region?.identifier
    ) {
        self.attachment = attachment
        self.loader = loader
        self.resolver = resolver
        self.performer = performer ?? ContactCardActionPerformer()
        self.defaultCountry = defaultCountry
        let cached = loader.cachedCard(for: attachment)
        self.card = cached
        self.accounts = cached.flatMap { resolver.cachedAccounts(for: request(for: $0)) } ?? []
    }

    /// Le compte montré dans la bulle : le premier rendu par le serveur.
    var primaryAccount: PublicContactAccount? { accounts.first }

    func load() async {
        let loaded: VCard?
        if let card {
            loaded = card
        } else {
            loaded = await loader.loadCard(for: attachment)
        }
        guard let loaded else {
            didFailToRead = true
            return
        }
        if card != loaded { card = loaded }
        let resolved = await resolver.resolve(request(for: loaded))
        if resolved != accounts { accounts = resolved }
    }

    func actions(for account: PublicContactAccount) -> ContactAccountActions {
        ContactAccountActions.resolve(
            relation: account.relation,
            pendingReceivedRequestId: account.relation == .requestReceived ? performer.pendingReceivedRequestId(from: account.userId) : nil
        )
    }

    /// Se connecter : l'état « Demande envoyée » est posé AVANT le réseau,
    /// et retiré si la file refuse la demande.
    @discardableResult
    func connect(_ account: PublicContactAccount) async -> Bool {
        guard !busyUserIds.contains(account.userId) else { return false }
        let previous = account.relation
        busyUserIds.insert(account.userId)
        defer { busyUserIds.remove(account.userId) }
        setRelation(.requestSent, for: account.userId)
        guard await performer.sendFriendRequest(to: account.userId) else {
            setRelation(previous, for: account.userId)
            return false
        }
        return true
    }

    @discardableResult
    func accept(_ account: PublicContactAccount, requestId: String) async -> Bool {
        guard !busyUserIds.contains(account.userId) else { return false }
        let previous = account.relation
        busyUserIds.insert(account.userId)
        defer { busyUserIds.remove(account.userId) }
        setRelation(.friend, for: account.userId)
        guard await performer.acceptFriendRequest(requestId: requestId, from: account.userId) else {
            setRelation(previous, for: account.userId)
            return false
        }
        return true
    }

    func openConversation(with account: PublicContactAccount) async -> Conversation? {
        guard !busyUserIds.contains(account.userId) else { return nil }
        busyUserIds.insert(account.userId)
        defer { busyUserIds.remove(account.userId) }
        return await performer.openDirectConversation(with: account.userId)
    }

    private func setRelation(_ relation: ContactRelation, for userId: String) {
        accounts = accounts.map { account in
            guard account.userId == userId else { return account }
            var updated = account
            updated.relation = relation
            return updated
        }
        resolver.updateRelation(userId: userId, to: relation)
    }

    private func request(for card: VCard) -> ContactResolveRequest {
        ContactResolveRequest(card: card, defaultCountry: defaultCountry)
    }
}
