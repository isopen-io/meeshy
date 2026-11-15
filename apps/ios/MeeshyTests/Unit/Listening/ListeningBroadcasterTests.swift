import Combine
import XCTest
import MeeshySDK
@testable import Meeshy

/// L'émetteur de mon écoute (#16803) branché sur ses flux : ce qui part sur la socket, dans l'ordre, et seulement après
/// le choix de l'utilisateur.
@MainActor
final class ListeningBroadcasterTests: XCTestCase {

    final class FakeEmitter: NowPlayingEmitting, @unchecked Sendable {
        enum Sent: Equatable {
            case publish(NowPlayingUpdate)
            case clear
        }

        private let lock = NSLock()
        private var log: [Sent] = []
        private var nextOutcome: NowPlayingPublishOutcome = .accepted

        var sent: [Sent] { lock.withLock { log } }

        func answer(_ outcome: NowPlayingPublishOutcome) {
            lock.withLock { nextOutcome = outcome }
        }

        func publishNowPlaying(_ update: NowPlayingUpdate) async -> NowPlayingPublishOutcome {
            lock.withLock {
                log.append(.publish(update))
                return nextOutcome
            }
        }

        func clearNowPlaying() async {
            lock.withLock { log.append(.clear) }
        }
    }

    private struct Rig {
        let sut: ListeningBroadcaster
        let emitter: FakeEmitter
        let tracks: CurrentValueSubject<ListeningTrack?, Never>
        let enabled: CurrentValueSubject<Bool, Never>
        let visible: CurrentValueSubject<Bool, Never>
        let connected: CurrentValueSubject<Bool, Never>
        let ticks: PassthroughSubject<Void, Never>
    }

    private func makeRig(enabled: Bool = true) -> Rig {
        let emitter = FakeEmitter()
        let tracks = CurrentValueSubject<ListeningTrack?, Never>(nil)
        let enabledSubject = CurrentValueSubject<Bool, Never>(enabled)
        let visible = CurrentValueSubject<Bool, Never>(true)
        let connected = CurrentValueSubject<Bool, Never>(true)
        let ticks = PassthroughSubject<Void, Never>()
        let sut = ListeningBroadcaster(
            emitter: emitter,
            tracks: tracks.eraseToAnyPublisher(),
            enabled: enabledSubject.eraseToAnyPublisher(),
            visible: visible.eraseToAnyPublisher(),
            connected: connected.eraseToAnyPublisher(),
            ticks: ticks.eraseToAnyPublisher()
        )
        return Rig(sut: sut, emitter: emitter, tracks: tracks, enabled: enabledSubject, visible: visible,
                   connected: connected, ticks: ticks)
    }

    private let song = ListeningTrack(title: "Clair de lune", artist: "Debussy")

    func test_nothingLeaves_beforeTheUserChose() async {
        let rig = makeRig(enabled: false)

        rig.tracks.send(song)
        await rig.sut.drain()

        XCTAssertEqual(rig.emitter.sent, [])
    }

    func test_aSong_leavesComplete_thenThePauseClearsIt() async {
        let rig = makeRig()

        rig.tracks.send(song)
        rig.tracks.send(nil)
        await rig.sut.drain()

        XCTAssertEqual(rig.emitter.sent, [
            .publish(NowPlayingUpdate(category: .music, title: "Clair de lune — Debussy", source: "Apple Music")),
            .clear,
        ])
    }

    func test_goingToBackground_clears() async {
        let rig = makeRig()
        rig.tracks.send(song)

        rig.visible.send(false)
        await rig.sut.drain()

        XCTAssertEqual(rig.emitter.sent.last, .clear)
    }

    func test_aSendLostOffline_isReplayedAtTheNextTick() async {
        let rig = makeRig()
        rig.emitter.answer(.offline)
        rig.tracks.send(song)
        await rig.sut.drain()
        rig.emitter.answer(.accepted)

        rig.ticks.send(())
        await rig.sut.drain()

        XCTAssertEqual(rig.emitter.sent.count, 2)
    }

    func test_aReconnection_sendsWhatPlays() async {
        let rig = makeRig()
        rig.tracks.send(song)
        await rig.sut.drain()

        rig.connected.send(false)
        rig.connected.send(true)
        await rig.sut.drain()

        XCTAssertEqual(rig.emitter.sent.count, 2)
    }

    func test_turningTheChoiceOff_clears() async {
        let rig = makeRig()
        rig.tracks.send(song)

        rig.enabled.send(false)
        await rig.sut.drain()

        XCTAssertEqual(rig.emitter.sent.last, .clear)
    }

    func test_theAppleMusicReading_dropsAnEmptyTitle_andKeepsTheArtistWhenThere() {
        XCTAssertNil(AppleMusicListeningSource.track(title: "  ", artist: "Satie"))
        XCTAssertNil(AppleMusicListeningSource.track(title: nil, artist: "Satie"))
        XCTAssertEqual(
            AppleMusicListeningSource.track(title: " Gnossienne ", artist: " "),
            ListeningTrack(title: "Gnossienne", artist: nil)
        )
    }
}
