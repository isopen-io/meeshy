import SwiftUI

/// Les deux cibles d'un glisser : la copie en haut, le retrait en bas. Aucune
/// autre : une cible existe si et seulement si l'hôte passe son rappel.
public nonisolated enum MeeshyDragTarget: String, Sendable, Equatable, Hashable, CaseIterable {
    case duplicate
    case remove
}

/// Le retour haptique de l'ENTRÉE dans une cible. `none` quand l'hôte joue le sien.
public nonisolated enum MeeshyDragTargetsHaptic: String, Sendable, Equatable, CaseIterable {
    case medium
    case none
}

/// Les quatre noms accessibles, traduits par l'hôte : le nom de chaque cible au
/// repos, puis celui qu'elle prend quand le doigt la survole. Obligatoires et
/// non vides : le kit ne porte aucun texte.
public nonisolated struct MeeshyDragTargetsLabels: Sendable, Equatable {
    public let duplicate: String
    public let duplicateHot: String
    public let remove: String
    public let removeHot: String

    public init(duplicate: String, duplicateHot: String, remove: String, removeHot: String) {
        assert(
            ![duplicate, duplicateHot, remove, removeHot].contains(where: \.isEmpty),
            "MeeshyDragTargets : les quatre noms accessibles sont obligatoires et non vides"
        )
        self.duplicate = duplicate
        self.duplicateHot = duplicateHot
        self.remove = remove
        self.removeHot = removeHot
    }

    public func name(of target: MeeshyDragTarget, isHot: Bool) -> String {
        switch (target, isHot) {
        case (.duplicate, false): return duplicate
        case (.duplicate, true): return duplicateHot
        case (.remove, false): return remove
        case (.remove, true): return removeHot
        }
    }
}
