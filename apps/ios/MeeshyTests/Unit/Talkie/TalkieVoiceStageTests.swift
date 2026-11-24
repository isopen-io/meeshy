import Combine
import XCTest
@testable import Meeshy

/// Chaque voix du talkie a ses propres bandes (#20531) : le registre les garde par personne, lissées bande par
/// bande, et ne publie que qui parle et dans quel sens.
@MainActor
final class TalkieVoiceStageTests: XCTestCase {

    private static let startedAt = Date(timeIntervalSince1970: 1_800_000_000)
    private static let zeros = [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount)
    private static let full = [Float](repeating: 1, count: TalkieSpectrumAnalyzer.bandCount)

    func test_push_twoSpeakers_bandsStayPerPerson() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)
        stage.begin(userId: "b", direction: .incoming, at: Self.startedAt)

        stage.push(userId: "a", bands: Self.full)
        stage.push(userId: "b", bands: Self.zeros)

        XCTAssertEqual(stage.bands(for: "b"), Self.zeros)
        XCTAssertTrue(stage.bands(for: "a").allSatisfy { $0 > 0 })
    }

    func test_end_clearsBandsAndDirection() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .outgoing, at: Self.startedAt)
        stage.push(userId: "a", bands: Self.full)

        stage.end(userId: "a")

        XCTAssertEqual(stage.bands(for: "a"), Self.zeros)
        XCTAssertNil(stage.direction(for: "a"))
        XCTAssertNil(stage.startedAt(for: "a"))
    }

    func test_push_smoothing_attackFastReleaseSlow() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)

        stage.push(userId: "a", bands: Self.full)
        let attacked = try XCTUnwrap(stage.bands(for: "a").first)
        stage.push(userId: "a", bands: Self.zeros)
        let released = try XCTUnwrap(stage.bands(for: "a").first)

        XCTAssertEqual(attacked, 0.55, accuracy: 1e-6)
        XCTAssertEqual(released, 0.55 * (1 - 0.12), accuracy: 1e-6)
    }

    func test_bands_unknownUser_returns120Zeros() {
        let stage = TalkieVoiceStage()

        XCTAssertEqual(stage.bands(for: "personne"), Self.zeros)
        XCTAssertEqual(stage.bands(for: "personne").count, 120)
    }

    func test_begin_recordsDirectionAndStart() {
        let stage = TalkieVoiceStage()

        stage.begin(userId: "a", direction: .outgoing, at: Self.startedAt)

        XCTAssertEqual(stage.direction(for: "a"), .outgoing)
        XCTAssertEqual(stage.startedAt(for: "a"), Self.startedAt)
    }

    /// Un tampon du fil audio qui arrive après la fin ne rouvre pas la voix.
    func test_push_afterEnd_isIgnored() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)
        stage.end(userId: "a")

        stage.push(userId: "a", bands: Self.full)

        XCTAssertEqual(stage.bands(for: "a"), Self.zeros)
        XCTAssertNil(stage.direction(for: "a"))
    }

    func test_observer_beginAndEnd_publishesWhoSpeaksAndWhichWay() {
        let stage = TalkieVoiceStage()
        let observer = TalkieVoiceStageObserver(stage: stage)
        XCTAssertEqual(observer.voices, [:])

        stage.begin(userId: "a", direction: .outgoing, at: Self.startedAt)
        stage.begin(userId: "b", direction: .incoming, at: Self.startedAt)
        XCTAssertEqual(observer.voices, ["a": .outgoing, "b": .incoming])

        stage.end(userId: "a")
        XCTAssertEqual(observer.voices, ["b": .incoming])
    }

    func test_observer_push_publishesNothing() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)
        let observer = TalkieVoiceStageObserver(stage: stage)
        var publications = 0
        let subscription = observer.objectWillChange.sink { publications += 1 }

        stage.push(userId: "a", bands: Self.full)
        stage.push(userId: "a", bands: Self.zeros)

        XCTAssertEqual(publications, 0)
        XCTAssertEqual(observer.voices, ["a": .incoming])
        subscription.cancel()
    }
}
