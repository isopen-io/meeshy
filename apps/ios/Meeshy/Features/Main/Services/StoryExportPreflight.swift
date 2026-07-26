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
/// l'utilisateur courant EST l'identité à graver. Résolution `async` : l'avatar
/// et le fond (bannière ou thumbHash) sont chargés depuis le cache image ; le
/// bake attend cette résolution (rapide, cache-first) pour un interlude complet.
enum StoryExportIntroFactory {

    @MainActor
    static func currentUser() async -> StoryExportIntroContent? {
        guard let user = AuthManager.shared.currentUser else { return nil }
        let display = [user.firstName, user.lastName]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)

        let avatarImage = await resolveImage(user.avatar)
        let backgroundImage = await resolveBackground(user: user)
        let status = await resolveMood(userId: user.id)

        return StoryExportIntroContent(
            displayName: display.isEmpty ? user.username : display,
            username: user.username,
            avatar: avatarImage,
            banner: backgroundImage,
            moodEmoji: status?.moodEmoji,
            moodMessage: status?.content,
            accentColorHex: DynamicColorGenerator.colorForName(user.username)
        )
    }

    /// URL (relative ou absolue) → `CGImage` via le cache image (réseau si
    /// absent). `nil` sur URL vide ou échec.
    private static func resolveImage(_ urlString: String?) async -> CGImage? {
        guard let urlString, !urlString.isEmpty,
              let url = MeeshyConfig.resolveMediaURL(urlString) else { return nil }
        return await CacheCoordinator.shared.images.image(for: url.absoluteString)?.cgImage
    }

    /// Fond de l'interlude, dans l'ordre demandé : bannière de l'auteur → sinon
    /// le thumbHash de son avatar (flou une fois agrandi en aspectFill) → sinon
    /// `nil`, ce qui laisse le SDK peindre un gradient d'accent vibrant.
    private static func resolveBackground(user: MeeshyUser) async -> CGImage? {
        if let banner = await resolveImage(user.banner) {
            return banner
        }
        if let hash = user.avatarThumbHash, !hash.isEmpty,
           let thumb = ThumbHashDecoder.decodeIfAvailable(hash)?.cgImage {
            return thumb
        }
        return nil
    }

    /// Mood de l'auteur, best-effort depuis le cache des statuts « amis » (le
    /// backend y place le status de l'utilisateur courant en tête). Non-expiré.
    private static func resolveMood(userId: String) async -> StatusEntry? {
        let cached = await CacheCoordinator.shared.statuses.load(for: "statuses_friends")
        let entries: [StatusEntry]
        switch cached {
        case .fresh(let data, _), .stale(let data, _):
            entries = data
        default:
            return nil
        }
        return entries.first { entry in
            entry.userId == userId && (entry.expiresAt.map { $0 > Date() } ?? true)
        }
    }
}
