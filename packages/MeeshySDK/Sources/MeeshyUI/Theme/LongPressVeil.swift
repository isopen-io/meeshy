import SwiftUI

/// Le poids d'un voile d'appui long. STANDARD : la matière système sous un
/// assombrissement de 30 % (le menu d'un message, l'aperçu d'une pièce).
/// LÉGER (#17316) : aucune matière, un assombrissement discret, et un flou de
/// quelques points que l'HÔTE pose sur ce qu'il voile — on lit au travers.
public nonisolated enum LongPressVeilWeight: Equatable, Sendable {
    case standard
    case light
}

/// **La loi du voile de l'appui long** (#11222, décision porteur) :
/// le voile est le MATÉRIAU SYSTÈME, une seule loi pour iOS et le web — la
/// matière `.ultraThinMaterial` (le web : flou 20 px saturé), un
/// assombrissement de 30 % dans les deux schémas, et un repli OPAQUE sous
/// Réduire la transparence. Le voile LÉGER (#17316) laisse lire au travers.
public nonisolated enum LongPressVeilLaw {
    public static let dimOpacity: Double = 0.30
    public static let lightDimOpacity: Double = 0.12
    public static let lightReducedTransparencyDimOpacity: Double = 0.40
    public static let lightBackdropBlurRadius: CGFloat = 2

    public static func matter(reduceTransparency: Bool) -> MeeshySurface {
        MeeshySurface.translucent.resolved(reduceTransparency: reduceTransparency)
    }

    /// La matière sous l'assombrissement ; `nil` : aucune (voile léger).
    public static func matter(weight: LongPressVeilWeight, reduceTransparency: Bool) -> MeeshySurface? {
        weight == .standard ? matter(reduceTransparency: reduceTransparency) : nil
    }

    public static func dim(weight: LongPressVeilWeight, reduceTransparency: Bool) -> Double {
        guard weight == .light else { return dimOpacity }
        return reduceTransparency ? lightReducedTransparencyDimOpacity : lightDimOpacity
    }

    /// Le flou que l'hôte pose sur ce qu'il voile : nul sous le voile standard,
    /// dont la matière floute déjà.
    public static func backdropBlurRadius(weight: LongPressVeilWeight) -> CGFloat {
        weight == .light ? lightBackdropBlurRadius : 0
    }

    public static func opaqueWhite(isDark: Bool) -> Double {
        isDark ? 0.08 : 0.86
    }
}

/// **Le voile de l'appui long**, plein écran : la matière de la loi sous son
/// assombrissement. Un toucher le ferme ; il est invisible aux technologies
/// d'assistance (le menu porte sa propre fermeture). `visibility` (0…1) suit
/// l'apparition de l'hôte, ou sa résorption pendant un geste.
public struct LongPressVeil: View {
    private let visibility: Double
    private let weight: LongPressVeilWeight
    private let onDismiss: () -> Void

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorScheme) private var colorScheme

    public init(visibility: Double, weight: LongPressVeilWeight = .standard, onDismiss: @escaping () -> Void) {
        self.visibility = visibility
        self.weight = weight
        self.onDismiss = onDismiss
    }

    public var body: some View {
        ZStack {
            matter
            Color.black.opacity(LongPressVeilLaw.dim(weight: weight, reduceTransparency: reduceTransparency))
        }
        .ignoresSafeArea()
        .opacity(visibility)
        .contentShape(Rectangle())
        .onTapGesture(perform: onDismiss)
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var matter: some View {
        switch LongPressVeilLaw.matter(weight: weight, reduceTransparency: reduceTransparency) {
        case .translucent:
            Rectangle().fill(.ultraThinMaterial)
        case .opaque:
            Color(white: LongPressVeilLaw.opaqueWhite(isDark: colorScheme == .dark))
        case nil:
            Color.clear
        }
    }
}
