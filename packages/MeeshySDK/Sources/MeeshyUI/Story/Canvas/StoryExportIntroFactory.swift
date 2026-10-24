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

/// **Ce qu'il faut pour peindre l'identité de QUELQU'UN** (#10536) — des
/// paramètres opaques : la fabrique ne sait pas si c'est l'utilisateur connecté
/// ou l'auteur d'une story qu'un lecteur emporte ; l'app le décide
/// (`StoryExportDressing`).
public nonisolated struct StoryExportIntroSource: Equatable, Sendable {
    /// Sert à retrouver le mood ; `nil` ⇒ pas de mood.
    public let userId: String?
    public let displayName: String
    public let username: String
    public let avatarURL: String?
    public let bannerURL: String?
    /// Fond de repli quand la bannière manque : un thumbHash (bannière ou avatar).
    public let backgroundThumbHash: String?
    /// Le contour équipé, tel que servi ; la fabrique le résout dans le catalogue
    /// embarqué (`ProfileDecorResolver.ring`). `nil` ⇒ l'avatar nu.
    public let avatarRing: ServedProfileDecorItem?

    public init(userId: String?,
                displayName: String,
                username: String,
                avatarURL: String? = nil,
                bannerURL: String? = nil,
                backgroundThumbHash: String? = nil,
                avatarRing: ServedProfileDecorItem? = nil) {
        self.userId = userId
        self.displayName = displayName
        self.username = username
        self.avatarURL = avatarURL
        self.bannerURL = bannerURL
        self.backgroundThumbHash = backgroundThumbHash
        self.avatarRing = avatarRing
    }
}

/// Identité peinte sur le préambule de marque de l'export.
///
/// Deux entrées, une seule peinture : `currentUser()` grave l'utilisateur
/// connecté (sa propre story, « Mes stories », le composer) ; `content(for:)`
/// grave l'identité qu'on lui remet — l'auteur d'une story qu'un lecteur
/// emporte (#10536). Résolution `async` : l'avatar et le fond (bannière ou
/// thumbHash) sont chargés depuis le cache image ; le bake attend cette
/// résolution (rapide, cache-first, BORNÉE par l'appelant) pour un interlude
/// complet.
public enum StoryExportIntroFactory {

    @MainActor
    public static func currentUser() async -> StoryExportIntroContent? {
        guard let user = AuthManager.shared.currentUser else { return nil }
        return await content(for: StoryExportIntroSource(
            userId: user.id,
            displayName: resolveDisplayName(displayName: user.displayName,
                                            firstName: user.firstName,
                                            lastName: user.lastName,
                                            username: user.username),
            username: user.username,
            avatarURL: user.avatar,
            bannerURL: user.banner,
            backgroundThumbHash: user.avatarThumbHash,
            avatarRing: user.profileDecor?.avatarRing))
    }

    @MainActor
    public static func content(for source: StoryExportIntroSource) async -> StoryExportIntroContent {
        let avatarImage = await resolveImage(source.avatarURL)
        let backgroundImage = await resolveBackground(bannerURL: source.bannerURL,
                                                      thumbHash: source.backgroundThumbHash)
        let status: StatusEntry?
        if let userId = source.userId {
            status = await resolveMood(userId: userId)
        } else {
            status = nil
        }

        return StoryExportIntroContent(
            displayName: source.displayName,
            username: source.username,
            avatar: avatarImage,
            banner: backgroundImage,
            moodEmoji: status?.moodEmoji,
            moodMessage: status?.content,
            accentColorHex: DynamicColorGenerator.colorForName(source.username),
            avatarRing: ProfileDecorResolver.ring(source.avatarRing)
        )
    }

    /// L'interlude SANS image — nom, pseudo, teinte de repli. Ce qu'on peint
    /// quand l'avatar et la bannière ne sont pas revenus dans la borne de
    /// temps : un interlude sobre plutôt qu'une story sans prélude. Le contour
    /// reste : il se lit dans le catalogue EMBARQUÉ, sans réseau ni attente.
    @MainActor
    public static func unresolvedContent(for source: StoryExportIntroSource) -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: source.displayName,
                                username: source.username,
                                accentColorHex: DynamicColorGenerator.colorForName(source.username),
                                avatarRing: ProfileDecorResolver.ring(source.avatarRing))
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
    /// le thumbHash remis (flou une fois agrandi en aspectFill) → sinon `nil`,
    /// ce qui laisse le SDK peindre un gradient d'accent vibrant.
    private static func resolveBackground(bannerURL: String?, thumbHash: String?) async -> CGImage? {
        if let banner = await resolveImage(bannerURL) {
            return banner
        }
        if let thumbHash, !thumbHash.isEmpty,
           let thumb = ThumbHashDecoder.decodeIfAvailable(thumbHash)?.cgImage {
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
