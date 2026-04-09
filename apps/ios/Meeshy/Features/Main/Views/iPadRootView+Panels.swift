import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View Right Panel Content (Hub Routes)

extension iPadRootView {

    @ViewBuilder
    func rightPanelContent(for route: Route) -> some View {
        switch route {
        case .settings:
            SettingsView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .profile:
            ProfileView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .contacts(let initialTab):
            ContactsHubView(initialTab: initialTab)
                .navigationBarHidden(true)
        case .communityList:
            CommunityListView(
                onSelectCommunity: { community in
                    rightPanelRoute = .communityDetail(community.id)
                },
                onCreateCommunity: {
                    rightPanelRoute = .communityCreate
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communityDetail(let communityId):
            CommunityDetailView(
                communityId: communityId,
                onSelectConversation: { apiConversation in
                    let currentUserId = AuthManager.shared.currentUser?.id ?? ""
                    let conv = apiConversation.toConversation(currentUserId: currentUserId)
                    openConversation(conv)
                },
                onOpenSettings: { community in
                    rightPanelRoute = .communitySettings(community)
                },
                onOpenMembers: { id in
                    rightPanelRoute = .communityMembers(id)
                },
                onInvite: { id in
                    rightPanelRoute = .communityInvite(id)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communityCreate:
            CommunityCreateView(
                onCreated: { community in
                    rightPanelRoute = .communityDetail(community.id)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .navigationBarHidden(true)
        case .communitySettings(let community):
            CommunitySettingsView(
                community: community,
                onUpdated: { _ in rightPanelRoute = .communityList },
                onDeleted: { rightPanelRoute = nil },
                onLeft: { rightPanelRoute = nil }
            )
        case .communityMembers(let communityId):
            CommunityMembersView(
                communityId: communityId,
                onInvite: {
                    rightPanelRoute = .communityInvite(communityId)
                }
            )
        case .communityInvite(let communityId):
            CommunityInviteView(communityId: communityId)
        case .notifications:
            NotificationListView(
                onNotificationTap: { notification in
                    handleNotificationTap(notification)
                },
                onDismiss: { rightPanelRoute = nil }
            )
            .iPadFormWidth(MeeshyLayout.contentMaxWidth)
            .navigationBarHidden(true)
            .onDisappear {
                Task { await notificationManager.refreshUnreadCount() }
            }
        case .userStats:
            UserStatsView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .links:
            LinksHubView()
                .iPadFormWidth()
        case .affiliate:
            AffiliateView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .trackingLinks:
            TrackingLinksView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .shareLinks:
            ShareLinksView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .communityLinks:
            CommunityLinksView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .dataExport:
            DataExportView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .postDetail(let postId, let initialPost, let showComments):
            PostDetailView(postId: postId, initialPost: initialPost, showComments: showComments)
                .iPadFormWidth(MeeshyLayout.contentMaxWidth)
        case .bookmarks:
            BookmarksView()
                .iPadFormWidth(MeeshyLayout.contentMaxWidth)
                .navigationBarHidden(true)
        case .friendRequests:
            FriendRequestListView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .editProfile:
            EditProfileView()
                .iPadFormWidth()
                .navigationBarHidden(true)
        case .conversation:
            EmptyView()
        }
    }
}

// MARK: - iPad Left Column Header

struct iPadLeftColumnHeader: View {
    let title: String
    var showFeedButton: Bool = false
    var onFeedTap: (() -> Void)?
    var notificationCount: Int = 0
    var onNotificationsTap: (() -> Void)?
    var onSettingsTap: (() -> Void)?

    @ObservedObject private var theme = ThemeManager.shared

    var body: some View {
        HStack(spacing: 12) {
            if showFeedButton {
                Button {
                    HapticFeedback.light()
                    onFeedTap?()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.stack.fill")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Feed")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500, MeeshyColors.indigo700],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill(MeeshyColors.indigo100.opacity(theme.mode.isDark ? 0.15 : 1))
                    )
                }
            }

            Text(title)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(theme.textPrimary)

            Spacer()

            if let onNotificationsTap {
                Button {
                    HapticFeedback.light()
                    onNotificationsTap()
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell.fill")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(theme.textSecondary)

                        if notificationCount > 0 {
                            Text("\(min(notificationCount, 99))")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 16, height: 16)
                                .background(Circle().fill(MeeshyColors.error))
                                .offset(x: 6, y: -6)
                        }
                    }
                }
            }

            if let onSettingsTap {
                Button {
                    HapticFeedback.light()
                    onSettingsTap()
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(theme.backgroundPrimary.opacity(0.95))
    }
}

// MARK: - iPad Resizable Handle

struct iPadResizableHandle: View {
    @Binding var ratio: CGFloat
    let screenWidth: CGFloat
    @ObservedObject private var theme = ThemeManager.shared
    @State private var isDragging = false

    private let minRatio: CGFloat = 0.30
    private let maxRatio: CGFloat = 0.50
    private let handleWidth: CGFloat = 20

    var body: some View {
        ZStack {
            Rectangle()
                .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08))
                .frame(width: 1)

            RoundedRectangle(cornerRadius: 2)
                .fill(isDragging ? MeeshyColors.indigo400 : (theme.mode.isDark ? Color.white.opacity(0.2) : Color.black.opacity(0.15)))
                .frame(width: 4, height: 36)
                .animation(.easeInOut(duration: 0.15), value: isDragging)
        }
        .frame(width: handleWidth)
        .contentShape(Rectangle())
        .gesture(
            DragGesture(minimumDistance: 1)
                .onChanged { value in
                    isDragging = true
                    let currentX = screenWidth * ratio + value.translation.width
                    let newRatio = currentX / screenWidth
                    ratio = min(maxRatio, max(minRatio, newRatio))
                }
                .onEnded { _ in
                    isDragging = false
                }
        )
        .ignoresSafeArea()
    }
}
