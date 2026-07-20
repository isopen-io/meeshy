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

    init(initialTab: DiscoveryTab = .discover) {
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
                backgroundColor: theme.backgroundPrimary,
                // The sub-tab bar lives *inside* the header surface (accessory
                // slot) so it rides up with the collapsing header and the
                // content scrolls under it — same pattern as the Feed.
                accessory: { AnyView(subTabBar) }
            )

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

    // MARK: - Sub-tab Bar (fine underline tabs, integrated in the header)

    private var subTabBar: some View {
        HStack(spacing: 0) {
            ForEach(DiscoveryTab.allCases, id: \.self) { tab in
                subTabButton(tab)
            }
        }
        .padding(.horizontal, 8)
        .overlay(alignment: .bottom) { Divider().opacity(0.3) }
    }

    private func subTabButton(_ tab: DiscoveryTab) -> some View {
        let isSelected = subTab == tab
        let badge = subBadge(for: tab)

        return Button {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                subTab = tab
            }
        } label: {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: tab.icon)
                        .font(.footnote.weight(.medium))

                    Text(tabTitle(tab))
                        .font(.caption.weight(.semibold))
                        .lineLimit(1)

                    if badge > 0 {
                        Text("\(badge)")
                            .font(.caption2.weight(.bold))
                            .foregroundColor(.white)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Circle().fill(MeeshyColors.indigo500))
                    }
                }
                .foregroundColor(isSelected ? MeeshyColors.indigo500 : theme.textMuted)

                Rectangle()
                    .fill(isSelected ? MeeshyColors.indigo500 : Color.clear)
                    .frame(height: 2)
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: subTab)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
        }
        .accessibilityLabel(tabTitle(tab))
        .accessibilityValue(badge > 0 ? "\(badge)" : "")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    /// Localized display name for a discovery sub-tab. The raw enum value stays
    /// the stable key used for `.tag`, persistence and deep links
    /// (`Route.peopleDiscovery(DiscoveryTab)`); VoiceOver and the visible label
    /// read this localized string instead. Defaults are byte-identical to the
    /// raw values so the French UI is unchanged.
    private func tabTitle(_ tab: DiscoveryTab) -> String {
        switch tab {
        case .discover:
            return String(localized: "discovery.tab.discover", defaultValue: "Decouvrir", bundle: .main)
        case .requests:
            return String(localized: "discovery.tab.requests", defaultValue: "Demandes", bundle: .main)
        case .blocked:
            return String(localized: "discovery.tab.blocked", defaultValue: "Bloques", bundle: .main)
        }
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
