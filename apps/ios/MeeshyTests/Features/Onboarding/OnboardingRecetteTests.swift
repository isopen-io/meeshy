import XCTest
import MeeshySDK
@testable import Meeshy

/// Les défauts de la recette staging du 2026-09-25 (#7729), côté parcours :
/// la carte « valide ton adresse » (#7907), la story qu'un compte non vérifié
/// ne peut plus publier (#7907), et le « +N » qui dit ce que le serveur a
/// VRAIMENT crédité, élan compris (#7908).
@MainActor
final class OnboardingRecetteTests: XCTestCase {

    private static let globalId = "000000000000000000000abc"

    private func makeState(
        seen: [OnboardingStepId] = [],
        prefilled: [OnboardingStepId] = [],
        emailVerified: Bool? = nil,
        canPublishStory: Bool? = nil,
        stepRewards: APIOnboardingStepRewards? = nil
    ) -> APIOnboardingState {
        APIOnboardingState(
            eligible: true,
            completedAt: nil,
            seenSteps: seen,
            prefilledSteps: prefilled,
            globalConversationId: Self.globalId,
            protectedRegime: false,
            storyDefaultVisibility: .public,
            suggestions: [APIOnboardingSuggestion(id: "u1", username: "lina", displayName: "Lina", avatarUrl: nil, languages: ["fr"])],
            emailVerified: emailVerified,
            canPublishStory: canPublishStory,
            stepRewards: stepRewards
        )
    }

    private func makeUser() -> MeeshyUser {
        MeeshyUser(id: "me", username: "aicha", email: "aicha@example.com", displayName: "Aïcha", systemLanguage: "fr")
    }

    private static func progress(score: Int, elan: Double) -> APIEngagementProgress {
        APIEngagementProgress(
            counters: [],
            milestones: [],
            streak: .init(currentStreakDays: 0, longestStreakDays: 0),
            level: .init(engagementScore: score),
            elan: .init(factor: elan, activeFamilyCount: Int(elan), hasStanding: false, windowDays: 7)
        )
    }

    private struct SUT {
        let model: OnboardingViewModel
        let service: MockOnboardingService
        let messages: MockMessageService
        let progress: MockEngagementProgressService
        let auth: MockAuthServiceSDK
    }

    private func makeSUT(state: APIOnboardingState) -> SUT {
        let service = MockOnboardingService()
        service.fetchStateResult = .success(state)
        let messages = MockMessageService()
        let progress = MockEngagementProgressService()
        let auth = MockAuthServiceSDK()
        let model = OnboardingViewModel(
            service: service,
            messages: messages,
            friends: MockFriendService(),
            users: MockUserService(),
            progress: progress,
            permission: MockOnboardingNotificationPermission(),
            pickTemplate: { _ in 0 },
            applyUser: { _ in },
            settled: MockOnboardingSettledStore(),
            auth: auth,
            pause: { _ in },
            contacts: MockContactSyncService.restricted(),
            directory: MockContactDirectoryService()
        )
        return SUT(model: model, service: service, messages: messages, progress: progress, auth: auth)
    }

    private func publishFromComposer(_ sut: SUT, id: String) {
        sut.model.storyComposerOpened(uploadIds: [])
        sut.model.storyComposerClosed(uploads: [OnboardingStoryUpload(id: id, failed: false)])
    }

    // MARK: - #7907 — la carte « valide ton adresse »

    func test_start_unverifiedEmail_offersTheEmailCardRightAfterLanguages() async {
        let sut = makeSUT(state: makeState(emailVerified: false))

        await sut.model.start(user: makeUser())
        await sut.model.confirmLanguages()

        XCTAssertEqual(sut.model.card, .step(.email))
        XCTAssertEqual(sut.model.plannedSteps.prefix(3), [.languages, .email, .global])
    }

    func test_start_verifiedEmail_neverOffersTheEmailCard() async {
        let sut = makeSUT(state: makeState(seen: [.languages], emailVerified: true))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertFalse(sut.model.plannedSteps.contains(.email))
    }

    func test_start_gatewayWithoutVerificationState_neverInventsTheEmailCard() async {
        let sut = makeSUT(state: makeState(seen: [.languages], emailVerified: nil))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.global))
    }

    func test_start_emailStepPrefilledByTheServer_isNotShownAgain() async {
        let sut = makeSUT(state: makeState(seen: [.languages], prefilled: [.email], emailVerified: false))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.global))
    }

    func test_resendVerificationLink_sendsTheLinkToTheAccountAddress() async {
        let sut = makeSUT(state: makeState(seen: [.languages], emailVerified: false))
        await sut.model.start(user: makeUser())

        await sut.model.resendVerificationLink()

        XCTAssertEqual(sut.auth.resendVerificationEmailCallCount, 1)
        XCTAssertEqual(sut.auth.lastResendEmail, "aicha@example.com")
        XCTAssertEqual(sut.model.verificationLinkState, .sent)
    }

    func test_resendVerificationLink_failure_showsFailedAndStaysOnTheCard() async {
        let sut = makeSUT(state: makeState(seen: [.languages], emailVerified: false))
        sut.auth.resendVerificationEmailResult = .failure(URLError(.notConnectedToInternet))
        await sut.model.start(user: makeUser())

        await sut.model.resendVerificationLink()

        XCTAssertEqual(sut.model.verificationLinkState, .failed)
        XCTAssertEqual(sut.model.card, .step(.email))
    }

    func test_refreshVerification_onceVerified_leavesTheEmailCardAndRecordsDone() async {
        let sut = makeSUT(state: makeState(seen: [.languages], emailVerified: false))
        await sut.model.start(user: makeUser())
        sut.service.fetchStateResult = .success(makeState(seen: [.languages], prefilled: [.email], emailVerified: true))

        await sut.model.refreshVerification()

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.service.recorded.last, .init(step: .email, outcome: .done))
    }

    func test_refreshVerification_stillUnverified_staysOnTheEmailCard() async {
        let sut = makeSUT(state: makeState(seen: [.languages], emailVerified: false))
        await sut.model.start(user: makeUser())

        await sut.model.refreshVerification()

        XCTAssertEqual(sut.model.card, .step(.email))
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    func test_later_onTheEmailCard_recordsSkippedAndMovesOn() async {
        let sut = makeSUT(state: makeState(seen: [.languages], emailVerified: false))
        await sut.model.start(user: makeUser())

        await sut.model.later()

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.service.recorded.last, .init(step: .email, outcome: .skipped))
    }

    // MARK: - #7907 — la carte Story d'un compte qui ne peut plus publier

    func test_start_cannotPublishStory_storyCardAsksToVerifyTheEmail() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .email, .global], emailVerified: false, canPublishStory: false))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.story))
        XCTAssertTrue(sut.model.storyNeedsEmailVerification)
    }

    func test_start_firstStoryAllowedWhileUnverified_storyCardPublishesNormally() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .email, .global], emailVerified: false, canPublishStory: true))

        await sut.model.start(user: makeUser())

        XCTAssertFalse(sut.model.storyNeedsEmailVerification)
    }

    func test_refreshVerification_storyBecomesPublishable_storyCardResumes() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .email, .global], emailVerified: false, canPublishStory: false))
        await sut.model.start(user: makeUser())
        sut.service.fetchStateResult = .success(makeState(seen: [.languages, .email, .global], emailVerified: true, canPublishStory: true))

        await sut.model.refreshVerification()

        XCTAssertEqual(sut.model.card, .step(.story))
        XCTAssertFalse(sut.model.storyNeedsEmailVerification)
    }

    func test_storyUploadRejected_emailNotVerified_asksToVerifyInsteadOfRetrying() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, id: "s1")

        sut.model.storyUploadRejected(StoryUploadRejection(id: "s1", code: "EMAIL_NOT_VERIFIED"))

        XCTAssertEqual(sut.model.storyState, .idle)
        XCTAssertTrue(sut.model.storyNeedsEmailVerification)
        XCTAssertNil(sut.model.lastReward)
        XCTAssertNil(sut.model.trackedStoryUploadId)
    }

    func test_storyUploadRejected_otherRefusal_showsTheDefinitiveFailureWithoutCredit() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, id: "s1")

        sut.model.storyUploadRejected(StoryUploadRejection(id: "s1", code: "VALIDATION_ERROR"))
        sut.model.storyUploadsChanged([])

        XCTAssertEqual(sut.model.storyState, .rejected)
        XCTAssertFalse(sut.model.storyNeedsEmailVerification)
        XCTAssertNil(sut.model.lastReward)
        XCTAssertTrue(sut.service.recorded.allSatisfy { $0.step != .story })
    }

    func test_storyUploadRejected_forAnotherUpload_isIgnored() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, id: "s1")

        sut.model.storyUploadRejected(StoryUploadRejection(id: "other", code: nil))

        XCTAssertEqual(sut.model.storyState, .publishing)
    }

    // MARK: - #7908 — le « +N » est le crédit RÉEL, élan compris

    func test_sendGreeting_withElanThree_showsWhatTheServerCredited() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        sut.progress.fetchProgressSequence = [
            .success(Self.progress(score: 100, elan: 3)),
            .success(Self.progress(score: 142, elan: 3)),
        ]
        await sut.model.start(user: makeUser())

        await sut.model.sendGreeting()

        XCTAssertEqual(sut.model.lastReward?.points, 42)
        XCTAssertEqual(sut.model.greetingReward, 42)
        XCTAssertEqual(sut.model.sessionPoints, 42)
    }

    func test_storyUploadSucceeded_withElanTwo_showsWhatTheServerCredited() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        sut.progress.fetchProgressSequence = [
            .success(Self.progress(score: 40, elan: 2)),
            .success(Self.progress(score: 60, elan: 2)),
        ]
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, id: "s1")

        await sut.model.storyUploadSucceeded(id: "s1")?.value

        XCTAssertEqual(sut.model.lastReward?.points, 20)
        XCTAssertEqual(sut.model.storyReward, 20)
    }

    func test_sendGreeting_creditNotYetVisible_retriesTheReadBeforeAnnouncing() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        sut.progress.fetchProgressSequence = [
            .success(Self.progress(score: 100, elan: 3)),
            .success(Self.progress(score: 100, elan: 3)),
            .success(Self.progress(score: 142, elan: 3)),
        ]
        await sut.model.start(user: makeUser())

        await sut.model.sendGreeting()

        XCTAssertEqual(sut.model.lastReward?.points, 42)
    }

    func test_sendGreeting_progressNeverReadable_announcesWeightTimesServedElan() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        sut.progress.fetchProgressSequence = [.success(Self.progress(score: 100, elan: 3))]
        sut.progress.fetchProgressResult = .failure(URLError(.notConnectedToInternet))
        await sut.model.start(user: makeUser())

        await sut.model.sendGreeting()

        XCTAssertEqual(sut.model.lastReward?.points, OnboardingRewards.greeting * 3)
    }

    func test_sendGreeting_creditNeverVisible_announcesTheServedStepReward() async {
        let sut = makeSUT(state: makeState(seen: [.languages], stepRewards: .init(global: 56, story: 40, friendship: 28)))
        sut.progress.fetchProgressSequence = [.success(Self.progress(score: 100, elan: 3))]
        sut.progress.fetchProgressResult = .failure(URLError(.notConnectedToInternet))
        await sut.model.start(user: makeUser())

        await sut.model.sendGreeting()

        XCTAssertEqual(sut.model.lastReward?.points, 56, "la passerelle sait quelle famille le geste ouvre : son chiffre prime")
    }
}
