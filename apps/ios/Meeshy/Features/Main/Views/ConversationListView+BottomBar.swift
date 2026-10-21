import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Bottom Bar Overlay
// Search bar + communities carousel. Extracted into its
// own View struct for the same type-complexity reason as the header. Owns
// its `searchBounce` animation state locally.
struct ConversationListBottomBar: View {
    @Binding var showSearchOverlay: Bool
    var isSearching: FocusState<Bool>.Binding
    @Binding var showWidgetPreview: Bool
    @Binding var showGlobalSearch: Bool
    let userCommunities: [MeeshyCommunity]

    @EnvironmentObject var conversationViewModel: ConversationListViewModel

    @State private var searchBounce = false
    /// La VACUITÉ du texte de recherche, remontée par l'hôte du champ — la
    /// seule chose que cette barre ait à savoir de la frappe. Un `@Binding`
    /// sur le texte lui-même la ferait se re-rendre à chaque caractère, ce
    /// que l'isolement du modèle vient précisément d'éviter (#7158).
    @State private var searchTextIsEmpty = true

    private var theme: ThemeManager { ThemeManager.shared }
    private var isActive: Bool { isSearching.wrappedValue || showSearchOverlay }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Communities carousel — inside a glass panel while the search
            // field has focus. Its communities or nothing (#10924): no empty
            // title, and no filter chips — they live at the head of the list.
            if showSearchOverlay && ConversationSearchCommunitiesBandLaw.drawsBand(for: userCommunities, queryIsEmpty: searchTextIsEmpty) {
                VStack(spacing: 0) {
                    ConversationSearchCommunitiesBand(communities: userCommunities) { isSearching.wrappedValue = false }
                        .padding(.vertical, MeeshySpacing.smPlus)
                }
                .padding(.top, MeeshySpacing.xsPlus)
                .padding(.bottom, MeeshySpacing.xs)
                .background(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                        .fill(.ultraThinMaterial)
                        .overlay(
                            RoundedRectangle(cornerRadius: MeeshyRadius.xxl)
                                .stroke(theme.inputBorder, lineWidth: 1)
                        )
                        .shadow(color: Color.black.opacity(MeeshyOpacity.light), radius: 14, y: 6)
                )
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.bottom, MeeshySpacing.sm)
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }

            // Search bar — always visible (unless scrolled away); floor of the sync pill (#10840)
            themedSearchBar.docksSyncPill(liftAboveEdge: MeeshySpacing.sm)
        }
        // #11036 — la bande se replie dès le premier caractère, et revient au champ vidé.
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: searchTextIsEmpty)
    }

    // MARK: - Themed Search Bar
    private var themedSearchBar: some View {
        HStack(spacing: MeeshySpacing.md) {
            // Magnifying glass: tappable to toggle search overlay (communities)
            Button {
                HapticFeedback.light()
                // La bande suit le focus (#10841) : la loupe le donne ou le reprend.
                isSearching.wrappedValue = !isActive
            } label: {
                Image(systemName: "magnifyingglass")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                    .foregroundStyle(
                        isActive ?
                        AnyShapeStyle(LinearGradient(colors: [MeeshyColors.error, MeeshyColors.indigo300], startPoint: .leading, endPoint: .trailing)) :
                        AnyShapeStyle(theme.textMuted)
                    )
                    .scaleEffect(isActive ? 1.15 : 1.0)
                    .animation(.spring(response: 0.3, dampingFraction: 0.6), value: isActive)
            }
            .accessibilityLabel(String(localized: "accessibility.search", defaultValue: "Rechercher"))
            .accessibilityHint(String(localized: "accessibility.search.list.hint", defaultValue: "Ouvre la recherche de conversations et vos communautés"))
            // La recherche déjà ouverte ne se disait que par un dégradé et un
            // `scaleEffect` — rien pour VoiceOver (253i, #4266).
            .toggleStateAccessibility(isToggle: true, isActive: isActive)

            // Seul cet hôte se re-rend à la frappe — cette barre, et la liste
            // au-dessus d'elle, n'apprennent du texte que sa VACUITÉ (#7158).
            ConversationSearchFieldHost(
                searchTextModel: conversationViewModel.searchTextModel,
                isSearching: isSearching,
                isEmpty: $searchTextIsEmpty
            )

            // Dashboard / widget button
            Button {
                HapticFeedback.medium()
                showWidgetPreview = true
            } label: {
                Image(systemName: "square.grid.2x2")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.warning, MeeshyColors.indigo500],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .accessibilityLabel(String(localized: "accessibility.dashboard", defaultValue: "Tableau de bord"))
            .accessibilityHint(String(localized: "accessibility.dashboard.hint", defaultValue: "Ouvre le tableau de bord avec les widgets"))

            // Global search button
            Button {
                HapticFeedback.medium()
                showGlobalSearch = true
            } label: {
                Image(systemName: "text.magnifyingglass")
                    .font(MeeshyFont.relative(MeeshyIconSize.md, weight: .medium))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [MeeshyColors.indigo600, MeeshyColors.indigo300],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
            .accessibilityLabel(String(localized: "accessibility.global_search", defaultValue: "Recherche globale"))
            .accessibilityHint(String(localized: "accessibility.global_search.hint", defaultValue: "Rechercher dans tous les messages, conversations et utilisateurs"))
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.md)
        .background(
            RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: MeeshyRadius.xlPlus)
                        .stroke(
                            isActive ?
                            AnyShapeStyle(LinearGradient(colors: [MeeshyColors.error, MeeshyColors.indigo300], startPoint: .leading, endPoint: .trailing)) :
                            AnyShapeStyle(theme.inputBorder),
                            lineWidth: isActive ? 2 : 1
                        )
                )
                .shadow(color: isActive ? MeeshyColors.indigo300.opacity(0.25) : .clear, radius: 12, y: 5)
        )
        .scaleEffect(searchBounce ? 1.02 : 1.0)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: searchTextIsEmpty)
        .adaptiveOnChange(of: isSearching.wrappedValue) { _, newValue in
            withAnimation(.spring(response: 0.35, dampingFraction: 0.55)) {
                searchBounce = newValue
            }
            let shown = ConversationSearchCommunitiesBandLaw.isShown(afterFocusChangeTo: newValue)
            guard shown != showSearchOverlay else { return }
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { showSearchOverlay = shown }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.bottom, MeeshySpacing.lg)
    }
}


// MARK: - Hôte du champ de recherche (#7158)

/// Seul abonné du texte de recherche : ce champ DESSINE la frappe, il doit
/// donc se re-rendre à chaque caractère. La barre qui l'héberge — et la liste
/// de conversations au-dessus d'elle — n'en apprend que la VACUITÉ, un
/// changement rare.
///
/// Même dispositif que `ComposerTextHost` pour le texte du composeur (#4105) :
/// le modèle vit hors de l'arbre de dépendances de la racine, un hôte dédié
/// l'observe.
struct ConversationSearchFieldHost: View {
    @ObservedObject var searchTextModel: ConversationSearchTextModel
    var isSearching: FocusState<Bool>.Binding
    @Binding var isEmpty: Bool

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        TextField(
            String(localized: "search.placeholder", defaultValue: "Rechercher..."),
            text: $searchTextModel.text
        )
            .focused(isSearching)
            .foregroundColor(theme.textPrimary)
            .font(MeeshyFont.relative(MeeshyFont.bodySize))
            .accessibilityLabel(String(localized: "conversation.list.search_conversations", defaultValue: "Rechercher des conversations", bundle: .main))
            .adaptiveOnChange(of: searchTextModel.text.isEmpty, initial: true) { _, nowEmpty in
                isEmpty = nowEmpty
            }

        if !searchTextModel.text.isEmpty {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { searchTextModel.text = "" }
            } label: {
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(MeeshyColors.error)
                    .scaleEffect(1.0)
            }
            .accessibilityLabel(String(localized: "accessibility.clear_search", defaultValue: "Effacer la recherche"))
            .transition(.scale.combined(with: .opacity))
        }
    }
}
