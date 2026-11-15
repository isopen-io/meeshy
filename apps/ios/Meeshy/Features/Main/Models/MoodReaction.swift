import Foundation
import MeeshyUI

/// Ce qu'est devenue une réaction à une humeur, rendu par `StatusViewModel.reactToStatus`.
nonisolated enum StatusReactionOutcome: Equatable, Sendable {
    case sent
    case alreadyPlaced
    case failed
}

/// La réaction à une humeur, injectée depuis la racine (#18110) : la bulle et
/// la page plein écran passent par la MÊME `reactToStatus`, celle de l'instance
/// de `StatusViewModel` qui tient la barre des humeurs.
struct MoodReactionHandler {
    let react: @MainActor (_ statusId: String, _ emoji: String) async -> StatusReactionOutcome
    let placed: @MainActor (_ statusId: String) -> Set<String>
}

/// Les emojis posés sur UNE humeur par une surface, de façon optimiste : posés
/// au toucher, rendus sur refus, jamais renvoyés deux fois.
struct MoodReactionSelection: Equatable {
    static let emojis: [String] = MeeshyQuickReactions.standard

    private(set) var placed: Set<String>

    init(placed: Set<String> = []) {
        self.placed = placed
    }

    mutating func begin(_ emoji: String) -> Bool {
        placed.insert(emoji).inserted
    }

    mutating func settle(_ emoji: String, outcome: StatusReactionOutcome) {
        guard outcome == .failed else { return }
        placed.remove(emoji)
    }

    func merging(_ other: Set<String>) -> MoodReactionSelection {
        MoodReactionSelection(placed: placed.union(other))
    }
}
