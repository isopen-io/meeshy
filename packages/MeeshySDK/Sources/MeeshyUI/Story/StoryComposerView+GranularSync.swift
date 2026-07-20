import SwiftUI
import MeeshySDK

/// Modifieur de vue pour décharger le type-checker SwiftUI (qui a un
/// budget d'exécution limité) du `body` géant de `StoryComposerView`. 
/// Au lieu de calculer un "Fingerprint" artificiel (qui itérait sur 
/// tous les stickers à chaque rendu), ce helper permet un tracking 
/// granulaire en O(1).
extension View {
    @ViewBuilder
    func granularCanvasSync(
        filter: String?,
        hasImage: Bool,
        stickersCount: Int,
        drawingCount: Int,
        bgColor: String,
        opening: StoryTransitionEffect?,
        action: @escaping () -> Void
    ) -> some View {
        self
            .adaptiveOnChange(of: filter) { _, _ in action() }
            .adaptiveOnChange(of: hasImage) { _, _ in action() }
            .adaptiveOnChange(of: stickersCount) { _, _ in action() }
            .adaptiveOnChange(of: drawingCount) { _, _ in action() }
            .adaptiveOnChange(of: bgColor) { _, _ in action() }
            .adaptiveOnChange(of: opening) { _, _ in action() }
    }
}
