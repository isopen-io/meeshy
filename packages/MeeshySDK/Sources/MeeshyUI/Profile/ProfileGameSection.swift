import SwiftUI

// MARK: - L'emplacement du jeu dans le profil d'un autre (#9481)
//
// Le profil d'un AUTRE membre peut porter une carte de jeu — sa vitrine de trophées, ce que SA visibilité autorise
// et rien de plus. Le SDK ne sait RIEN du jeu côté produit (lecture serveur, cache, règles de visibilité) : il
// expose un emplacement OPAQUE, comme `postsContent`. L'app y branche sa carte, une fois, à la racine, et chaque
// feuille de profil la reçoit par l'environnement — dix sites d'appel n'ont pas à la passer un à un.

/// Ce que l'app fournit : à partir de l'identifiant et du nom d'affichage du membre, la vue à montrer — ou une vue
/// vide quand la visibilité du membre ferme la vitrine à ce lecteur.
public struct ProfileGameSection {
    public let build: (_ userId: String, _ displayName: String) -> AnyView

    public init(build: @escaping (_ userId: String, _ displayName: String) -> AnyView) {
        self.build = build
    }
}

private struct ProfileGameSectionKey: EnvironmentKey {
    static let defaultValue: ProfileGameSection? = nil
}

public extension EnvironmentValues {
    /// L'emplacement du jeu dans le profil d'un autre membre ; `nil` : le profil reste celui d'avant.
    var profileGameSection: ProfileGameSection? {
        get { self[ProfileGameSectionKey.self] }
        set { self[ProfileGameSectionKey.self] = newValue }
    }
}
