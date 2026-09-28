import XCTest
@testable import MeeshySDK

/// **Un objet posé sur une scène animée entre à la tête** (#8370, lot 6 —
/// maquette `Main.dc.html`, `mkObj` : `t0 = min(ph, 0.8)`, `t1 = 1`).
final class SceneEntryWindowTests: XCTestCase {

    func test_lObjetEntreALaTete_etResteJusquALaFin() {
        let w = SceneEntryWindow.forNewObject(playhead: 1.5, slideDuration: 6)
        XCTAssertEqual(w.start, 1.5, accuracy: 0.0001)
        XCTAssertEqual(w.duration, 4.5, accuracy: 0.0001)
    }

    func test_lEntreeNeDepassePas80PourCent() {
        let w = SceneEntryWindow.forNewObject(playhead: 5.9, slideDuration: 6)
        XCTAssertEqual(w.start, 4.8, accuracy: 0.0001, "Un objet qui n'entrerait qu'à la dernière image serait posé sans être vu.")
        XCTAssertEqual(w.duration, 1.2, accuracy: 0.0001)
    }

    func test_uneTeteInvalide_poseAuDebut() {
        XCTAssertEqual(SceneEntryWindow.forNewObject(playhead: .nan, slideDuration: 6).start, 0)
        XCTAssertEqual(SceneEntryWindow.forNewObject(playhead: -2, slideDuration: 6).start, 0)
    }

    func test_laFenetreSePose_surChaqueFamille_saufLeFond() {
        var effets = StoryEffects(textObjects: [StoryTextObject(id: "t", text: "x")])
        effets.stickerObjects = [StorySticker(id: "s", emoji: "🔥")]
        effets.mediaObjects = [StoryMediaObject(id: "fond", kind: .image, aspectRatio: 1, isBackground: true),
                               StoryMediaObject(id: "m", kind: .video, aspectRatio: 1)]
        XCTAssertEqual(Set(effets.timedObjectIds), ["t", "s", "m"])
        XCTAssertTrue(effets.setWindow(id: "t", start: 1, duration: 2))
        XCTAssertTrue(effets.setWindow(id: "s", start: 1, duration: 2))
        XCTAssertTrue(effets.setWindow(id: "m", start: 1, duration: 2))
        XCTAssertFalse(effets.setWindow(id: "fond", start: 1, duration: 2), "Le fond EST la scène.")
        XCTAssertEqual(effets.textObjects.first?.startTime, 1)
        XCTAssertEqual(effets.stickerObjects?.first?.duration, 2)
        XCTAssertEqual(effets.mediaObjects?.last?.startTime, 1)
        XCTAssertNil(effets.mediaObjects?.first?.startTime)
    }
}
