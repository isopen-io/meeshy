import Foundation
import MeeshySDK
import MeeshyUI

/// Cache à 1 entrée du `StorySlide` renderable de la slide courante.
/// `toRenderableSlide` résout les traductions (Prisme) et hydrate les durées
/// média — l'appeler 3× par évaluation de body (representable + check fond
/// média + backdrop), à chaque tick de barre pendant la lecture, recompose
/// l'intégralité du slide pour rien. Classe boxée en `@State` : survit aux
/// re-créations de la struct ; invalidée par fingerprint (id + chaîne de
/// langues + counts de traductions par textObject — couvre les merges de
/// traductions temps réel `story:translation-updated`).
@MainActor
final class RenderableSlideCache {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    private var key: String = ""
    private var cached: StorySlide?

    func slide(for story: StoryItem, chain: [String]) -> StorySlide {
        let translationCounts = (story.storyEffects?.textObjects ?? [])
            .map { String($0.translations?.count ?? 0) }
            .joined(separator: ".")
        let newKey = "\(story.id)|\(chain.joined(separator: ","))|\(translationCounts)"
        if newKey == key, let cached { return cached }
        let slide = story.toRenderableSlide(preferredLanguages: chain)
        key = newKey
        cached = slide
        return slide
    }
}
