import CoreGraphics

/// **Quelle page le pager vertical montre-t-il VRAIMENT ?** (#9837)
///
/// `scrollPosition(id:)` sans ancre rend la page au bord d'attaque de la zone
/// visible : en avant, la page quittée le reste jusqu'à la fin de la
/// décélération ; en arrière, la précédente le devient dès son premier point.
/// Un lecteur qui démarre son média sur cette valeur démarre trop tard dans un
/// sens, trop tôt dans l'autre.
///
/// La règle juste est géométrique et symétrique : une page est ÉLUE quand plus
/// de la moitié de sa hauteur est dans la zone visible. Strictement plus : à la
/// moitié exacte, aucune des deux pages ne l'est et la précédente reste élue —
/// deux pages ne peuvent jamais l'être à la fois.
public enum VerticalPagerMajority {

    /// - Parameters:
    ///   - pageHeight: hauteur de la page.
    ///   - viewport: la zone visible du défilement, exprimée dans le repère de
    ///     la page (`GeometryProxy.bounds(of: .scrollView(axis: .vertical))`),
    ///     ou `nil` quand la page n'est dans aucun défilement.
    public nonisolated static func isMajorityVisible(pageHeight: CGFloat, viewport: CGRect?) -> Bool {
        false
    }
}
