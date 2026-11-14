import CoreGraphics

/// **L'ajustement de « OK »** (K17) : la capsule grandit sur une ligne avec son titre, puis passe en coche
/// quand la rangée ne tient plus. Son nom reste dit. Même arithmétique que le rendu, qui laisse le système
/// de mise en page trancher.
public nonisolated enum MeeshyKeyboardBarFit {

    public enum Display: String, Sendable, Equatable {
        case title
        case check
    }

    public static func confirmWidth(titleWidth: CGFloat) -> CGFloat {
        max(MeeshyKeyboardDockRecipe.confirmHeight, titleWidth + 2 * MeeshyKeyboardDockRecipe.confirmMargin)
    }

    public static func requiredWidth(itemCount: Int, titleWidth: CGFloat) -> CGFloat {
        let count = max(0, min(itemCount, MeeshyKeyboardDockRecipe.maxItems))
        return 2 * MeeshyKeyboardDockRecipe.barPadding
            + CGFloat(count) * MeeshyKeyboardDockRecipe.toolDiameter
            + confirmWidth(titleWidth: titleWidth)
    }

    public static func display(availableWidth: CGFloat, itemCount: Int, titleWidth: CGFloat) -> Display {
        requiredWidth(itemCount: itemCount, titleWidth: titleWidth) <= availableWidth ? .title : .check
    }
}
