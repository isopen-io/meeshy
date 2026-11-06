import SwiftUI
import MeeshySDK

// MARK: - Où la fiche et le plein écran se présentent (#16268)

/// **La navigation de toute vitrine** : la fiche d'un pack s'empile en feuille au-dessus de la
/// boutique (elle-même souvent une feuille), le plein écran au-dessus de la fiche — ou directement
/// au-dessus de la boutique quand on touche une couverture. Refermer l'un rend l'écran d'en dessous
/// tel qu'il était, défilement compris : la boutique ne se reconstruit pas.
struct PackShowcasePresentations: ViewModifier {
    @ObservedObject var model: PackShowcaseModel
    let context: (PackDomain) -> PackShowcaseContext

    func body(content: Content) -> some View {
        content
            .sheet(item: $model.detail, onDismiss: { model.viewer = nil }) { target in
                PackDetailView(model: model, target: target, context: context(target.domain))
            }
            .fullScreenCover(item: shopViewerBinding) { target in
                PackElementViewer(model: model, context: context(target.domain)) { model.viewer = nil }
            }
    }

    /// Le plein écran ouvert depuis la couverture d'une rangée ; ouvert depuis la fiche, c'est elle qui le présente.
    private var shopViewerBinding: Binding<PackViewerTarget?> {
        Binding(get: { model.detail == nil ? model.viewer : nil },
                set: { if model.detail == nil { model.viewer = $0 } })
    }
}

extension View {
    func packShowcase(_ model: PackShowcaseModel, context: @escaping (PackDomain) -> PackShowcaseContext) -> some View {
        modifier(PackShowcasePresentations(model: model, context: context))
    }
}
