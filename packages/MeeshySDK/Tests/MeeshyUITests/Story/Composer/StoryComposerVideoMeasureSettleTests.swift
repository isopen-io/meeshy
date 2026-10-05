import XCTest
@testable import MeeshyUI

/// **La retouche d'une pièce du fil prend son état de départ APRÈS les mesures
/// vidéo** (#9126, #9131). Une mesure arrive après la pose : sans attente, elle
/// se lit comme une retouche, et une vidéo intacte repartait ré-encodée.
@MainActor
final class StoryComposerVideoMeasureSettleTests: XCTestCase {

    func test_videoMeasurementsSettled_pendingMeasurement_waitsForIt() async {
        let vm = StoryComposerViewModel()
        let fini = Flag()
        vm.videoMeasureTasks["v"] = Task {
            try? await Task.sleep(nanoseconds: 50_000_000)
            await fini.set()
        }
        await vm.videoMeasurementsSettled()
        let valeur = await fini.value
        XCTAssertTrue(valeur)
    }

    func test_videoMeasurementsSettled_noMeasurement_returnsAtOnce() async {
        let vm = StoryComposerViewModel()
        await vm.videoMeasurementsSettled()
        XCTAssertTrue(vm.videoMeasureTasks.isEmpty)
    }
}

private actor Flag {
    private(set) var value = false
    func set() { value = true }
}
