import SwiftUI
import MeeshySDK

// MARK: - Les sorties de « Personne ici » (planche `Etat-Introuvable`, #18873)
//
// Le SDK ne connaît ni la recherche ni le lecteur de QR de l'app : l'app les remet ici, et la fiche les propose quand
// elle les a. Sans elles, « Personne ici » garde sa seule sortie, « Retour ».

/// Ce que l'app offre à qui tombe sur un profil introuvable : chercher quelqu'un, scanner un QR.
public struct ProfileUnavailableExits {
    /// Le lecteur de QR à présenter ; il reçoit de quoi fermer la fiche une fois un code ouvert.
    public typealias Scanner = (_ onOpened: @escaping () -> Void) -> AnyView

    /// La recherche de personnes que l'app sait faire, pour « Tu cherchais peut-être » : elle ne rend que ce que le
    /// serveur me laisse voir.
    public typealias Suggest = @Sendable (_ query: String) async -> [UserSearchResult]

    public let search: (() -> Void)?
    public let scanner: Scanner?
    public let suggest: Suggest?
    /// Ouvre la fiche de la personne suggérée, une fois celle-ci fermée.
    public let openSuggestion: ((UserSearchResult) -> Void)?

    public init(search: (() -> Void)? = nil, scanner: Scanner? = nil, suggest: Suggest? = nil,
                openSuggestion: ((UserSearchResult) -> Void)? = nil) {
        self.search = search
        self.scanner = scanner
        self.suggest = suggest
        self.openSuggestion = openSuggestion
    }

    /// Fermer d'abord, ouvrir ensuite : la fiche présentée par la même liaison que la suggestion (lien profond) effacerait
    /// en se fermant la personne qu'on vient d'y poser, et une feuille demandée pendant qu'une autre est à l'écran est
    /// ignorée. La suggestion s'ouvre donc une fois la fermeture jouée.
    @MainActor
    public func openSuggestionClosingFirst(_ person: UserSearchResult, close: () -> Void,
                                           delay: Duration = .milliseconds(300)) {
        close()
        guard let openSuggestion else { return }
        Task { @MainActor in
            do { try await Task.sleep(for: delay) } catch { return }
            openSuggestion(person)
        }
    }
}

/// « Tu cherchais peut-être » (planche `Etat-Introuvable`) : le pseudo le plus voisin de l'adresse demandée, à deux
/// fautes de frappe au plus, dans l'ordre de la recherche à égalité. Jamais l'adresse demandée elle-même : introuvable
/// et privé se confondent (loi 9), et la proposer dirait qu'elle existe.
nonisolated enum ProfileUnavailableSuggestion {
    static let maximumDistance = 2

    static func pick(requested: String, among candidates: [UserSearchResult]) -> UserSearchResult? {
        let wanted = requested.lowercased()
        guard !wanted.isEmpty else { return nil }
        let ranked = candidates
            .filter { $0.username.lowercased() != wanted }
            .map { (person: $0, distance: distance(Array(wanted), Array($0.username.lowercased()))) }
            .filter { $0.distance <= maximumDistance }
        guard let best = ranked.map({ $0.distance }).min() else { return nil }
        return ranked.first { $0.distance == best }?.person
    }

    /// La distance d'édition (insertion, suppression, substitution) entre deux pseudos.
    static func distance(_ lhs: [Character], _ rhs: [Character]) -> Int {
        guard !lhs.isEmpty else { return rhs.count }
        guard !rhs.isEmpty else { return lhs.count }
        let first = Array(0...rhs.count)
        let last = lhs.indices.reduce(first) { previous, i in
            rhs.indices.reduce(into: [i + 1]) { row, j in
                let substitution = previous[j] + (lhs[i] == rhs[j] ? 0 : 1)
                row.append(min(previous[j + 1] + 1, row[j] + 1, substitution))
            }
        }
        return last[rhs.count]
    }
}

/// Les sorties de « Personne ici », en colonne sous la suggestion : chercher d'abord, scanner ensuite quand l'app les
/// offre, et toujours « Retour » en dernier (planche `Etat-Introuvable`).
nonisolated enum ProfileUnavailableExit: Equatable, Sendable {
    case search
    case scan
    case back

    static func resolve(canSearch: Bool, canScan: Bool) -> [ProfileUnavailableExit] {
        (canSearch ? [.search] : []) + (canScan ? [.scan] : []) + [.back]
    }
}

private struct ProfileUnavailableExitsKey: EnvironmentKey {
    static let defaultValue: ProfileUnavailableExits? = nil
}

public extension EnvironmentValues {
    /// Les sorties de « Personne ici » ; `nil` : la fiche n'y propose que « Retour ».
    var profileUnavailableExits: ProfileUnavailableExits? {
        get { self[ProfileUnavailableExitsKey.self] }
        set { self[ProfileUnavailableExitsKey.self] = newValue }
    }
}
