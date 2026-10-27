import Foundation
import MeeshyUI

/// C6 — dernier mode d'audience choisi pour une NOUVELLE story. Le composer
/// s'ouvre dessus au lieu de repartir de « Contacts » à chaque fois, comme
/// Snapchat/Instagram.
///
/// Préférence NON sensible → `UserDefaults` (jamais le Keychain). Le magasin
/// est instanciable et sa suite injectable : `MeeshyTests` est hébergé dans
/// `Meeshy.app`, donc un test qui écrirait `UserDefaults.standard` laisserait
/// un résidu VISIBLE au lancement suivant (leçon
/// `reference_outbox_db_path_and_test_residue`) — sur une préférence de
/// confidentialité, ce n'est pas un compromis acceptable.
struct StoryVisibilityPreferenceStore {
    static let key = "story.composer.lastVisibility"
    /// Loi produit 2026-08-23 : une publication naît PUBLIQUE — posts, réels
    /// et stories confondus. Ce n'est que le point de départ : le composer
    /// mémorise ensuite le dernier mode retenu par l'auteur.
    static let fallback = PostVisibility.public.rawValue

    /// Règle pure : les modes qui exigent une sélection d'utilisateurs
    /// (EXCEPT/ONLY) ne sont JAMAIS mémorisés — restaurer « Seulement… » sans
    /// sa liste publierait vers personne, ou rouvrirait un sélecteur vide.
    static func isRememberable(_ visibility: String) -> Bool {
        guard let mode = PostVisibility(rawValue: visibility) else { return false }
        return !mode.requiresUserSelection
    }

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// Valeur validée : un mode inconnu ou non mémorisable (valeur corrompue,
    /// downgrade de schéma) retombe sur le défaut produit.
    func lastVisibility() -> String {
        guard let stored = defaults.string(forKey: Self.key),
              Self.isRememberable(stored) else { return Self.fallback }
        return stored
    }

    func remember(_ visibility: String) {
        guard Self.isRememberable(visibility) else { return }
        defaults.set(visibility, forKey: Self.key)
    }
}
