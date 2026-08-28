import Foundation
import MeeshySDK

/// ViewModel du sélecteur de transfert (`ForwardPickerSheet`) : pagination
/// des conversations au-delà de la première page, et recherche serveur
/// (conversations + contacts) au-delà de ce qui est déjà chargé localement.
///
/// Deux modes distincts partagent `targets` :
/// - **Navigation** (`loadInitial`/`loadMore`) : uniquement des conversations,
///   paginées par curseur EN MÉMOIRE — aucun `saveCursor` n'est jamais
///   appelé. `ConversationListViewModel` reste l'unique écrivain du curseur
///   persisté `"list"` ; un second écrivain le corromprait.
/// - **Recherche** (`search`) : fusionne conversations (`ConversationService
///   .search`) et contacts (amis acceptés + répertoire) via
///   `ForwardTargetMerge`, qui absorbe un contact déjà joint par une
///   conversation directe (Task 6).
@MainActor
final class ForwardPickerViewModel: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    @Published private(set) var targets: [ForwardTarget] = []
    @Published private(set) var paginationState: PaginationState = .idle
    @Published private(set) var hasMore: Bool = true
    @Published var searchText: String = ""

    // MARK: - Dependencies

    private let conversationService: ConversationServiceProviding
    private let friendService: FriendServiceProviding
    private let contactDirectoryService: ContactDirectoryServiceProviding
    private let authManager: AuthManaging

    private static let pageLimit = 50
    /// Répertoire (`ContactDirectoryService.list`) : filtré `q` CÔTÉ SERVEUR,
    /// une page suffit donc.
    private static let contactSearchLimit = 50
    /// Relations acceptées : AUCUNE recherche serveur, le filtre est client —
    /// il faut donc les avoir toutes. Taille de page alignée sur le web et sur
    /// `ContactsListViewModel` (le gateway plafonne `limit` à 100).
    private static let friendsPageSize = 100
    /// Borne de sécurité : au-delà, on cesse de paginer plutôt que de suivre
    /// indéfiniment un `hasMore` qui ne retomberait jamais. 500 relations
    /// couvrent très largement la population réelle ; la même borne vaut côté
    /// web (`use-friend-requests-v2.ts`).
    private static let friendsFetchCap = 500
    private static let searchMinimumLength = 2
    private static let searchDebounceNanoseconds: UInt64 = 300_000_000

    /// Conversations paginées, EN MÉMOIRE UNIQUEMENT — source de `targets`
    /// hors recherche. Dédupliquée par id à chaque page, comme
    /// `ConversationListViewModel.appendConversations`.
    private var conversationTargets: [ForwardTarget] = []
    private var nextCursor: String?

    /// Jeton monotone de recherche — jumeau de `searchTokenRef` côté web
    /// (`apps/web/components/conversations/forward-message-modal.tsx`).
    /// Incrémenté à CHAQUE appel de `search`, y compris quand la requête
    /// redescend sous le seuil : sans cette invalidation, une réponse en vol
    /// pour une saisie plus longue réécrirait la liste que l'effacement vient
    /// de restaurer.
    private var searchToken: Int = 0

    private var currentUserId: String {
        authManager.currentUser?.id ?? ""
    }

    /// La lecture cache-first, INJECTÉE comme les quatre services voisins.
    ///
    /// Elle lisait `CacheCoordinator.shared` en direct — le seul point de ce
    /// view-model qui échappait à l'injection. Conséquence mesurée : les tests
    /// devenaient dépendants de l'ORDRE. Toute suite qui hydrate le cache
    /// « list » (`GlobalSearchViewModelTests` y pose `conv-hydrate`) et toute
    /// exécution qui laisse un cache DISQUE derrière elle — la phase 3 du gate
    /// laisse l'app connectée à un vrai compte — injectaient leurs
    /// conversations dans les assertions d'ici.
    ///
    /// Le défaut porte la discrimination `CacheResult` là où elle se lit : une
    /// page `.expired` ou `.empty` ne rend RIEN, elle ne rend pas « du vide
    /// frais ».
    private let cachedConversations: @Sendable () async -> [Conversation]

    init(
        conversationService: ConversationServiceProviding = ConversationService.shared,
        friendService: FriendServiceProviding = FriendService.shared,
        contactDirectoryService: ContactDirectoryServiceProviding = ContactDirectoryService.shared,
        authManager: AuthManaging = AuthManager.shared,
        cachedConversations: @escaping @Sendable () async -> [Conversation] = {
            switch await CacheCoordinator.shared.conversations.load(for: "list") {
            case .fresh(let data, _), .stale(let data, _): return data
            case .expired, .empty: return []
            }
        }
    ) {
        self.conversationService = conversationService
        self.friendService = friendService
        self.contactDirectoryService = contactDirectoryService
        self.authManager = authManager
        self.cachedConversations = cachedConversations
    }

    // MARK: - Pagination

    func loadInitial() async {
        nextCursor = nil
        hasMore = true
        conversationTargets = []
        targets = []
        paginationState = .idle
        // Cache-first : les conversations de la machine s'affichent IMMÉDIATEMENT
        // (aucun spinner quand le cache « list » est plein), puis revalidation
        // silencieuse via fetchNextPage. Réintroduit le cache-first supprimé par
        // le refactor 99ceb9a49b (ForwardPickerViewModel devenu réseau-pur).
        appendConversationTargets(await cachedConversations().map(Self.makeTarget))
        await fetchNextPage()
    }

    /// Reprend `ConversationListViewModel.loadMore()` (`:1725-1834`) : garde
    /// de ré-entrance + refus de requêter une fois `hasMore == false`.
    func loadMore() async {
        guard hasMore, paginationState != .loadingMore else { return }
        await fetchNextPage()
    }

    private func fetchNextPage() async {
        paginationState = .loadingMore
        let cursor = nextCursor
        do {
            let knownIds = Set(conversationTargets.compactMap(\.conversationId))
            let page = try await conversationService.listPage(
                before: cursor,
                limit: Self.pageLimit,
                currentUserId: currentUserId
            )
            let newTargets = page.items.map(Self.makeTarget)

            // La page est POSÉE avant la garde — comme
            // `ConversationListViewModel.loadMore()` (`:1758`), l'implémentation
            // de référence. La garde arrête la BOUCLE, elle ne jette pas la page
            // qu'elle protège : si `cursorPagination` disparaît de la réponse
            // (incident de mai 2026 cité plus bas), `nextCursor` revient nil à
            // chaque page et le sélecteur affichait « Aucune conversation »
            // pendant que la liste principale montrait sa page 1.
            appendConversationTargets(newTargets)

            // Garde anti-boucle « zero-progress » (incident de production
            // documenté sur `ConversationListViewModel.loadMore()`) : une
            // page qui ne fait AVANCER ni le curseur ni le jeu d'ids connus
            // boucle indéfiniment si on la laisse retenter. On force
            // `.exhausted` au lieu de reboucler.
            let newConversationIds = Set(newTargets.compactMap(\.conversationId)).subtracting(knownIds)
            let cursorAdvanced = page.nextCursor != nil && page.nextCursor != cursor
            let madeProgress = !newConversationIds.isEmpty && cursorAdvanced
            if !madeProgress, !page.items.isEmpty {
                nextCursor = page.nextCursor
                hasMore = false
                paginationState = .exhausted
                return
            }

            nextCursor = page.nextCursor
            hasMore = page.hasMore
            paginationState = page.hasMore ? .idle : .exhausted
        } catch {
            paginationState = .error(error.localizedDescription)
        }
    }

    private func appendConversationTargets(_ newTargets: [ForwardTarget]) {
        var seen = Set(conversationTargets.map(\.id))
        for target in newTargets where seen.insert(target.id).inserted {
            conversationTargets.append(target)
        }
        targets = conversationTargets
    }

    // MARK: - Search

    /// Recherche serveur (conversations + contacts), au-delà des cibles déjà
    /// paginées localement. 2 caractères minimum, anti-rebond 300 ms ; une
    /// réponse dont le jeton n'est plus le jeton COURANT (une recherche plus
    /// récente est partie entre temps, ou la requête est redescendue sous le
    /// seuil) est rejetée en silence.
    ///
    /// Sous le seuil, `targets` RETOMBE sur les cibles de navigation : la
    /// sentinelle de pagination est le seul autre écrivain de `targets` et elle
    /// est gatée sur `hasMore`, faux pour tout compte de moins de 50
    /// conversations — sans cette restauration, effacer la recherche laissait
    /// ses résultats à l'écran jusqu'à la fermeture de la feuille.
    func search(_ query: String) async {
        searchText = query
        searchToken &+= 1
        let token = searchToken
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= Self.searchMinimumLength else {
            targets = conversationTargets
            return
        }

        try? await Task.sleep(nanoseconds: Self.searchDebounceNanoseconds)
        guard token == searchToken else { return }

        let userId = currentUserId
        async let conversationResults = fetchSearchConversationTargets(query: trimmed, currentUserId: userId)
        async let contactResults = fetchSearchContactTargets(query: trimmed, currentUserId: userId)
        let (conversations, contacts) = await (conversationResults, contactResults)

        guard token == searchToken else { return }
        // Les cibles déjà paginées localement (`conversationTargets`) SONT
        // forcément atteignables — l'endpoint de liste ne rend que les
        // conversations de l'utilisateur — donc les correspondances locales
        // AUGMENTENT les résultats distants plutôt que d'être écrasées : une
        // recherche serveur qui échoue (elle rend `[]`, indiscernable d'un
        // « aucun résultat ») ne fait alors disparaître aucune conversation
        // déjà à l'écran. Même sémantique que le jumeau web
        // (`forward-message-modal.tsx` : filtre local sur le titre, fusionné —
        // jamais un remplacement). La déduplication par id de
        // `ForwardTargetMerge.merge` absorbe le doublon quand une conversation
        // est trouvée à la fois localement et à distance.
        //
        // Ce repli comblait AUSSI un faux négatif du filtre d'appartenance
        // (participants tronqués à 5) — supprimé à la source depuis que le
        // serveur déclare `isMember`.
        let localMatches = conversationTargets.filter { $0.title.localizedCaseInsensitiveContains(trimmed) }
        targets = ForwardTargetMerge.merge(conversations: conversations + localMatches, contacts: contacts)
    }

    private func fetchSearchConversationTargets(query: String, currentUserId: String) async -> [ForwardTarget] {
        do {
            let apiConversations = try await conversationService.search(query: query)
            return apiConversations
                .filter { conversation in
                    ForwardTargetMerge.isReachableConversation(
                        type: conversation.type,
                        participantUserIds: (conversation.participants ?? []).compactMap(\.userId),
                        currentUserId: currentUserId,
                        isMember: conversation.isMember
                    )
                }
                .map { $0.toConversation(currentUserId: currentUserId) }
                .map(Self.makeTarget)
        } catch {
            return []
        }
    }

    private func fetchSearchContactTargets(query: String, currentUserId: String) async -> [ForwardTarget] {
        async let friendTargets = fetchFriendContactTargets(query: query, currentUserId: currentUserId)
        async let directoryTargets = fetchDirectoryContactTargets(query: query)
        let (friends, directory) = await (friendTargets, directoryTargets)
        return friends + directory
    }

    /// Amis acceptés (dans les deux sens, `FriendService.allFriendRequests`
    /// — Task 2), filtrés CÔTÉ CLIENT sur `query` : cet endpoint n'a pas de
    /// recherche texte serveur (contrairement à `ContactDirectoryService.list`
    /// et `ConversationService.search`). Même sémantique que
    /// `ContactsListViewModel.filteredFriends`
    /// (`apps/ios/Meeshy/Features/Contacts/ContactsListViewModel.swift:34-37`)
    /// — sans ce filtre, taper 2 caractères quelconques remontait la liste
    /// COMPLÈTE des amis mêlée aux vrais résultats.
    private func fetchFriendContactTargets(query: String, currentUserId: String) async -> [ForwardTarget] {
        do {
            // Le filtre étant CLIENT, une seule page rendrait inatteignable
            // tout ami au-delà d'elle (Volet C : « paginé jusqu'à épuisement »).
            var collected: [FriendRequest] = []
            var offset = 0
            while collected.count < Self.friendsFetchCap {
                let page = try await friendService.allFriendRequests(
                    status: "accepted",
                    offset: offset,
                    limit: Self.friendsPageSize
                )
                collected.append(contentsOf: page.data)
                // `hasMore` peut manquer sur un gateway antérieur à la Task 1 :
                // le repli sur la taille de page garde le comportement correct.
                let more = page.pagination?.hasMore ?? (page.data.count == Self.friendsPageSize)
                if !more || page.data.isEmpty { break }
                offset += Self.friendsPageSize
            }
            let lowered = query.lowercased()
            return collected.compactMap { request -> ForwardTarget? in
                guard request.status == "accepted",
                      let other = Self.otherParty(of: request, currentUserId: currentUserId) else {
                    return nil
                }
                guard other.username.lowercased().contains(lowered)
                    || other.name.lowercased().contains(lowered) else {
                    return nil
                }
                return Self.makeContactTarget(from: other)
            }
        } catch {
            return []
        }
    }

    /// Répertoire (`ContactDirectoryService.list`) filtré `query` côté
    /// serveur, restreint aux contacts qui ont un compte Meeshy (`.meeshy`) —
    /// un contact hors plateforme n'a pas de `userId` vers qui transférer.
    private func fetchDirectoryContactTargets(query: String) async -> [ForwardTarget] {
        do {
            let page = try await contactDirectoryService.list(
                offset: 0,
                limit: Self.contactSearchLimit,
                filter: .meeshy,
                query: query
            )
            return page.data.compactMap(Self.makeContactTarget(from:))
        } catch {
            return []
        }
    }

    // MARK: - Projection pure

    /// `userId` = `participantUserId` pour un `direct`, `nil` sinon (un
    /// groupe n'a pas de personne unique à absorber).
    private static func makeTarget(from conversation: MeeshyConversation) -> ForwardTarget {
        ForwardTarget(
            id: "conv:\(conversation.id)",
            kind: .conversation,
            conversationId: conversation.id,
            userId: conversation.type == .direct ? conversation.participantUserId : nil,
            title: conversation.displayName,
            subtitle: nil,
            avatarURL: conversation.avatar ?? conversation.participantAvatarURL
        )
    }

    private static func makeContactTarget(from user: FriendRequestUser) -> ForwardTarget {
        ForwardTarget(
            id: "user:\(user.id)",
            kind: .contact,
            conversationId: nil,
            userId: user.id,
            title: user.name,
            subtitle: "@\(user.username)",
            avatarURL: user.avatar
        )
    }

    private static func otherParty(of request: FriendRequest, currentUserId: String) -> FriendRequestUser? {
        if let sender = request.sender, sender.id != currentUserId { return sender }
        if let receiver = request.receiver, receiver.id != currentUserId { return receiver }
        return nil
    }

    private static func makeContactTarget(from contact: DirectoryContact) -> ForwardTarget? {
        guard let user = contact.matchedUser else { return nil }
        return ForwardTarget(
            id: "user:\(user.id)",
            kind: .contact,
            conversationId: nil,
            userId: user.id,
            title: contact.resolvedName,
            subtitle: contact.subtitle,
            avatarURL: user.avatar
        )
    }
}
