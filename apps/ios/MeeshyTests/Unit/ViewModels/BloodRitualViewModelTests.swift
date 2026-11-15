import XCTest
import MeeshySDK
@testable import Meeshy

/// Le rituel du Sang, côté écran (#13938). Le serveur tient l'état (jeton, fenêtre de
/// tenue de 15 s, double confirmation, consentements) ; l'écran ne fait que le piloter :
/// consentements d'abord (le serveur n'accepte un `confirm` que sur une tenue fraîche),
/// puis les deux tiennent l'écran, puis le scellement part tout seul. Lâcher est calme :
/// rien n'est enregistré.
@MainActor
final class BloodRitualViewModelTests: XCTestCase {

    private struct Rig {
        let sut: BloodRitualViewModel
        let relations: MockRelationsService
        let network: FakeNetworkMonitor
    }

    private func makeRig(online: Bool = true) -> Rig {
        let relations = MockRelationsService()
        relations.ritualResults[.start] = .success(
            RelationRitualStep(token: "tok", requestId: "r1", expiresAt: "2026-11-01T10:01:00.000Z", holdWindowMs: 15_000))
        relations.ritualResults[.hold] = .success(RelationRitualStep(holdWindowMs: 15_000, held: true))
        relations.ritualResults[.confirm] = .success(RelationRitualStep(completed: true, level: "BLOOD"))
        let network = FakeNetworkMonitor(isOnline: online)
        let sut = BloodRitualViewModel(
            userId: "u1",
            displayName: "Alice",
            relations: relations,
            networkMonitor: network,
            sleep: { _ in try? await Task.sleep(nanoseconds: 60_000_000_000) }
        )
        return Rig(sut: sut, relations: relations, network: network)
    }

    private func opened(_ rig: Rig) async {
        rig.sut.proceedFromConsents()
        await rig.sut.open()
    }

    private func refusal(_ status: Int, _ code: String) -> MeeshyError {
        .rejected(APIRejection(statusCode: status, code: code, message: "refus"))
    }

    private func held(by userId: String = "u1", token: String = "tok") -> RelationRitualProgressEvent {
        RelationRitualProgressEvent(token: token, userId: userId, stage: .held)
    }

    // MARK: - Les consentements d'abord

    func test_everyShareStartsRefused_andTheRitualStartsOnTheConsentStep() {
        let rig = makeRig()

        XCTAssertEqual(rig.sut.stage, .consent)
        XCTAssertEqual(rig.sut.consents, .allRefused)
    }

    func test_aConsentIsSetOneShareAtATime() {
        let rig = makeRig()

        rig.sut.setConsent(.locationLive, to: true)

        XCTAssertEqual(
            rig.sut.consents,
            RelationRitualConsents(listeningTitle: false, locationLive: true, locationHistory: false, locationProximity: false)
        )
    }

    func test_openingBeforeTheConsentsAreSeen_isIgnored() async {
        let rig = makeRig()

        await rig.sut.open()

        XCTAssertTrue(rig.relations.ritualCalls.isEmpty)
        XCTAssertEqual(rig.sut.stage, .consent)
    }

    // MARK: - Ouvrir

    func test_open_startsTheRitual_andWaitsForTheOther() async {
        let rig = makeRig()

        await opened(rig)

        XCTAssertEqual(rig.relations.ritualCalls, [
            MockRelationsService.RitualCall(userId: "u1", phase: .start, token: nil, consents: nil)
        ])
        XCTAssertEqual(rig.sut.stage, .waiting)
    }

    func test_open_offline_isUnavailable_andSaysSoWithoutCallingTheServer() async {
        let rig = makeRig(online: false)

        await opened(rig)

        XCTAssertEqual(rig.sut.stage, .unavailable)
        XCTAssertTrue(rig.sut.isOfflineUnavailable)
        XCTAssertTrue(rig.relations.ritualCalls.isEmpty)
    }

    func test_open_withoutAPendingBloodRequest_isUnavailableForThatReason() async {
        let rig = makeRig()
        rig.relations.ritualResults[.start] = .failure(refusal(409, "RELATION_RITUAL_NO_REQUEST"))

        await opened(rig)

        XCTAssertEqual(rig.sut.stage, .unavailable)
        XCTAssertEqual(rig.sut.refusal, .ritualNoRequest)
    }

    func test_open_whenTheServerIsBusy_comesBackToReady() async {
        let rig = makeRig()
        rig.relations.ritualResults[.start] = .failure(refusal(409, "RELATION_RITUAL_BUSY"))

        await opened(rig)

        XCTAssertEqual(rig.sut.stage, .ready)
        XCTAssertNotNil(rig.sut.notice)
    }

    func test_theOthersOpeningIsShown_beforeOurOwn() {
        let rig = makeRig()

        rig.sut.receive(started: RelationRitualStartedEvent(token: "tok", userId: "u1", requestId: "r1", expiresAt: "x", holdWindowMs: 15_000))

        XCTAssertTrue(rig.sut.otherIsWaiting)
    }

    // MARK: - Tenir l'écran, ensemble

    func test_holdingFirst_thenTheOtherHolding_sealsWithTheTokenAndTheChosenConsents() async {
        let rig = makeRig()
        rig.sut.setConsent(.listeningTitle, to: true)
        await opened(rig)

        await rig.sut.holdBegan()
        XCTAssertEqual(rig.sut.stage, .waiting, "seul : on attend l'autre")
        await rig.sut.receive(progress: held())

        let confirm = rig.relations.ritualCalls.last
        XCTAssertEqual(confirm?.phase, .confirm)
        XCTAssertEqual(confirm?.token, "tok")
        XCTAssertEqual(confirm?.consents?.listeningTitle, true)
        XCTAssertEqual(confirm?.consents?.locationLive, false)
        XCTAssertEqual(rig.sut.stage, .completed)
    }

    func test_theOtherHoldingFirst_thenUs_sealsAsSoonAsWeHold() async {
        let rig = makeRig()
        await opened(rig)

        await rig.sut.receive(progress: held())
        XCTAssertEqual(rig.relations.ritualCallCount(.confirm), 0, "on ne scelle pas sans tenir l'écran soi-même")
        await rig.sut.holdBegan()

        XCTAssertEqual(rig.relations.ritualCallCount(.confirm), 1)
        XCTAssertEqual(rig.sut.stage, .completed)
    }

    func test_holdBeforeOpening_isIgnored() async {
        let rig = makeRig()
        rig.sut.proceedFromConsents()

        await rig.sut.holdBegan()

        XCTAssertEqual(rig.relations.ritualCallCount(.hold), 0)
        XCTAssertFalse(rig.sut.isHolding)
    }

    func test_releasing_stopsTheHold() async {
        let rig = makeRig()
        await opened(rig)

        await rig.sut.holdBegan()
        rig.sut.holdEnded()

        XCTAssertFalse(rig.sut.isHolding)
        XCTAssertEqual(rig.relations.ritualCallCount(.hold), 1)
        XCTAssertEqual(rig.sut.stage, .waiting)
    }

    func test_whenTheOtherConfirmsLast_weAreLeftWaitingUntilTheCompletedEvent() async {
        let rig = makeRig()
        rig.relations.ritualResults[.confirm] = .success(RelationRitualStep(completed: false))
        await opened(rig)
        await rig.sut.holdBegan()
        await rig.sut.receive(progress: held())

        XCTAssertEqual(rig.sut.stage, .awaitingOther)

        rig.sut.receive(completed: RelationRitualCompletedEvent(token: "tok", userId: "u1", level: .blood, at: nil))
        XCTAssertEqual(rig.sut.stage, .completed)
    }

    // MARK: - Lâcher

    func test_theOtherLettingGo_endsCalmly_andRetryComesBackToReady() async {
        let rig = makeRig()
        await opened(rig)
        await rig.sut.holdBegan()

        await rig.sut.receive(progress: RelationRitualProgressEvent(token: "tok", userId: "u1", stage: .lapsed))

        XCTAssertEqual(rig.sut.stage, .lapsed)
        XCTAssertFalse(rig.sut.isHolding)
        XCTAssertEqual(rig.relations.ritualCallCount(.confirm), 0, "rien n'est enregistré")

        rig.sut.retry()
        XCTAssertEqual(rig.sut.stage, .ready)
    }

    func test_aLapsedAnswerToTheConfirm_endsCalmlyToo() async {
        let rig = makeRig()
        rig.relations.ritualResults[.confirm] = .failure(refusal(409, "RELATION_RITUAL_LAPSED"))
        await opened(rig)
        await rig.sut.holdBegan()
        await rig.sut.receive(progress: held())

        XCTAssertEqual(rig.sut.stage, .lapsed)
    }

    func test_aNotSynchronisedAnswer_goesBackToWaiting_andForgetsTheOthersHold() async {
        let rig = makeRig()
        rig.relations.ritualResults[.confirm] = .failure(refusal(409, "RELATION_RITUAL_NOT_SYNCHRONISED"))
        await opened(rig)
        await rig.sut.holdBegan()
        await rig.sut.receive(progress: held())

        XCTAssertEqual(rig.sut.stage, .waiting)
        XCTAssertFalse(rig.sut.otherIsHolding)
    }

    func test_aMissingConsent_sendsBackToTheConsentStep() async {
        let rig = makeRig()
        rig.relations.ritualResults[.confirm] = .failure(refusal(400, "RELATION_CONSENT_REQUIRED"))
        await opened(rig)
        await rig.sut.holdBegan()
        await rig.sut.receive(progress: held())

        XCTAssertEqual(rig.sut.stage, .consent)
    }

    // MARK: - Les événements d'une autre personne ne comptent pas

    func test_eventsOfSomeoneElse_areIgnored() async {
        let rig = makeRig()
        await opened(rig)
        await rig.sut.holdBegan()

        await rig.sut.receive(progress: held(by: "someone-else"))
        rig.sut.receive(completed: RelationRitualCompletedEvent(token: "tok", userId: "someone-else", level: .blood, at: nil))

        XCTAssertEqual(rig.sut.stage, .waiting)
        XCTAssertEqual(rig.relations.ritualCallCount(.confirm), 0)
    }

    func test_eventsOfAnotherToken_areIgnored() async {
        let rig = makeRig()
        await opened(rig)
        await rig.sut.holdBegan()

        await rig.sut.receive(progress: held(token: "stale-token"))

        XCTAssertEqual(rig.relations.ritualCallCount(.confirm), 0)
    }
}
