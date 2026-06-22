import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Découverte d'utilisateurs Meeshy** — the people-discovery hub.
///
/// Hosts the three sticky sub-tabs that used to clutter the contact directory —
/// Demandes / Decouvrir / Bloques — above their respective content. Splitting
/// them out keeps the Contacts tab an exploitable annuaire (filtered by
/// `ContactFilter`) while connection management and user discovery live here.
///
/// Pushed full-screen from the floating menu ladder (`RootView`) and reachable
/// via deep links (`Route.peopleDiscovery(DiscoveryTab)`). The sub-tab bar stays
/// pinned while the active sub-tab scrolls; that scroll is forwarded up so the
/// collapsing header reacts to it. Sub-tabs switch by tap; each sub-view owns
/// its own scroll + cache-first load, and the view-models are held here so state
/// survives sub-tab switches.
struct PeopleDiscoveryView: View {
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var router: Router

    @StateObject private var requestsVM = RequestsViewModel()
    @StateObject private var discoverVM = DiscoverViewModel()
    @StateObject private var blockedVM = BlockedViewModel()
    @ObservedObject private var friendship = FriendshipCache.shared

    @State private var scrollOffset: CGFloat = 0
    @State private var subTab: DiscoveryTab

    init(initialTab: DiscoveryTab = .requests) {
        _subTab = State(initialValue: initialTab)
    }

    var body: some View {
        VStack(spacing: 0) {
            CollapsibleHeader(
                title: String(localized: "discovery.title", defaultValue: "Decouvrir", bundle: .main),
                scrollOffset: scrollOffset,
                onBack: { router.pop() },
                titleColor: theme.textPrimary,
                backArrowColor: MeeshyColors.indigo500,
                backgroundColor: theme.backgroundPrimary
            )

            subTabBar
            subContent
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .navigationBarHidden(true)
        .adaptiveOnChange(of: subTab) { _, _ in
            // Re-expand the header when switching sub-tabs (the freshly shown
            // sub-tab only re-reports its offset once scrolled).
            scrollOffset = 0
            HapticFeedback.light()
        }
    }

    // MARK: - Sticky Sub-tab Bar

    private var subTabBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(DiscoveryTab.allCases, id: \.self) { tab in
                    subTabChip(tab)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
        }
        .overlay(alignment: .bottom) { Divider().opacity(0.2) }
    }

    private func subTabChip(_ tab: DiscoveryTab) -> some View {
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

    private func subBadge(for tab: DiscoveryTab) -> Int {
        switch tab {
        case .requests: return friendship.pendingReceivedCount
        case .discover, .blocked: return 0
        }
    }

    // MARK: - Sub-tab Content

    @ViewBuilder
    private var subContent: some View {
        switch subTab {
        case .requests:
            RequestsTab(
                viewModel: requestsVM,
                isActive: true,
                onScrollOffsetChange: { scrollOffset = $0 }
            )
        case .discover:
            DiscoverTab(
                viewModel: discoverVM,
                isActive: true,
                onScrollOffsetChange: { scrollOffset = $0 }
            )
        case .blocked:
            BlockedTab(
                viewModel: blockedVM,
                isActive: true,
                onScrollOffsetChange: { scrollOffset = $0 }
            )
        }
    }
}
