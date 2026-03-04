import SwiftUI
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
        case .all: return "Toutes"
        case .unread: return "Non lues"
        case .messages: return "Messages"
        case .reactions: return "Reactions"
        case .mentions: return "Mentions"
        case .social: return "Social"
        case .contacts: return "Contacts"
        case .groups: return "Groupes"
        case .calls: return "Appels"
        case .translations: return "Traductions"
        case .system: return "Systeme"
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
        HStack {
            if viewModel.unreadCount > 0 {
                Button {
                    HapticFeedback.light()
                    Task { await viewModel.markAllRead() }
                } label: {
                    Text("Tout lire")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(hex: "6366F1"))
                }
            } else {
                Color.clear.frame(width: 50, height: 24)
            }

            Spacer()

            Text("Notifications")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if let onDismiss {
                Button {
                    HapticFeedback.light()
                    onDismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(theme.textMuted.opacity(0.6))
                }
            } else {
                Color.clear.frame(width: 50, height: 24)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
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

                            Divider()
                                .background(theme.textMuted.opacity(0.1))
                        }

                        if viewModel.hasMore {
                            ProgressView()
                                .padding()
                                .onAppear {
                                    Task { await viewModel.loadMore() }
                                }
                        }
                    }
                }
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
                .tint(Color(hex: "6366F1"))
            Text("Chargement...")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }

    private var emptyState: some View {
        let category = viewModel.selectedCategory
        let emptyMessage: String = {
            switch category {
            case .all: return "Aucune notification"
            case .unread: return "Aucune notification non lue"
            case .messages: return "Aucune notification de message"
            case .reactions: return "Aucune reaction"
            case .mentions: return "Aucune mention"
            case .social: return "Aucune notification sociale"
            case .contacts: return "Aucune notification de contact"
            case .groups: return "Aucune notification de groupe"
            case .calls: return "Aucun appel manque"
            case .translations: return "Aucune traduction"
            case .system: return "Aucune notification systeme"
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

            Text("Vos notifications apparaitront ici")
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
    private let limit = 20

    var filteredNotifications: [APINotification] {
        guard selectedCategory != .all && selectedCategory != .unread else {
            return notifications
        }
        return notifications.filter { selectedCategory.matches($0) }
    }

    func loadInitial() async {
        isLoading = true
        offset = 0
        do {
            let response = try await NotificationService.shared.list(
                offset: 0, limit: limit, unreadOnly: unreadOnly
            )
            notifications = response.data
            unreadCount = response.unreadCount ?? 0
            hasMore = response.pagination?.hasMore ?? false
            offset = limit
        } catch {
            // Silently fail - UI shows empty state
        }
        isLoading = false
    }

    func loadMore() async {
        guard !isLoading, hasMore else { return }
        isLoading = true
        do {
            let response = try await NotificationService.shared.list(
                offset: offset, limit: limit, unreadOnly: unreadOnly
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
            if let _ = notifications.firstIndex(where: { $0.id == notification.id }) {
                await loadInitial()
            }
        } catch {}
    }

    func markAllRead() async {
        do {
            _ = try await NotificationService.shared.markAllAsRead()
            await loadInitial()
        } catch {}
    }

    func deleteNotification(_ notification: APINotification) async {
        do {
            try await NotificationService.shared.delete(notificationId: notification.id)
            notifications.removeAll { $0.id == notification.id }
            if !notification.isRead { unreadCount = max(0, unreadCount - 1) }
        } catch {}
    }
}
