import XCTest
import MeeshySDK
@testable import Meeshy

/// Le lecteur suit la séance, et la séance suit ses gestes (#17097, iso `use-together-sync.ts`) : la position servie
/// s'applique à l'horloge du serveur, la dérive se rattrape, et seul un geste qui change l'état partagé part chez
/// l'autre.
@MainActor
final class TogetherPlaybackDriverTests: XCTestCase {

    final class FakeSurface: TogetherPlayerSurface {
        var currentMs: Double = 0
        var isPaused = true
        var rates: [Double] = []
        var seeks: [Double] = []
        var pauses = 0

        nonisolated deinit {}

        func seek(toMs: Double) {
            seeks.append(toMs)
            currentMs = toMs
        }

        func play(rate: Double) {
            rates.append(rate)
            isPaused = false
        }

        func pause() {
            pauses += 1
            isPaused = true
        }
    }

    final class Sent {
        var calls: [(playing: Bool, positionMs: Double)] = []

        nonisolated deinit {}
    }

    private let device = Date(timeIntervalSince1970: 1_000)

    private func playback(playing: Bool, positionMs: Double, at: Double = 1_000_000, rev: Int = 1) -> TogetherPlayback {
        TogetherPlayback(playing: playing, positionMs: positionMs, at: at, rev: rev, byUserId: "proche")
    }

    private func makeDriver(_ surface: FakeSurface, sent: Sent) -> TogetherPlaybackDriver {
        let device = self.device
        return TogetherPlaybackDriver(surface: surface, now: { device }) { playing, positionMs in
            sent.calls.append((playing, positionMs))
        }
    }

    func test_aServedPlayback_seeksToTheServerClockPosition_andPlays() {
        let surface = FakeSurface()
        let driver = makeDriver(surface, sent: Sent())

        driver.apply(playback(playing: true, positionMs: 10_000, at: 1_000_000), clockOffsetMs: 2_500)

        XCTAssertEqual(surface.seeks, [12_500])
        XCTAssertEqual(surface.rates, [1])
    }

    func test_aSmallDrift_isCaughtUpBySpeed_notByAJump() {
        let surface = FakeSurface()
        surface.currentMs = 9_600
        let driver = makeDriver(surface, sent: Sent())

        driver.apply(playback(playing: true, positionMs: 10_000), clockOffsetMs: 0)

        XCTAssertEqual(surface.seeks, [])
        XCTAssertEqual(surface.rates, [1.05])
    }

    func test_aServedPause_pausesHere_atThePausedPosition() {
        let surface = FakeSurface()
        surface.isPaused = false
        surface.currentMs = 30_000
        let driver = makeDriver(surface, sent: Sent())

        driver.apply(playback(playing: false, positionMs: 12_000), clockOffsetMs: 0)

        XCTAssertEqual(surface.seeks, [12_000])
        XCTAssertEqual(surface.pauses, 1)
        XCTAssertTrue(surface.rates.isEmpty)
    }

    func test_pausingWhileTheSessionPlays_isSentToTheOther() {
        let surface = FakeSurface()
        let sent = Sent()
        let driver = makeDriver(surface, sent: sent)
        driver.apply(playback(playing: true, positionMs: 10_000), clockOffsetMs: 0)

        driver.gesture(.pause)

        XCTAssertEqual(sent.calls.map(\.playing), [false])
        XCTAssertEqual(sent.calls.first?.positionMs, 10_000)
        XCTAssertTrue(surface.isPaused)
    }

    func test_playingWhileTheSessionAlreadyPlays_onlyRealignsHere() {
        let surface = FakeSurface()
        let sent = Sent()
        let driver = makeDriver(surface, sent: sent)
        driver.apply(playback(playing: true, positionMs: 30_000), clockOffsetMs: 0)
        surface.currentMs = 0
        surface.isPaused = true

        driver.gesture(.play)

        XCTAssertTrue(sent.calls.isEmpty)
        XCTAssertEqual(surface.seeks.last, 30_000)
        XCTAssertFalse(surface.isPaused)
    }

    func test_aBigSeek_isSent_aSmallOneIsNot() {
        let surface = FakeSurface()
        let sent = Sent()
        let driver = makeDriver(surface, sent: sent)
        driver.apply(playback(playing: false, positionMs: 10_000), clockOffsetMs: 0)

        driver.gesture(.seek(toMs: 10_400))
        XCTAssertTrue(sent.calls.isEmpty)

        driver.gesture(.seek(toMs: 40_000))
        XCTAssertEqual(sent.calls.count, 1)
        XCTAssertEqual(sent.calls.first?.playing, false)
        XCTAssertEqual(sent.calls.first?.positionMs, 40_000)
    }

    func test_theTick_neverRestartsAPausedPlayer() {
        let surface = FakeSurface()
        let driver = makeDriver(surface, sent: Sent())
        driver.apply(playback(playing: true, positionMs: 10_000), clockOffsetMs: 0)
        surface.isPaused = true
        let before = surface.rates.count

        driver.tick()

        XCTAssertEqual(surface.rates.count, before)
    }

    func test_beforeAnyPlayback_aGestureDoesNothing() {
        let surface = FakeSurface()
        let sent = Sent()
        let driver = makeDriver(surface, sent: sent)

        driver.gesture(.play)

        XCTAssertTrue(sent.calls.isEmpty)
        XCTAssertTrue(surface.rates.isEmpty)
    }
}
