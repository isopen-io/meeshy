import SwiftUI

// MARK: - Les sorties de « Personne ici » (planche `Etat-Introuvable`, #18873)
//
// Le SDK ne connaît ni la recherche ni le lecteur de QR de l'app : l'app les remet ici, et la fiche les propose quand
// elle les a. Sans elles, « Personne ici » garde sa seule sortie, « Retour ».

/// Ce que l'app offre à qui tombe sur un profil introuvable : chercher quelqu'un, scanner un QR.
public struct ProfileUnavailableExits {
    /// Le lecteur de QR à présenter ; il reçoit de quoi fermer la fiche une fois un code ouvert.
    public typealias Scanner = (_ onOpened: @escaping () -> Void) -> AnyView

    public let search: (() -> Void)?
    public let scanner: Scanner?

    public init(search: (() -> Void)? = nil, scanner: Scanner? = nil) {
        self.search = search
        self.scanner = scanner
    }
}

/// Les deux boutons de « Personne ici » : chercher d'abord, scanner ensuite, et « Retour » quand l'app n'offre rien.
nonisolated enum ProfileUnavailableExit: Equatable, Sendable {
    case search
    case scan
    case back

    static func resolve(canSearch: Bool, canScan: Bool) -> (primary: ProfileUnavailableExit, secondary: ProfileUnavailableExit?) {
        switch (canSearch, canScan) {
        case (true, true): return (primary: ProfileUnavailableExit.search, secondary: ProfileUnavailableExit.scan)
        case (true, false): return (primary: ProfileUnavailableExit.search, secondary: ProfileUnavailableExit.back)
        case (false, true): return (primary: ProfileUnavailableExit.scan, secondary: ProfileUnavailableExit.back)
        case (false, false): return (primary: ProfileUnavailableExit.back, secondary: nil)
        }
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
