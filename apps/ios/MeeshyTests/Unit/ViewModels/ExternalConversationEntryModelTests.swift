import XCTest
@testable import Meeshy
import MeeshySDK

/// #17118 — l'entrée « Écrire à un ami WhatsApp » de la nouvelle conversation.
/// Un numéro mal formé ne part jamais ; chaque réponse de la passerelle devient
/// un état que l'écran DIT ; une ouverture réussie mène au fil.
@MainActor
final class ExternalConversationEntryModelTests: XCTestCase {

    private final class MockExternalConversationService: ExternalConversationServiceProviding, @unchecked Sendable {
        var outcome: ExternalOpeningOutcome = .open(conversationId: "c1", created: true)
        private(set) var openCallCount = 0
        private(set) var lastHandle: String?
        private(set) var lastNetwork: ExternalNetwork?

        func open(network: ExternalNetwork, handle: String) async -> ExternalOpeningOutcome {
            openCallCount += 1
            lastNetwork = network
            lastHandle = handle
            return outcome
        }
    }

    private func makeSUT(outcome: ExternalOpeningOutcome = .open(conversationId: "c1", created: true))
        -> (model: ExternalConversationEntryModel, service: MockExternalConversationService) {
        let service = MockExternalConversationService()
        service.outcome = outcome
        return (ExternalConversationEntryModel(service: service), service)
    }

    func test_submit_malformedNumber_sendsNothingAndSaysWhy() async {
        let (model, service) = makeSUT()
        model.handle = "06 12 34 56 78"

        await model.submit()

        XCTAssertEqual(service.openCallCount, 0)
        XCTAssertEqual(model.phase, .malformed)
        XCTAssertNotNil(ExternalConversationEntryCopy.message(for: model.phase))
    }

    func test_submit_internationalNumber_sendsItInE164ToWhatsApp() async {
        let (model, service) = makeSUT()
        model.handle = "+33 6 12 34 56 78"

        await model.submit()

        XCTAssertEqual(service.openCallCount, 1)
        XCTAssertEqual(service.lastNetwork, .whatsapp)
        XCTAssertEqual(service.lastHandle, "+33612345678")
    }

    func test_submit_opened_handsTheConversationToTheNavigator() async {
        let (model, _) = makeSUT(outcome: .open(conversationId: "c42", created: false))
        model.handle = "+33612345678"

        await model.submit()

        XCTAssertEqual(model.openedConversationId, "c42")
        XCTAssertEqual(model.phase, .idle)
        model.consumeOpened()
        XCTAssertNil(model.openedConversationId)
    }

    func test_submit_phoneUnverified_offersTheVerification() async {
        let (model, _) = makeSUT(outcome: .phoneUnverified)
        model.handle = "+33612345678"

        await model.submit()

        XCTAssertEqual(model.phase, .phoneUnverified)
        XCTAssertTrue(model.offersPhoneVerification)
        XCTAssertNil(model.openedConversationId)
    }

    func test_everyRefusal_isSaidInWords() {
        for refusal in ExternalOpeningRefusal.allCases {
            let message = ExternalConversationEntryCopy.message(for: .refused(refusal))
            XCTAssertFalse(message?.isEmpty ?? true, "refus muet : \(refusal)")
        }
        XCTAssertNil(ExternalConversationEntryCopy.message(for: .idle))
        XCTAssertNil(ExternalConversationEntryCopy.message(for: .opening))
    }

    func test_submit_refused_keepsTheNumberToRetry() async {
        let (model, _) = makeSUT(outcome: .refused(.offline))
        model.handle = "+33612345678"

        await model.submit()

        XCTAssertEqual(model.phase, .refused(.offline))
        XCTAssertEqual(model.handle, "+33612345678")
    }

    // MARK: - Le consentement à ce qui part chez Meta (#17120)

    func test_submit_consentRequired_asksForConsentWithoutOpening() async {
        let (model, _) = makeSUT(outcome: .consentRequired)
        model.handle = "+33612345678"

        await model.submit()

        XCTAssertEqual(model.phase, .consentRequired)
        XCTAssertTrue(model.asksForConsent)
        XCTAssertNil(model.openedConversationId)
    }

    func test_consentGranted_reopensTheSameNumber() async {
        let (model, service) = makeSUT(outcome: .consentRequired)
        model.handle = "+33612345678"
        await model.submit()
        service.outcome = .open(conversationId: "c7", created: true)

        await model.consentGranted()

        XCTAssertEqual(service.openCallCount, 2)
        XCTAssertEqual(service.lastHandle, "+33612345678")
        XCTAssertEqual(model.openedConversationId, "c7")
    }

    func test_consentDeclined_opensNothing() async {
        let (model, service) = makeSUT(outcome: .consentRequired)
        model.handle = "+33612345678"
        await model.submit()

        model.consentDeclined()

        XCTAssertEqual(model.phase, .idle)
        XCTAssertFalse(model.asksForConsent)
        XCTAssertEqual(service.openCallCount, 1)
    }

    func test_collapse_forgetsTheNumberAndTheState() async {
        let (model, _) = makeSUT(outcome: .refused(.failed))
        model.toggle()
        model.handle = "+33612345678"
        await model.submit()

        model.toggle()

        XCTAssertFalse(model.isExpanded)
        XCTAssertEqual(model.handle, "")
        XCTAssertEqual(model.phase, .idle)
    }
}
