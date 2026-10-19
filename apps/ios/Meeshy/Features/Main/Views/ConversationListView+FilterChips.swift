import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Filtres composés

/// La rangée de filtres COMPOSÉS, sous le rail (#4069).
///
/// Un appui pose, un second retire — `ConversationFilterComposition`
/// porte la règle, la vue ne fait que la relayer. La rangée disparaît si
/// l'énumération n'a rien à proposer, plutôt que de laisser une bande vide
/// entre le rail et la première conversation.
struct ConversationListFilterChipRow: View {
    @Binding var selectedFilters: Set<ConversationFilter>

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(ConversationFilter.allCases) { filter in
                    ThemedFilterChip(
                        title: filter.displayName,
                        color: filter.color,
                        isSelected: selectedFilters.contains(filter),
                        isCompact: true
                    ) {
                        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                            selectedFilters = ConversationFilterComposition.toggling(
                                filter, in: selectedFilters
                            )
                        }
                    }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.vertical, MeeshySpacing.xsPlus)
        }
        .accessibilityLabel(String(localized: "conversation.filter.row",
                                   defaultValue: "Filtres de conversations", bundle: .main))
    }
}
