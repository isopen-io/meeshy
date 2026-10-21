import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - Visibility menu

/// Marquage du mode de visibilité courant dans le sous-menu « Modifier la
/// visibilité ». Le mode actif porte un `checkmark` à la place de son icône.
///
/// Pourquoi pas un `Picker` inline (qui coche nativement) : sous iOS 26, un
/// `.tint(.clear)` fait disparaître toutes les icônes d'un menu — on garde donc
/// la main sur le symbole rendu.
enum StoryVisibilityMenuResolver {

    /// Ce que déclenche le tap sur une entrée du sous-menu.
    enum Route: Equatable {
        /// Mode déjà actif : ne rien faire (ni réseau, ni picker).
        case ignored
        /// Écriture directe — aucune sélection d'utilisateurs requise.
        ///
        /// `userIds` vaut `[]`, **jamais `nil`**, et c'est le cœur de la
        /// correction : `UpdatePostRequest` encode ses optionnels via
        /// l'`Encodable` synthétisé, donc un `nil` est simplement OMIS du JSON
        /// — et le gateway ne touche le champ que s'il est présent
        /// (`PostService.updatePost` : `if (data.visibilityUserIds !==
        /// undefined)`). Passer de `EXCEPT[a,b,c]` à Public en envoyant `nil`
        /// vidait donc la liste LOCALEMENT pendant que la base gardait
        /// `[a,b,c]` : au refresh suivant, rouvrir « Sauf… » repré-cochait
        /// a/b/c. `[]` est accepté par le schéma Zod du gateway pour toutes
        /// les visibilités sans sélection (le `refine` ne rejette une liste
        /// vide que pour `EXCEPT`/`ONLY`) et nettoie réellement le champ.
        ///
        /// Le payload est porté par le cas plutôt que décidé au site d'appel :
        /// un retour à `nil` ne compile plus.
        case applyDirectly(userIds: [String])
        /// `EXCEPT` / `ONLY` : le gateway rejette un envoi sans `visibilityUserIds`.
        case openAudiencePicker
    }

    static func isCurrent(_ candidate: PostVisibility, rawValue: String?) -> Bool {
        guard let rawValue else { return false }
        return rawValue.uppercased() == candidate.rawValue
    }

    static func symbol(for candidate: PostVisibility, currentRawValue: String?) -> String {
        isCurrent(candidate, rawValue: currentRawValue) ? "checkmark" : candidate.icon
    }

    static func route(to candidate: PostVisibility, current rawValue: String?) -> Route {
        if isCurrent(candidate, rawValue: rawValue) { return .ignored }
        // `[]` et non `nil` — voir la doc de `Route.applyDirectly` : c'est ce
        // qui nettoie RÉELLEMENT une liste d'audience orpheline côté serveur.
        return candidate.requiresUserSelection ? .openAudiencePicker : .applyDirectly(userIds: [])
    }
}
