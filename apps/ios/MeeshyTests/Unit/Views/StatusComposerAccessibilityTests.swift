import XCTest
@testable import Meeshy

// MARK: - StatusComposerAccessibilityTests
//
// L'action principale du composer de mood est un bouton de barre de navigation
// dont le label VISUEL disparaît pendant la publication : `publishToolbarButton`
// remplace le `Text("Publier")` par un `ProgressView()` nu. Un `ProgressView`
// sans label n'expose aucun texte d'accessibilité — le bouton perd donc son nom
// au moment précis où il devient `.disabled`, et VoiceOver n'annonce plus qu'un
// contrôle estompé et anonyme. C'est le seul moment du parcours où l'utilisateur
// a besoin de distinguer « en cours » de « bloqué ».
//
// Le dépôt traite déjà ce cas quatre fois (`SharePickerView`, `ForwardPickerSheet`,
// `MessageDetailSheet`, `MessageForwardDetailView`) ; le composer était
// l'exception.
//
// Le nom est résolu par une fonction pure colocalisée avec la vue (idiome du
// dépôt : `StoryVisibilityMenuResolver`, `MyStoryRowAccessibility`,
// `StoryExportSheetPalette`), donc testable sans instancier la vue.
//
// `@MainActor` : le target `Meeshy` a `SWIFT_DEFAULT_ACTOR_ISOLATION =
// MainActor` (SE-0466), `StatusComposerAccessibility` y est donc main-actor-isolé.
@MainActor
final class StatusComposerAccessibilityTests: XCTestCase {

    /// Au repos, le nom entendu doit être celui qui est lu à l'écran : la HIG
    /// demande que le label d'accessibilité corresponde au texte visible, sans
    /// quoi la commande vocale « Appuyer sur Publier » ne cible plus le bouton.
    func test_publishActionLabel_whenIdle_matchesTheVisibleTitle() {
        XCTAssertEqual(
            StatusComposerAccessibility.publishActionLabel(isPublishing: false),
            String(localized: "status.composer.publish", defaultValue: "Publier", bundle: .main)
        )
    }

    /// Pendant la publication, le nom doit décrire l'état en cours plutôt que
    /// de disparaître avec le `Text` qu'il remplace.
    func test_publishActionLabel_whilePublishing_announcesProgress() {
        let label = StatusComposerAccessibility.publishActionLabel(isPublishing: true)

        XCTAssertEqual(
            label,
            String(localized: "status.composer.publishing", defaultValue: "Publication en cours…", bundle: .main)
        )
        XCTAssertFalse(
            label.isEmpty,
            "Le ProgressView qui remplace le titre n'expose rien : sans ce label le bouton devient anonyme."
        )
    }

    /// Les deux états doivent être distinguables à l'oreille — c'est toute la
    /// raison d'être de la résolution.
    func test_publishActionLabel_differsBetweenStates() {
        XCTAssertNotEqual(
            StatusComposerAccessibility.publishActionLabel(isPublishing: false),
            StatusComposerAccessibility.publishActionLabel(isPublishing: true)
        )
    }
}
