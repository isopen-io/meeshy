import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le Prisme Linguistique du détail d'un post** — langue affichée, contenu
/// servi, drapeaux et traduction secondaire. Extrait de
/// `PostDetailView.swift` (#10956).
extension PostDetailView {

    private var currentDisplayLangCode: String {
        guard let post = displayPost else { return "fr" }
        return activeDisplayLangCode ?? PostDisplayLanguage.code(
            originalLanguage: post.originalLanguage, translations: post.translations,
            prism: ReaderPrism.resolve(for: AuthManager.shared.currentUser)
        ) ?? "fr"
    }

    var effectiveContent: String {
        guard let post = displayPost else { return "" }
        let code = currentDisplayLangCode
        if code == post.originalLanguage?.lowercased() { return post.content }
        if let translation = post.translations?[code] ?? post.translations?.first(where: { $0.key.lowercased() == code })?.value {
            return translation.text
        }
        return post.displayContent
    }

    /// Vidéo embeddable (YouTube) détectée dans le contenu affiché du post.
    var embeddedVideo: EmbeddedVideo? {
        EmbeddableVideoResolver.resolve(in: effectiveContent)
    }

    /// `[rawURL: token]` outbound-link tracking map du post (nil si aucun lien
    /// tracké → pas de réécriture dans le renderer).
    var postTrackedLinks: [String: String]? {
        let map = displayPost?.trackedLinkMap ?? [:]
        return map.isEmpty ? nil : map
    }

    /// Destination trackée `/l/<token>` pour la façade vidéo, dérivée de la
    /// première URL du contenu via `trackedLinkMap`. `nil` → watchURL.
    var embedTrackedURL: URL? {
        guard let raw = LinkPreviewFetcher.firstURL(in: effectiveContent),
              let token = displayPost?.trackedLinkMap[raw] else { return nil }
        return TrackedLink.redirectURL(token: token)
    }

    var textTruncation: (text: String, isTruncated: Bool) {
        let words = effectiveContent.split(separator: " ", omittingEmptySubsequences: true)
        if words.count <= 60 { return (effectiveContent, false) }
        let truncated = words.prefix(60).joined(separator: " ")
        return (truncated, true)
    }

    var secondaryContent: String? {
        guard let post = displayPost, let code = secondaryLangCode else { return nil }
        if code == post.originalLanguage?.lowercased() { return post.content }
        return post.translations?.first(where: { $0.key.lowercased() == code })?.value.text
    }

    func buildAvailableFlags() -> [String] {
        guard let post = displayPost, let origLang = post.originalLanguage?.lowercased() else { return [] }
        let activeLang = currentDisplayLangCode
        let user = AuthManager.shared.currentUser
        var all: [String] = [origLang]
        var seen: Set<String> = [origLang]
        for lang in ReaderPrism.resolve(for: user) {
            let l = lang.lowercased()
            if !seen.contains(l), post.translations?.keys.contains(where: { $0.lowercased() == l }) == true {
                all.append(l); seen.insert(l)
            }
        }
        return all.filter { $0 != activeLang }
    }

    /// Le retour haptique appartient à `LanguageFlagChip` — seul appelant de
    /// cette méthode — et non aux deux sorties de sa logique.
    func handleFlagTap(_ code: String) {
        guard let post = displayPost else { return }
        let isOriginal = code == post.originalLanguage?.lowercased()
        let hasContent = isOriginal || post.translations?.keys.contains(where: { $0.lowercased() == code }) == true
        if !hasContent { return }
        if isOriginal {
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                activeDisplayLangCode = code; secondaryLangCode = nil
            }
        } else {
            let isShowing = secondaryLangCode == code
            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                secondaryLangCode = isShowing ? nil : code
            }
        }
    }
}
