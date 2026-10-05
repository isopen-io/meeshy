import SwiftUI
import MeeshySDK

/// **Le texte alternatif d'un média de post est LU par VoiceOver** (#6738).
///
/// L'auteur l'écrit dans le composer (`MediaAltTextField`), le serveur le
/// persiste (`PostMedia.alt`) — et aucune surface du fil ne le rendait. Ce site
/// est la lecture unique : la carte d'un média seul, le carrousel et la
/// mosaïque de scènes le consultent.
nonisolated enum PostMediaAccessibility {

    /// Le texte alternatif, `nil` s'il est absent ou blanc.
    static func alt(_ media: FeedMedia) -> String? {
        let texte = media.alt?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let texte, !texte.isEmpty else { return nil }
        return texte
    }

    /// Ce que VoiceOver lit pour le média : l'alternative, sinon la légende
    /// servie dans la langue du lecteur, sinon `nil` (libellé générique).
    static func description(_ media: FeedMedia, preferredLanguages: [String]) -> String? {
        media.accessibilityDescription(preferredLanguages: preferredLanguages)
    }

    /// Le texte alternatif du premier média d'une scène — le média que la
    /// tuile de la mosaïque montre.
    static func sceneDescription(sceneIndex: Int, document: CanvasV3, media: [FeedMedia]) -> String? {
        guard document.scenes.indices.contains(sceneIndex) else { return nil }
        let references = document.scenes[sceneIndex].objects
            .filter { $0.kind == .media }
            .compactMap(\.mediaReference)
        return references.lazy
            .compactMap { reference in media.first(where: { $0.id == reference }).flatMap(alt) }
            .first
    }
}

extension View {
    /// Pose le texte alternatif (ou la légende) comme libellé VoiceOver du média,
    /// et ne touche à rien quand il n'y en a pas.
    @ViewBuilder
    func postMediaAccessibility(_ media: FeedMedia) -> some View {
        if let texte = PostMediaAccessibility.description(
            media, preferredLanguages: ReaderPrism.resolve(for: AuthManager.shared.currentUser)) {
            self.accessibilityElement(children: .combine)
                .accessibilityLabel(texte)
        } else {
            self
        }
    }
}
