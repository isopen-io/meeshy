import SwiftUI
import MeeshySDK

/// La surface d'une carte de la page d'invitation : blanche sur fond clair,
/// indigo profond sur fond sombre, bord indigo discret — la même pour chaque
/// section, pour que la page se lise comme une pile de cartes sœurs.
public struct InviteCardSurface: ViewModifier {
    let isDark: Bool
    let cornerRadius: CGFloat

    public func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(isDark ? MeeshyColors.indigo950.opacity(0.72) : Color.white)
            )
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(isDark ? MeeshyColors.indigo800.opacity(0.55) : MeeshyColors.indigo100, lineWidth: 1)
            )
    }
}

public extension View {
    func inviteCardSurface(isDark: Bool, cornerRadius: CGFloat = MeeshyRadius.xl) -> some View {
        modifier(InviteCardSurface(isDark: isDark, cornerRadius: cornerRadius))
    }
}

/// Le titre de section en capitales espacées (« ON Y PARLE »).
struct InviteSectionTitle: View {
    let text: String
    let isDark: Bool

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .heavy))
            .kerning(1.1)
            .textCase(.uppercase)
            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
            .accessibilityAddTraits(.isHeader)
    }
}
