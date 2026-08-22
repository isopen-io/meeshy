import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

/// The People hub — the redesigned contact view.
///
/// Three primary tabs sit under a collapsing header and swipe horizontally:
/// **Appels** (call journal), **Clavier** (dial pad), **Contacts** (the
/// directory — an annuaire filtered by `ContactFilter`).
///
/// Connection management and user discovery (Demandes / Decouvrir / Bloques)
/// no longer clutter the Contacts tab — they live in `PeopleDiscoveryView`,
/// reachable from the floating menu ladder.
struct ContactsHubView: View {
    @Environment(\.colorScheme) private var colorScheme
    private var isDark: Bool { colorScheme == .dark }
    private var theme: ThemeManager { ThemeManager.shared }
    @EnvironmentObject private var router: Router
    @State private var scrollRelay = ScrollOffsetRelay()
    @State private var selectedTab: PeopleTab

    @StateObject private var keypadVM = KeypadViewModel()
    @StateObject private var callsVM = CallsViewModel()
    @StateObject private var contactsListVM = ContactsListViewModel()
    @StateObject private var phonebookVM = PhonebookViewModel()
    @StateObject private var affiliatesVM = AffiliatesViewModel()

    /// - Parameter initialTab: tab shown on open. The floating menu ladder
    ///   lands on `.calls` (call journal); everything else keeps the directory.
    init(initialTab: PeopleTab = .contacts) {
        _selectedTab = State(initialValue: initialTab)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Seul ce reader se re-rend au fil du scroll — la racine écrit
            // `scrollRelay.offset` sans s'y abonner (P1-1).
            ScrollOffsetReader(relay: scrollRelay) { offset in
                CollapsibleHeader(
                    title: selectedTab.title,
                    scrollOffset: offset,
                    onBack: { router.pop() },
                    titleColor: theme.textPrimary,
                    backArrowColor: MeeshyColors.indigo500,
                    backgroundColor: theme.backgroundPrimary
                )
            }

            tabBar
            tabContent
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .navigationBarHidden(true)
        .adaptiveOnChange(of: selectedTab) { _, _ in
            // Re-expand the header when switching tabs (the freshly shown tab's
            // offset only re-fires once the user scrolls it).
            scrollRelay.offset = 0
            HapticFeedback.light()
        }
    }

    // MARK: - Tab Bar

    private var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(PeopleTab.allCases, id: \.self) { tab in
                tabButton(tab)
            }
        }
        .padding(.horizontal, 8)
        .overlay(alignment: .bottom) {
            Divider().opacity(0.3)
        }
    }

    private func tabButton(_ tab: PeopleTab) -> some View {
        let isSelected = selectedTab == tab
        let badge = badgeCount(for: tab)

        return Button {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                selectedTab = tab
            }
        } label: {
            VStack(spacing: 6) {
                HStack(spacing: 4) {
                    Image(systemName: tab.icon)
                        .font(.footnote.weight(.medium))

                    Text(tab.title)
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
                    .animation(.spring(response: 0.3, dampingFraction: 0.7), value: selectedTab)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 10)
        }
        .accessibilityLabel("\(String(localized: "contacts.tab.prefix", defaultValue: "Tab", bundle: .main)) \(tab.title)\(badge > 0 ? ", \(badge) \(String(localized: "contacts.tab.items", defaultValue: "items", bundle: .main))" : "")")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    private func badgeCount(for tab: PeopleTab) -> Int {
        switch tab {
        case .contacts, .calls, .keypad: return 0
        }
    }

    // MARK: - Tab Content

    private var tabContent: some View {
        TabView(selection: $selectedTab) {
            CallsTab(
                viewModel: callsVM,
                isActive: selectedTab == .calls,
                onScrollOffsetChange: { scrollRelay.offset = $0 }
            )
            .tag(PeopleTab.calls)

            KeypadTab(
                viewModel: keypadVM,
                isActive: selectedTab == .keypad,
                onScrollOffsetChange: { scrollRelay.offset = $0 }
            )
            .tag(PeopleTab.keypad)

            ContactsListTab(
                viewModel: contactsListVM,
                phonebookViewModel: phonebookVM,
                affiliatesViewModel: affiliatesVM,
                isActive: selectedTab == .contacts,
                onScrollOffsetChange: { scrollRelay.offset = $0 }
            )
            .tag(PeopleTab.contacts)
        }
        .tabViewStyle(.page(indexDisplayMode: .never))
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: selectedTab)
    }
}
