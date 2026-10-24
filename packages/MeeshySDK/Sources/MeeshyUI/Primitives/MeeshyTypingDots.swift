import SwiftUI

/// **Les trois points « écrit… » — une seule implémentation** (#9891).
///
/// Trois copies vivaient côté app, au caractère près : la rangée de la liste
/// (`ThemedConversationRow.TypingDotsView`), la rangée plate de la Lentille
/// (`LentilleTypingDots`, « même patron, reproduit ici ») et la bulle du fil
/// (`TypingIndicatorBubble.pulsingDots`). Les deux rangées lisaient le seul
/// réglage système de Reduce Motion, la bulle lisait aussi le réglage de
/// l'app ; les deux rangées remettaient leur état à zéro DANS la transaction
/// animée à la disparition, ce qui relance la boucle au lieu de la couper.
///
/// Au repos (mouvement réduit), les points restent à pleine taille et pleine
/// opacité : figés à la phase basse, ils se liraient comme un contrôle éteint,
/// alors que leur PRÉSENCE dit déjà « quelqu'un écrit ».
public struct MeeshyTypingDots: View {
    nonisolated public static let dotSize: CGFloat = 5
    nonisolated public static let period: Double = 0.5
    nonisolated public static let stagger: Double = 0.18

    let color: Color
    let spacing: CGFloat

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userForcedReduceMotion
    @State private var isAnimating = false

    public init(color: Color, spacing: CGFloat = MeeshySpacing.xxs) {
        self.color = color
        self.spacing = spacing
    }

    private var restsStill: Bool {
        MeeshyMotion.shouldReduce(system: reduceMotion, userForced: userForcedReduceMotion)
    }

    public var body: some View {
        HStack(spacing: spacing) {
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .fill(color)
                    .frame(width: Self.dotSize, height: Self.dotSize)
                    .scaleEffect(Self.scale(isAnimating: isAnimating, restsStill: restsStill))
                    .opacity(Self.opacity(isAnimating: isAnimating, restsStill: restsStill))
                    .animation(restsStill ? nil : Self.animation(forDot: index), value: isAnimating)
            }
        }
        .onAppear { isAnimating = true }
        .onDisappear { withTransaction(Transaction(animation: nil)) { isAnimating = false } }
        .accessibilityHidden(true)
    }

    nonisolated static func scale(isAnimating: Bool, restsStill: Bool) -> CGFloat {
        restsStill || isAnimating ? 1.0 : 0.5
    }

    nonisolated static func opacity(isAnimating: Bool, restsStill: Bool) -> Double {
        restsStill || isAnimating ? 1.0 : 0.4
    }

    nonisolated static func animation(forDot index: Int) -> Animation {
        .easeInOut(duration: period)
            .repeatForever(autoreverses: true)
            .delay(Double(index) * stagger)
    }
}
