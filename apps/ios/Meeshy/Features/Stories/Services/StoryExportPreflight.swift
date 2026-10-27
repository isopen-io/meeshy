import Foundation
import UIKit
import MeeshySDK
import MeeshyUI

// MARK: - StoryExportPreflight
//
// Décisions prises AVANT le bake d'un MP4 de story, partagées par les deux
// chemins d'export :
//   - « Partager »   → StoryExportShareSheet (sélecteur de langue explicite)
//   - « Enregistrer » → StoryPhotoSaveService (aucune sheet, tout est résolu ici)
//
// Extraite en helper pur parce que deux implémentations divergentes
// graveraient des langues différentes selon le bouton pressé.
//
// `StoryExportIntroFactory` (identité de l'interlude de marque) a DÉMÉNAGÉ
// dans le SDK (Task 9, 2026-07-26) :
// `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryExportIntroFactory.swift`.
// Elle ne vivait ici que par accident — aucune de ses dépendances n'est
// app-side — et `TimelineExportController` (SDK) a besoin d'appeler la MÊME
// fabrique que les chemins app-side ci-dessous, pour que l'interlude soit
// garanti par construction sur TOUS les chemins d'export.

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
