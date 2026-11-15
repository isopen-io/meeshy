import SwiftUI

// MARK: - L'emplacement du jeu sur la fiche d'un profil (#9481, #10093)
//
// La fiche d'un membre porte, SUR SA BANNIÈRE, son niveau et son rang — ce que SA visibilité autorise et rien de plus
// (#10093 : plus de bloc de jeu dans le corps de la fiche). Le SDK ne sait RIEN du jeu côté produit (lecture serveur,
// cache, règles de visibilité) : il expose un emplacement OPAQUE, comme `postsContent`. L'app y branche sa vue, une
// fois, à la racine, et chaque feuille de profil la reçoit par l'environnement — dix sites d'appel n'ont pas à la
// passer un à un.

/// Ce que l'app fournit : à partir de l'identifiant et du nom d'affichage du membre, la vue à poser sur la bannière
/// — ou une vue vide quand la visibilité du membre ferme son jeu à ce lecteur.
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
    /// L'emplacement du jeu sur la bannière d'une fiche ; `nil` : la bannière reste nue.
    var profileGameSection: ProfileGameSection? {
        get { self[ProfileGameSectionKey.self] }
        set { self[ProfileGameSectionKey.self] = newValue }
    }
}
