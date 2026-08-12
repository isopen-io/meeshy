import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// Le ré-armement du timer ne doit JAMAIS relâcher une pause en cours.
///
/// `StoryReaderTimerController.setCurrentSlide(id:duration:)` remet
/// `isPaused = false` par contrat documenté (« a new slide always starts
/// un-paused »). `refreshPrefetchWindowAndTimer()` l'appelle à chaque
/// changement de slide OU de groupe — donc chaque ré-armement relâche la
/// pause, silencieusement.
///
/// `startTimer()` s'en protège en ré-appliquant `setPaused(shouldPauseTimer)`
/// juste après. Mais les deux autres appelants (`adaptiveOnChange(of:
/// currentStoryIndex)` et `adaptiveOnChange(of: currentGroupIndex)`) ne le
/// font pas, et `adaptiveOnChange(of: shouldPauseTimer)` ne rattrape rien :
/// `shouldPauseTimer` n'a pas *changé* de valeur, donc SwiftUI ne refire pas
/// le closure. La pause est perdue sans qu'aucun signal ne la restaure.
///
/// Conséquence visible : la barre de progression avance sous l'interlude
/// d'identité inter-groupes et pendant les cross-fades, alors que
/// l'utilisateur ne voit pas encore la story — et un long-press maintenu
/// pendant un changement de slide ne gèle plus rien.
///
/// On épingle le comportement au point de jonction (`refreshPrefetchWindowAndTimer`)
/// plutôt que sur chacun des appelants : c'est le seul endroit où
/// `setCurrentSlide` est invoqué, donc le seul endroit où la garde tient
/// pour tous les chemins présents ET futurs.
@MainActor
final class StoryViewerTimerPausePreservationTests: XCTestCase {

    // MARK: - Fixtures

    private func makeStoryItem(id: String) -> StoryItem {
        StoryItem(
            id: id,
            content: "story \(id)",
            media: [],
            storyEffects: nil,
            createdAt: Date(),
            expiresAt: nil,
            isViewed: false
        )
    }

    private func makeSUT(storyCount: Int = 3,
                         currentIndex: Int = 0) -> (sut: StoryViewerView,
                                                    stories: [StoryItem]) {
        let stories = (0..<storyCount).map { makeStoryItem(id: "story-\($0)") }
        let group = StoryGroup(
            id: "author-1",
            username: "alice",
            avatarColor: "#6366F1",
            avatarURL: nil,
            stories: stories
        )
        var presented = true
        let binding = Binding(get: { presented }, set: { presented = $0 })
        let view = StoryViewerView(
            viewModel: StoryViewModel(),
            groups: [group],
            currentGroupIndex: 0,
            isPresented: binding
        )
        view.currentStoryIndex = currentIndex
        return (view, stories)
    }

    // MARK: - Garde principale

    /// Une pause est active (interlude, long-press, sheet — toutes convergent
    /// vers `shouldPauseTimer`) : le ré-armement ne doit pas rendre le timer
    /// courant.
    ///
    /// La pause est injectée par le paramètre `paused:` plutôt qu'en écrivant
    /// dans `showGroupIntro` : les `@State` d'une `View` hors graphe SwiftUI
    /// ignorent silencieusement les écritures d'un test, si bien qu'une
    /// assertion bâtie dessus mesurerait l'absence de pause au lieu de sa
    /// préservation — verte ou rouge pour la mauvaise raison.
    func test_refreshWhilePaused_keepsTimerPaused() {
        let (sut, _) = makeSUT()
        let timer = StoryReaderTimerController(useDisplayLink: false)

        sut.installPrefetchPipelineIfNeeded(timer: timer)
        sut.refreshPrefetchWindowAndTimer(timer: timer, paused: true)

        XCTAssertTrue(
            timer.isPaused,
            "Ré-armer le timer pendant une pause doit la préserver — sinon la barre avance sous un écran que l'utilisateur ne regarde pas encore"
        )
    }

    /// La vraie conséquence utilisateur : la barre ne bouge pas. On mesure le
    /// comportement (progression) et non l'état interne, pour que le test
    /// survive à un changement d'implémentation de la pause.
    func test_refreshWhilePaused_clockDoesNotAdvanceProgress() {
        let (sut, stories) = makeSUT()
        let timer = StoryReaderTimerController(useDisplayLink: false)

        sut.installPrefetchPipelineIfNeeded(timer: timer)
        sut.refreshPrefetchWindowAndTimer(timer: timer, paused: true)
        timer.markContentReady(slideId: stories[0].id)
        timer._advanceClockForTesting(by: 3.0)

        XCTAssertEqual(
            timer.progress, 0, accuracy: 0.0001,
            "3 s d'horloge sous l'interlude ne doivent produire aucune progression"
        )
    }

    /// Un second ré-armement (changement de slide en cascade, cross-fade suivi
    /// d'un switch de groupe) ne doit pas non plus relâcher la pause.
    func test_repeatedRefreshWhilePaused_staysPaused() {
        let (sut, stories) = makeSUT(storyCount: 3)
        let timer = StoryReaderTimerController(useDisplayLink: false)

        sut.installPrefetchPipelineIfNeeded(timer: timer)
        sut.refreshPrefetchWindowAndTimer(timer: timer, paused: true)
        sut.refreshPrefetchWindowAndTimer(timer: timer, paused: true)
        timer.markContentReady(slideId: stories[0].id)
        timer._advanceClockForTesting(by: 5.0)

        XCTAssertTrue(timer.isPaused)
        XCTAssertEqual(timer.progress, 0, accuracy: 0.0001)
    }

    // MARK: - Contrôle positif

    /// Sans pause active, le ré-armement laisse le timer libre et l'horloge
    /// progresse. Sans ce contrôle, les tests ci-dessus passeraient tout aussi
    /// bien avec un timer bloqué en permanence.
    func test_refreshWithoutPause_leavesTimerRunning() {
        let (sut, stories) = makeSUT()
        let timer = StoryReaderTimerController(useDisplayLink: false)

        sut.installPrefetchPipelineIfNeeded(timer: timer)
        sut.refreshPrefetchWindowAndTimer(timer: timer, paused: false)
        timer.markContentReady(slideId: stories[0].id)
        timer._advanceClockForTesting(by: 3.0)

        XCTAssertFalse(timer.isPaused,
                       "Aucune surface de pause active ⇒ le timer reste libre")
        XCTAssertGreaterThan(
            timer.progress, 0,
            "Le contrôle positif doit progresser, sinon les tests de pause ne prouvent rien"
        )
    }
}
