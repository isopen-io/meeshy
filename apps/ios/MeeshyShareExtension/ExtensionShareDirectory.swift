import Foundation
import MeeshySDK
// Compilé AUSSI dans `MeeshyTests` (`project.yml`) : l'écran de partage y vient
// du module de l'app, qu'aucune extension ne peut importer.
#if !MEESHY_SHARE_EXTENSION
@testable import Meeshy
#endif

/// **D'où l'extension tire ses destinataires** (#10947) — le cache d'abord.
///
/// 1. le cliché que l'app dépose dans l'App Group (`ShareDirectorySnapshot` :
///    conversations, amis, carnet apparié), s'il appartient à la session ;
/// 2. à défaut — l'app n'a pas encore tourné depuis la mise à jour —, les
///    conversations récentes du widget (`ShareConversationStore`) ;
/// 3. puis, s'il y a une session, la première page du serveur en silence et la
///    recherche serveur fusionnée (personnes, conversations).
///
/// Aucun singleton de l'app : la session vient du trousseau partagé
/// (`ShareSession`), les requêtes partent par `URLSession` avec son jeton.
nonisolated struct ExtensionShareDirectory: ShareRecipientSourcing {
    let session: ShareSession?
    var readDefaults: @Sendable () -> UserDefaults? = { UserDefaults(suiteName: ShareDirectorySnapshot.appGroupIdentifier) }
    var fetch: @concurrent @Sendable (URLRequest) async throws -> (Data, URLResponse) = { try await URLSession.shared.data(for: $0) }

    static let pageLimit = 50
    static let searchLimit = 20

    enum Failure: Error { case signedOut, refused }

    // MARK: - Cache d'abord

    private var snapshot: ShareDirectorySnapshot? {
        let decoded = ShareDirectorySnapshot.decoded(from: readDefaults()?.data(forKey: ShareDirectorySnapshot.defaultsKey))
        return decoded?.isServable(to: session?.userId) == true ? decoded : nil
    }

    func cachedConversations() async -> [ShareRecipient] {
        guard session != nil else { return [] }
        if let snapshot, !snapshot.conversations.isEmpty { return snapshot.conversations }
        let defaults = readDefaults()
        return ShareConversationStore.targets(
            recentsData: defaults?.data(forKey: ShareConversationStore.recentConversationsKey),
            snapshotsData: defaults?.data(forKey: ShareConversationStore.conversationSnapshotsKey)
        ).map(Self.recipient(from:))
    }

    func cachedPeople(currentUserId: String) async -> [ShareRecipient] {
        snapshot?.people.filter { $0.userId != currentUserId } ?? []
    }

    func cachedCommunities() async -> [ShareCommunity] { [] }

    func writableChannels(of community: ShareCommunity, currentUserId: String) async -> [ShareRecipient] { [] }

    /// Une conversation du widget : on sait son nom et si c'est un groupe — pas
    /// son chiffrement. Inconnu vaut chiffré (fail-closed, #9224) : la ligne est
    /// relayée à l'app, qui connaît le mode, au lieu de partir en clair d'ici.
    static func recipient(from target: ShareTarget) -> ShareRecipient {
        ShareRecipient(
            id: "conv:\(target.id)", kind: .conversation, conversationId: target.id, userId: nil,
            title: target.displayName, detail: target.isGroup ? .group(members: 0) : .direct, avatarURL: nil,
            isEncrypted: true
        )
    }

    // MARK: - Le serveur, en silence

    func freshConversations(currentUserId: String) async throws -> [ShareRecipient] {
        guard let session else { throw Failure.signedOut }
        let conversations: [APIConversation] = try await get(
            ConversationsEndpoint.root.path, query: [URLQueryItem(name: "limit", value: "\(Self.pageLimit)")], session: session
        )
        return conversations
            .map { $0.toConversation(currentUserId: currentUserId) }
            .filter(\.isActive)
            .map { ShareRecipient(conversation: $0) }
    }

    func search(_ query: String, currentUserId: String) async -> ShareSearchResults {
        guard let session else { return ShareSearchResults() }
        async let conversations: [APIConversation]? = try? get(
            ConversationsEndpoint.search.path, query: [URLQueryItem(name: "q", value: query)], session: session
        )
        async let users: [UserSearchResult]? = try? get(
            UsersEndpoint.search.path,
            query: [URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "\(Self.searchLimit)"), URLQueryItem(name: "offset", value: "0")],
            session: session
        )
        let (foundConversations, foundUsers) = await (conversations, users)
        let reachable = (foundConversations ?? [])
            .filter {
                ShareRecipientMerge.isReachableConversation(
                    type: $0.type, participantUserIds: ($0.participants ?? []).compactMap(\.userId),
                    currentUserId: currentUserId, isMember: $0.isMember
                )
            }
            .map { ShareRecipient(conversation: $0.toConversation(currentUserId: currentUserId)) }
        let people = (foundUsers ?? []).filter { $0.id != currentUserId }.map { user in
            ShareRecipient(
                id: "user:\(user.id)", kind: .person, conversationId: nil, userId: user.id,
                title: user.displayName ?? user.username, detail: .handle(user.username), avatarURL: user.avatar
            )
        }
        return ShareSearchResults(people: people, conversations: reachable, communities: [])
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem], session: ShareSession) async throws -> T {
        guard var components = URLComponents(string: "\(session.apiBaseURL)\(path)") else { throw Failure.refused }
        components.queryItems = query
        guard let url = components.url else { throw Failure.refused }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(session.token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 10
        let (data, response) = try await fetch(request)
        guard let status = (response as? HTTPURLResponse)?.statusCode, (200...299).contains(status) else { throw Failure.refused }
        return try MeeshyCoders.decoder(.api).decode(APIResponse<T>.self, from: data).data
    }
}
