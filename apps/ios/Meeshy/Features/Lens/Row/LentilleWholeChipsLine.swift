import SwiftUI

/// **Chips ENTIÈRES (#10835), sans `ViewThatFits`.** La ligne garde sa largeur idéale ; quand la place offerte ne la
/// loge pas (Split View, Slide Over, barre latérale de l'iPad), elle défile au lieu de comprimer puis rogner ses
/// pastilles.
///
/// Pas de `ViewThatFits` ici : sous iOS 26 il mesure ses candidats sur le rendu asynchrone, et ces lignes atteignent
/// des `ForEach` et des `GeometryReader` (menus de catégorie, avatars, humeur) isolés au main actor — ils y trappent
/// (garde ViewThatFitsAsyncRenderGuardTests). Les deux largeurs sont mesurées par la mise en page, sur le fil principal.
/// `onGeometryChange` : iOS 16+ (rétro-déployé).
struct LentilleWholeChipsLine<Content: View>: View {
    private let content: Content
    @State private var contentWidth: CGFloat = 0
    @State private var availableWidth: CGFloat = 0

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    /// La ligne défile seulement si elle dépasse vraiment la place offerte (demi-point de tolérance d'arrondi).
    nonisolated static func scrolls(contentWidth: CGFloat, availableWidth: CGFloat) -> Bool {
        availableWidth > 0 && contentWidth > availableWidth + 0.5
    }

    var body: some View {
        let line = content
            .fixedSize(horizontal: true, vertical: false)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { contentWidth = $0 }
        Group {
            if Self.scrolls(contentWidth: contentWidth, availableWidth: availableWidth) {
                ScrollView(.horizontal, showsIndicators: false) { line }
            } else {
                line
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { availableWidth = $0 }
    }
}
