import SwiftUI
import Combine
import MeeshySDK

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
                .incomingCall, .callEnded, .legacyCallIncoming
            ]
        case .translations:
            return [
                .translationCompleted, .translationReady, .legacyTranslationReady,
                .transcriptionCompleted, .voiceCloneReady
            ]
        case .system:
            return [
                .securityAlert, .loginNewDevice, .legacySystemAlert, .passwordChanged, .twoFactorEnabled, .twoFactorDisabled,
                .system, .maintenance, .updateAvailable,
                .achievementUnlocked, .legacyAchievementUnlocked, .streakMilestone, .badgeEarned,
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

    @State private var scrollOffset: CGFloat = 0

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
            CollapsibleHeader(
                title: String(localized: "notifications.title", defaultValue: "Notifications", bundle: .module),
                scrollOffset: scrollOffset,
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
            viewModel.selectedCategory = category
            viewModel.unreadOnly = category == .unread
            Task { await viewModel.loadInitial() }
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

    private var filteredNotifications: [APINotification] {
        viewModel.filteredNotifications
    }

    private var notificationList: some View {
        Group {
            if viewModel.isLoading && viewModel.notifications.isEmpty {
                loadingState
            } else if filteredNotifications.isEmpty {
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
                                }
                            )
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
                .onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }
                .refreshable {
                    await viewModel.loadInitial()
                }
            }
        }
    }

    // MARK: - States

    private var loadingState: some View {
        VStack(spacing: 12) {
            Spacer()
            ProgressView()
                .tint(brandColor)
            Text(String(localized: "notifications.loading", defaultValue: "Chargement...", bundle: .module))
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }

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
    @Published var notifications: [APINotification] = []
    @Published var unreadCount: Int = 0
    @Published var isLoading = false
    @Published var hasMore = false
    @Published var unreadOnly = false
    @Published var selectedCategory: NotificationCategory = .all

    private var offset = 0
    private let limit = 30
    private var cancellables = Set<AnyCancellable>()
    private var refreshTask: Task<Void, Never>?

    var filteredNotifications: [APINotification] {
        guard selectedCategory != .all && selectedCategory != .unread else {
            return notifications
        }
        return notifications.filter { selectedCategory.matches($0) }
    }

    init() {
        subscribeToRealTimeEvents()
    }

    // MARK: - Real-Time Socket Subscriptions

    private func subscribeToRealTimeEvents() {
        let manager = NotificationManager.shared

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

        manager.notificationWasDeleted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] notificationId in
                self?.notifications.removeAll { $0.id == notificationId }
            }
            .store(in: &cancellables)
    }

    private func scheduleRefresh() {
        refreshTask?.cancel()
        refreshTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled else { return }
            await refreshFromAPI()
        }
    }

    private func handleReadEvent(_ notificationId: String) {
        guard let idx = notifications.firstIndex(where: { $0.id == notificationId }) else { return }
        let wasUnread = !notifications[idx].isRead
        notifications[idx] = notifications[idx].withReadState(true)
        if wasUnread { unreadCount = max(0, unreadCount - 1) }
    }

    // MARK: - Loading

    func loadInitial() async {
        offset = 0

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
            let response = try await NotificationService.shared.list(
                offset: 0, limit: limit, unreadOnly: false
            )
            notifications = response.data
            unreadCount = response.unreadCount ?? 0
            hasMore = response.pagination?.hasMore ?? false
            offset = limit
            await CacheCoordinator.shared.notifications.save(response.data, for: "all")
        } catch {}
        isLoading = false
    }

    func loadMore() async {
        guard !isLoading, hasMore else { return }
        isLoading = true
        do {
            let response = try await NotificationService.shared.list(
                offset: offset, limit: limit, unreadOnly: false
            )
            notifications.append(contentsOf: response.data)
            hasMore = response.pagination?.hasMore ?? false
            offset += limit
        } catch {}
        isLoading = false
    }

    func markRead(_ notification: APINotification) async {
        guard !notification.isRead else { return }
        do {
            try await NotificationService.shared.markAsRead(notificationId: notification.id)
            handleReadEvent(notification.id)
        } catch {}
    }

    func markAllRead() async {
        await NotificationManager.shared.markAllAsRead()
        unreadCount = 0
        await loadInitial()
    }

    func deleteNotification(_ notification: APINotification) async {
        do {
            try await NotificationService.shared.delete(notificationId: notification.id)
            notifications.removeAll { $0.id == notification.id }
            if !notification.isRead { unreadCount = max(0, unreadCount - 1) }
        } catch {}
    }
}
