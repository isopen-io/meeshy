//
//  MainTabView.swift
//  Meeshy
//
//  Main tab bar interface
//  iOS 16+ compatible
//

import SwiftUI

struct MainTabView: View {
    // MARK: - Properties

    @EnvironmentObject var coordinator: NavigationCoordinator
    @EnvironmentObject var appState: AppState

    /// Hide tab bar when viewing a conversation
    private var shouldShowTabBar: Bool {
        appState.activeConversationId == nil
    }

    // MARK: - Body

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                // Offline Banner - Red panel when no internet
                OfflineBanner()

                ZStack(alignment: .bottom) {
                    // Content
                    Group {
                        switch coordinator.selectedTab {
                    case .conversations:
                        ConversationsCoordinatorView()
                    case .calls:
                        DashboardCoordinatorView()
                    case .notifications:
                        NotificationsCoordinatorView()
                    case .profile:
                        ProfileCoordinatorView()
                    default:
                        // Meeshy tab removed - accessed via button in conversation list
                        ConversationsCoordinatorView()
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                // Add padding at bottom to prevent content from being hidden by the floating tab bar
                // We'll handle this in individual views if they need to scroll behind,
                // but for now let's ensure safe area is respected or ignored as needed.
                // The user wants "conversations défilent en dessous" (scroll underneath).
                // So we should NOT add padding here, but let the views handle it.

                    // Floating Tab Bar - hidden when in conversation view
                    if shouldShowTabBar {
                        FloatingTabBar(selectedTab: $coordinator.selectedTab, unreadCount: appState.unreadCount)
                            .padding(.horizontal, 16)
                            .padding(.bottom, 20)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .animation(.easeInOut(duration: 0.25), value: shouldShowTabBar)
                .ignoresSafeArea(.keyboard) // Don't move tab bar up with keyboard
            }
            .animation(.easeInOut(duration: 0.3), value: NetworkMonitor.shared.isConnected)

            // Voice Cloning Debug Overlay (DEBUG builds only)
            #if DEBUG
            VoiceCloningDebugOverlay()
            #endif
        }
    }
}

struct FloatingTabBar: View {
    @Binding var selectedTab: TabSelection
    let unreadCount: Int
    
    var body: some View {
        HStack(spacing: 0) {
            TabBarButton(
                icon: "message.fill",
                title: "Chats",
                isSelected: selectedTab == .conversations,
                badge: unreadCount > 0 ? unreadCount : nil,
                action: { selectedTab = .conversations }
            )

            TabBarButton(
                icon: "chart.bar.fill",
                title: "Dashboard",
                isSelected: selectedTab == .calls,
                action: { selectedTab = .calls }
            )

            TabBarButton(
                icon: "bell.fill",
                title: "Notifs",
                isSelected: selectedTab == .notifications,
                action: { selectedTab = .notifications }
            )

            TabBarButton(
                icon: "gearshape.fill",
                title: "Paramètres",
                isSelected: selectedTab == .profile,
                action: { selectedTab = .profile }
            )
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 4)
        .background(.ultraThinMaterial)
        .cornerRadius(32)
        .shadow(color: Color.black.opacity(0.15), radius: 10, x: 0, y: 5)
        .overlay(
            RoundedRectangle(cornerRadius: 32)
                .stroke(Color.white.opacity(0.2), lineWidth: 1)
        )
    }
}

struct TabBarButton: View {
    let icon: String
    let title: String
    let isSelected: Bool
    var badge: Int? = nil
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                ZStack(alignment: .topTrailing) {
                    Image(systemName: icon)
                        .font(.system(size: 20, weight: isSelected ? .bold : .regular))
                        .foregroundColor(isSelected ? .meeshyPrimary : .secondary)
                        .frame(width: 24, height: 24)
                    
                    if let badge = badge, badge > 0 {
                        Text("\(badge)")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(.white)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Color.red)
                            .clipShape(Circle())
                            .offset(x: 8, y: -8)
                    }
                }
                
                Text(title)
                    .font(.system(size: 10, weight: isSelected ? .semibold : .medium))
                    .foregroundColor(isSelected ? .meeshyPrimary : .secondary)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
    }
}

// MARK: - Conversations Coordinator

struct ConversationsCoordinatorView: View {
    @EnvironmentObject var coordinator: NavigationCoordinator
    @EnvironmentObject var appState: AppState

    var body: some View {
        // Use the merged ConversationListView from Features/Conversations/Views
        // It has its own NavigationStack internally
        ConversationListView()
    }
}

// MARK: - Dashboard Coordinator

struct DashboardCoordinatorView: View {
    @EnvironmentObject var coordinator: NavigationCoordinator

    var body: some View {
        NavigationStack {
            DashboardView()
        }
    }
}

// MARK: - Notifications Coordinator

struct NotificationsCoordinatorView: View {
    @EnvironmentObject var coordinator: NavigationCoordinator

    var body: some View {
        NavigationStack(path: $coordinator.notificationsPath) {
            NotificationListView()
        }
    }
}

// MARK: - Profile Coordinator

struct ProfileCoordinatorView: View {
    @EnvironmentObject var coordinator: NavigationCoordinator

    var body: some View {
        NavigationStack(path: $coordinator.profilePath) {
            MainSettingsView()
        }
    }
}

// NOTE: MeeshyCoordinatorView removed - Meeshy is now accessed via the
// Meeshy button in ConversationListView header, opening MeeshyFeedView
