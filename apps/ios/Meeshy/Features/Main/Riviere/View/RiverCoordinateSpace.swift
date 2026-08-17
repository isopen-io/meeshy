import Foundation

/// Nom du repère de coordonnées partagé par `RiverBubbleView` (qui publie
/// son cadre) et `RiverLaneCanvas` (qui le lit) — une seule maison pour cette
/// chaîne, jamais un littéral répété dans les deux fichiers.
enum RiverCoordinateSpace {
    static let name = "riverStream"
}
