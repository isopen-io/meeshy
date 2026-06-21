import SwiftUI
import MeeshySDK
import MeeshyUI

/// The **Contacts** tab of the People hub.
///
/// Hosts the contact directory's four sticky sub-tabs — Tous / Demandes /
/// Bloques / Decouvrir — above their respective content. The sub-tab bar stays
/// pinned while the active sub-tab scrolls; that scroll is forwarded up so the
/// hub's collapsing header reacts to it.
///
/// Sub-tabs switch by tap (not horizontal paging) so the hub's primary swipe
/// between Appels / Clavier / Contacts is never ambiguous. Each sub-view owns
/// its own scroll + cache-first load; the view-models are held here so state
/// survives sub-tab switches.
struct ContactsSection: View {
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

    @StateObject private var contactsListVM = ContactsListViewModel()
    @StateObject private var requestsVM = RequestsViewModel()
    @StateObject private var discoverVM = DiscoverViewModel()
    @StateObject private var blockedVM = BlockedViewModel()

    @State private var subTab: ContactsTab
    var isActive: Bool
    var onScrollOffsetChange: (CGFloat) -> Void

    init(
        initialTab: ContactsTab = .contacts,
        isActive: Bool,
        onScrollOffsetChange: @escaping (CGFloat) -> Void
    ) {
        _subTab = State(initialValue: initialTab)
        self.isActive = isActive
        self.onScrollOffsetChange = onScrollOffsetChange
    }

    var body: some View {
        VStack(spacing: 0) {
            subTabBar
            subContent
        }
        .adaptiveOnChange(of: subTab) { _, _ in
            // Re-expand the hub header when switching sub-tabs (the freshly
            // shown sub-tab only re-reports its offset once scrolled).
            onScrollOffsetChange(0)
            HapticFeedback.light()
        }
    }

    // MARK: - Sticky Sub-tab Bar

    private var subTabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ContactsTab.allCases, id: \.self) { tab in
                    subTabChip(tab)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .overlay(alignment: .bottom) { Divider().opacity(0.2) }
    }

    private func subTabChip(_ tab: ContactsTab) -> some View {
        let isSelected = subTab == tab
        let badge = subBadge(for: tab)

        return Button {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                subTab = tab
            }
        } label: {
            HStack(spacing: 5) {
                Text(tab.rawValue)
                    .font(.footnote.weight(.semibold))
                if badge > 0 {
                    Text("\(badge)")
                        .font(.caption2.weight(.bold))
                        .foregroundColor(isSelected ? MeeshyColors.indigo500 : .white)
                        .frame(minWidth: 15, minHeight: 15)
                        .background(Circle().fill(isSelected ? Color.white : MeeshyColors.indigo500))
                }
            }
            .foregroundColor(isSelected ? .white : MeeshyColors.indigo500)
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            .background(Capsule().fill(isSelected ? MeeshyColors.indigo500 : Color.clear))
            .overlay(Capsule().stroke(isSelected ? Color.clear : MeeshyColors.indigo900.opacity(0.3), lineWidth: 1))
        }
        .accessibilityLabel(tab.rawValue)
    }

    private func subBadge(for tab: ContactsTab) -> Int {
        switch tab {
        case .requests: return FriendshipCache.shared.pendingReceivedCount
        case .contacts, .discover, .blocked: return 0
        }
    }

    // MARK: - Sub-tab Content

    @ViewBuilder
    private var subContent: some View {
        switch subTab {
        case .contacts:
            ContactsListTab(
                viewModel: contactsListVM,
                isActive: isActive,
                onScrollOffsetChange: onScrollOffsetChange
            )
        case .requests:
            RequestsTab(
                viewModel: requestsVM,
                isActive: isActive,
                onScrollOffsetChange: onScrollOffsetChange
            )
        case .discover:
            DiscoverTab(
                viewModel: discoverVM,
                isActive: isActive,
                onScrollOffsetChange: onScrollOffsetChange
            )
        case .blocked:
            BlockedTab(
                viewModel: blockedVM,
                isActive: isActive,
                onScrollOffsetChange: onScrollOffsetChange
            )
        }
    }
}
