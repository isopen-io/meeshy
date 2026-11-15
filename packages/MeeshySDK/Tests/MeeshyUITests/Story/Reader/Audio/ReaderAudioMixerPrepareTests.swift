import XCTest
@testable import MeeshyUI

/// Le moteur d'un canevas voisin se prépare dès que ses clips sont chargés
/// (#9837), pour que la reprise au passage de réel à réel ne paie pas
/// l'allocation sur le fil principal, pendant le geste.
final class ReaderAudioMixerPrepareTests: XCTestCase {

    func test_idleEngineWithClips_isPrepared() {
        XCTAssertTrue(ReaderAudioMixer.shouldPrepareEngine(isRunning: false, hasClips: true))
    }

    func test_runningEngine_isLeftAlone() {
        XCTAssertFalse(ReaderAudioMixer.shouldPrepareEngine(isRunning: true, hasClips: true))
    }

    func test_engineWithoutClips_isNotPrepared() {
        XCTAssertFalse(ReaderAudioMixer.shouldPrepareEngine(isRunning: false, hasClips: false))
    }
}
