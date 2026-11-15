import SwiftUI

/// **La loi 13 du cadre, en fonction pure** (K16) : ce qui est dessiné d'après ce que l'hôte fournit.
/// Pas de validation sans `confirm`, ni de centre ni d'accessoire sans emplacement garni, ni de plaque
/// (donc ni verre ni bande vide) sans contenu. Rangé : rien de visible, rien de touchable.
public nonisolated struct MeeshyModeChromeRule: Equatable, Sendable {
    public let showsHeader: Bool
    public let showsExit: Bool
    public let showsConfirm: Bool
    public let showsCenter: Bool
    public let showsAccessory: Bool
    public let showsPlate: Bool
    /// Le cadre reçoit les touchers de ses capsules et de sa plaque ; hors d'elles, il n'en reçoit jamais.
    public let acceptsTouches: Bool

    public static func resolve(
        hasConfirm: Bool,
        hasCenter: Bool,
        hasAccessory: Bool,
        hasPlate: Bool,
        presence: MeeshyModeChromePresence
    ) -> MeeshyModeChromeRule {
        let shown = !presence.isStowed
        return MeeshyModeChromeRule(
            showsHeader: shown,
            showsExit: shown,
            showsConfirm: shown && hasConfirm,
            showsCenter: shown && hasCenter,
            showsAccessory: shown && hasAccessory,
            showsPlate: shown && hasPlate,
            acceptsTouches: shown
        )
    }
}

/// **La loi d'ajustement de l'en-tête** (K16). Quand il ne tient plus, il réduit dans cet ordre : le
/// centre en glyphe seul, la validation en coche (si elle a un glyphe), puis les libellés à 80 % avec
/// troncature (le centre d'abord, la validation ensuite, Quitter en dernier).
///
/// Largeur requise : le côté de début (Quitter), le côté de fin (accessoire, validation, joints par
/// l'écart), et le centre posé au milieu DU CADRE : il exige donc deux fois le plus large des côtés.
/// La vue réalise la loi par `ViewThatFits` sur quatre candidats ; les vecteurs prouvent l'égalité.
public nonisolated enum MeeshyModeHeaderFit {

    public enum Step: String, Sendable, Equatable, CaseIterable {
        case full
        case centerGlyph
        case confirmGlyph
        case compact

        public var reducesCenter: Bool { self != .full }
        public var reducesConfirm: Bool { self == .confirmGlyph || self == .compact }
        public var labelScale: CGFloat { self == .compact ? MeeshyModeChromeRecipe.minimumLabelScale : 1 }
    }

    /// Une capsule vue de la loi : la largeur de son titre et ce qu'elle sait montrer.
    public struct Item: Equatable, Sendable {
        public let textWidth: CGFloat
        public let hasGlyph: Bool
        public let display: MeeshyModeCapsuleDisplay

        public init(textWidth: CGFloat, hasGlyph: Bool, display: MeeshyModeCapsuleDisplay) {
            self.textWidth = textWidth
            self.hasGlyph = hasGlyph
            self.display = display
        }

        func width(reducedToGlyph: Bool, labelScale: CGFloat) -> CGFloat {
            MeeshyModeChromeRecipe.capsuleWidth(
                textWidth: textWidth, hasGlyph: hasGlyph,
                display: reducedToGlyph && hasGlyph ? .glyph : display, labelScale: labelScale
            )
        }
    }

    public struct Result: Equatable, Sendable {
        public let step: Step
        /// La largeur requise au pas retenu.
        public let width: CGFloat
        /// Faux quand même le pas le plus serré ne tient pas : la troncature fait le reste.
        public let fits: Bool
    }

    /// La largeur requise de l'en-tête pour des largeurs de capsules données.
    public static func requiredWidth(
        exit: CGFloat,
        center: CGFloat?,
        accessory: CGFloat?,
        confirm: CGFloat?,
        gap: CGFloat = MeeshyModeChromeRecipe.itemGap
    ) -> CGFloat {
        let trailing = joined([accessory, confirm], gap: gap)
        let sides = joined([exit, trailing > 0 ? trailing : nil], gap: gap)
        guard let center, center > 0 else { return sides }
        return max(sides, center + 2 * (max(exit, trailing) + gap))
    }

    public static func resolve(
        available: CGFloat,
        exit: Item,
        center: Item?,
        accessory: CGFloat?,
        confirm: Item?,
        gap: CGFloat = MeeshyModeChromeRecipe.itemGap
    ) -> Result {
        let place = available.isFinite ? max(available, 0) : 0
        var last = Result(step: .compact, width: 0, fits: false)
        for step in Step.allCases {
            let width = requiredWidth(
                exit: exit.width(reducedToGlyph: false, labelScale: step.labelScale),
                center: center?.width(reducedToGlyph: step.reducesCenter, labelScale: step.labelScale),
                accessory: accessory,
                confirm: confirm?.width(reducedToGlyph: step.reducesConfirm, labelScale: step.labelScale),
                gap: gap
            )
            last = Result(step: step, width: width, fits: width <= place)
            if last.fits { return last }
        }
        return last
    }

    /// Les largeurs rendues quand la place manque encore au pas le plus serré : le centre cède d'abord
    /// (dans l'espace symétrique qui lui reste), puis la validation, Quitter en dernier ; l'accessoire,
    /// un bouton, ne se tronque pas.
    public static func allocate(
        available: CGFloat,
        exit: CGFloat,
        center: CGFloat?,
        accessory: CGFloat?,
        confirm: CGFloat?,
        gap: CGFloat = MeeshyModeChromeRecipe.itemGap
    ) -> Allocation {
        let place = available.isFinite ? max(available, 0) : 0
        let fixed = accessory ?? 0
        let items = 1 + (accessory == nil ? 0 : 1) + (confirm == nil ? 0 : 1)
        let room = max(place - gap * CGFloat(items - 1), 0)
        let confirmShare = confirm.map { min($0, max(room - exit - fixed, 0)) }
        let exitShare = min(exit, max(room - fixed - (confirmShare ?? 0), 0))
        let trailing = joined([accessory, confirmShare], gap: gap)
        let centerShare = center.map { min($0, max(place - 2 * (max(exitShare, trailing) + gap), 0)) }
        return Allocation(exit: exitShare, center: centerShare, accessory: accessory, confirm: confirmShare)
    }

    public struct Allocation: Equatable, Sendable {
        public let exit: CGFloat
        public let center: CGFloat?
        public let accessory: CGFloat?
        public let confirm: CGFloat?
    }

    private static func joined(_ widths: [CGFloat?], gap: CGFloat) -> CGFloat {
        let present = widths.compactMap { $0 }.filter { $0 > 0 }
        guard !present.isEmpty else { return 0 }
        return present.reduce(0, +) + gap * CGFloat(present.count - 1)
    }
}

/// **La loi de hauteur et de pose de la plaque** (K16) : elle épouse son contenu jusqu'à 42 % de la
/// fenêtre (jamais moins de 160), puis défile ; son bas suit la zone sûre comme la pilule de K10 ; sa
/// largeur est celle que l'hôte lui laisse, bornée.
public nonisolated enum MeeshyModePlateMetrics {

    public static func maxHeight(windowHeight: CGFloat) -> CGFloat {
        guard windowHeight.isFinite, windowHeight > 0 else { return MeeshyModeChromeRecipe.plateFloor }
        return max(MeeshyModeChromeRecipe.plateFloor, windowHeight * MeeshyModeChromeRecipe.plateCeilingShare)
    }

    /// La hauteur : le contenu (au moins 1, avant sa première mesure), plafonnée.
    public static func height(content: CGFloat, windowHeight: CGFloat) -> CGFloat {
        let measured = content.isFinite ? content : 0
        return min(max(measured, 1), maxHeight(windowHeight: windowHeight))
    }

    /// Le contenu dépasse son plafond : la plaque défile.
    public static func scrolls(content: CGFloat, windowHeight: CGFloat) -> Bool {
        content.isFinite && content > maxHeight(windowHeight: windowHeight)
    }

    /// Le bas : la zone sûre plus 12, jamais sous 28.
    public static func bottomMargin(safeBottom: CGFloat) -> CGFloat {
        max(safeBottom + MeeshyModeChromeRecipe.plateBottomGap, MeeshyModeChromeRecipe.plateMinimumBottom)
    }

    /// La largeur : la place moins les deux bords, bornée par `maxWidth` quand l'hôte en donne un.
    public static func width(available: CGFloat, maxWidth: CGFloat?) -> CGFloat {
        guard available.isFinite else { return 0 }
        let room = max(available - 2 * MeeshyModeChromeRecipe.plateEdge, 0)
        guard let maxWidth, maxWidth.isFinite else { return room }
        return min(room, max(maxWidth, 0))
    }
}
