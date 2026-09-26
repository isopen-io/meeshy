import SwiftUI
import Combine
import MeeshySDK
import os

// MARK: - Notification Category Filter

enum NotificationCategory: String, CaseIterable {
    case all
    case unread
    case messages
    case reactions
    case mentions
    case social
    case contacts
    case groups
    case calls
    case translations
    case system

    var label: String {
        switch self {
        case .all: return String(localized: "notifications.category.all", defaultValue: "Toutes", bundle: .module)
        case .unread: return String(localized: "notifications.category.unread", defaultValue: "Non lues", bundle: .module)
        case .messages: return String(localized: "notifications.category.messages", defaultValue: "Messages", bundle: .module)
        case .reactions: return String(localized: "notifications.category.reactions", defaultValue: "Reactions", bundle: .module)
        case .mentions: return String(localized: "notifications.category.mentions", defaultValue: "Mentions", bundle: .module)
        case .social: return String(localized: "notifications.category.social", defaultValue: "Social", bundle: .module)
        case .contacts: return String(localized: "notifications.category.contacts", defaultValue: "Contacts", bundle: .module)
        case .groups: return String(localized: "notifications.category.groups", defaultValue: "Groupes", bundle: .module)
        case .calls: return String(localized: "notifications.category.calls", defaultValue: "Appels", bundle: .module)
        case .translations: return String(localized: "notifications.category.translations", defaultValue: "Traductions", bundle: .module)
        case .system: return String(localized: "notifications.category.system", defaultValue: "Systeme", bundle: .module)
        }
    }

    var icon: String {
        switch self {
        case .all: return "bell.fill"
        case .unread: return "circle.fill"
        case .messages: return "bubble.left.fill"
        case .reactions: return "heart.fill"
        case .mentions: return "at"
        case .social: return "hand.thumbsup.fill"
        case .contacts: return "person.badge.plus"
        case .groups: return "person.3.fill"
        case .calls: return "phone.fill"
        case .translations: return "globe"
        case .system: return "gear"
        }
    }

    // Categorical filter palette: each notification category keeps a distinct
    // hue so the filter chips read as a colour-coded set, not brand chrome.
    // Treated as one ladder (arbitrated separately) — do not migrate piecemeal.
    var color: String {
        switch self {
        case .all: return "6366F1"
        case .unread: return "FF6B6B"
        case .messages: return "3498DB"
        case .reactions: return "FF6B6B"
        case .mentions: return "9B59B6"
        case .social: return "F8B500"
        case .contacts: return "4ECDC4"
        case .groups: return "F8B500"
        case .calls: return "E91E63"
        case .translations: return "08D9D6"
        case .system: return "6366F1"
        }
    }

    var matchingTypes: Set<MeeshyNotificationType> {
        switch self {
        case .all, .unread:
            return Set(MeeshyNotificationType.allCases)
        case .messages:
            return [
                .newMessage, .legacyNewMessage, .messageReply, .reply,
                .messageEdited, .messageDeleted, .messagePinned, .messageForwarded
            ]
        case .reactions:
            return [
                .messageReaction, .reaction, .legacyMessageReaction,
                .postLike, .legacyPostLike, .storyReaction, .statusReaction, .commentLike
            ]
        case .mentions:
            return [
                .userMentioned, .mention, .legacyMention
            ]
        case .social:
            return [
                .postComment, .legacyPostComment, .postRepost, .commentReply,
                .legacyStoryReply
            ]
        case .contacts:
            return [
                .friendRequest, .contactRequest, .legacyFriendRequest,
                .friendAccepted, .contactAccepted, .legacyFriendAccepted,
                .legacyStatusUpdate
            ]
        case .groups:
            return [
                .communityInvite, .communityJoined, .communityLeft,
                .legacyGroupInvite, .legacyGroupJoined, .legacyGroupLeft,
                .memberJoined, .memberLeft, .memberRemoved, .memberPromoted, .memberDemoted, .memberRoleChanged,
                .addedToConversation, .newConversation, .removedFromConversation
            ]
        case .calls:
            return [
                .missedCall, .callDeclined, .legacyCallMissed,
                .incomingCall, .incomingCallAlert, .callEnded, .legacyCallIncoming
            ]
        case .translations:
            return [
                .translationCompleted, .translationReady, .legacyTranslationReady,
                .transcriptionCompleted, .voiceCloneReady
            ]
        case .system:
            return [
                .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
                .system, .maintenance, .updateAvailable, .reportResolved,
                .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .levelUp, .badgeEarned,
                .legacyAffiliateSignup
            ]
        }
    }

    func matches(_ notification: APINotification) -> Bool {
        matchingTypes.contains(notification.notificationType)
    }
}

// MARK: - NotificationListView

public struct NotificationListView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = NotificationListViewModel()

    public var onNotificationTap: ((APINotification) -> Void)?
    public var onDismiss: (() -> Void)?

    @State private var scrollRelay = ScrollOffsetRelay()

    private let brandColor = Color(hex: "6366F1")

    public init(
        onNotificationTap: ((APINotification) -> Void)? = nil,
        onDismiss: (() -> Void)? = nil
    ) {
        self.onNotificationTap = onNotificationTap
        self.onDismiss = onDismiss
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
                                    .font(.system(size: 13, weight: .semibold))
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
                    .font(.system(size: 11))
                    .foregroundColor(brandColor)
                    .padding(.bottom, 4)
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(NotificationCategory.allCases, id: \.self) { category in
                    filterChip(category: category)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    private func filterChip(category: NotificationCategory) -> some View {
        let isSelected = viewModel.selectedCategory == category
        let chipColor = category.color

        return Button {
            HapticFeedback.light()
            // #7169 — AUCUN aller-retour réseau. `filteredNotifications` filtre
            // ce qui est DÉJÀ chargé, sur `selectedCategory` seul : recharger
            // faisait attendre le réseau pour un geste de LECTURE, et hors
            // ligne la liste ne se filtrait pas alors que les données étaient
            // là. `selectedCategory` est `@Published` : la poser suffit à
            // redessiner.
            viewModel.selectedCategory = category
        } label: {
            HStack(spacing: 5) {
                Image(systemName: category.icon)
                    .font(.system(size: 10, weight: .bold))
                Text(category.label)
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundColor(isSelected ? .white : Color(hex: chipColor))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isSelected ? Color(hex: chipColor) : Color(hex: chipColor).opacity(0.12))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    @ViewBuilder
    private var notificationList: some View {
        let filtered = viewModel.filteredNotifications   // UNE descente du filtre par rendu
        if viewModel.isLoading && viewModel.notifications.isEmpty {
            NotificationListSkeleton()
        } else if viewModel.loadDidFail && viewModel.notifications.isEmpty {
            // La panne AVANT le vide : sans cet ordre, une erreur réseau
            // se lit « Aucune notification ».
            NotificationListErrorState(brandColor: brandColor) {
                Task { await viewModel.loadInitial() }
            }
        } else if filtered.isEmpty {
            emptyState
        } else {
            ScrollView {
                GeometryReader { geo in
                    Color.clear.preference(
                        key: ScrollOffsetPreferenceKey.self,
                        value: geo.frame(in: .named("scroll")).minY
                    )
                }
                .frame(height: 0)

                LazyVStack(spacing: 0) {
                    ForEach(filtered) { notification in
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
                            }
                        )
                        .equatable()
                    }

                    if viewModel.hasMore && viewModel.selectedCategory == .all {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                            .onAppear {
                                Task { await viewModel.loadMore() }
                            }
                    }
                }
            }
            .coordinateSpace(name: "scroll")
            .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollRelay.offset = $0 }   // iOS 16–17
            .trackScrollContentOffset { scrollRelay.offset = -$0 }                            // iOS 18+ (preference path is dead there)
            .refreshable {
                await viewModel.loadInitial()
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
            case .contacts: return String(localized: "notifications.empty.contacts", defaultValue: "Aucune notification de contact", bundle: .module)
            case .groups: return String(localized: "notifications.empty.groups", defaultValue: "Aucune notification de groupe", bundle: .module)
            case .calls: return String(localized: "notifications.empty.calls", defaultValue: "Aucun appel manque", bundle: .module)
            case .translations: return String(localized: "notifications.empty.translations", defaultValue: "Aucune traduction", bundle: .module)
            case .system: return String(localized: "notifications.empty.system", defaultValue: "Aucune notification systeme", bundle: .module)
            }
        }()

        return VStack(spacing: 16) {
            Spacer()
            Image(systemName: category.icon)
                .font(.system(size: 48))
                .foregroundColor(Color(hex: category.color).opacity(0.4))

            Text(emptyMessage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text(String(localized: "notifications.empty.subtitle", defaultValue: "Vos notifications apparaitront ici", bundle: .module))
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
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
    @Published var selectedCategory: NotificationCategory = .all

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

    var filteredNotifications: [APINotification] {
        switch selectedCategory {
        case .all:
            return notifications
        case .unread:
            return notifications.filter { !$0.isRead }
        default:
            return notifications.filter { selectedCategory.matches($0) }
        }
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

    func loadInitial() async {
        offset = 0

        // Un réessai après panne repart d'une ardoise propre : sinon l'état
        // d'erreur resterait affiché le temps du chargement, sous le squelette.
        loadDidFail = false

        let cached = await CacheCoordinator.shared.notifications.load(for: "all")
        switch cached {
        case .fresh(let data, _):
            notifications = data
            offset = data.count
            hasMore = data.count >= limit
            return
        case .stale(let data, _):
            notifications = data
            offset = data.count
            await refreshFromAPI()
        case .expired, .empty:
            isLoading = notifications.isEmpty
            await refreshFromAPI()
        }
    }

    private func refreshFromAPI() async {
        do {
            // Sans rang ni curseur : la première page KEYSET (#4901) — plus de
            // `count()` payé pour un total que cet écran n'affiche pas.
            let response = try await service.list(offset: nil, cursor: nil, limit: limit, unreadOnly: false)
            notifications = response.data
            hasMore = response.pagination?.hasMore ?? false
            nextCursor = response.pagination?.nextCursor
            offset = response.data.count
            loadDidFail = false
            try await CacheCoordinator.shared.notifications.save(response.data, for: "all")
            await NotificationToastManager.shared.refreshUnreadCount()
        } catch {
            Logger.notifications.error("Failed to refresh notifications: \(error.localizedDescription)")
            // L'échec doit ATTEINDRE l'écran (#7000) : journalisé et oublié,
            // il laissait la vue rendre son état vide.
            loadDidFail = true
        }
        isLoading = false
    }

    func loadMore() async {
        guard !isLoading, hasMore else { return }
        isLoading = true
        do {
            // LE CURSEUR QUAND IL EST LÀ (#4901) — stable sous insertion : une
            // notification arrivée en tête entre deux pages ne fait ni doublon
            // ni ligne sautée. Le RANG reste le repli d'un gateway antérieur
            // qui ne servirait pas d'ancre (dimension 9), jamais le défaut.
            let response = try await service.list(
                offset: nextCursor == nil ? offset : nil,
                cursor: nextCursor,
                limit: limit,
                unreadOnly: false
            )
            notifications.append(contentsOf: response.data)
            hasMore = response.pagination?.hasMore ?? false
            nextCursor = response.pagination?.nextCursor
            offset += response.data.count
        } catch {
            Logger.notifications.error("Failed to load more notifications: \(error.localizedDescription)")
        }
        isLoading = false
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

    func deleteNotification(_ notification: APINotification) async {
        // Le manager retire la ligne du cache durable puis publie
        // `notificationWasDeleted`, que cette vue écoute déjà — pas de retrait
        // local en double ici.
        await NotificationToastManager.shared.delete(notificationId: notification.id)
    }
}

// MARK: - Logger

private extension Logger {
    static let notifications = Logger(subsystem: "me.meeshy.sdk", category: "notifications")
}
