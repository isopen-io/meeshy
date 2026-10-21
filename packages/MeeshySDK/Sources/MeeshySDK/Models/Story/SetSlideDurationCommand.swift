import CoreGraphics
import Foundation

/// Allonge (ou raccourcit) la timeline elle-même — ce que pose « +10 s ».
///
/// La commande porte AUSSI la durée d'auteur d'avant : c'est le champ qui
/// distingue une longueur voulue d'un simple calcul du contenu, et sans lui
/// l'annulation aurait rendu la durée au projet pour se la faire aussitôt
/// reprendre par le premier recalcul venu.
public struct SetSlideDurationCommand: EditCommand {
    public let id: String
    public let timestamp: Date
    public let oldDuration: Float
    public let newDuration: Float
    /// Durée d'auteur d'avant la commande — `nil` quand la longueur dérivait
    /// encore du contenu seul.
    public let oldAuthoredDuration: Float?

    public init(id: String = UUID().uuidString,
                timestamp: Date = Date(),
                oldDuration: Float,
                newDuration: Float,
                oldAuthoredDuration: Float?) {
        self.id = id
        self.timestamp = timestamp
        self.oldDuration = oldDuration
        self.newDuration = newDuration
        self.oldAuthoredDuration = oldAuthoredDuration
    }

    public func apply(to project: inout TimelineProject) throws {
        project.slideDuration = newDuration
    }

    public func revert(from project: inout TimelineProject) throws {
        project.slideDuration = oldDuration
    }
}
