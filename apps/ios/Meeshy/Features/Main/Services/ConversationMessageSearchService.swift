import Foundation
import MeeshySDK

// MARK: - Recherche des MESSAGES (#14619)

/// Les deux volets d'une recherche de messages : l'index LOCAL (FTS5, hors
/// ligne, instantané — et seul à pouvoir chercher dans une conversation
/// chiffrée de bout en bout, que le serveur ne voit jamais en clair) et le
/// volet RÉSEAU. La recherche globale et la liste des conversations les
/// partagent : une seule loi de sortie, un seul Prisme.
protocol ConversationMessageSearchProviding: Sendable {
    func localMessages(query: String, reader: MeeshyUser?) async -> [GlobalSearchMessageResult]
    func remoteMessages(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchMessageResult>
}

nonisolated struct ConversationMessageSearchService: ConversationMessageSearchProviding {

    private let api: APIClientProviding
    private let searchService: MessageSearchService
    private let cachedConversations: @Sendable () async -> [MeeshyConversation]

    init(
        api: APIClientProviding,
        searchService: MessageSearchService,
        cachedConversations: @escaping @Sendable () async -> [MeeshyConversation] = Self.listCache
    ) {
        self.api = api
        self.searchService = searchService
        self.cachedConversations = cachedConversations
    }

    /// Le cache de la liste, frais ou périmé : il ne sert qu'à nommer la
    /// conversation d'un résultat local, jamais à décider de ce qui est trouvé.
    @Sendable static func listCache() async -> [MeeshyConversation] {
        switch await CacheCoordinator.shared.conversations.load(for: "list") {
        case .fresh(let value, _), .stale(let value, _): return value
        case .expired, .empty: return []
        }
    }

    /// **Un message qui disparaît ne sort pas de sa conversation par la
    /// recherche** (#9619, loi de sortie #9572). Une vue unique, une flamme à
    /// durée ou après lecture — sur le message OU sur l'une de ses pièces —
    /// n'apparaît dans aucun résultat.
    static func appearsInSearch(_ message: MeeshyMessage) -> Bool {
        message.contentExitLaw.nature == .ordinary
    }

    /// Le texte servi d'un résultat : la traduction élue par le Prisme du
    /// lecteur, sinon l'original (règle 1 — jamais `translations.first`).
    static func servedText(
        original: String,
        originalLanguage: String?,
        translations: [(language: String, text: String)],
        preferredLanguages: [String]
    ) -> String {
        PrismTranslationResolver.resolveElement(
            originalLanguage: originalLanguage,
            elements: translations,
            languageOf: { $0.language },
            isServable: { !$0.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty },
            preferredLanguages: preferredLanguages
        )?.text ?? original
    }

    /// Le réseau d'abord (il porte le nom et l'avatar frais), le local comble
    /// ce que le réseau n'a pas rendu — hors ligne, conversation chiffrée.
    static func merged(
        local: [GlobalSearchMessageResult],
        remote: [GlobalSearchMessageResult]
    ) -> [GlobalSearchMessageResult] {
        var seen = Set<String>()
        return (remote + local)
            .filter { seen.insert($0.id).inserted }
            .sorted { $0.createdAt > $1.createdAt }
    }

    // MARK: - Volet local

    func localMessages(query: String, reader: MeeshyUser?) async -> [GlobalSearchMessageResult] {
        let records = (try? await searchService.search(query: query, limit: 50, conversationId: nil)) ?? []
        guard !records.isEmpty else { return [] }
        let readerId = reader?.id ?? ""
        let preferred = ReaderPrism.resolve(for: reader)
        let visible = records.filter { Self.appearsInSearch($0.toMessage(currentUserId: readerId)) }
        let translations = (try? await searchService.translations(forMessageLocalIds: visible.map(\.localId))) ?? [:]
        let conversationsById = Dictionary(
            await cachedConversations().map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first }
        )
        return visible.map { record in
            let conversation = conversationsById[record.conversationId]
            return GlobalSearchMessageResult(
                id: record.serverId ?? record.localId,
                conversationId: record.conversationId,
                conversationName: conversation?.displayName ?? record.conversationId,
                conversationAvatar: conversation?.avatar ?? conversation?.participantAvatarURL,
                content: Self.servedText(
                    original: record.content ?? "",
                    originalLanguage: record.originalLanguage,
                    translations: (translations[record.localId] ?? []).map { ($0.targetLanguage, $0.translatedContent) },
                    preferredLanguages: preferred
                ),
                senderName: record.senderName ?? record.senderUsername ?? "?",
                senderAvatar: record.senderAvatarURL,
                createdAt: record.createdAt
            )
        }
    }

    // MARK: - Volet réseau

    /// `GET /messages/search` d'abord (#14619) : la passerelle cherche dans
    /// TOUTES les conversations du lecteur, sert le texte du Prisme et retient
    /// ce qui ne doit pas sortir. Une passerelle qui ne la porte pas encore
    /// (production avant promotion) répond par une erreur : on retombe alors
    /// sur l'ancienne recherche par conversation, jamais sur un vide.
    func remoteMessages(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchMessageResult> {
        do {
            let page: PaginatedAPIResponse<[APIMessageSearchHit]> = try await api.request(
                MessagesEndpoint.search,
                queryItems: [URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "30")]
            )
            return .served(page.data.map(Self.result(from:)))
        } catch {
            return await legacyRemoteMessages(query: query, reader: reader)
        }
    }

    static func result(from hit: APIMessageSearchHit) -> GlobalSearchMessageResult {
        GlobalSearchMessageResult(
            id: hit.id,
            conversationId: hit.conversationId,
            conversationName: hit.conversation.title,
            conversationAvatar: hit.conversation.avatar,
            content: hit.content,
            senderName: hit.senderLabel,
            senderAvatar: hit.sender?.avatar,
            createdAt: hit.createdAt
        )
    }

    private func legacyRemoteMessages(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchMessageResult> {
        do {
            let response: APIResponse<[APIConversation]> = try await api.request(
                ConversationsEndpoint.search,
                queryItems: [URLQueryItem(name: "q", value: query)]
            )
            let userId = reader?.id ?? ""
            let preferred = ReaderPrism.resolve(for: reader)
            let conversations = Array(response.data.prefix(10)).map { $0.toConversation(currentUserId: userId) }
            let legs = await withTaskGroup(of: GlobalSearchLeg<GlobalSearchMessageResult>.self) { group in
                for conversation in conversations {
                    group.addTask {
                        await messages(in: conversation, query: query, readerId: userId, preferred: preferred)
                    }
                }
                return await group.reduce(into: [GlobalSearchLeg<GlobalSearchMessageResult>]()) { $0.append($1) }
            }
            let items = legs.flatMap(\.items).sorted { $0.createdAt > $1.createdAt }
            return GlobalSearchLeg(items: items, failure: items.isEmpty ? legs.lazy.compactMap(\.failure).first : nil)
        } catch {
            return .failed(String(localized: "common.error.generic"))
        }
    }

    private func messages(
        in conversation: MeeshyConversation,
        query: String,
        readerId: String,
        preferred: [String]
    ) async -> GlobalSearchLeg<GlobalSearchMessageResult> {
        do {
            let response: MessagesAPIResponse = try await api.request(
                ConversationsEndpoint.byIdMessagesSearch(id: conversation.id),
                queryItems: [URLQueryItem(name: "q", value: query), URLQueryItem(name: "limit", value: "5")]
            )
            return .served(response.data.compactMap { message -> GlobalSearchMessageResult? in
                guard Self.appearsInSearch(message.toMessage(currentUserId: readerId)) else { return nil }
                return GlobalSearchMessageResult(
                    id: message.id,
                    conversationId: message.conversationId,
                    conversationName: conversation.name,
                    conversationAvatar: conversation.avatar ?? conversation.participantAvatarURL,
                    content: Self.servedText(
                        original: message.content ?? "",
                        originalLanguage: message.originalLanguage,
                        translations: (message.translations ?? []).map { ($0.targetLanguage, $0.translatedContent) },
                        preferredLanguages: preferred
                    ),
                    senderName: message.sender?.displayName ?? message.sender?.username ?? "?",
                    senderAvatar: message.sender?.avatar,
                    createdAt: message.createdAt
                )
            })
        } catch {
            return .failed(String(localized: "common.error.generic"))
        }
    }
}
