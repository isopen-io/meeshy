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

/// L'espacement des titres en capitales — sauf dans une écriture LIÉE.
/// Espacer l'arabe coupe ses ligatures : « لغات ا لمنضمّين » au lieu de
/// « لغات المنضمّين » (relevé au simulateur, #7797).
public struct ScriptSafeTracking: ViewModifier {
    let amount: CGFloat
    @Environment(\.layoutDirection) private var layoutDirection

    public func body(content: Content) -> some View {
        content.kerning(layoutDirection == .rightToLeft ? 0 : amount)
    }
}

public extension View {
    func scriptSafeTracking(_ amount: CGFloat) -> some View {
        modifier(ScriptSafeTracking(amount: amount))
    }

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
            .scriptSafeTracking(1.1)
            .textCase(.uppercase)
            .foregroundColor(isDark ? MeeshyColors.indigo300 : MeeshyColors.indigo600)
            .accessibilityAddTraits(.isHeader)
    }
}
