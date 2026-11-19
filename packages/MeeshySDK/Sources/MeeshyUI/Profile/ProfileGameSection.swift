import SwiftUI

// MARK: - L'emplacement du jeu sur la fiche d'un profil (#9481, #19416)
//
// La fiche d'un membre porte son jeu dans sa Vitrine, en UNE carte : « Sa Légende » — niveau, rang, étincelles,
// progression, trophées —, ce que SA visibilité autorise et rien de plus. La bannière ne le redit plus (#19773 : niveau
// et gloire posés sur la bannière doublaient la carte). Le SDK ne sait RIEN du jeu côté produit (lecture serveur,
// cache, règles de visibilité) : il expose un emplacement OPAQUE, comme `postsContent`. L'app y branche sa vue, une
// fois, à la racine, et chaque fiche de profil la reçoit par l'environnement.

/// Ce que l'app fournit : « Sa Légende » dans la Vitrine d'un autre, la carte que l'app y pose
/// (`ProfileGameBoardView`), vide quand rien n'est servi à ce lecteur.
public struct ProfileGameSection {
    public let card: (_ userId: String, _ tint: Color) -> AnyView

    public init(card: @escaping (_ userId: String, _ tint: Color) -> AnyView) {
        self.card = card
    }
}

private struct ProfileGameSectionKey: EnvironmentKey {
    static let defaultValue: ProfileGameSection? = nil
}

public extension EnvironmentValues {
    /// L'emplacement de « Sa Légende » dans la Vitrine d'une fiche ; `nil` : la Vitrine ne la pose pas.
    var profileGameSection: ProfileGameSection? {
        get { self[ProfileGameSectionKey.self] }
        set { self[ProfileGameSectionKey.self] = newValue }
    }
}
