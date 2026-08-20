import XCTest
import SwiftUI
@testable import MeeshySDK
@testable import Meeshy

/// Une story ne compte comme « vue » qu'une fois réellement montrée.
///
/// L'interlude d'identité inter-groupes est OPAQUE et prend tout l'écran
/// pendant ~500 ms : tant qu'il est là, l'utilisateur ne voit rien de la story.
/// Or `markCurrentViewed()` était appelé au moment du changement d'index —
/// donc AVANT `presentGroupIntroIfNeeded()` pendant le switch de groupe
/// (depuis 2026-08-20 l'ouverture du viewer, elle, n'a plus d'interlude).
/// Conséquences pour l'auteur : son compteur de vues montait
/// pour des stories que personne n'avait regardées, et l'anneau du lecteur
/// passait en « vu » alors qu'il n'avait vu qu'un écran d'identité.
///
/// La règle : le marquage suit la RÉVÉLATION, pas l'indexation.
@MainActor
final class StoryViewedMarkingTests: XCTestCase {

    // MARK: - Fixtures

    private func makeStory(id: String) -> StoryItem {
        StoryItem(id: id, content: id, media: [], storyEffects: nil,
                  createdAt: Date(), expiresAt: nil, isViewed: false)
    }

    /// Collecteur de référence : capturer un `var` local dans le closure de
    /// l'enqueuer ne passe pas la concurrence stricte (le `Task` interne de
    /// `markViewed` exige un closure `Sendable`).
    @MainActor
    private final class Recorder {
        var ids: [String] = []
    }

    private func makeSUT() -> (sut: StoryViewerView, enqueued: () -> [String]) {
        let recorder = Recorder()
        let vm = StoryViewModel(postService: MockPostService())
        vm.markViewedOutboxEnqueuer = { id in
            await MainActor.run { recorder.ids.append(id) }
        }
        let group = StoryGroup(id: "author-1", username: "alice",
                               avatarColor: "#6366F1", avatarURL: nil,
                               stories: [makeStory(id: "s0"), makeStory(id: "s1")])
        var presented = true
        let binding = Binding(get: { presented }, set: { presented = $0 })
        let view = StoryViewerView(viewModel: vm, groups: [group],
                                   currentGroupIndex: 0, isPresented: binding)
        view.currentStoryIndex = 0
        return (view, { recorder.ids })
    }

    /// Laisse le `Task` fire-and-forget de `markViewed` atteindre l'enqueuer.
    private func settle() async {
        for _ in 0..<3 { await Task.yield() }
        try? await Task.sleep(nanoseconds: 120_000_000)
    }

    // MARK: - Le défaut corrigé

    /// L'état d'interlude est injecté par `isIntroVisible:` : écrire dans le
    /// `@State showGroupIntro` d'une `View` hors graphe SwiftUI est un no-op
    /// silencieux, et le test mesurerait alors l'absence d'interlude au lieu
    /// de la garde.
    func test_markCurrentViewed_whileGroupIntroVisible_doesNotCount() async {
        let (sut, enqueued) = makeSUT()

        sut.markCurrentViewed(isIntroVisible: true)
        await settle()

        XCTAssertTrue(
            enqueued().isEmpty,
            "L'interlude est opaque : rien n'a encore été montré, donc rien n'est vu"
        )
    }

    // MARK: - Contrôle positif

    func test_markCurrentViewed_withoutIntro_counts() async {
        let (sut, enqueued) = makeSUT()

        sut.markCurrentViewed(isIntroVisible: false)
        await settle()

        XCTAssertEqual(
            enqueued(), ["s0"],
            "Sans interlude, la story est visible : elle doit compter — sinon le test ci-dessus ne prouve rien"
        )
    }

    /// La révélation est le déclencheur : une fois l'interlude retiré, la story
    /// visible doit être marquée sans attendre le changement d'index suivant.
    func test_revealingAfterIntro_countsTheStoryNowVisible() async {
        let (sut, enqueued) = makeSUT()
        sut.markCurrentViewed(isIntroVisible: true)
        await settle()
        XCTAssertTrue(enqueued().isEmpty, "précondition : rien marqué sous l'interlude")

        sut.skipGroupIntro()
        await settle()

        XCTAssertEqual(enqueued(), ["s0"],
                       "Retirer l'interlude révèle la story : c'est là qu'elle devient vue")
    }

    /// Tap gauche sur l'interlude = « annule ce switch de groupe ». La story
    /// du groupe qu'on quitte n'a jamais été montrée : elle ne doit pas compter.
    func test_cancellingGroupSwitchFromIntro_doesNotCount() async {
        let (sut, enqueued) = makeSUT()

        sut.goBackToPreviousGroupFromIntro()
        await settle()

        XCTAssertTrue(
            enqueued().isEmpty,
            "Annuler le switch ne révèle rien — marquer ici gonflerait les vues de l'auteur"
        )
    }
}
