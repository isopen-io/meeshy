import XCTest
import MeeshySDK
@testable import Meeshy

/// L'émission de mon écoute (#16803) : rien ne part sans mon choix, l'état part complet une fois par changement, la
/// pause et l'arrière-plan l'effacent, et un envoi perdu se rejoue.
@MainActor
final class ListeningBroadcastLawTests: XCTestCase {

    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    private let song = ListeningTrack(title: "Clair de lune", artist: "Debussy")
    private let other = ListeningTrack(title: "Gymnopédie n° 1", artist: "Satie")

    private func enabledLaw() -> ListeningBroadcastLaw {
        var law = ListeningBroadcastLaw()
        _ = law.setEnabled(true, now: t0)
        return law
    }

    func test_play_beforeTheUserChose_sendsNothing() {
        var law = ListeningBroadcastLaw()

        XCTAssertEqual(law.play(song, now: t0), .none)
        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(700)), .none)
    }

    func test_choosing_whileASongPlays_sendsTheFullState() {
        var law = ListeningBroadcastLaw()
        _ = law.play(song, now: t0)

        XCTAssertEqual(
            law.setEnabled(true, now: t0),
            .publish(NowPlayingUpdate(category: .music, title: "Clair de lune — Debussy", source: "Apple Music"))
        )
    }

    func test_aNewSong_isSentOnce() {
        var law = enabledLaw()

        XCTAssertEqual(law.play(song, now: t0), .publish(ListeningBroadcastLaw.update(for: song)))
        XCTAssertEqual(law.play(song, now: t0.addingTimeInterval(5)), .none)
        XCTAssertEqual(law.play(other, now: t0.addingTimeInterval(6)), .publish(ListeningBroadcastLaw.update(for: other)))
    }

    func test_theSameSong_isRefreshedOnlyAfterTenMinutes() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)

        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(599)), .none)
        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(600)), .publish(ListeningBroadcastLaw.update(for: song)))
    }

    func test_pause_clearsOnce() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)

        XCTAssertEqual(law.play(nil, now: t0.addingTimeInterval(1)), .clear)
        XCTAssertEqual(law.play(nil, now: t0.addingTimeInterval(2)), .none)
        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(900)), .none)
    }

    func test_pause_withNothingSent_sendsNothing() {
        var law = enabledLaw()

        XCTAssertEqual(law.play(nil, now: t0), .none)
    }

    func test_background_clears_andForeground_sendsAgain() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)

        XCTAssertEqual(law.setVisible(false, now: t0.addingTimeInterval(1)), .clear)
        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(700)), .none)
        XCTAssertEqual(law.setVisible(true, now: t0.addingTimeInterval(800)), .publish(ListeningBroadcastLaw.update(for: song)))
    }

    func test_withdrawingTheChoice_clears() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)

        XCTAssertEqual(law.setEnabled(false, now: t0.addingTimeInterval(1)), .clear)
        XCTAssertEqual(law.play(other, now: t0.addingTimeInterval(2)), .none)
    }

    func test_aLostSend_isReplayedAtTheNextTick() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)
        law.settle(ListeningBroadcastLaw.update(for: song), .offline)

        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(60)), .publish(ListeningBroadcastLaw.update(for: song)))
    }

    func test_aLostSend_stillClearsOnPause() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)
        law.settle(ListeningBroadcastLaw.update(for: song), .rateLimited)

        XCTAssertEqual(law.play(nil, now: t0.addingTimeInterval(1)), .clear)
    }

    func test_aRefusedSend_isNotReplayedBeforeTheRefresh() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)
        law.settle(ListeningBroadcastLaw.update(for: song), .refused)

        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(60)), .none)
    }

    func test_aLateAckForAnOlderSong_changesNothing() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)
        _ = law.play(other, now: t0.addingTimeInterval(1))
        law.settle(ListeningBroadcastLaw.update(for: song), .offline)

        XCTAssertEqual(law.tick(now: t0.addingTimeInterval(60)), .none)
    }

    func test_reconnecting_whileASongPlays_sendsItAgain() {
        var law = enabledLaw()
        _ = law.play(song, now: t0)

        XCTAssertEqual(law.reconnected(now: t0.addingTimeInterval(30)), .publish(ListeningBroadcastLaw.update(for: song)))
    }

    func test_reconnecting_inSilence_sendsNothing() {
        var law = enabledLaw()

        XCTAssertEqual(law.reconnected(now: t0), .none)
    }

    func test_aTrackWithoutArtist_isSentByItsTitle() {
        XCTAssertEqual(
            ListeningBroadcastLaw.update(for: ListeningTrack(title: "Podcast du matin", artist: nil)),
            NowPlayingUpdate(category: .music, title: "Podcast du matin", source: "Apple Music")
        )
    }

    func test_theUpdate_respectsTheContractBounds() {
        let long = ListeningTrack(title: String(repeating: "a", count: 300), artist: "b")

        XCTAssertEqual(ListeningBroadcastLaw.update(for: long).title?.count, NowPlayingContract.titleMax)
    }
}
