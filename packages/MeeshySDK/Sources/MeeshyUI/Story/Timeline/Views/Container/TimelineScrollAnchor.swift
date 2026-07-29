import SwiftUI

/// Point invisible que le scroll programmatique de la timeline prend pour
/// cible : le playhead pendant la lecture, le décalage demandé par la poignée
/// de défilement sous les pistes.
///
/// L'ancre porte son décalage dans le LAYOUT, pas dans le rendu. C'est toute
/// la question : `ScrollViewProxy.scrollTo(id:)` vise les bounds de la vue
/// identifiée, et `.offset(x:)` ne les déplace pas — il ne déplace que le
/// dessin. Les deux ancres étaient donc restées à l'origine pour le layout, et
/// aucun `scrollTo` ne bougeait : pendant la lecture d'une timeline plus large
/// que l'écran (dès « +10 s », ou dès un zoom), le playhead sortait du viewport
/// sans que la vue le suive, et la poignée ne faisait rien non plus. Restait le
/// glissement au doigt — que les barres de clip captent en priorité pour
/// déplacer le clip. Plus aucun chemin de navigation horizontale.
struct TimelineScrollAnchor: View {

    /// Position visée, en points, dans l'espace du contenu défilant.
    /// Un décalage négatif est ramené à zéro : le layout d'une largeur
    /// négative propagerait l'erreur à tout le contenu.
    let x: CGFloat
    let anchorId: String

    var body: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: max(0, x), height: 1)
            Color.clear.frame(width: 1, height: 1).id(anchorId)
        }
    }
}
