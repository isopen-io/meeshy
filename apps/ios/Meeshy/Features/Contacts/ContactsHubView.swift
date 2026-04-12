import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

struct ContactsHubView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var router: Router
    @State private var scrollOffset: CGFloat = 0
    @State private var selectedTab: ContactsTab

    @StateObject private var contactsListVM = ContactsListViewModel()
    @StateObject private var requestsVM = RequestsViewModel()
    @StateObject private var discoverVM = DiscoverViewModel()
    @StateObject private var blockedVM = BlockedViewModel()

    init(initialTab: ContactsTab = .contacts) {
        _selectedTab = State(initialValue: initialTab)
    }

    var body: some View {
        VStack(spacing: 0) {
            CollapsibleHeader(
                title: "Contacts",
                scrollOffset: scrollOffset,
                onBack: { router.pop() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            )

            tabBar
            tabContent
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .navigationBarHidden(true)
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(ContactsTab.allCases, id: \.self) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, 8)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.3)
        }
    }

    private func tabButton(_ tab: ContactsTab) -> some View {
        let isSelected = selectedTab == tab
        let badge = badgeCount(for: tab)

        return Button {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                selectedTab = tab
            }
            HapticFeedback.light()
        } label: {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: tab.icon)
                        .font(.system(size: 13, weight: .medium))

                    Text(tab.rawValue)
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)

                    if badge > 0 {
                        Text("\(badge)")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Circle().fill(MeeshyColors.indigo500))
                    }
                }
                .foregroundColor(isSelected ? MeeshyColors.indigo500 : theme.textMuted)

                Rectangle()
                    .fill(isSelected ? MeeshyColors.indigo500 : Color.clear)
                    .frame(height: 2)
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: selectedTab)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
        }
        .accessibilityLabel("Onglet \(tab.rawValue)\(badge > 0 ? ", \(badge) elements" : "")")
    }

    private func badgeCount(for tab: ContactsTab) -> Int {
        switch tab {
        case .contacts: return FriendshipCache.shared.friendCount
        case .requests: return FriendshipCache.shared.pendingReceivedCount
        case .discover, .blocked: return 0
        }
    }

    // MARK: - Tab Content

    private var tabContent: some View {
        TabView(selection: $selectedTab) {
            ContactsListTab(viewModel: contactsListVM)
                .tag(ContactsTab.contacts)

            RequestsTab(viewModel: requestsVM)
                .tag(ContactsTab.requests)

            DiscoverTab(viewModel: discoverVM)
                .tag(ContactsTab.discover)

            BlockedTab(viewModel: blockedVM)
                .tag(ContactsTab.blocked)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: selectedTab)
    }

}
