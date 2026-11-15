#if DEBUG
import SwiftUI

/// La scène d'une tuile : le composant, cadré à sa taille naturelle avec une
/// marge `md`, sur le fond de son état. Le catalogue et les instantanés la
/// partagent, donc l'image prouve exactement ce que l'écran montre.
public struct MeeshyKitCatalogStage: View {
    private let key: String
    private let state: MeeshyKitCatalogState
    private let isPressed: Bool

    public init(key: String, state: MeeshyKitCatalogState, isPressed: Bool = false) {
        self.key = key
        self.state = state
        self.isPressed = isPressed
    }

    public var body: some View {
        MeeshyKitCatalog.content(key: key, state: state, isPressed: isPressed)
            .padding(MeeshySpacing.md)
            .background { backdrop }
    }

    @ViewBuilder
    private var backdrop: some View {
        switch state.backdrop {
        case .dark: MeeshyColors.backgroundPrimary(isDark: true)
        case .light: MeeshyColors.backgroundPrimary(isDark: false)
        case .media: MeeshyColors.brandGradient
        }
    }
}
#endif
