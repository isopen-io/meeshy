import XCTest
@testable import MeeshyUI

/// #4999 — **l'horloge du mouvement en COMPOSITION.** Elle ne lit aucune
/// horloge : elle reçoit ses instants, donc tout ce qui suit se prouve à la
/// milliseconde sans faire tourner le moindre `CADisplayLink`.
final class StoryStickerMotionClockTests: XCTestCase {

    // MARK: - L'avancement

    func test_firstTick_advancesNothing() {
        var horloge = StoryStickerMotionClock()
        horloge.advance(to: 1_000)
        XCTAssertEqual(horloge.elapsed, 0, "un premier tick pose l'origine, il ne mesure rien")
    }

    func test_consecutiveTicks_accumulate() {
        var horloge = StoryStickerMotionClock()
        horloge.advance(to: 100)
        horloge.advance(to: 100.1)
        horloge.advance(to: 100.2)
        XCTAssertEqual(horloge.elapsed, 0.2, accuracy: 1e-9)
    }

    /// Le témoin du lot : un écran mis au repos par `EditClockThrottle`, une
    /// application passée en arrière-plan, une feuille présentée par-dessus.
    /// Reprendre en ajoutant le trou ferait sauter la décoration d'un quart
    /// d'heure de phase.
    func test_aGap_isNotAnInterval() {
        var horloge = StoryStickerMotionClock()
        horloge.advance(to: 0)
        horloge.advance(to: 0.1)
        horloge.advance(to: 900)      // quinze minutes d'écran au repos
        horloge.advance(to: 900.1)
        XCTAssertEqual(horloge.elapsed, 0.2, accuracy: 1e-9,
                       "le trou est ignoré, l'intervalle qui le suit ne l'est pas")
    }

    func test_theBoundary_isTheRule() {
        var juste = StoryStickerMotionClock()
        juste.advance(to: 0)
        juste.advance(to: StoryStickerMotionClock.maximumStep)
        XCTAssertEqual(juste.elapsed, StoryStickerMotionClock.maximumStep, accuracy: 1e-9)

        var trop = StoryStickerMotionClock()
        trop.advance(to: 0)
        trop.advance(to: StoryStickerMotionClock.maximumStep + 0.001)
        XCTAssertEqual(trop.elapsed, 0)
    }

    func test_timeGoingBackwards_advancesNothing() {
        var horloge = StoryStickerMotionClock()
        horloge.advance(to: 10)
        horloge.advance(to: 9)
        XCTAssertEqual(horloge.elapsed, 0)
    }

    // MARK: - Les naissances

    /// `pose(at: 0)` étant l'identité par contrat, une décoration qu'on vient
    /// de poser part de la pose exacte que l'auteur a choisie — et un `.pop`
    /// joue au moment de la POSE, pas à l'ouverture du composer.
    func test_aStickerPosedLate_startsAtZero() {
        var horloge = StoryStickerMotionClock()
        horloge.synchronize(ids: ["a"])
        horloge.advance(to: 0)
        for tick in 1...10 { horloge.advance(to: Double(tick) / 10) }
        horloge.synchronize(ids: ["a", "b"])

        XCTAssertEqual(horloge.time(forId: "a"), 1.0, accuracy: 1e-9)
        XCTAssertEqual(horloge.time(forId: "b"), 0, accuracy: 1e-9)
    }

    func test_anUnknownSticker_readsAsAtRest() {
        let horloge = StoryStickerMotionClock()
        XCTAssertEqual(horloge.time(forId: "jamais annoncé"), 0)
    }

    /// Un identifiant réutilisé ne doit pas hériter de la phase de la
    /// décoration supprimée : l'oubli est ce qui le garantit.
    func test_aDepartedSticker_isForgotten() {
        var horloge = StoryStickerMotionClock()
        horloge.synchronize(ids: ["a"])
        horloge.advance(to: 0)
        for tick in 1...10 { horloge.advance(to: Double(tick) / 10) }

        horloge.synchronize(ids: [])
        horloge.synchronize(ids: ["a"])
        XCTAssertEqual(horloge.time(forId: "a"), 0, accuracy: 1e-9)
    }

    // MARK: - Le témoin de pose

    func test_isPosing_saysWhetherThereIsSomethingToUndo() {
        var horloge = StoryStickerMotionClock()
        XCTAssertFalse(horloge.isPosing)
        horloge.markPosed()
        XCTAssertTrue(horloge.isPosing)
        horloge.markRested()
        XCTAssertFalse(horloge.isPosing)
    }
}
