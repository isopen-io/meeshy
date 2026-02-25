import SwiftUI
import MeeshySDK

public struct NotificationListView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = NotificationListViewModel()

    public var onNotificationTap: ((APINotification) -> Void)?
    public var onDismiss: (() -> Void)?

    private let accentColor = "FF6B6B"

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
            if let onDismiss {
                Button {
                    HapticFeedback.light()
                    onDismiss()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                }
            }

            Spacer()

            Text("Notifications")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if viewModel.unreadCount > 0 {
                Button {
                    HapticFeedback.light()
                    Task { await viewModel.markAllRead() }
                } label: {
                    Text("Tout lire")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                }
            } else {
                Color.clear.frame(width: 24, height: 24)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                filterChip(label: "Toutes", isSelected: !viewModel.unreadOnly) {
                    viewModel.unreadOnly = false
                    Task { await viewModel.loadInitial() }
                }
                filterChip(label: "Non lues", isSelected: viewModel.unreadOnly) {
                    viewModel.unreadOnly = true
                    Task { await viewModel.loadInitial() }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
    }

    private func filterChip(label: String, isSelected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(isSelected ? .white : Color(hex: accentColor))
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(isSelected ? Color(hex: accentColor) : Color(hex: accentColor).opacity(0.12))
                )
        }
    }

    // MARK: - List

    private var notificationList: some View {
        Group {
            if viewModel.isLoading && viewModel.notifications.isEmpty {
                loadingState
            } else if viewModel.notifications.isEmpty {
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(viewModel.notifications) { notification in
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
                .tint(Color(hex: accentColor))
            Text("Chargement...")
                .font(.system(size: 14))
                .foregroundColor(theme.textMuted)
            Spacer()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "bell.slash")
                .font(.system(size: 48))
                .foregroundColor(Color(hex: accentColor).opacity(0.4))

            Text(viewModel.unreadOnly ? "Aucune notification non lue" : "Aucune notification")
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

    private var offset = 0
    private let limit = 20

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
            if let index = notifications.firstIndex(where: { $0.id == notification.id }) {
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
