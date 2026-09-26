import UIKit

/// L'état du dépliage EN PLACE d'un message long dans le fil UIKit (#8147,
/// #8157) : le message déplié et, le temps que sa hauteur se pose, le bord
/// qu'il faut tenir immobile.
///
/// La hauteur d'une cellule `UIHostingConfiguration` se pose dans la passe
/// forcée par le dépliage — ou dans une passe ultérieure, quand SwiftUI
/// re-mesure plus tard. Le bord est donc tenu à CHAQUE changement de
/// `contentSize` pendant la fenêtre du dépliage, jamais sur une seule
/// mesure qui pourrait précéder la croissance.
struct LongMessageExpansionState {

    /// Le bord tenu pendant que la hauteur du déplié se pose.
    struct Hold {
        let id = UUID()
        let localId: String
        let anchor: LongMessageExpansionLaw.Anchor
        /// Ordonnée VISUELLE du bord, relevée avant la passe.
        let edge: CGFloat
    }

    /// Le message déplié — un seul à la fois.
    var localId: String?
    var hold: Hold?
    var contentSizeObservation: NSKeyValueObservation?
}
