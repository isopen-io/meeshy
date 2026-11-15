import AVFoundation
import CoreMedia
import XCTest
@testable import MeeshyUI

/// #9884 — trois risques que #9702 laissait ouverts dans l'aperçu du composer :
/// une vidéo pas prête partait sans ancre pendant que le son partait à la sienne,
/// les recalages de dérive pouvaient s'empiler, et le tampon d'E/S de 5 ms restait
/// emprunté tant que le composer vivait.
@MainActor
final class TimelineStartReadinessTests: XCTestCase {

    // MARK: - Départ commun vidéo + son

    func test_videoStart_readyItem_isAnchored() {
        XCTAssertEqual(TimelinePlaybackSync.videoStart(itemStatus: .readyToPlay), .anchored)
    }

    func test_videoStart_itemNotReady_waitsBeforeStartingAnything() {
        XCTAssertEqual(TimelinePlaybackSync.videoStart(itemStatus: .unknown), .awaitingReadiness)
        XCTAssertEqual(TimelinePlaybackSync.videoStart(itemStatus: nil), .awaitingReadiness)
    }

    func test_videoStart_failedItem_playsWithoutAnchor_soTheSoundStillStarts() {
        XCTAssertEqual(TimelinePlaybackSync.videoStart(itemStatus: .failed), .unanchored)
    }

    // MARK: - Un seul recalage de dérive en vol

    func test_driftSeekGate_secondClaimWhileInFlight_isRefused() {
        let gate = DriftSeekGate()
        XCTAssertTrue(gate.claim())
        XCTAssertFalse(gate.claim(), "un second recalage ne part pas tant que le premier n'a pas abouti")
    }

    func test_driftSeekGate_afterCompletion_acceptsTheNextSeek() {
        let gate = DriftSeekGate()
        XCTAssertTrue(gate.claim())
        gate.release()
        XCTAssertTrue(gate.claim())
    }

    func test_driftSeekGate_copiesShareTheSameFlight() {
        let gate = DriftSeekGate()
        let copie = gate
        XCTAssertTrue(gate.claim())
        XCTAssertFalse(copie.claim(), "la complétion du seek relâche le portail que la couche consulte")
    }

    // MARK: - Le tampon de 5 ms n'est emprunté que pendant la lecture

    func test_ioBufferLease_borrowsOnce_andGivesBackTheOriginal() {
        var lease = IOBufferLease()
        XCTAssertTrue(lease.borrow(current: 0.023))
        XCTAssertFalse(lease.borrow(current: 0.005), "un second play ne réécrit pas la valeur d'origine")
        XCTAssertEqual(lease.giveBack(), 0.023)
        XCTAssertNil(lease.giveBack(), "rendre deux fois ne réécrit rien")
    }

    func test_ioBufferLease_neverBorrowed_givesNothingBack() {
        var lease = IOBufferLease()
        XCTAssertNil(lease.giveBack())
    }

    func test_ioBufferLease_isTheFiveMillisecondPreviewBuffer() {
        XCTAssertEqual(IOBufferLease.previewDuration, 0.005, accuracy: 0.000_001)
    }
}
