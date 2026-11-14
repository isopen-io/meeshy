import SwiftUI

/// **La loi d'ajustement** : on retient la première taille de bouton (48, 44,
/// 40) dont la pilule tient dans la place ; sinon 40, et la rangée défile sous
/// un fondu de bord, l'action principale restant fixe.
///
/// `largeur(d) = n·d + (n−1)·6 + (primary ? 6 + largeur de primary : 0) + 16`,
/// place = largeur de l'hôte − 24. Un `primary` seul pèse sa largeur plus 16,
/// sans écart ; rien du tout pèse 0.
///
/// La pilule rendue réalise cette loi par `ViewThatFits` sur quatre candidats
/// (48, 44, 40, 40 qui défile) : le nombre de boutons ne se compte pas dans un
/// `@ViewBuilder`, la mesure l'épargne. Les vecteurs prouvent l'égalité.
public nonisolated enum MeeshyGlassPillFit {

    public struct Result: Equatable, Sendable {
        public let size: MeeshyGlassButtonSize
        public let scrolls: Bool
        public let width: CGFloat

        public init(size: MeeshyGlassButtonSize, scrolls: Bool, width: CGFloat) {
            self.size = size
            self.scrolls = scrolls
            self.width = width
        }
    }

    /// Les deux bords d'écran de 12 que la pilule laisse libres.
    public static let hostMargin: CGFloat = 2 * MeeshyGlassPillRecipe.defaultSideMargin

    public static func place(forHostWidth hostWidth: CGFloat) -> CGFloat {
        guard hostWidth.isFinite else { return 0 }
        return max(hostWidth - hostMargin, 0)
    }

    public static func requiredWidth(buttonCount: Int, diameter: CGFloat, primaryWidth: CGFloat?) -> CGFloat {
        let buttons = max(buttonCount, 0)
        let primary = primaryWidth.map { $0.isFinite ? max($0, 0) : 0 }
        let items = buttons + (primary == nil ? 0 : 1)
        guard items > 0 else { return 0 }
        let content = CGFloat(buttons) * diameter + (primary ?? 0)
        return content + CGFloat(items - 1) * MeeshyGlassPillRecipe.gap + 2 * MeeshyGlassPillRecipe.inset
    }

    public static func resolve(availableWidth: CGFloat, buttonCount: Int, primaryWidth: CGFloat? = nil) -> Result {
        let place = availableWidth.isFinite ? max(availableWidth, 0) : 0
        for size in MeeshyGlassPillRecipe.sizes {
            let required = requiredWidth(buttonCount: buttonCount, diameter: CGFloat(size.diameter), primaryWidth: primaryWidth)
            if required <= place { return Result(size: size, scrolls: false, width: required) }
        }
        return Result(size: .s40, scrolls: buttonCount > 0, width: place)
    }
}
