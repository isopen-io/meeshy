import Foundation
import UIKit
import MeeshySDK

// MARK: - StoryExportIntroFactory
//
// Task 9 (2026-07-26) : déplacée depuis
// `apps/ios/Meeshy/Features/Main/Services/StoryExportPreflight.swift`, où
// elle ne vivait que par accident de la Task 1. Aucune de ses dépendances
// n'est app-side : `AuthManager` / `CacheCoordinator` (MeeshySDK),
// `MeeshyConfig` / `ThumbHashDecoder` / `StoryExportIntroContent` (MeeshyUI,
// ce module), `DynamicColorGenerator` (MeeshySDK). Elle vit donc ici, à côté
// de `StoryExportIntroContent` — et TOUS les chemins d'export de story
// (app-side `StoryPhotoSaveService`/`StoryExportShareViewModel` ET SDK-side
// `TimelineExportController`) appellent désormais la MÊME fabrique : plus de
// décision dupliquée, l'interlude est garanti par construction.
//
// `StoryExportLanguageResolver` (résolution de la langue gravée) RESTE
// côté app (`StoryExportPreflight.swift`) : elle dépend de `StoryItem`, un
// modèle de LISTE, pas du bake.

/// Identité peinte sur le préambule de marque de l'export.
///
/// L'export est réservé à l'auteur (`railPlan.showsExport == isOwnStory`) :
/// l'auteur de la story et celui qui l'exporte sont la même personne, donc
/// l'utilisateur courant EST l'identité à graver. Résolution `async` : l'avatar
/// et le fond (bannière ou thumbHash) sont chargés depuis le cache image ; le
/// bake attend cette résolution (rapide, cache-first) pour un interlude complet.
public enum StoryExportIntroFactory {

    @MainActor
    public static func currentUser() async -> StoryExportIntroContent? {
        guard let user = AuthManager.shared.currentUser else { return nil }

        let avatarImage = await resolveImage(user.avatar)
        let backgroundImage = await resolveBackground(user: user)
        let status = await resolveMood(userId: user.id)

        return StoryExportIntroContent(
            displayName: resolveDisplayName(displayName: user.displayName,
                                            firstName: user.firstName,
                                            lastName: user.lastName,
                                            username: user.username),
            username: user.username,
            avatar: avatarImage,
            banner: backgroundImage,
            moodEmoji: status?.moodEmoji,
            moodMessage: status?.content,
            accentColorHex: DynamicColorGenerator.colorForName(user.username)
        )
    }

    /// Nom à graver sur l'interlude. Priorité au `displayName` explicite de
    /// l'utilisateur (ce que le reste de l'app affiche) ; à défaut « prénom nom »,
    /// puis le username. Pur — testé sans le singleton d'auth.
    ///
    /// Bug user 2026-07-26 : l'ancienne version gravait TOUJOURS « prénom nom »
    /// et ignorait le `displayName`.
    public nonisolated static func resolveDisplayName(displayName: String?,
                                                       firstName: String?,
                                                       lastName: String?,
                                                       username: String) -> String {
        if let name = displayName?.trimmingCharacters(in: .whitespaces), !name.isEmpty {
            return name
        }
        let full = [firstName, lastName]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        return full.isEmpty ? username : full
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
