import Foundation
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportPreflight
//
// Décisions prises AVANT le bake d'un MP4 de story, partagées par les deux
// chemins d'export :
//   - « Partager »   → StoryExportShareSheet (sélecteur de langue explicite)
//   - « Enregistrer » → StoryPhotoSaveService (aucune sheet, tout est résolu ici)
//
// Extraites en helpers purs parce que deux implémentations divergentes
// graveraient des langues (ou des identités) différentes selon le bouton pressé.

/// Résolution de la langue gravée dans le MP4 (Prisme Linguistique).
enum StoryExportLanguageResolver {

    /// Langues effectivement disponibles à graver, dans l'ordre du payload,
    /// sans doublon. Une story sans `translations` n'en propose aucune : le
    /// renderer retombe alors sur le texte source.
    static func availableLanguages(story: StoryItem) -> [String] {
        var langs: [String] = []
        for translation in story.translations ?? [] where !langs.contains(translation.language) {
            langs.append(translation.language)
        }
        return langs
    }

    /// Première langue préférée de l'utilisateur qui figure parmi `available`.
    /// `nil` = graver le texte original (aucune préférence ne correspond).
    static func defaultLanguage(available: [String], preferred: [String]) -> String? {
        preferred.first { available.contains($0) }
    }
}

/// Identité peinte sur le préambule de marque de l'export.
///
/// L'export est réservé à l'auteur (`railPlan.showsExport == isOwnStory`) :
/// l'auteur de la story et celui qui l'exporte sont la même personne, donc
/// l'utilisateur courant EST l'identité à graver. Avatar et bannière restent
/// `nil` — le préambule retombe alors sur la couleur d'accent, et les charger
/// demanderait un aller-retour cache asynchrone que le bake n'a pas à attendre.
enum StoryExportIntroFactory {

    @MainActor
    static func currentUser() -> StoryExportIntroContent? {
        guard let user = AuthManager.shared.currentUser else { return nil }
        let display = [user.firstName, user.lastName]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        return StoryExportIntroContent(
            displayName: display.isEmpty ? user.username : display,
            username: user.username,
            accentColorHex: DynamicColorGenerator.colorForName(user.username)
        )
    }
}
