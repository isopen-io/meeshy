import SwiftUI

/// **La loi du voile de l'appui long** (#11222, décision porteur) :
/// le voile est le MATÉRIAU SYSTÈME, une seule loi pour iOS et le web — la
/// matière `.ultraThinMaterial` (le web : flou 20 px saturé), un
/// assombrissement de 30 % dans les deux schémas, et un repli OPAQUE sous
/// Réduire la transparence.
public nonisolated enum LongPressVeilLaw {
    public static let dimOpacity: Double = 0.30

    public static func matter(reduceTransparency: Bool) -> MeeshySurface {
        MeeshySurface.translucent.resolved(reduceTransparency: reduceTransparency)
    }

    public static func opaqueWhite(isDark: Bool) -> Double {
        isDark ? 0.08 : 0.86
    }
}

/// **Le voile de l'appui long**, plein écran : la matière système sous
/// l'assombrissement de la loi. Un toucher le ferme ; il est invisible aux
/// technologies d'assistance (le menu porte sa propre fermeture). `visibility`
/// (0…1) suit l'apparition de l'hôte, ou sa résorption pendant un geste.
public struct LongPressVeil: View {
    private let visibility: Double
    private let onDismiss: () -> Void

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorScheme) private var colorScheme

    public init(visibility: Double, onDismiss: @escaping () -> Void) {
        self.visibility = visibility
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            matter
            Color.black.opacity(LongPressVeilLaw.dimOpacity)
        }
        .ignoresSafeArea()
        .opacity(visibility)
        .contentShape(Rectangle())
        .onTapGesture(perform: onDismiss)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var matter: some View {
        switch LongPressVeilLaw.matter(reduceTransparency: reduceTransparency) {
        case .translucent:
            Rectangle().fill(.ultraThinMaterial)
        case .opaque:
            Color(white: LongPressVeilLaw.opaqueWhite(isDark: colorScheme == .dark))
        }
    }
}
