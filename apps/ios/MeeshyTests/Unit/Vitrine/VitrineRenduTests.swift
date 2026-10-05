import XCTest
@testable import Meeshy

/// « prêt » ne part qu'une fois la destination RENDUE (#8921), jamais au bout d'une minuterie.
@MainActor
final class VitrineRenduTests: XCTestCase {
    func test_attendre_returnsOnlyOnceTheAwaitedRenderIsObserved() async {
        let rendu = VitrineRendu(actif: true)
        let drapeau = Drapeau()
        let attente = Task { await rendu.attendre([.progression]); drapeau.leve = true }
        await laisserTourner()
        XCTAssertFalse(drapeau.leve)
        rendu.signaler(.fil)
        await laisserTourner()
        XCTAssertFalse(drapeau.leve, "Un autre écran rendu ne libère pas la scène.")
        rendu.signaler(.progression)
        await attente.value
        XCTAssertTrue(drapeau.leve)
    }

    func test_attendre_aRenderAlreadyObserved_returnsAtOnce() async {
        let rendu = VitrineRendu(actif: true)
        rendu.signaler(.fil)
        await rendu.attendre([.fil])
        XCTAssertEqual(rendu.observes, [.fil])
    }

    func test_signaler_outsideTheVitrine_observesNothing() {
        let rendu = VitrineRendu(actif: false)
        rendu.signaler(.progression)
        XCTAssertTrue(rendu.observes.isEmpty)
    }

    /// Sur iPad, sans conversation ouverte, la racine montre le fil à gauche (#8922).
    func test_rendusAttendus_progressionOnIPad_alsoWaitsForTheFeed() {
        XCTAssertEqual(VitrineScene.progression.rendusAttendus(conversationId: nil, appareil: .iphone), [.progression])
        XCTAssertEqual(VitrineScene.progression.rendusAttendus(conversationId: nil, appareil: .ipad), [.progression, .fil])
    }

    func test_rendusAttendus_globalWaitsForItsConversation_lienForItsPreview() {
        XCTAssertEqual(VitrineScene.global.rendusAttendus(conversationId: "c1", appareil: .iphone), [.conversation("c1")])
        XCTAssertEqual(VitrineScene.lien.rendusAttendus(conversationId: nil, appareil: .ipad), [.lien])
    }

    func test_rendusAttendus_conversationScenesWaitForTheirConversation() {
        for scene in [VitrineScene.amour, .groupe, .imagine] {
            XCTAssertEqual(scene.rendusAttendus(conversationId: "c2", appareil: .ipad), [.conversation("c2")], "\(scene)")
        }
    }

    /// Sans conversation connue, la scène attend un rendu qui ne viendra jamais : la capture échoue
    /// en la nommant plutôt que de photographier autre chose.
    func test_rendusAttendus_unknownConversation_isNeverSatisfied() {
        XCTAssertEqual(VitrineScene.global.rendusAttendus(conversationId: nil, appareil: .iphone), [.conversation("")])
    }

    private func laisserTourner() async {
        for _ in 0..<10 { await Task.yield() }
    }
}

@MainActor
private final class Drapeau {
    nonisolated deinit {}

    var leve = false
}
