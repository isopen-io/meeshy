import SwiftUI

/// Le voile d'un message flouté hors du fil (ligne d'aperçu, résultat de recherche) :
/// un brouillard diffus, de la famille du voile des bulles, jamais des pavés gris.
/// Le texte voilé est un substitut servi par le serveur ; seul son halo se lit.
struct DiffuseVeil: ViewModifier {
    static let radius: CGFloat = 7
    static let opacity: Double = 0.55

    func body(content: Content) -> some View {
        content
            .blur(radius: Self.radius)
            .opacity(Self.opacity)
            .mask(
                LinearGradient(
                    stops: [
                        .init(color: .clear, location: 0),
                        .init(color: .black, location: 0.12),
                        .init(color: .black, location: 0.8),
                        .init(color: .clear, location: 1),
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )
            .accessibilityHidden(true)
    }
}
