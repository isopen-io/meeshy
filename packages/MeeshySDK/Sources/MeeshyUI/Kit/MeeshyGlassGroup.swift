import SwiftUI

/// Regroupe des surfaces de verre voisines. Sur iOS 26+, elles fusionnent dans
/// un même conteneur du système ; dessous, le contenu reste tel quel — une
/// matière par surface, jamais de verre posé sur du verre.
public struct MeeshyGlassGroup<Content: View>: View {
    private let spacing: CGFloat
    private let content: Content

    public init(spacing: CGFloat = 20, @ViewBuilder content: () -> Content) {
        self.spacing = spacing
        self.content = content()
    }

    public var body: some View {
        AdaptiveGlassContainer(spacing: spacing) { content }
    }
}

/// L'appui du verre dessiné : pose l'état pressé du bouton dans
/// l'environnement de son libellé, où `.meeshyGlass(isInteractive: true)` le lit.
/// Sur iOS 26+, le système répond lui-même ; le style ne change alors rien.
/// Aucun retour haptique : il appartient au contrôle.
public struct MeeshyGlassPressStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .environment(\.meeshyGlassIsPressed, configuration.isPressed)
    }
}
