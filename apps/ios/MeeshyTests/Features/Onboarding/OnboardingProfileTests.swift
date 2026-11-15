import XCTest
import Contacts
import MeeshySDK
@testable import Meeshy

/// #17236 — la carte « Montre-toi » : avatar et bannière dès l'inscription.
/// Ces témoins suivent ce que l'utilisateur voit (la carte courante, l'image
/// affichée, l'état de l'envoi) et ce qui part au réseau (l'étape écrite et
/// son issue, l'utilisateur appliqué).
@MainActor
final class OnboardingProfileTests: XCTestCase {

    private static let globalId = "000000000000000000000abc"

    private func makeState(
        seen: [OnboardingStepId] = [.languages],
        prefilled: [OnboardingStepId] = [],
        emailVerified: Bool? = nil
    ) -> APIOnboardingState {
        APIOnboardingState(
            eligible: true,
            completedAt: nil,
            seenSteps: seen,
            prefilledSteps: prefilled,
            globalConversationId: Self.globalId,
            protectedRegime: false,
            storyDefaultVisibility: .public,
            suggestions: [],
            emailVerified: emailVerified
        )
    }

    private func makeUser(avatar: String? = nil, banner: String? = nil) -> MeeshyUser {
        MeeshyUser(id: "me", username: "aicha", displayName: "Aïcha", avatar: avatar, banner: banner, systemLanguage: "fr")
    }

    private func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
            UIColor.systemIndigo.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
    }

    private final class AppliedUsers {
        var users: [MeeshyUser] = []
    }

    private struct SUT {
        let model: OnboardingViewModel
        let service: MockOnboardingService
        let uploader: MockProfileImageUploader
        let applied: AppliedUsers
    }

    private func makeSUT(state: APIOnboardingState? = nil, currentUser: MeeshyUser? = nil) -> SUT {
        let service = MockOnboardingService()
        service.fetchStateResult = .success(state ?? makeState())
        let notifications = MockOnboardingNotificationPermission()
        notifications.status = .authorized
        let contacts = MockContactSyncService()
        contacts.authorizationStatusResult = .restricted
        let uploader = MockProfileImageUploader()
        let applied = AppliedUsers()
        let model = OnboardingViewModel(
            service: service,
            messages: MockMessageService(),
            friends: MockFriendService(),
            users: MockUserService(),
            progress: MockEngagementProgressService(),
            permission: notifications,
            pickTemplate: { _ in 0 },
            applyUser: { applied.users.append($0) },
            settled: MockOnboardingSettledStore(),
            pause: { _ in },
            contacts: contacts,
            directory: MockContactDirectoryService(),
            birthDates: MockBirthDateService(),
            signOut: {},
            profileImages: uploader,
            currentUser: { currentUser }
        )
        return SUT(model: model, service: service, uploader: uploader, applied: applied)
    }

    // MARK: - Place dans le parcours

    func test_pendingGestureSteps_unseenProfile_comesAfterEmailAndBeforeGlobal() {
        let steps = OnboardingFlow.pendingGestureSteps(for: makeState(seen: [], emailVerified: false))

        XCTAssertEqual(steps, [.languages, .email, .profile, .global, .story])
    }

    func test_pendingGestureSteps_profileSeenOrPrefilled_isNotProposed() {
        XCTAssertFalse(OnboardingFlow.pendingGestureSteps(for: makeState(seen: [.profile])).contains(.profile))
        XCTAssertFalse(OnboardingFlow.pendingGestureSteps(for: makeState(prefilled: [.profile])).contains(.profile))
    }

    func test_pendingGestureSteps_accountAlreadyHasBothImages_isNotProposed() {
        let steps = OnboardingFlow.pendingGestureSteps(for: makeState(), profileComplete: true)

        XCTAssertFalse(steps.contains(.profile))
    }

    func test_start_afterLanguages_presentsTheProfileCard() async {
        let sut = makeSUT()

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.profile))
        XCTAssertEqual(sut.model.plannedSteps.first, .profile)
    }

    func test_start_userWithAvatarAndBanner_skipsTheProfileCard() async {
        let sut = makeSUT()

        await sut.model.start(user: makeUser(avatar: "https://a/1.jpg", banner: "https://a/2.jpg"))

        XCTAssertEqual(sut.model.card, .step(.global))
    }

    // MARK: - Issue de la carte

    func test_continueFromProfile_withoutImage_recordsSkippedAndAdvances() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.continueFromProfile()

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.service.recorded.last, .init(step: .profile, outcome: .skipped))
    }

    func test_continueFromProfile_afterAnUploadedAvatar_recordsDone() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())
        await sut.model.profile.choose(makeImage(), for: .avatar)

        await sut.model.continueFromProfile()

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.service.recorded.last, .init(step: .profile, outcome: .done))
    }

    func test_continueFromProfile_oldGatewayRefusesTheStep_stillAdvances() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())
        sut.service.recordResult = .failure(URLError(.badServerResponse))

        await sut.model.continueFromProfile()

        XCTAssertEqual(sut.model.card, .step(.global))
    }

    func test_later_onProfileCard_recordsSkipped() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.later()

        XCTAssertEqual(sut.service.recorded.last, .init(step: .profile, outcome: .skipped))
    }

    // MARK: - Envoi optimiste

    func test_choose_showsTheImageWhileUploading() async {
        let sut = makeSUT()
        let image = makeImage()
        var shownDuringUpload: UIImage?
        var phaseDuringUpload: OnboardingProfileUploadPhase?
        sut.uploader.duringUpload = {
            shownDuringUpload = sut.model.profile.banner.shown
            phaseDuringUpload = sut.model.profile.banner.phase
        }

        await sut.model.profile.choose(image, for: .banner)

        XCTAssertTrue(shownDuringUpload === image)
        XCTAssertEqual(phaseDuringUpload, .uploading)
        XCTAssertEqual(sut.uploader.uploadedSlots, [.banner])
    }

    func test_choose_success_appliesTheServedUserMergedOntoTheCurrentOne() async {
        let sut = makeSUT(currentUser: makeUser())
        sut.uploader.uploadResult = .success(makeUser(avatar: "https://cdn/avatar.jpg"))

        await sut.model.profile.choose(makeImage(), for: .avatar)

        XCTAssertEqual(sut.applied.users.last?.avatar, "https://cdn/avatar.jpg")
        XCTAssertEqual(sut.model.profile.avatar.phase, .uploaded)
        XCTAssertTrue(sut.model.profile.hasChosenImage)
    }

    func test_choose_failure_rollsBackToThePreviousImageAndOffersRetry() async {
        let sut = makeSUT()
        let first = makeImage()
        await sut.model.profile.choose(first, for: .avatar)
        sut.uploader.uploadResult = .failure(URLError(.notConnectedToInternet))

        await sut.model.profile.choose(makeImage(), for: .avatar)

        XCTAssertTrue(sut.model.profile.avatar.shown === first)
        XCTAssertEqual(sut.model.profile.avatar.phase, .failed)
        XCTAssertEqual(sut.model.profile.failedSlots, [.avatar])
    }

    func test_choose_firstUploadFails_leavesNothingChosen() async {
        let sut = makeSUT()
        sut.uploader.uploadResult = .failure(URLError(.timedOut))

        await sut.model.profile.choose(makeImage(), for: .banner)

        XCTAssertNil(sut.model.profile.banner.shown)
        XCTAssertFalse(sut.model.profile.hasChosenImage)
        XCTAssertTrue(sut.applied.users.isEmpty)
    }

    func test_retry_afterFailure_resendsTheSameImageAndSucceeds() async {
        let sut = makeSUT()
        let image = makeImage()
        sut.uploader.uploadResult = .failure(URLError(.timedOut))
        await sut.model.profile.choose(image, for: .banner)
        sut.uploader.uploadResult = .success(makeUser(banner: "https://cdn/banner.jpg"))

        await sut.model.profile.retryFailed()

        XCTAssertTrue(sut.model.profile.banner.shown === image)
        XCTAssertEqual(sut.model.profile.banner.phase, .uploaded)
        XCTAssertEqual(sut.uploader.uploadCallCount, 2)
    }
}
