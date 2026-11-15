#if DEBUG
import SwiftUI

/// L'état vide du catalogue : aucun composant n'est livré, et une phrase le dit
/// sur le fond du thème. L'écran du catalogue et le premier instantané de K00
/// partagent cette vue, donc l'image prouve exactement ce que l'écran montre.
public struct MeeshyKitCatalogEmptyState: View {
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    private var isDark: Bool { colorScheme == .dark }

    public var body: some View {
        Text(verbatim: "Aucun composant livré")
            .font(.body)
            .multilineTextAlignment(.center)
            .foregroundStyle(MeeshyColors.textSecondary(isDark: isDark))
            .padding(MeeshySpacing.lg)
            .frame(maxWidth: .infinity)
            .background { MeeshyColors.backgroundPrimary(isDark: isDark) }
    }
}
#endif
