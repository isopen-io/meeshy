import Foundation

/// QUAND UN NIVEAU EST « GAGNÉ » (#9381) — la tape légère ne joue que pour une
/// montée CONFIRMÉE.
///
/// Une frappe baisse le niveau tout de suite (optimiste) ; si elle est refusée, le
/// niveau d'avant revient : le chiffre MONTE, mais rien n'a été gagné. Comparer au
/// niveau précédemment affiché confondait ce retour avec une montée. On compare au
/// dernier niveau CONFIRMÉ — celui lu quand aucun geste n'était en vol — et
/// l'on ne juge qu'une fois les gestes réglés : une montée vraie arrivée PENDANT un
/// geste (le coffre) se joue à son règlement, pas avant.
struct GameLevelConfirmation: Equatable {
    private(set) var confirmed: Int

    init(confirmed: Int) {
        self.confirmed = confirmed
    }

    /// `true` quand `level` dépasse le dernier niveau confirmé, une fois réglé.
    mutating func observe(level: Int, settled: Bool) -> Bool {
        guard settled else { return false }
        let climbed = level > confirmed
        confirmed = level
        return climbed
    }
}
