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
    func remoteMessages(query: String, reader: MeeshyUser?, after cursor: String?) async -> GlobalSearchLeg<GlobalSearchMessageResult>
}

extension ConversationMessageSearchProviding {
    func remoteMessages(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchMessageResult> {
        await remoteMessages(query: query, reader: reader, after: nil)
    }
}

nonisolated struct ConversationMessageSearchService: ConversationMessageSearchProviding {

    static let pageSize = 30
    /// Aller-retours consacrés à des pages VIDES avant de rendre la main : la
    /// passerelle filtre après lecture, une page vide peut précéder une pleine,
    /// mais un terme rare ne balaie pas tout l'historique à chaque frappe (#16476).
    static let emptyPageBudget = 8

    private let api: APIClientProviding
    private let searchService: MessageSearchService
    private let cachedConversations: @concurrent @Sendable () async -> [MeeshyConversation]

    init(
        api: APIClientProviding,
        searchService: MessageSearchService,
        cachedConversations: @escaping @concurrent @Sendable () async -> [MeeshyConversation] = Self.listCache
    ) {
        self.api = api
        self.searchService = searchService
        self.cachedConversations = cachedConversations
    }

    /// Le cache de la liste, frais ou périmé : il ne sert qu'à nommer la
    /// conversation d'un résultat local, jamais à décider de ce qui est trouvé.
    @concurrent static func listCache() async -> [MeeshyConversation] {
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
    ///
    /// Le verrou PIN protège le CONTENU (#11387) : aucun message d'une
    /// conversation verrouillée ne sort, d'où qu'il vienne. La loi s'applique
    /// ici, à la sortie, et non à la lecture : un résultat mis en cache avant
    /// le verrou reste retenu.
    @MainActor static func merged(
        local: [GlobalSearchMessageResult],
        remote: [GlobalSearchMessageResult],
        contentLocks: Set<String> = ConversationLockManager.shared.contentLockedConversationIds
    ) -> [GlobalSearchMessageResult] {
        var seen = Set<String>()
        return (remote + local)
            .filter { !ConversationLockManager.hidesContent(of: $0.conversationId, lockedConversationIds: contentLocks) }
            .filter { seen.insert($0.id).inserted }
            .sorted { $0.createdAt > $1.createdAt }
    }

    /// La photo d'une conversation connue : un direct montre son interlocuteur,
    /// jamais la photo de la conversation (#12569). Sans photo de pair, il
    /// reste en initiales.
    static func avatar(of conversation: MeeshyConversation) -> String? {
        conversation.type == .direct ? conversation.participantAvatarURL : conversation.avatar
    }

    private func conversationsById() async -> [String: MeeshyConversation] {
        Dictionary(await cachedConversations().map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    // MARK: - Volet local

    func localMessages(query: String, reader: MeeshyUser?) async -> [GlobalSearchMessageResult] {
        let records = (try? await searchService.search(query: query, limit: 50, conversationId: nil)) ?? []
        guard !records.isEmpty else { return [] }
        let readerId = reader?.id ?? ""
        let preferred = ReaderPrism.resolve(for: reader)
        let visible = records.filter { Self.appearsInSearch($0.toMessage(currentUserId: readerId)) }
        let translations = (try? await searchService.translations(forMessageLocalIds: visible.map(\.localId))) ?? [:]
        let known = await conversationsById()
        return visible.map { record in
            let conversation = known[record.conversationId]
            return GlobalSearchMessageResult(
                id: record.serverId ?? record.localId,
                conversationId: record.conversationId,
                conversationName: conversation?.displayName
                    ?? String(localized: "conversation.info.header", defaultValue: "Conversation"),
                conversationAvatar: conversation.flatMap(Self.avatar(of:)),
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
    ///
    /// `cursor` reprend là où la page précédente s'est arrêtée. La suite d'une
    /// pagination ne se replie pas : son échec garde le curseur, pour que la
    /// page ratée se redemande.
    func remoteMessages(query: String, reader: MeeshyUser?, after cursor: String?) async -> GlobalSearchLeg<GlobalSearchMessageResult> {
        do {
            let page = try await servedPage(query: query, cursor: cursor, emptyPagesLeft: Self.emptyPageBudget)
            let known = await conversationsById()
            return GlobalSearchLeg(
                items: page.hits.map { Self.result(from: $0, in: known[$0.conversationId]) },
                failure: nil,
                nextCursor: page.nextCursor
            )
        } catch {
            guard let cursor else { return await legacyRemoteMessages(query: query, reader: reader) }
            return GlobalSearchLeg(items: [], failure: String(localized: "common.error.generic"), nextCursor: cursor)
        }
    }

    /// La première page qui rend quelque chose : une page courte s'affiche
    /// aussitôt, seule une page VIDE avec `hasMore` s'enchaîne d'elle-même
    /// (contrat #14619 : le serveur filtre après lecture).
    private func servedPage(
        query: String,
        cursor: String?,
        emptyPagesLeft: Int
    ) async throws -> (hits: [APIMessageSearchHit], nextCursor: String?) {
        let page: PaginatedAPIResponse<[APIMessageSearchHit]> = try await api.request(
            MessagesEndpoint.search,
            queryItems: [
                URLQueryItem(name: "q", value: query),
                URLQueryItem(name: "limit", value: String(Self.pageSize))
            ] + (cursor.map { [URLQueryItem(name: "cursor", value: $0)] } ?? [])
        )
        let next = page.pagination?.hasMore == true ? page.pagination?.nextCursor : nil
        guard page.data.isEmpty, let next, emptyPagesLeft > 1, !Task.isCancelled else { return (page.data, next) }
        return try await servedPage(query: query, cursor: next, emptyPagesLeft: emptyPagesLeft - 1)
    }

    /// Une conversation que l'appareil connaît garde son nom et sa photo élus
    /// contre le lecteur (nom choisi, interlocuteur d'un direct) ; la carte
    /// servie ne nomme que ce qu'il ne connaît pas (#16485).
    static func result(from hit: APIMessageSearchHit, in conversation: MeeshyConversation? = nil) -> GlobalSearchMessageResult {
        GlobalSearchMessageResult(
            id: hit.id,
            conversationId: hit.conversationId,
            conversationName: conversation?.displayName ?? hit.conversation.title,
            conversationAvatar: conversation.map(avatar(of:)) ?? hit.conversation.avatar,
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
                    conversationAvatar: Self.avatar(of: conversation),
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
