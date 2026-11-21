import XCTest
import MeeshySDK
@testable import Meeshy

/// LE MOUVEMENT VOYAGE AVEC MA POSITION (#19887) : l'activité de l'appareil (de confiance moyenne au moins) part avec
/// chaque relevé ; une passerelle d'avant refuse la clé (`INVALID`, schéma strict) — le même relevé repart alors sans
/// elle, et plus aucun mouvement ne part jusqu'à la fin du partage. Chez le lecteur, il ne se montre que frais.
@MainActor
final class SharedLocationMotionTests: XCTestCase {

    private let alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private let t0 = Date(timeIntervalSince1970: 1_800_000_000)
    private let accepted = SharedLocationStartVerdict.started(expiresAt: Date(timeIntervalSince1970: 2_000_000_000))

    private struct Rig {
        let sut: SharedLocationMotionTaggingEmitter
        let inner: ScriptedSharedLocationEmitter
        let motion: FakeSharedLocationMotionSource
    }

    private func makeRig(motion latest: SharedLocationMotion? = .walking) -> Rig {
        let inner = ScriptedSharedLocationEmitter()
        let motion = FakeSharedLocationMotionSource()
        motion.latest = latest
        return Rig(sut: SharedLocationMotionTaggingEmitter(inner: inner, motion: motion), inner: inner, motion: motion)
    }

    private func fix(_ latitude: Double = 48.85) throws -> SharedLocationFix {
        try XCTUnwrap(SharedLocationFix(latitude: latitude, longitude: 2.35, accuracy: 10))
    }

    private func request() throws -> SharedLocationStartRequest {
        try XCTUnwrap(SharedLocationStartRequest(
            recipients: [SharedLocationRecipient(userId: alice, precision: .exact)], duration: .oneHour, fix: try fix()))
    }

    // MARK: - L'envoi

    func test_update_carriesTheDeviceMotion_andStartsListening() async throws {
        let rig = makeRig(motion: .cycling)

        let verdict = await rig.sut.update(try fix())

        XCTAssertEqual(verdict, accepted)
        XCTAssertEqual(rig.inner.updates.map(\.motion), [.cycling])
        XCTAssertEqual(rig.motion.begins, 1)
    }

    func test_update_withoutKnownMotion_sendsThePlainFixOnce() async throws {
        let rig = makeRig(motion: nil)

        _ = await rig.sut.update(try fix())

        XCTAssertEqual(rig.inner.updates, [try fix()])
    }

    func test_start_carriesTheMotionInItsPosition() async throws {
        let rig = makeRig(motion: .running)

        _ = await rig.sut.start(try request())

        XCTAssertEqual(rig.inner.starts.map { $0.fix?.motion }, [.running])
    }

    // MARK: - Rétrocompatibilité : une passerelle d'avant refuse la clé

    func test_anUpdateRefusedInvalid_isResentWithoutMotion_andNoMotionLeavesForTheRestOfTheShare() async throws {
        let rig = makeRig(motion: .walking)
        rig.inner.verdicts = [.refused(.invalid)]

        let verdict = await rig.sut.update(try fix())
        _ = await rig.sut.update(try fix(48.9))

        XCTAssertEqual(verdict, accepted)
        XCTAssertEqual(rig.inner.updates.map(\.motion), [.walking, nil, nil])
        XCTAssertEqual(rig.inner.updates[1], try fix())
        XCTAssertEqual(rig.inner.updates[2], try fix(48.9))
    }

    func test_aStartRefusedInvalid_isResentWithoutMotion_withTheSameRecipients() async throws {
        let rig = makeRig(motion: .automotive)
        rig.inner.verdicts = [.refused(.invalid)]

        let verdict = await rig.sut.start(try request())
        _ = await rig.sut.update(try fix())

        XCTAssertEqual(verdict, accepted)
        XCTAssertEqual(rig.inner.starts.map { $0.fix?.motion }, [.automotive, nil])
        XCTAssertEqual(rig.inner.starts[1], try request())
        XCTAssertEqual(rig.inner.updates.map(\.motion), [nil])
    }

    func test_aRefusalThatIsNotTheMotions_leavesTheMotionOn() async throws {
        let rig = makeRig(motion: .walking)
        rig.inner.verdicts = [.refused(.invalid), .refused(.invalid)]

        let verdict = await rig.sut.update(try fix())
        _ = await rig.sut.update(try fix())

        XCTAssertEqual(verdict, .refused(.invalid))
        XCTAssertEqual(rig.inner.updates.map(\.motion), [.walking, nil, .walking])
    }

    func test_anotherRefusal_isNotRetried() async throws {
        let rig = makeRig(motion: .walking)
        rig.inner.verdicts = [.refused(.rateLimited)]

        let verdict = await rig.sut.update(try fix())

        XCTAssertEqual(verdict, .refused(.rateLimited))
        XCTAssertEqual(rig.inner.updates.count, 1)
    }

    func test_aNewShareAfterStop_triesTheMotionAgain_andStopsListening() async throws {
        let rig = makeRig(motion: .walking)
        rig.inner.verdicts = [.refused(.invalid)]
        _ = await rig.sut.update(try fix())

        _ = await rig.sut.stop()
        _ = await rig.sut.start(try request())

        XCTAssertEqual(rig.motion.ends, 1)
        XCTAssertEqual(rig.inner.starts.map { $0.fix?.motion }, [.walking])
    }

    func test_aListOnlyStart_sendsOnce_withoutPosition() async throws {
        let rig = makeRig(motion: .walking)
        let listOnly = try XCTUnwrap(SharedLocationStartRequest(
            listOnly: [SharedLocationRecipient(userId: alice, precision: .exact)], duration: .oneHour))

        _ = await rig.sut.start(listOnly)

        XCTAssertEqual(rig.inner.starts, [listOnly])
    }

    // MARK: - Ce que l'appareil dit de son activité

    func test_reading_keepsOnlyMediumOrHighConfidence() {
        XCTAssertEqual(SharedLocationMotionReading(walking: true, confidence: .medium).motion, .walking)
        XCTAssertEqual(SharedLocationMotionReading(walking: true, confidence: .high).motion, .walking)
        XCTAssertNil(SharedLocationMotionReading(walking: true, confidence: .low).motion)
    }

    func test_reading_prefersTheVehicleOverStillness_andIsNilWhenUnknown() {
        XCTAssertEqual(SharedLocationMotionReading(stationary: true, automotive: true, confidence: .high).motion, .automotive)
        XCTAssertEqual(SharedLocationMotionReading(cycling: true, confidence: .high).motion, .cycling)
        XCTAssertEqual(SharedLocationMotionReading(running: true, confidence: .high).motion, .running)
        XCTAssertEqual(SharedLocationMotionReading(stationary: true, confidence: .high).motion, .stationary)
        XCTAssertNil(SharedLocationMotionReading(confidence: .high).motion)
    }

    // MARK: - Chez le lecteur

    func test_glyph_showsAMovingPerson_neverAStillOne() {
        XCTAssertEqual(LocationMotionGlyph.symbol(for: .walking), "figure.walk")
        XCTAssertEqual(LocationMotionGlyph.symbol(for: .running), "figure.run")
        XCTAssertEqual(LocationMotionGlyph.symbol(for: .cycling), "bicycle")
        XCTAssertEqual(LocationMotionGlyph.symbol(for: .automotive), "car.fill")
        XCTAssertNil(LocationMotionGlyph.symbol(for: .stationary))
        XCTAssertFalse(LocationMotionGlyph.label(for: .cycling).isEmpty)
    }

    func test_pin_showsItsMotionOnlyWhileThePositionIsFresh() {
        let pin = SharedLocationPin(id: alice, latitude: 0, longitude: 0, radiusMeters: 10, precision: .exact, name: "A",
                                    initials: "A", presence: nil, deadline: t0.addingTimeInterval(3600),
                                    updatedAt: t0, motion: .running)

        XCTAssertEqual(pin.shownMotion(now: t0.addingTimeInterval(60)), .running)
        XCTAssertNil(pin.shownMotion(now: t0.addingTimeInterval(301)))
    }

    func test_pinLabel_saysAFreshMovement_neverAStaleOrStillOne() {
        let cycling = pin(motion: .cycling)
        let said = LocationMotionGlyph.label(for: .cycling)

        XCTAssertTrue(LocationMapPinsLayer.label(of: cycling, now: t0.addingTimeInterval(60)).hasSuffix(", \(said)"))
        XCTAssertFalse(LocationMapPinsLayer.label(of: cycling, now: t0.addingTimeInterval(600)).contains(said))
        XCTAssertEqual(LocationMapPinsLayer.label(of: pin(motion: .stationary), now: t0),
                       LocationMapPinsLayer.label(of: pin(motion: nil), now: t0))
    }

    private func pin(motion: SharedLocationMotion?) -> SharedLocationPin {
        SharedLocationPin(id: alice, latitude: 0, longitude: 0, radiusMeters: 10, precision: .exact, name: "A",
                          initials: "A", presence: nil, deadline: t0.addingTimeInterval(3600), updatedAt: t0, motion: motion)
    }
}

/// Une passerelle qui rend ses verdicts dans l'ordre, puis accepte.
final class ScriptedSharedLocationEmitter: SharedLocationEmitting, @unchecked Sendable {
    var isConnected = true
    var verdicts: [SharedLocationStartVerdict] = []
    private(set) var starts: [SharedLocationStartRequest] = []
    private(set) var updates: [SharedLocationFix] = []
    private(set) var stops = 0

    func start(_ request: SharedLocationStartRequest) async -> SharedLocationStartVerdict {
        starts.append(request)
        return next()
    }

    func update(_ fix: SharedLocationFix) async -> SharedLocationStartVerdict {
        updates.append(fix)
        return next()
    }

    func stop() async -> Bool {
        stops += 1
        return true
    }

    private func next() -> SharedLocationStartVerdict {
        verdicts.isEmpty ? .started(expiresAt: Date(timeIntervalSince1970: 2_000_000_000)) : verdicts.removeFirst()
    }
}

@MainActor
final class FakeSharedLocationMotionSource: SharedLocationMotionProviding {
    var latest: SharedLocationMotion?
    private(set) var begins = 0
    private(set) var ends = 0

    nonisolated deinit {}

    func begin() { begins += 1 }
    func end() { ends += 1 }
}
