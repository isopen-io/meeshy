import SwiftUI
import Combine
import MeeshySDK
import os

// MARK: - NotificationListView

public struct NotificationListView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = NotificationListViewModel()

    public var onNotificationTap: ((APINotification) -> Void)?
    public var onDismiss: (() -> Void)?
    /// Exécute un geste de rangée (`NotificationQuickAction`) et dit s'il a
    /// abouti. `nil` : aucune rangée ne propose de geste.
    public var onQuickAction: (@MainActor (NotificationQuickAction) async -> Bool)?

    @State private var scrollRelay = ScrollOffsetRelay()
    /// Les personnes à qui « Se connecter » est parti depuis cet écran —
    /// posé AVANT l'aller-retour, retiré s'il échoue.
    @State private var connectRequestedIds: Set<String> = []

    private let brandColor = MeeshyColors.indigo500

    public init(
        onNotificationTap: ((APINotification) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil,
        onQuickAction: (@MainActor (NotificationQuickAction) async -> Bool)? = nil
    ) {
        self.onNotificationTap = onNotificationTap
        self.onDismiss = onDismiss
        self.onQuickAction = onQuickAction
    }

    public var body: some View {
        VStack(spacing: 0) {
            header
            filterBar
            notificationList
        }
        .background(theme.backgroundGradient.ignoresSafeArea())
        .task { await viewModel.loadInitial() }
    }

    // MARK: - Gestes de rangée (#8105)

    /// « Écrire » ouvre ailleurs, la notification est donc lue ; « Se
    /// connecter » s'affiche envoyé tout de suite et se défait s'il échoue.
    private func runQuickAction(_ action: NotificationQuickAction,
                                on notification: APINotification,
                                perform: @escaping (NotificationQuickAction) async -> Bool) {
        Task {
            await viewModel.markRead(notification)
            guard case .connect(let userId) = action else {
                _ = await perform(action)
                return
            }
            connectRequestedIds.insert(userId)
            if !(await perform(action)) { connectRequestedIds.remove(userId) }
        }
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 0) {
            // Seul ce reader se re-rend au fil du scroll — la racine écrit
            // `scrollRelay.offset` sans s'y abonner (P1-1).
            ScrollOffsetReader(relay: scrollRelay) { offset in
                CollapsibleHeader(
                    title: String(localized: "notifications.title", defaultValue: "Notifications", bundle: .module),
                    scrollOffset: offset,
                    onBack: { onDismiss?() },
                    titleColor: theme.textPrimary,
                    backArrowColor: brandColor,
                    backgroundColor: theme.backgroundPrimary,
                    trailing: {
                        if viewModel.unreadCount > 0 {
                            Button {
                                HapticFeedback.light()
                                Task { await viewModel.markAllRead() }
                            } label: {
                                Text(String(localized: "notifications.markAllRead", defaultValue: "Tout lire", bundle: .module))
                                    .font(.system(size: MeeshyFont.subheadSize, weight: .semibold))
                                    .foregroundColor(brandColor)
                            }
                        } else {
                            EmptyView()
                        }
                    }
                )
            }

            if viewModel.unreadCount > 0 {
                Text("\(viewModel.unreadCount) non lue\(viewModel.unreadCount > 1 ? "s" : "")")
                    .font(.system(size: MeeshyFont.footnoteSize))
                    .foregroundColor(brandColor)
                    .padding(.bottom, MeeshySpacing.xs)
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(NotificationCategory.allCases, id: \.self) { category in
                    filterChip(category: category)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.sm)
        }
    }

    private func filterChip(category: NotificationCategory) -> some View {
        let isSelected = viewModel.selectedCategory == category
        let chipColor = category.color

        return Button {
            HapticFeedback.light()
            // #7169 puis #8958 — la puce s'allume et la liste se redessine
            // TOUT DE SUITE, depuis ce qui est déjà chargé ; la page serveur
            // de la catégorie arrive ensuite, sans spinner (`select`).
            Task { await viewModel.select(category) }
        } label: {
            HStack(spacing: MeeshySpacing.xs) {
                Image(systemName: category.icon)
                    .font(.system(size: MeeshyIconSize.xxs, weight: .bold))
                Text(category.label)
                    .font(.system(size: MeeshyFont.smallSize, weight: .semibold))
            }
            .foregroundColor(isSelected ? .white : Color(hex: chipColor))
            .padding(.horizontal, MeeshySpacing.md)
            .padding(.vertical, MeeshySpacing.xsPlus)
            .background(
                Capsule()
                    .fill(isSelected ? Color(hex: chipColor) : Color(hex: chipColor).opacity(MeeshyOpacity.light))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    private var filteredNotifications: [APINotification] {
        viewModel.filteredNotifications
    }

    private var notificationList: some View {
        Group {
            if viewModel.isLoading && viewModel.notifications.isEmpty {
                NotificationListSkeleton()
            } else if viewModel.loadDidFail && viewModel.notifications.isEmpty {
                // La panne AVANT le vide : sans cet ordre, une erreur réseau
                // se lit « Aucune notification ».
                NotificationListErrorState(brandColor: brandColor) {
                    Task { await viewModel.loadInitial() }
                }
            } else if filteredNotifications.isEmpty {
                emptyState
            } else {
                List {
                    // Le lecteur de décalage du chemin iOS 16–17 : une ligne de
                    // hauteur nulle, en tête.
                    GeometryReader { geo in
                        Color.clear.preference(
                            key: ScrollOffsetPreferenceKey.self,
                            value: geo.frame(in: .named("scroll")).minY
                        )
                    }
                    .frame(height: 0)
                    .notificationListRow()

                    ForEach(filteredNotifications) { notification in
                        NotificationRowView(
                            notification: notification,
                            onTap: {
                                Task { await viewModel.markRead(notification) }
                                onNotificationTap?(notification)
                            },
                            onMarkRead: {
                                Task { await viewModel.markRead(notification) }
                            },
                            onDelete: {
                                Task { await viewModel.deleteNotification(notification) }
                            },
                            onQuickAction: onQuickAction.map { perform in
                                { action in runQuickAction(action, on: notification, perform: perform) }
                            },
                            isConnectRequested: notification.senderId.map(connectRequestedIds.contains) ?? false,
                            isFriend: notification.senderId.map { FriendshipCache.shared.isFriend($0) } ?? false
                        )
                        .equatable()
                        .notificationListRow()
                        // #8958 — le glissement vers la gauche VIDE la ligne.
                        // Il vit ici et non dans la rangée : `.swipeActions` n'a
                        // d'effet que dans une `List`.
                        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                            Button(role: .destructive) {
                                Task { await viewModel.deleteNotification(notification) }
                            } label: {
                                Label(
                                    String(localized: "notifications.swipe.delete", defaultValue: "Supprimer", bundle: .module),
                                    systemImage: "trash.fill"
                                )
                            }
                            if !notification.isRead {
                                Button {
                                    Task { await viewModel.markRead(notification) }
                                } label: {
                                    Label(
                                        String(localized: "notifications.swipe.read", defaultValue: "Lu", bundle: .module),
                                        systemImage: "envelope.open.fill"
                                    )
                                }
                                .tint(brandColor)
                            }
                        }
                    }

                    if viewModel.hasMore {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                            .notificationListRow()
                            .onAppear {
                                Task { await viewModel.loadMore() }
                            }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .environment(\.defaultMinListRowHeight, 0)
                .animation(.easeInOut(duration: 0.25), value: filteredNotifications.map(\.id))
                .coordinateSpace(name: "scroll")
                .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }   // iOS 16–17
                .trackScrollContentOffset { scrollRelay.offset = -$0 }                            // iOS 18+ (preference path is dead there)
                .refreshable {
                    await viewModel.loadInitial()
                }
            }
        }
    }

    // MARK: - States
    //
    // Le squelette et l'état d'erreur vivent dans `NotificationListStates.swift`
    // — voir son en-tête pour ce qu'ils remplacent (un spinner sur cache vide,
    // et une panne qui se lisait « Aucune notification »).

    private var emptyState: some View {
        let category = viewModel.selectedCategory
        let emptyMessage: String = {
            switch category {
            case .all: return String(localized: "notifications.empty.all", defaultValue: "Aucune notification", bundle: .module)
            case .unread: return String(localized: "notifications.empty.unread", defaultValue: "Aucune notification non lue", bundle: .module)
            case .messages: return String(localized: "notifications.empty.messages", defaultValue: "Aucune notification de message", bundle: .module)
            case .reactions: return String(localized: "notifications.empty.reactions", defaultValue: "Aucune reaction", bundle: .module)
            case .mentions: return String(localized: "notifications.empty.mentions", defaultValue: "Aucune mention", bundle: .module)
            case .social: return String(localized: "notifications.empty.social", defaultValue: "Aucune notification sociale", bundle: .module)
            case .engagement: return String(localized: "notifications.empty.engagement", defaultValue: "Aucun engagement", bundle: .module)
            case .contacts: return String(localized: "notifications.empty.contacts", defaultValue: "Aucune notification de contact", bundle: .module)
            case .groups: return String(localized: "notifications.empty.groups", defaultValue: "Aucune notification de groupe", bundle: .module)
            case .calls: return String(localized: "notifications.empty.calls", defaultValue: "Aucun appel manque", bundle: .module)
            case .translations: return String(localized: "notifications.empty.translations", defaultValue: "Aucune traduction", bundle: .module)
            case .system: return String(localized: "notifications.empty.system", defaultValue: "Aucune notification systeme", bundle: .module)
            }
        }()

        return VStack(spacing: MeeshySpacing.lg) {
            Spacer()
            Image(systemName: category.icon)
                .font(.system(size: MeeshyIconSize.hero))
                .foregroundColor(Color(hex: category.color).opacity(0.4))

            Text(emptyMessage)
                .font(.system(size: MeeshyFont.calloutSize, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "notifications.empty.subtitle", defaultValue: "Vos notifications apparaitront ici", bundle: .module))
                .font(.system(size: MeeshyFont.subheadSize))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }
}

private extension View {
    /// Une ligne de la cloche dans la `List` : bord à bord, sans séparateur ni
    /// fond de cellule — la rangée dessine elle-même son fond de non-lu.
    func notificationListRow() -> some View {
        listRowInsets(EdgeInsets())
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
    }
}

// MARK: - ViewModel

@MainActor
final class NotificationListViewModel: ObservableObject {
    /// L'ancre de reprise servie par la page précédente — `nil` en fin de liste ou sur un gateway antérieur.
    private var nextCursor: String?
    @Published var notifications: [APINotification] = []
    @Published var isLoading = false
    @Published var hasMore = false
    // `unreadOnly` a été RETIRÉ (#7169) : il était écrit par la puce de filtre
    // et lu par personne — les deux appels de liste passent `unreadOnly: false`
    // EN DUR. Un `@Published` sans lecteur fait republier l'objet, donc
    // re-rendre ses abonnés, sans porter aucune information.
    @Published private(set) var selectedCategory: NotificationCategory = .all

    /// Le dernier chargement RÉSEAU a échoué (#7000). L'erreur était avalée
    /// dans un `Logger.error` : la vue retombait sur son état VIDE, et une
    /// panne s'affichait « Aucune notification ». Un booléen suffit — le
    /// message rendu ne cite pas l'erreur technique, qui n'apprendrait rien à
    /// l'utilisateur et fuiterait des détails d'implémentation.
    @Published var loadDidFail = false

    var unreadCount: Int { NotificationToastManager.shared.unreadCount }

    private var offset = 0
    private let limit = 30
    private var cancellables = Set<AnyCancellable>()
    // `nonisolated(unsafe)` pour que le `deinit` (nonisolated) puisse
    // l'annuler : le task debounce 500 ms capture `self` fortement et
    // prolongeait sinon la vie du VM d'un sleep + un aller-retour API
    // après fermeture de l'écran.
    private nonisolated(unsafe) var refreshTask: Task<Void, Never>?

    deinit {
        refreshTask?.cancel()
    }

    /// Ce que la catégorie choisie affiche : la page serveur de la catégorie,
    /// passée au crible de la même loi (`accepts`) — une ligne lue ou
    /// arrivée par le socket depuis le chargement se range sans aller-retour.
    var filteredNotifications: [APINotification] {
        notifications.filter(selectedCategory.accepts)
    }

    private let service: NotificationServiceProviding

    init(service: NotificationServiceProviding = NotificationService.shared) {
        self.service = service
        subscribeToRealTimeEvents()
    }

    // MARK: - Real-Time Socket Subscriptions

    private func subscribeToRealTimeEvents() {
        let manager = NotificationToastManager.shared

        // #7169 — LE COMPTEUR SEUL, pas tout ce que le gestionnaire publie.
        //
        // Relayer `objectWillChange` re-rendait la cloche ENTIÈRE à chaque
        // apparition ET disparition de bannière — un contenu qu'elle ne
        // dessine pas. Le seul état du gestionnaire qu'elle LIT est
        // `unreadCount` (cf. la propriété calculée plus haut) ; les huit
        // autres signaux ont déjà leur abonnement nommé juste en dessous.
        // `removeDuplicates` parce que `refreshUnreadCount` rend très souvent
        // la même valeur, et que `@Published` republie sans comparer.
        manager.$unreadCount
            .removeDuplicates()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.objectWillChange.send()
            }
            .store(in: &cancellables)

        manager.newNotificationReceived
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.scheduleRefresh()
            }
            .store(in: &cancellables)

        manager.notificationMarkedRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notificationId in
                self?.handleReadEvent(notificationId)
            }
            .store(in: &cancellables)

        manager.conversationNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] conversationId in
                self?.handleConversationReadEvent(conversationId)
            }
            .store(in: &cancellables)

        manager.postNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] postId in
                self?.handlePostReadEvent(postId)
            }
            .store(in: &cancellables)

        manager.typeNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] types in
                guard let self else { return }
                self.notifications = NotificationCachePatch.markingRead(
                    self.notifications, scope: .types(types)
                )
            }
            .store(in: &cancellables)

        // #7000 — le canal qui manquait. `republishRead(.all)` faisait `break`
        // faute d'abonné : une cloche déjà montée gardait ses lignes non lues
        // pendant qu'un autre appareil venait de tout marquer.
        manager.allNotificationsRead
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                guard let self else { return }
                self.notifications = NotificationCachePatch.markingRead(
                    self.notifications, scope: .all
                )
            }
            .store(in: &cancellables)

        // #7000 — le serveur a refusé un marquage optimiste : la ligne
        // redevient non lue à l'écran, et l'utilisateur l'apprend. Sans ce
        // retour, l'optimisme deviendrait un MENSONGE durable.
        manager.notificationReadRolledBack
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notificationId in
                self?.handleReadRollback(notificationId)
            }
            .store(in: &cancellables)

        manager.notificationWasDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notificationId in
                self?.notifications.removeAll { $0.id == notificationId }
            }
            .store(in: &cancellables)
    }

    private func scheduleRefresh() {
        refreshTask?.cancel()
        // `[weak self]` obligatoire : une capture forte rendait le `deinit`
        // (et donc son cancel) inatteignable pendant le sleep + l'appel API.
        refreshTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(0.5))
            guard !Task.isCancelled else { return }
            await self?.refreshFromAPI()
        }
    }

    private func handleReadEvent(_ notificationId: String) {
        guard let idx = notifications.firstIndex(where: { $0.id == notificationId }) else { return }
        notifications[idx] = notifications[idx].withReadState(true)
    }

    /// Le rollback d'un marquage optimiste — la transformation PURE inverse,
    /// plus le signal à l'utilisateur.
    private func handleReadRollback(_ notificationId: String) {
        notifications = NotificationCachePatch.markingUnread(notifications, id: notificationId)
        Self.announceFailure(
            String(
                localized: "notifications.markRead.failed",
                defaultValue: "Impossible de marquer cette notification lue",
                bundle: .module
            )
        )
    }

    /// Le pont de toast que le SDK et l'app partagent déjà
    /// (`FeedbackToastManager.observeSDKToasts`). MeeshyUI ne peut pas
    /// atteindre `FeedbackToastManager`, qui vit dans la cible app.
    static func announceFailure(_ message: String) {
        NotificationCenter.default.post(
            name: Notification.Name("meeshy.showToast"),
            object: nil,
            userInfo: ["message": message, "isSuccess": false]
        )
    }

    /// Marque localement toutes les lignes liées à une conversation comme lues
    /// (ouverture de la conversation → contenu consommé). Mise à jour optimiste :
    /// le compteur autoritatif est ensuite recalé par `notification:counts`.
    private func handleConversationReadEvent(_ conversationId: String) {
        notifications = NotificationCachePatch.markingRead(
            notifications, scope: .conversation(id: conversationId)
        )
    }

    /// Pendant du précédent pour un contenu social consommé (story ouverte,
    /// détail de post). Même transformation pure que celle appliquée au cache
    /// durable — une seule règle, deux surfaces.
    private func handlePostReadEvent(_ postId: String) {
        notifications = NotificationCachePatch.markingRead(
            notifications, scope: .post(id: postId)
        )
    }

    // MARK: - Loading

    /// Seule la liste « Toutes » est persistée : c'est elle que le manager
    /// tient à jour (lu, supprimé, reçu). Une catégorie s'affiche d'abord
    /// depuis elle, filtrée, puis depuis sa propre page serveur.
    private static let persistedCacheKey = "all"

    func loadInitial() async {
        offset = 0
        nextCursor = nil

        // Un réessai après panne repart d'une ardoise propre : sinon l'état
        // d'erreur resterait affiché le temps du chargement, sous le squelette.
        loadDidFail = false

        let cached = await CacheCoordinator.shared.notifications.load(for: Self.persistedCacheKey)
        switch cached {
        case .fresh(let data, _) where selectedCategory == .all:
            notifications = data
            offset = data.count
            hasMore = data.count >= limit
            return
        case .fresh(let data, _), .stale(let data, _):
            showCachedPreview(data)
            await refreshFromAPI()
        case .expired, .empty:
            isLoading = notifications.isEmpty
            await refreshFromAPI()
        }
    }

    /// Change de catégorie (#8958). La liste se redessine TOUT DE SUITE depuis
    /// ce qui est en mémoire ou en cache, puis la passerelle sert la page
    /// de la catégorie — celle qui contient aussi ses lignes plus anciennes
    /// que la première page « Toutes ».
    func select(_ category: NotificationCategory) async {
        guard category != selectedCategory else { return }
        let preview = notifications
        selectedCategory = category
        offset = 0
        nextCursor = nil
        hasMore = false
        loadDidFail = false
        notifications = preview.filter(category.accepts)
        if notifications.isEmpty {
            switch await CacheCoordinator.shared.notifications.load(for: Self.persistedCacheKey) {
            case .fresh(let data, _), .stale(let data, _):
                showCachedPreview(data)
            case .expired, .empty:
                break
            }
        }
        isLoading = notifications.isEmpty
        await refreshFromAPI()
    }

    private func showCachedPreview(_ data: [APINotification]) {
        let rows = data.filter(selectedCategory.accepts)
        notifications = rows
        offset = selectedCategory == .all ? rows.count : 0
    }

    private func refreshFromAPI() async {
        let category = selectedCategory
        let query = category.serverQuery
        do {
            // Sans rang ni curseur : la première page KEYSET (#4901) — plus de
            // `count()` payé pour un total que cet écran n'affiche pas.
            let response = try await service.list(
                offset: nil,
                cursor: nil,
                limit: limit,
                unreadOnly: query.unreadOnly,
                types: query.types,
                hideReadTypes: query.hideReadTypes
            )
            // La réponse d'une catégorie quittée entre-temps ne s'affiche pas.
            guard category == selectedCategory else { return }
            notifications = response.data
            hasMore = response.pagination?.hasMore ?? false
            nextCursor = response.pagination?.nextCursor
            offset = response.data.count
            loadDidFail = false
            isLoading = false
            if category == .all {
                try await CacheCoordinator.shared.notifications.save(response.data, for: Self.persistedCacheKey)
            }
            await NotificationToastManager.shared.refreshUnreadCount()
        } catch {
            Logger.notifications.error("Failed to refresh notifications: \(error.localizedDescription)")
            guard category == selectedCategory else { return }
            // L'échec doit ATTEINDRE l'écran (#7000) : journalisé et oublié,
            // il laissait la vue rendre son état vide.
            loadDidFail = true
            isLoading = false
        }
    }

    func loadMore() async {
        guard !isLoading, hasMore else { return }
        let category = selectedCategory
        let query = category.serverQuery
        isLoading = true
        defer { isLoading = false }
        do {
            // LE CURSEUR QUAND IL EST LÀ (#4901) — stable sous insertion : une
            // notification arrivée en tête entre deux pages ne fait ni doublon
            // ni ligne sautée. Le RANG reste le repli d'un gateway antérieur
            // qui ne servirait pas d'ancre (dimension 9), jamais le défaut.
            let response = try await service.list(
                offset: nextCursor == nil ? offset : nil,
                cursor: nextCursor,
                limit: limit,
                unreadOnly: query.unreadOnly,
                types: query.types,
                hideReadTypes: query.hideReadTypes
            )
            guard category == selectedCategory else { return }
            let known = Set(notifications.map(\.id))
            notifications.append(contentsOf: response.data.filter { !known.contains($0.id) })
            hasMore = response.pagination?.hasMore ?? false
            nextCursor = response.pagination?.nextCursor
            offset += response.data.count
        } catch {
            Logger.notifications.error("Failed to load more notifications: \(error.localizedDescription)")
        }
    }

    /// Passe par le manager : lui seul écrit le cache durable ET publie vers les
    /// autres surfaces. L'appel direct au service ne mutait que cette copie
    /// mémoire — le store GRDB gardait `isRead:false` et la ligne repartait non
    /// lue à la réouverture de la cloche (`loadInitial` lit le cache d'abord).
    func markRead(_ notification: APINotification) async {
        guard !notification.isRead else { return }
        await NotificationToastManager.shared.markRead(notificationId: notification.id)
    }

    /// « Tout lire » ne patche QU'EN SUCCÈS (#7000).
    ///
    /// Le patch était inconditionnel derrière l'`await` : un refus serveur
    /// affichait quand même toutes les lignes lues, au-dessus d'un compteur
    /// que le manager avait — lui — correctement laissé en place. Deux
    /// vérités à l'écran, dont la fausse était la plus visible. La
    /// republication `.all` du manager suffirait, mais on garde le patch
    /// local : un geste de l'utilisateur ne se paie pas un aller-retour de
    /// publisher pour se voir.
    func markAllRead() async {
        guard await NotificationToastManager.shared.markAllAsRead() else {
            Self.announceFailure(
                String(
                    localized: "notifications.markAllRead.failed",
                    defaultValue: "Impossible de tout marquer comme lu",
                    bundle: .module
                )
            )
            return
        }
        notifications = NotificationCachePatch.markingRead(notifications, scope: .all)
    }

    /// Le glissement vide la ligne TOUT DE SUITE (#8958) : une `List` dont la
    /// ligne glissée attend le réseau pour partir la laisse revenir en place
    /// le temps de l'aller-retour. Le manager retire ensuite la ligne du cache
    /// durable ; s'il échoue, elle revient à sa place et l'utilisateur
    /// l'apprend.
    func deleteNotification(_ notification: APINotification) async {
        guard let index = notifications.firstIndex(where: { $0.id == notification.id }) else { return }
        let removed = notifications.remove(at: index)
        guard await NotificationToastManager.shared.delete(notificationId: notification.id) else {
            if !notifications.contains(where: { $0.id == removed.id }) {
                notifications.insert(removed, at: min(index, notifications.count))
            }
            Self.announceFailure(
                String(
                    localized: "notifications.delete.failed",
                    defaultValue: "Impossible de supprimer cette notification",
                    bundle: .module
                )
            )
            return
        }
    }
}

// MARK: - Logger

private extension Logger {
    static let notifications = Logger(subsystem: "me.meeshy.sdk", category: "notifications")
}
