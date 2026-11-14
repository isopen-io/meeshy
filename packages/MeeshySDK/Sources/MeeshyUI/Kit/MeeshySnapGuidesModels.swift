import SwiftUI

/// Les lignes d'aimantation, en FRACTIONS du calque (0 à 1, comptées depuis la
/// gauche et le haut physiques). `vertical` : les abscisses des lignes
/// verticales ; `horizontal` : les ordonnées des lignes horizontales. Hors
/// bornes et non fini, une fraction est ignorée au dessin.
public nonisolated struct MeeshySnapLines: Sendable, Equatable, Hashable {
    public let vertical: [CGFloat]
    public let horizontal: [CGFloat]

    public init(vertical: [CGFloat] = [], horizontal: [CGFloat] = []) {
        self.vertical = vertical
        self.horizontal = horizontal
    }

    public static let none = MeeshySnapLines()

    public var isEmpty: Bool { vertical.isEmpty && horizontal.isEmpty }
}

/// Le tic que le calque joue à l'entrée d'une nouvelle ligne engagée. `none`
/// laisse l'hôte jouer le sien.
public nonisolated enum MeeshySnapHaptic: String, Sendable, Equatable, CaseIterable {
    case light
    case none
}

/// Ce que le halo suit : la silhouette de l'objet (sticker, texte, dessin) ou
/// la boîte arrondie d'un média opaque.
public nonisolated enum MeeshySelectionHaloShape: Sendable, Equatable {
    case content
    case rounded(CGFloat)
}
