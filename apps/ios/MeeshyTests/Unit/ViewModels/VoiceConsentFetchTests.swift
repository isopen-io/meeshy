import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

@MainActor
final class VoiceConsentFetchTests: XCTestCase {
    func test_voiceConsentMissing_falseWhenFetchThrows() async {
        // resolveVoiceConsentMissing is a pure async helper: maps a throwing
        // fetch to a Bool, defaulting to false (no false nudge) on error.
        let missing = await ConversationViewModel.resolveVoiceConsentMissing {
            throw NSError(domain: "x", code: 1)
        }
        XCTAssertFalse(missing)
    }

    func test_voiceConsentMissing_trueWhenNoConsent() async {
        let missing = await ConversationViewModel.resolveVoiceConsentMissing { false /* hasConsent */ }
        XCTAssertTrue(missing)
    }

    func test_voiceConsentMissing_falseWhenConsentGranted() async {
        let missing = await ConversationViewModel.resolveVoiceConsentMissing { true }
        XCTAssertFalse(missing)
    }

    // MARK: - Accorder la traduction vocale (#6624)
    //
    // Le geste est OPTIMISTE : le popup se referme et l'envoi repart aussitôt.
    // La passerelle peut pourtant refuser l'octroi (hors ligne, 409 de
    // politique, 5xx) — l'écran ne doit alors pas continuer de croire le
    // consentement enregistré.

    func test_grantVoiceAutoTranslationConsent_clearsTheMissingFlagBeforeTheNetworkAnswers() throws {
        let sut = try makeSUT()
        sut.voiceConsentMissing = true

        sut.grantVoiceAutoTranslationConsent(grant: {}, toast: MockFeedbackToast())

        XCTAssertFalse(sut.voiceConsentMissing)
    }

    func test_grantVoiceAutoTranslationConsent_whenConsentRouteFails_restoresTheMissingFlag() async throws {
        let sut = try makeSUT()
        sut.voiceConsentMissing = true

        await sut.grantVoiceAutoTranslationConsent(
            grant: { throw MeeshyError.server(statusCode: 409, message: "CONSENT_POLICY_VERSION_MISMATCH") },
            toast: MockFeedbackToast()
        ).value

        XCTAssertTrue(sut.voiceConsentMissing)
    }

    func test_grantVoiceAutoTranslationConsent_whenConsentRouteFails_showsAnError() async throws {
        let sut = try makeSUT()
        sut.voiceConsentMissing = true
        let toast = MockFeedbackToast()

        await sut.grantVoiceAutoTranslationConsent(
            grant: { throw MeeshyError.server(statusCode: 0, message: "offline") },
            toast: toast
        ).value

        XCTAssertEqual(toast.errorMessages.count, 1)
    }

    func test_grantVoiceAutoTranslationConsent_whenConsentRouteSucceeds_keepsTheGrantSilently() async throws {
        let sut = try makeSUT()
        sut.voiceConsentMissing = true
        let toast = MockFeedbackToast()

        await sut.grantVoiceAutoTranslationConsent(grant: {}, toast: toast).value

        XCTAssertFalse(sut.voiceConsentMissing)
        XCTAssertTrue(toast.errorMessages.isEmpty)
    }

    private func makeSUT() throws -> ConversationViewModel {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(
            user: MeeshyUser(id: "000000000000000000000099", username: "me", displayName: "Me")
        )
        return ConversationViewModel(
            conversationId: "000000000000000000000001",
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
    }
}
