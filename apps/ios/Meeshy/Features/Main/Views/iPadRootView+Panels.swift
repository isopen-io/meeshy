import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - iPad Root View Right Panel Content (Hub Routes)

extension iPadRootView {

    @ViewBuilder
    func rightPanelContent(for route: Route) -> some View {
        switch route {
        case .settings:
            SettingsView()
                                .navigationBarHidden(true)
        case .profile:
            ProfileView()
                                .navigationBarHidden(true)
        case .contacts:
            ContactsHubView()
                .navigationBarHidden(true)
        case .peopleDiscovery(let initialTab):
            PeopleDiscoveryView(initialTab: initialTab)
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
            .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner() }
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
            .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner() }
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
                        .navigationBarHidden(true)
            .safeAreaInset(edge: .top, spacing: 0) { ConnectionBanner() }
            .onDisappear {
                Task { await notificationManager.refreshUnreadCount() }
            }
        case .userStats:
            UserStatsView()
                                .navigationBarHidden(true)
        case .links:
            LinksHubView()
                        case .affiliate:
            AffiliateView()
                                .navigationBarHidden(true)
        case .trackingLinks:
            TrackingLinksView()
                                .navigationBarHidden(true)
        case .shareLinks:
            ShareLinksView()
                                .navigationBarHidden(true)
        case .communityLinks:
            CommunityLinksView()
                                .navigationBarHidden(true)
        case .dataExport:
            DataExportView()
                                .navigationBarHidden(true)
        case .postDetail(let postId, let initialPost, let showComments, let commentId, let parentCommentId):
            PostDetailView(postId: postId, initialPost: initialPost, showComments: showComments, targetCommentId: commentId, targetParentCommentId: parentCommentId)
                        case .bookmarks:
            BookmarksView()
                                .navigationBarHidden(true)
        case .starredMessages:
            StarredMessagesView()
        case .friendRequests:
            FriendRequestListView()
                                .navigationBarHidden(true)
        case .editProfile:
            EditProfileView()
                                .navigationBarHidden(true)
        case .conversation:
            EmptyView()
        case .storyNotificationTarget(let storyId, let intent, let context):
            // Mirrors iPhone (RootView) so that tapping a story-related
            // notification on iPad lands on the same Phase E/F screen
            // (loading → active → expired). The screen presents the viewer
            // through the shared `StoryViewerCoordinator` env object.
            StoryNotificationTargetScreen(
                storyId: storyId,
                intent: intent,
                context: context
            )
            .navigationBarHidden(true)
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

    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }

    var body: some View {
        HStack(spacing: 12) {
            if showFeedButton {
                Button {
                    HapticFeedback.light()
                    onFeedTap?()
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "square.stack.fill")
                            .font(MeeshyFont.relative(14, weight: .semibold))
                        Text(String(localized: "root.ipad.feed", defaultValue: "Feed", bundle: .main))
                            .font(MeeshyFont.relative(14, weight: .semibold))
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
                            .fill(MeeshyColors.indigo100.opacity(isDark ? 0.15 : 1))
                    )
                }
            }

            Text(title)
                .font(MeeshyFont.relative(20, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .accessibilityAddTraits(.isHeader)

            Spacer()

            if let onNotificationsTap {
                Button {
                    HapticFeedback.light()
                    onNotificationsTap()
                } label: {
                    ZStack(alignment: .topTrailing) {
                        Image(systemName: "bell.fill")
                            .font(MeeshyFont.relative(16, weight: .medium))
                            .foregroundColor(theme.textSecondary)

                        if notificationCount > 0 {
                            Text("\(min(notificationCount, 99))")
                                // Doctrine 86i : compteur dans une pastille circulaire fixe 16×16 → figé.
                                .font(MeeshyFont.relative(9, weight: .bold))
                                .foregroundColor(.white)
                                .frame(width: 16, height: 16)
                                .background(Circle().fill(MeeshyColors.error))
                                .offset(x: 6, y: -6)
                                .accessibilityHidden(true)
                        }
                    }
                }
                .accessibilityLabel(String(localized: "root.ipad.notifications", defaultValue: "Notifications", bundle: .main))
                .accessibilityValue(notificationCount > 0 ? String(notificationCount) : "")
            }

            if let onSettingsTap {
                Button {
                    HapticFeedback.light()
                    onSettingsTap()
                } label: {
                    Image(systemName: "gearshape.fill")
                        .font(MeeshyFont.relative(16, weight: .medium))
                        .foregroundColor(theme.textSecondary)
                }
                .accessibilityLabel(String(localized: "root.ipad.settings", defaultValue: "Paramètres", bundle: .main))
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
    private var theme: ThemeManager { ThemeManager.shared }
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    @State private var isDragging = false

    private let minRatio: CGFloat = 0.30
    private let maxRatio: CGFloat = 0.50
    private let handleWidth: CGFloat = 20

    var body: some View {
        ZStack {
            Rectangle()
                .fill(isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.08))
                .frame(width: 1)

            RoundedRectangle(cornerRadius: 2)
                .fill(isDragging ? MeeshyColors.indigo400 : (isDark ? Color.white.opacity(0.2) : Color.black.opacity(0.15)))
                .frame(width: 4, height: 36)
                .animation(.easeInOut(duration: 0.15), value: isDragging)
        }
        .frame(width: handleWidth)
        .contentShape(Rectangle())
        .gesture(
            // minimumDistance > tap-wobble so an accidental tap near the divider
            // never starts a resize (and never swallows a nearby tap sequence).
            DragGesture(minimumDistance: 8)
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
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "root.ipad.resizable_handle.label", defaultValue: "Séparateur de colonnes", bundle: .main))
        .accessibilityValue(String(format: String(localized: "root.ipad.resizable_handle.value_format", defaultValue: "%d pour cent", bundle: .main), Int(ratio * 100)))
        .accessibilityHint(String(localized: "root.ipad.resizable_handle.hint", defaultValue: "Ajuste la largeur de la colonne de gauche de 30 à 50 pour cent", bundle: .main))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment:
                ratio = min(maxRatio, ratio + 0.02)
            case .decrement:
                ratio = max(minRatio, ratio - 0.02)
            @unknown default:
                break
            }
        }
    }
}
