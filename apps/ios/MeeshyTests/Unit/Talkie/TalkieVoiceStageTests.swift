import Combine
import XCTest
@testable import Meeshy

/// Chaque voix du talkie a ses propres bandes (#20531) : le registre les garde par personne ET par sens, lissées
/// bande par bande, et ne publie que qui parle et dans quel sens.
@MainActor
final class TalkieVoiceStageTests: XCTestCase {

    private static let startedAt = Date(timeIntervalSince1970: 1_800_000_000)
    private static let zeros = [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount)
    private static let full = [Float](repeating: 1, count: TalkieSpectrumAnalyzer.bandCount)

    func test_bands_twoSpeakers_stayPerPerson() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)
        stage.begin(userId: "b", direction: .incoming, at: Self.startedAt)

        stage.push(userId: "a", direction: .incoming, bands: Self.full)
        stage.push(userId: "b", direction: .incoming, bands: Self.zeros)

        XCTAssertEqual(stage.bands(for: "b"), Self.zeros)
        XCTAssertTrue(stage.bands(for: "a").allSatisfy { $0 > 0 })
    }

    func test_push_bothDirectionsSamePerson_doNotOverwrite() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .outgoing, at: Self.startedAt)
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt.addingTimeInterval(1))

        stage.push(userId: "bob", direction: .outgoing, bands: Self.full)
        stage.push(userId: "bob", direction: .incoming, bands: Self.zeros)

        XCTAssertEqual(try XCTUnwrap(stage.bands(for: "bob", direction: .outgoing).first), 0.55, accuracy: 1e-6)
        XCTAssertEqual(stage.bands(for: "bob", direction: .incoming), Self.zeros)
        XCTAssertEqual(try XCTUnwrap(stage.bands(for: "bob").first), 0.55, accuracy: 1e-6, "max des deux sens")
        XCTAssertEqual(stage.direction(for: "bob"), .outgoing)
        XCTAssertEqual(stage.startedAt(for: "bob"), Self.startedAt)
    }

    func test_end_oneDirection_keepsTheOther() {
        let stage = TalkieVoiceStage()
        let heard = Self.startedAt.addingTimeInterval(2)
        stage.begin(userId: "bob", direction: .outgoing, at: Self.startedAt)
        stage.begin(userId: "bob", direction: .incoming, at: heard)
        stage.push(userId: "bob", direction: .incoming, bands: Self.full)

        stage.end(userId: "bob", direction: .outgoing)

        XCTAssertEqual(stage.direction(for: "bob"), .incoming)
        XCTAssertEqual(stage.startedAt(for: "bob"), heard)
        XCTAssertTrue(stage.bands(for: "bob").allSatisfy { $0 > 0 })
        XCTAssertEqual(stage.bands(for: "bob", direction: .outgoing), Self.zeros)
    }

    func test_end_clearsBandsAndDirection() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .outgoing, at: Self.startedAt)
        stage.push(userId: "a", direction: .outgoing, bands: Self.full)

        stage.end(userId: "a", direction: .outgoing)

        XCTAssertEqual(stage.bands(for: "a"), Self.zeros)
        XCTAssertNil(stage.direction(for: "a"))
        XCTAssertNil(stage.startedAt(for: "a"))
    }

    func test_push_smoothing_attackFastReleaseSlow() throws {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)

        stage.push(userId: "a", direction: .incoming, bands: Self.full)
        let attacked = try XCTUnwrap(stage.bands(for: "a").first)
        stage.push(userId: "a", direction: .incoming, bands: Self.zeros)
        let released = try XCTUnwrap(stage.bands(for: "a").first)

        XCTAssertEqual(attacked, 0.55, accuracy: 1e-6)
        XCTAssertEqual(released, 0.55 * (1 - 0.12), accuracy: 1e-6)
    }

    func test_bands_unknownUser_returns120Zeros() {
        let stage = TalkieVoiceStage()

        XCTAssertEqual(stage.bands(for: "personne"), Self.zeros)
        XCTAssertEqual(stage.bands(for: "personne", direction: .incoming), Self.zeros)
        XCTAssertEqual(stage.bands(for: "personne").count, 120)
    }

    func test_begin_recordsDirectionAndStart() {
        let stage = TalkieVoiceStage()

        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)

        XCTAssertEqual(stage.direction(for: "a"), .incoming)
        XCTAssertEqual(stage.startedAt(for: "a"), Self.startedAt)
    }

    /// Un tampon du fil audio qui arrive après la fin ne rouvre pas la voix.
    func test_push_afterEnd_isIgnored() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)
        stage.end(userId: "a", direction: .incoming)

        stage.push(userId: "a", direction: .incoming, bands: Self.full)

        XCTAssertEqual(stage.bands(for: "a"), Self.zeros)
        XCTAssertNil(stage.direction(for: "a"))
    }

    func test_push_otherDirection_isIgnored() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "bob", direction: .incoming, at: Self.startedAt)

        stage.push(userId: "bob", direction: .outgoing, bands: Self.full)

        XCTAssertEqual(stage.bands(for: "bob"), Self.zeros)
    }

    func test_observer_beginAndEnd_publishesWhoSpeaksAndWhichWay() {
        let stage = TalkieVoiceStage()
        let observer = TalkieVoiceStageObserver(stage: stage)
        XCTAssertEqual(observer.voices, [])

        stage.begin(userId: "a", direction: .outgoing, at: Self.startedAt)
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)
        stage.begin(userId: "b", direction: .incoming, at: Self.startedAt)
        XCTAssertEqual(observer.voices, [
            TalkieVoiceKey(userId: "a", direction: .outgoing),
            TalkieVoiceKey(userId: "a", direction: .incoming),
            TalkieVoiceKey(userId: "b", direction: .incoming),
        ])

        stage.end(userId: "a", direction: .outgoing)
        XCTAssertEqual(observer.voices, [
            TalkieVoiceKey(userId: "a", direction: .incoming),
            TalkieVoiceKey(userId: "b", direction: .incoming),
        ])
    }

    func test_observer_startsFromTheVoicesAlreadyInProgress() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)

        let observer = TalkieVoiceStageObserver(stage: stage)

        XCTAssertEqual(observer.voices, [TalkieVoiceKey(userId: "a", direction: .incoming)])
    }

    func test_observer_push_publishesNothing() {
        let stage = TalkieVoiceStage()
        stage.begin(userId: "a", direction: .incoming, at: Self.startedAt)
        let observer = TalkieVoiceStageObserver(stage: stage)
        var publications = 0
        let subscription = observer.objectWillChange.sink { publications += 1 }

        stage.push(userId: "a", direction: .incoming, bands: Self.full)
        stage.push(userId: "a", direction: .incoming, bands: Self.zeros)

        XCTAssertEqual(publications, 0)
        XCTAssertEqual(observer.voices, [TalkieVoiceKey(userId: "a", direction: .incoming)])
        subscription.cancel()
    }
}
