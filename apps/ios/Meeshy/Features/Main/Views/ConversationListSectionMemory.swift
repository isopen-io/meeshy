import Foundation

/// Les sections dépliées de la liste des conversations, gardées pour la SESSION.
///
/// Sur iPad, la liste change de colonne quand une conversation s'ouvre ou se ferme (à droite sans conversation, à
/// gauche avec) : SwiftUI la reconstruit, et son `@State` repartait de zéro — les catégories que l'utilisateur avait
/// repliées se rouvraient, et la liste remontait en haut. La mémoire vit au-dessus de la vue : une liste qui se monte
/// reprend les sections telles que l'utilisateur les avait laissées.
@MainActor
final class ConversationListSectionMemory {
    nonisolated deinit {}

    static let shared = ConversationListSectionMemory()

    /// Les sections dépliées d'aujourd'hui, ou celles par défaut d'une première ouverture.
    static let defaults: Set<String> = ["pinned", "other"]

    private(set) var expanded: Set<String>?

    init() {}

    /// Ce qu'une liste qui se monte doit déplier.
    var initial: Set<String> { expanded ?? Self.defaults }

    func remember(_ sections: Set<String>) { expanded = sections }
}
