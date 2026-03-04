import SwiftUI
import MeeshySDK

public struct NotificationListView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = NotificationListViewModel()

    public var onNotificationTap: ((APINotification) -> Void)?
    public var onDismiss: (() -> Void)?

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
        HStack {
            if viewModel.unreadCount > 0 {
                Button {
                    HapticFeedback.light()
                    Task { await viewModel.markAllRead() }
                } label: {
                    Text("Tout lire")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(brandColor)
                }
            } else {
                Color.clear.frame(width: 50, height: 24)
            }

            Spacer()

            VStack(spacing: 2) {
                Text("Notifications")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(theme.textPrimary)
                if viewModel.unreadCount > 0 {
                    Text("\(viewModel.unreadCount) non lue\(viewModel.unreadCount > 1 ? "s" : "")")
                        .font(.system(size: 11))
                        .foregroundColor(brandColor)
                }
            }

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
                ForEach(NotificationFilter.allCases, id: \.self) { filter in
                    filterChip(filter: filter)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    private func filterChip(filter: NotificationFilter) -> some View {
        let isSelected = viewModel.activeFilter == filter
        let count = viewModel.unreadCountFor(filter: filter)

        return Button {
            HapticFeedback.light()
            withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                viewModel.activeFilter = filter
            }
        } label: {
            HStack(spacing: 5) {
                Text(filter.label)
                    .font(.system(size: 13, weight: .semibold))

                if count > 0 {
                    Text("\(min(count, 99))")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(isSelected ? brandColor : .white)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(
                            Capsule().fill(isSelected ? .white : brandColor)
                        )
                }
            }
            .foregroundColor(isSelected ? .white : brandColor)
            .padding(.horizontal, 14)
            .padding(.vertical, 6)
            .background(
                Capsule()
                    .fill(isSelected ? brandColor : brandColor.opacity(0.12))
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - List

    private var notificationList: some View {
        Group {
            if viewModel.isLoading && viewModel.notifications.isEmpty {
                loadingState
            } else if viewModel.filteredNotifications.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(viewModel.filteredNotifications) { notification in
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
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                        .listRowSeparatorTint(theme.textMuted.opacity(0.1))
                    }

                    if viewModel.hasMore && viewModel.activeFilter == .all {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                            .padding()
                            .listRowBackground(Color.clear)
                            .listRowSeparator(.hidden)
                            .onAppear {
                                Task { await viewModel.loadMore() }
                            }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
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
            Text("Chargement...")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: viewModel.activeFilter == .all ? "bell.slash" : "tray")
                .font(.system(size: 48))
                .foregroundColor(brandColor.opacity(0.4))

            Text(emptyTitle)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            Text("Vos notifications apparaîtront ici")
                .font(.system(size: 13))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }

    private var emptyTitle: String {
        switch viewModel.activeFilter {
        case .all: return "Aucune notification"
        case .message: return "Aucun message"
        case .reaction: return "Aucune réaction"
        case .mention: return "Aucune mention"
        case .call: return "Aucun appel manqué"
        case .contact: return "Aucun contact"
        }
    }
}

// MARK: - Notification Filter

public enum NotificationFilter: CaseIterable, Hashable {
    case all, message, reaction, mention, call, contact

    var label: String {
        switch self {
        case .all: return "Toutes"
        case .message: return "Messages"
        case .reaction: return "Réactions"
        case .mention: return "Mentions"
        case .call: return "Appels"
        case .contact: return "Contacts"
        }
    }

    func matches(_ notification: APINotification) -> Bool {
        switch self {
        case .all: return true
        case .message:
            return [.newMessage, .message, .messageReply].contains(notification.notificationType)
        case .reaction:
            return [.messageReaction, .reaction].contains(notification.notificationType)
        case .mention:
            return [.mention, .mentionAlias].contains(notification.notificationType)
        case .call:
            return notification.notificationType == .missedCall
        case .contact:
            return [.friendRequest, .contactRequest, .friendAccepted, .contactAccepted]
                .contains(notification.notificationType)
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
    @Published var activeFilter: NotificationFilter = .all

    private var offset = 0
    private let limit = 30

    var filteredNotifications: [APINotification] {
        notifications.filter { activeFilter.matches($0) }
    }

    func unreadCountFor(filter: NotificationFilter) -> Int {
        notifications.filter { filter.matches($0) && !$0.isRead }.count
    }

    func loadInitial() async {
        isLoading = true
        offset = 0
        do {
            let response = try await NotificationService.shared.list(
                offset: 0, limit: limit, unreadOnly: false
            )
            notifications = response.data
            unreadCount = response.unreadCount ?? 0
            hasMore = response.pagination?.hasMore ?? false
            offset = limit
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
            await loadInitial()
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
