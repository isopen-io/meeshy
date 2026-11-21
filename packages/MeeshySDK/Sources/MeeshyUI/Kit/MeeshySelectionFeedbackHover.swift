import SwiftUI

public extension View {
    /// Le survol au pointeur de K23 pour une commande qui le suit elle-même :
    /// soulèvement, anneau et ombre à la teinte `tint` (défaut : la marque), et
    /// le pointeur iPadOS aimanté sur `shape`. Au toucher, rien ne change : seul
    /// un pointeur (trackpad, souris) survole.
    ///
    /// Ne prend aucun toucher, n'agrandit pas la cible et ne change pas la mise
    /// en page : l'échelle et les lueurs sont des effets de rendu.
    func meeshyPointerLift<S: InsettableShape>(in shape: S, tint: Color? = nil) -> some View {
        modifier(MeeshyPointerHoverModifier(shape: shape, tint: tint))
    }

    /// Le soulèvement seul, pour un hôte dont la zone de survol déborde la partie
    /// qui se soulève (K32 : la colonne entière est survolée, le disque se
    /// soulève). L'hôte suit le survol et pose `meeshyPointerMagnet` sur sa zone.
    func meeshyPointerLift<S: InsettableShape>(in shape: S, tint: Color? = nil, isHovered: Bool) -> some View {
        modifier(MeeshyPointerLiftModifier(shape: shape, tint: tint, isHovered: isHovered))
    }

    /// L'aimantation iPadOS : le pointeur prend la forme `shape` de la commande.
    /// Retirée sur une commande éteinte (`isActive` faux ou `.disabled`) et sous
    /// « réduire les animations ».
    func meeshyPointerMagnet<S: Shape>(in shape: S, isActive: Bool = true) -> some View {
        modifier(MeeshyPointerMagnetModifier(shape: shape, isActive: isActive))
    }
}

/// Suit le survol, puis délègue le rendu et l'aimantation : un seul site pour
/// la peinture (`MeeshyPointerLiftModifier`) et un seul pour l'aimantation.
private struct MeeshyPointerHoverModifier<S: InsettableShape>: ViewModifier {
    let shape: S
    let tint: Color?

    @State private var isHovered = false

    func body(content: Content) -> some View {
        content
            .meeshyPointerLift(in: shape, tint: tint, isHovered: isHovered)
            .meeshyPointerMagnet(in: shape)
            .onHover { hovering in isHovered = hovering }
    }
}

/// La peinture du survol. La structure du contenu ne dépend jamais du survol :
/// seules l'échelle, l'opacité de l'anneau et celle de l'ombre changent, et
/// l'anneau, posé en arrière-plan, n'entre dans l'arbre qu'allumé. L'état
/// peint est LOCAL : son fondu ne touche à aucun autre changement de l'hôte.
private struct MeeshyPointerLiftModifier<S: InsettableShape>: ViewModifier {
    let shape: S
    let tint: Color?
    let isHovered: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion
    @State private var lit: Bool

    init(shape: S, tint: Color?, isHovered: Bool) {
        self.shape = shape
        self.tint = tint
        self.isHovered = isHovered
        _lit = State(initialValue: isHovered)
    }

    func body(content: Content) -> some View {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        let paint = MeeshyPointerLiftRecipe.paint(isHovered: lit, isEnabled: isEnabled, reduceMotion: reduce)
        let ink = tint ?? MeeshyColors.brandPrimary
        let shadowed = paint.shadowOpacity > 0
        return content
            .background { ring(paint.ringOpacity, ink: ink) }
            .shadow(
                color: ink.opacity(paint.shadowOpacity),
                radius: shadowed ? MeeshyPointerLiftRecipe.shadowRadius : 0,
                y: shadowed ? MeeshyPointerLiftRecipe.shadowOffsetY : 0
            )
            .scaleEffect(paint.scale)
            .adaptiveOnChange(of: isHovered) { _, hovered in
                let fade = MeeshyPointerLiftRecipe.fade(appearing: hovered, reduceMotion: reduce)
                withAnimation(fade) { lit = hovered }
            }
    }

    /// L'anneau, tout entier hors de la forme : il ne recouvre jamais la commande.
    @ViewBuilder
    private func ring(_ opacity: Double, ink: Color) -> some View {
        if opacity > 0 {
            shape
                .inset(by: -MeeshyPointerLiftRecipe.ringWidth)
                .strokeBorder(ink.opacity(opacity), lineWidth: MeeshyPointerLiftRecipe.ringWidth)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }
}

/// L'aimantation système : la forme du survol, l'effet `highlight` d'iPadOS,
/// coupé (iOS 17+) quand la commande est éteinte ou que les animations sont
/// réduites. Avant iOS 17, le système suit lui-même son réglage.
private struct MeeshyPointerMagnetModifier<S: Shape>: ViewModifier {
    let shape: S
    let isActive: Bool

    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var userReduceMotion

    @ViewBuilder
    func body(content: Content) -> some View {
        let shaped = content
            .contentShape(.hoverEffect, shape)
            .hoverEffect(.highlight)
        if #available(iOS 17.0, *) {
            shaped.hoverEffectDisabled(!magnetizes)
        } else {
            shaped
        }
    }

    private var magnetizes: Bool {
        let reduce = MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: userReduceMotion)
        return MeeshyPointerLiftRecipe.magnetizes(isEnabled: isEnabled && isActive, reduceMotion: reduce)
    }
}
