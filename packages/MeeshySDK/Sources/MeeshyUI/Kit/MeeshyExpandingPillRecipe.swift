import SwiftUI

/// **Toutes les valeurs de la pilule qui s'ouvre** (K11), nulle part ailleurs.
/// Les jetons du design system y sont nommés ; ce qui n'a pas de jeton (la part
/// de l'hôte, le plancher du corps, l'échelle d'entrée, le glissement du web, le
/// rayon d'un choix) vit ici. Les durées et le ressort sont ceux de K10.
public nonisolated enum MeeshyExpandingPillRecipe {

    // MARK: Mesures

    /// Marge intérieure du panneau : 10 en haut, 12 sur les côtés (planche `.xp`).
    public static let topInset: CGFloat = MeeshySpacing.smPlus
    public static let sideInset: CGFloat = MeeshySpacing.md
    /// Écart entre l'en-tête, le corps et la rangée.
    public static let sectionGap: CGFloat = MeeshySpacing.md
    /// Sous la rangée de K10, qui porte déjà ses 8 : de quoi faire 12.
    public static let bottomInsetBeforeRow: CGFloat = MeeshySpacing.md - MeeshyGlassPillRecipe.inset
    /// Sans rangée, le corps est suivi de la même marge que le haut.
    public static let bottomInsetWithoutRow: CGFloat = MeeshySpacing.smPlus
    public static let headerButtonSize: MeeshyGlassButtonSize = .s40
    public static let headerButtonGap: CGFloat = MeeshySpacing.xsPlus

    // MARK: Confirmation

    public static let confirmationInset: CGFloat = MeeshySpacing.lg
    public static let confirmationGap: CGFloat = MeeshySpacing.md
    public static let choiceGap: CGFloat = MeeshySpacing.sm
    public static let choiceHeight: CGFloat = 44
    public static let choiceRadius: CGFloat = 22
    public static let choiceInset: CGFloat = MeeshySpacing.lg

    // MARK: Hauteur

    /// Le verre entier ne dépasse pas cette part de la hauteur de l'hôte.
    public static let hostShare: CGFloat = 0.62
    /// Le corps n'est jamais plus bas que cela, quel que soit l'hôte.
    public static let bodyFloor: CGFloat = 160
    /// Le fondu de bord du corps qui défile.
    public static let edgeFade: CGFloat = MeeshyGlassPillRecipe.edgeFade

    // MARK: Mouvement

    /// Le contenu entre et sort avec cette échelle, ancrée en bas (iOS, Android).
    public static let enterScale: CGFloat = 0.94
    /// Le glissement d'entrée du web, en pixels ; iOS ne le joue pas.
    public static let webSlide: CGFloat = 8
    public static let fadeDuration: TimeInterval = MeeshyGlassPillRecipe.stowDuration
    public static let reducedFadeDuration: TimeInterval = MeeshyGlassPillRecipe.reducedSizeDuration

    /// Le fondu du contenu ; sous « réduire les animations », 200 ms et rien d'autre.
    public static func fadeAnimation(reduceMotion: Bool) -> Animation {
        .easeInOut(duration: reduceMotion ? reducedFadeDuration : fadeDuration)
    }

    // MARK: Fonds des choix

    /// Le fond du choix neutre : le voile `soft` de K02.
    public static var neutralFillOpacity: Double { MeeshyGlassButtonRecipe.softRestOpacity }
    public static var neutralPressedFillOpacity: Double { MeeshyGlassButtonRecipe.softPressedOpacity }
    public static var destructivePressedFillOpacity: Double { MeeshyGlassButtonRecipe.pressedActiveFillOpacity }

    /// Le rouge plein du choix destructif. Le libellé blanc y doit tenir 4,5:1
    /// (le glyphe d'un bouton rond se contente de 3:1, un libellé non) : c'est le
    /// rouge d'encre du design system, `errorStrong` n'en tient que 3,8.
    public static let destructiveFill: Color = MeeshyColors.errorInk
    public static let destructiveInk: Color = MeeshyColors.onMedia
    public static let secondaryInk: Color = MeeshyColors.mediaChromeSecondary
}

/// Ce que K11 fait de la présence que l'hôte remet à K10.
public nonisolated enum MeeshyExpandingPillRule {

    /// Qui, de ‹, ✕ ou de l'échappement de l'hôte, répond à Échap.
    public nonisolated enum EscapeTarget: String, Sendable, Equatable {
        case escape
        case back
        case close
        case none
    }

    /// La présence remise à K10 : l'hôte choisit `shown` ou `stowed` ; K11 choisit
    /// seul `withoutRow`, quand l'option ouverte ne garde pas la rangée. Une pilule
    /// rangée le reste, quelle que soit l'option.
    public static func presence(
        host: MeeshyGlassPillPresence,
        option: MeeshyExpandingPillOption?
    ) -> MeeshyGlassPillPresence {
        guard !host.isStowed, let option else { return host }
        return option.keepsRow ? host : .withoutRow
    }

    /// Un panneau ouvert est montré, sauf un corps de hauteur nulle sans en-tête :
    /// la pilule reste alors fermée, jamais une bande vide (loi 13).
    public static func isOpen(option: MeeshyExpandingPillOption?, bodyIsEmpty: Bool) -> Bool {
        guard let option else { return false }
        return option.showsHeader || !bodyIsEmpty
    }

    /// Un bouton d'en-tête n'existe que si son rappel existe.
    public static func hasBack(onBack: Bool) -> Bool { onBack }
    public static func hasClose(onClose: Bool) -> Bool { onClose }

    /// Ce que l'en-tête pose à ses deux bords.
    public nonisolated struct HeaderSlots: Equatable, Sendable {
        public let back: Bool
        public let close: Bool
        /// ‹ absent : sa place reste réservée, le titre ne glisse pas vers le début.
        public let reservesStart: Bool
        /// Ni ✕ ni accessoire : la place de ✕ reste réservée. Sans ✕, un accessoire
        /// prend le bord de fin (O9).
        public let reservesEnd: Bool
    }

    public static func headerSlots(hasBack: Bool, hasClose: Bool, hasTrailing: Bool) -> HeaderSlots {
        HeaderSlots(back: hasBack, close: hasClose, reservesStart: !hasBack, reservesEnd: !hasClose && !hasTrailing)
    }

    /// La marge du titre, la même des deux côtés : la plus large des deux bords plus
    /// l'écart. Le titre reste centré et ne passe jamais sous un bouton ni sous
    /// l'accessoire.
    public static func headerTitleInset(start: CGFloat, end: CGFloat, gap: CGFloat) -> CGFloat {
        let widest = [start, end].filter(\.isFinite).max() ?? 0
        return max(widest, 0) + (gap.isFinite ? max(gap, 0) : 0)
    }

    /// Échap, retour matériel, échappement du lecteur d'écran : le rappel dédié de
    /// l'hôte, sinon ‹, sinon ✕. Fermée, K11 n'écoute rien.
    public static func escapeTarget(isOpen: Bool, hasEscape: Bool, hasBack: Bool, hasClose: Bool) -> EscapeTarget {
        guard isOpen else { return .none }
        if hasEscape { return .escape }
        if hasBack { return .back }
        return hasClose ? .close : .none
    }

    /// Les marges du panneau : une confirmation a ses 16 tout autour ; sinon 10 en
    /// haut, 12 sur les côtés, et sous le corps de quoi faire 12 avec la rangée.
    public static func insets(for option: MeeshyExpandingPillOption) -> EdgeInsets {
        if option.isConfirmation {
            let side = MeeshyExpandingPillRecipe.confirmationInset
            return EdgeInsets(top: side, leading: side, bottom: side, trailing: side)
        }
        return EdgeInsets(
            top: MeeshyExpandingPillRecipe.topInset,
            leading: MeeshyExpandingPillRecipe.sideInset,
            bottom: option.keepsRow
                ? MeeshyExpandingPillRecipe.bottomInsetBeforeRow
                : MeeshyExpandingPillRecipe.bottomInsetWithoutRow,
            trailing: MeeshyExpandingPillRecipe.sideInset
        )
    }

    // MARK: Hauteur

    /// Le plafond du corps : la part de l'hôte moins l'en-tête, la rangée et les
    /// marges, jamais sous le plancher ; `override` (grille d'un appel, journal)
    /// la remplace. Une hauteur d'hôte pas encore mesurée donne le plancher.
    public static func bodyCeiling(
        hostHeight: CGFloat,
        option: MeeshyExpandingPillOption,
        override: CGFloat? = nil
    ) -> CGFloat {
        if let override, override.isFinite { return max(override, 0) }
        let host = hostHeight.isFinite ? max(hostHeight, 0) : 0
        let edge = insets(for: option)
        let header = option.showsHeader
            ? CGFloat(MeeshyExpandingPillRecipe.headerButtonSize.diameter) + MeeshyExpandingPillRecipe.sectionGap
            : 0
        let row = option.keepsRow ? MeeshyGlassPillRecipe.restingHeight : 0
        let chrome = header + row + edge.top + edge.bottom
        return max(host * MeeshyExpandingPillRecipe.hostShare - chrome, MeeshyExpandingPillRecipe.bodyFloor)
    }

    /// Au-delà du plafond le corps défile, en-tête et rangée fixes ; en deçà, il
    /// garde sa taille et rien ne défile.
    public static func scrolls(contentHeight: CGFloat, ceiling: CGFloat) -> Bool {
        contentHeight.isFinite && contentHeight > ceiling + MeeshyScrollEdges.tolerance
    }

    // MARK: Confirmation

    /// Neutre au début, destructif à la fin : l'ordre de lecture ne dépend pas de
    /// l'ordre dans lequel l'hôte donne ses deux choix.
    public static func ordered(_ choices: [MeeshyPillChoice]) -> [MeeshyPillChoice] {
        choices.filter { $0.role == .neutral } + choices.filter { $0.role == .destructive }
    }

    /// Les deux choix de largeur égale côte à côte, ou empilés quand l'un d'eux
    /// ne tient plus dans sa moitié.
    public static func stacksChoices(idealWidths: [CGFloat], available: CGFloat, gap: CGFloat) -> Bool {
        guard idealWidths.count > 1, available.isFinite else { return false }
        let half = (available - gap * CGFloat(idealWidths.count - 1)) / CGFloat(idealWidths.count)
        return (idealWidths.max() ?? 0) > half
    }
}
