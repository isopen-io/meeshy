import Foundation
import MeeshySDK

/// Faut-il proposer d'ajouter son numéro avant de chercher ses contacts (#8843) ?
///
/// Oui, et seulement, quand le compte connecté n'en a pas : le rapprochement du
/// carnet marche dans les DEUX sens, et un compte sans numéro ne peut pas être
/// retrouvé par ceux qui l'ont au leur (`contacts-match.ts`). Un compte qui en a
/// déjà un ne voit JAMAIS la proposition — vérifié ou non, c'est la Sécurité qui
/// s'en occupe. Ni un visiteur anonyme, ni une session absente : ils n'ont pas
/// de profil à compléter.
///
/// `nonisolated` : règle pure, lisible hors du main actor (défaut du module).
nonisolated enum PhonePromptPolicy {
    static func shouldOffer(user: MeeshyUser?) -> Bool {
        guard let user, user.isAnonymous != true else { return false }
        let phone = user.phoneNumber?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return phone.isEmpty
    }
}
