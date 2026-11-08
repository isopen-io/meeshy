import UIKit

/// L'état du dépliage EN PLACE des messages longs dans le fil UIKit (#8147,
/// #8157, #16463) : les messages dépliés et, le temps que la hauteur du
/// dernier se pose, le bord qu'il faut tenir immobile.
///
/// Propriété du contrôleur du fil, recréé à chaque ouverture de la
/// conversation : rouvrir la conversation rend tout replié.
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

    /// Les messages dépliés — ils le restent tant que le fil vit.
    var expandedIds: Set<String> = []
    var hold: Hold?
    var contentSizeObservation: NSKeyValueObservation?
}
