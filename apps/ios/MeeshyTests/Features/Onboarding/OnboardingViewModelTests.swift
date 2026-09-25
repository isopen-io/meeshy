import XCTest
import MeeshySDK
@testable import Meeshy

/// L'onboarding post-inscription (#7729) : cinq cartes passables, chacune
/// finie par un geste RÉEL. Ces témoins suivent le parcours par ce que
/// l'utilisateur voit (la carte courante, les points affichés) et par ce qui
/// part au réseau (le message, la demande d'ami, l'étape écrite) — jamais par
/// l'état interne du modèle.
@MainActor
final class OnboardingViewModelTests: XCTestCase {

    private static let globalId = "000000000000000000000abc"

    private func makeState(
        eligible: Bool = true,
        seen: [OnboardingStepId] = [],
        prefilled: [OnboardingStepId] = [],
        globalId: String? = OnboardingViewModelTests.globalId,
        protectedRegime: Bool = false,
        suggestions: [APIOnboardingSuggestion]? = nil
    ) -> APIOnboardingState {
        APIOnboardingState(
            eligible: eligible,
            completedAt: nil,
            seenSteps: seen,
            prefilledSteps: prefilled,
            globalConversationId: globalId,
            protectedRegime: protectedRegime,
            storyDefaultVisibility: protectedRegime ? .friends : .public,
            suggestions: suggestions ?? [
                APIOnboardingSuggestion(id: "u1", username: "lina", displayName: "Lina", avatarUrl: nil, languages: ["fr", "es"]),
                APIOnboardingSuggestion(id: "u2", username: "tom", displayName: "Tom", avatarUrl: nil, languages: ["en"]),
            ]
        )
    }

    private func makeUser(systemLanguage: String? = "fr") -> MeeshyUser {
        MeeshyUser(id: "me", username: "aicha", displayName: "Aïcha", systemLanguage: systemLanguage)
    }

    private struct SUT {
        let model: OnboardingViewModel
        let service: MockOnboardingService
        let messages: MockMessageService
        let friends: MockFriendService
        let users: MockUserService
        let progress: MockEngagementProgressService
        let permission: MockOnboardingNotificationPermission
        let appliedUsers: AppliedUsers
        let settled: MockOnboardingSettledStore
    }

    final class AppliedUsers {
        var users: [MeeshyUser] = []
    }

    private func makeSUT(
        state: APIOnboardingState? = nil,
        permission: OnboardingNotificationStatus = .notDetermined,
        settled: MockOnboardingSettledStore = MockOnboardingSettledStore()
    ) -> SUT {
        let service = MockOnboardingService()
        service.fetchStateResult = .success(state ?? makeState())
        let messages = MockMessageService()
        let friends = MockFriendService()
        friends.sendRequestResult = .success(FriendRequest(id: "fr1", senderId: "me", receiverId: "u1", status: "pending", createdAt: Date()))
        let users = MockUserService()
        let progress = MockEngagementProgressService()
        let notif = MockOnboardingNotificationPermission()
        notif.status = permission
        let applied = AppliedUsers()
        let model = OnboardingViewModel(
            service: service,
            messages: messages,
            friends: friends,
            users: users,
            progress: progress,
            permission: notif,
            pickTemplate: { _ in 0 },
            applyUser: { applied.users.append($0) },
            settled: settled,
            pause: { _ in }
        )
        return SUT(model: model, service: service, messages: messages, friends: friends,
                   users: users, progress: progress, permission: notif, appliedUsers: applied,
                   settled: settled)
    }

    // MARK: - Présentation

    func test_start_eligible_presentsTheLanguagesCardFirst() async {
        let sut = makeSUT()

        await sut.model.start(user: makeUser())

        XCTAssertTrue(sut.model.isPresented)
        XCTAssertEqual(sut.model.card, .step(.languages))
        XCTAssertEqual(sut.model.stepPosition, 1)
    }

    func test_start_notEligible_staysHidden() async {
        let sut = makeSUT(state: makeState(eligible: false))

        await sut.model.start(user: makeUser())

        XCTAssertFalse(sut.model.isPresented)
        XCTAssertNil(sut.model.card)
    }

    func test_start_networkFailure_staysHidden() async {
        let sut = makeSUT()
        sut.service.fetchStateResult = .failure(URLError(.notConnectedToInternet))

        await sut.model.start(user: makeUser())

        XCTAssertFalse(sut.model.isPresented)
    }

    func test_start_resumesAtFirstStepNeitherSeenNorPrefilled() async {
        let sut = makeSUT(state: makeState(seen: [.languages], prefilled: [.global]))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.story))
    }

    func test_start_withoutGlobalConversation_skipsTheGreetingCard() async {
        let sut = makeSUT(state: makeState(seen: [.languages], globalId: nil))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.story))
    }

    func test_start_withoutSuggestions_neverShowsTheFriendsCard() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global, .story], suggestions: []))

        await sut.model.start(user: makeUser())

        XCTAssertNotEqual(sut.model.card, .step(.friends))
    }

    // MARK: - Un parcours réglé ne se redemande plus

    func test_start_notEligible_isRememberedAndNeverFetchedAgain() async {
        let store = MockOnboardingSettledStore()
        let first = makeSUT(state: makeState(eligible: false), settled: store)
        await first.model.start(user: makeUser())

        let second = makeSUT(settled: store)
        await second.model.start(user: makeUser())

        XCTAssertEqual(second.service.fetchStateCallCount, 0)
        XCTAssertFalse(second.model.isPresented)
    }

    func test_skipAll_isRememberedAndNeverFetchedAgain() async {
        let store = MockOnboardingSettledStore()
        let first = makeSUT(settled: store)
        await first.model.start(user: makeUser())
        await first.model.skipAll()

        let second = makeSUT(settled: store)
        await second.model.start(user: makeUser())

        XCTAssertEqual(second.service.fetchStateCallCount, 0)
    }

    func test_networkFailure_isNotRememberedAsSettled() async {
        let store = MockOnboardingSettledStore()
        let first = makeSUT(settled: store)
        first.service.fetchStateResult = .failure(URLError(.notConnectedToInternet))
        await first.model.start(user: makeUser())

        let second = makeSUT(settled: store)
        await second.model.start(user: makeUser())

        XCTAssertEqual(second.service.fetchStateCallCount, 1)
        XCTAssertTrue(second.model.isPresented)
    }

    func test_settled_isPerUser_anotherAccountStillFetches() async {
        let store = MockOnboardingSettledStore()
        let first = makeSUT(state: makeState(eligible: false), settled: store)
        await first.model.start(user: makeUser())

        let other = makeSUT(settled: store)
        await other.model.start(user: MeeshyUser(id: "someone-else", username: "tom", displayName: "Tom", systemLanguage: "en"))

        XCTAssertEqual(other.service.fetchStateCallCount, 1)
        XCTAssertTrue(other.model.isPresented)
    }

    // MARK: - Un deep link ou un push en cours passe d'abord

    func test_start_whileRoutingElsewhere_defersThePresentation() async {
        let sut = makeSUT()
        sut.model.routingChanged(isElsewhere: true)

        await sut.model.start(user: makeUser())

        XCTAssertFalse(sut.model.isPresented)
    }

    func test_routingBackHome_presentsTheDeferredCard() async {
        let sut = makeSUT()
        sut.model.routingChanged(isElsewhere: true)
        await sut.model.start(user: makeUser())

        sut.model.routingChanged(isElsewhere: false)

        XCTAssertTrue(sut.model.isPresented)
        XCTAssertEqual(sut.model.card, .step(.languages))
    }

    func test_routingElsewhere_onceShown_neverHidesTheOnboarding() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        sut.model.routingChanged(isElsewhere: true)

        XCTAssertTrue(sut.model.isPresented)
    }

    // MARK: - Carte 1 — langues

    func test_start_prefillsPrimaryLanguageFromTheProfile() async {
        let sut = makeSUT()

        await sut.model.start(user: makeUser(systemLanguage: "es"))

        XCTAssertEqual(sut.model.primaryLanguage, "es")
    }

    func test_confirmLanguages_unchanged_writesNoProfileButRecordsDone() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser(systemLanguage: "fr"))

        await sut.model.confirmLanguages()

        XCTAssertEqual(sut.users.updateProfileCallCount, 0)
        XCTAssertEqual(sut.service.recorded.first?.step, .languages)
        XCTAssertEqual(sut.service.recorded.first?.outcome, .done)
        XCTAssertEqual(sut.model.card, .step(.global))
    }

    func test_confirmLanguages_secondLanguage_patchesProfileAndAppliesUser() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser(systemLanguage: "fr"))
        sut.model.toggleSecondaryLanguage("es")

        await sut.model.confirmLanguages()

        XCTAssertEqual(sut.users.lastUpdateProfileRequest?.systemLanguage, "fr")
        XCTAssertEqual(sut.users.lastUpdateProfileRequest?.regionalLanguage, "es")
        XCTAssertEqual(sut.appliedUsers.users.count, 1)
    }

    func test_confirmLanguages_awardsNoPoints() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.confirmLanguages()

        XCTAssertEqual(sut.model.sessionPoints, 0)
        XCTAssertNil(sut.model.lastReward)
    }

    // MARK: - Carte 2 — salut dans Meeshy Global

    func test_start_prefillsAPersonalGreeting() async {
        let sut = makeSUT()

        await sut.model.start(user: makeUser())

        XCTAssertFalse(sut.model.greetingDraft.isEmpty)
        XCTAssertTrue(sut.model.greetingDraft.contains("Aïcha"))
    }

    func test_sendGreeting_sendsTheEditedTextToGlobalAndCreditsFourteen() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        await sut.model.start(user: makeUser())
        sut.model.greetingDraft = "Salut, moi c'est Aïcha de Dakar !"

        await sut.model.sendGreeting()

        XCTAssertEqual(sut.messages.sendCallCount, 1)
        XCTAssertEqual(sut.messages.lastSendConversationId, Self.globalId)
        XCTAssertEqual(sut.messages.lastSendRequest?.content, "Salut, moi c'est Aïcha de Dakar !")
        XCTAssertEqual(sut.model.greetingState, .sent)
        XCTAssertEqual(sut.model.sessionPoints, 14)
        XCTAssertEqual(sut.model.lastReward?.points, 14)
        XCTAssertEqual(sut.service.recorded.last?.step, .global)
        XCTAssertEqual(sut.service.recorded.last?.outcome, .done)
    }

    func test_sendGreeting_failure_showsFailedAndNeverCredits() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        sut.messages.sendResult = .failure(URLError(.timedOut))
        await sut.model.start(user: makeUser())

        await sut.model.sendGreeting()

        XCTAssertEqual(sut.model.greetingState, .failed)
        XCTAssertEqual(sut.model.sessionPoints, 0)
        XCTAssertNil(sut.model.lastReward)
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    func test_sendGreeting_blankText_sendsNothing() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        await sut.model.start(user: makeUser())
        sut.model.greetingDraft = "   \n "

        await sut.model.sendGreeting()

        XCTAssertEqual(sut.messages.sendCallCount, 0)
    }

    func test_sendGreeting_twice_sendsOnce() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        await sut.model.start(user: makeUser())

        await sut.model.sendGreeting()
        await sut.model.sendGreeting()

        XCTAssertEqual(sut.messages.sendCallCount, 1)
    }

    // MARK: - Carte 3 — première story

    func test_storyDefaultVisibility_followsTheProtectedRegime() async {
        let sut = makeSUT(state: makeState(protectedRegime: true))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.storyDefaultVisibility, .friends)
    }

    private func upload(_ id: String, failed: Bool = false) -> OnboardingStoryUpload {
        OnboardingStoryUpload(id: id, failed: failed)
    }

    /// Ouvre le composeur au-dessus d'une file qui porte déjà `existing`, puis
    /// le referme sur `uploads` — ce que l'hôte relaie depuis `StoryViewModel`.
    private func publishFromComposer(_ sut: SUT, existing: [String] = ["old"], uploads: [OnboardingStoryUpload]) {
        sut.model.storyComposerOpened(uploadIds: existing)
        sut.model.storyComposerClosed(uploads: uploads)
    }

    func test_storyComposerClosed_uploadStarted_showsSendingWithoutCreditOrRecord() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())

        publishFromComposer(sut, uploads: [upload("old"), upload("s1")])

        XCTAssertEqual(sut.model.storyState, .publishing)
        XCTAssertEqual(sut.model.sessionPoints, 0)
        XCTAssertNil(sut.model.lastReward)
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    func test_storyUpload_startedThenFailed_creditsNothingAndRecordsNothing() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, uploads: [upload("old"), upload("s1")])

        sut.model.storyUploadsChanged([upload("old"), upload("s1", failed: true)])

        XCTAssertEqual(sut.model.storyState, .failed)
        XCTAssertEqual(sut.model.trackedStoryUploadId, "s1")
        XCTAssertEqual(sut.model.card, .step(.story))
        XCTAssertEqual(sut.model.sessionPoints, 0)
        XCTAssertNil(sut.model.lastReward)
        XCTAssertFalse(sut.service.recorded.contains { $0.step == .story && $0.outcome == .done })
    }

    func test_storyUpload_succeeded_creditsTenAndRecordsDone() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, uploads: [upload("old"), upload("s1")])

        await sut.model.storyUploadSucceeded(id: "s1")?.value

        XCTAssertEqual(sut.model.storyState, .published)
        XCTAssertTrue(sut.model.storyPublished)
        XCTAssertEqual(sut.model.sessionPoints, 10)
        XCTAssertEqual(sut.model.lastReward?.points, 10)
        XCTAssertEqual(sut.service.recorded.last?.step, .story)
        XCTAssertEqual(sut.service.recorded.last?.outcome, .done)
    }

    func test_storyUpload_failedThenRetriedThenSucceeded_creditsOnce() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, uploads: [upload("old"), upload("s1")])
        sut.model.storyUploadsChanged([upload("old"), upload("s1", failed: true)])

        sut.model.storyUploadsChanged([upload("old"), upload("s1")])
        XCTAssertEqual(sut.model.storyState, .publishing)
        await sut.model.storyUploadSucceeded(id: "s1")?.value
        await sut.model.storyUploadSucceeded(id: "s1")?.value

        XCTAssertEqual(sut.model.sessionPoints, 10)
        XCTAssertEqual(sut.service.recorded.filter { $0.step == .story }.count, 1)
    }

    func test_storyUpload_removedWithoutSuccess_returnsToIdleWithoutCredit() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, uploads: [upload("old"), upload("s1")])

        sut.model.storyUploadsChanged([upload("old")])
        let late = sut.model.storyUploadSucceeded(id: "s1")
        await late?.value

        XCTAssertNil(late)
        XCTAssertEqual(sut.model.storyState, .idle)
        XCTAssertNil(sut.model.trackedStoryUploadId)
        XCTAssertEqual(sut.model.sessionPoints, 0)
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    func test_storyUploadSucceeded_forAnotherUpload_isIgnored() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())
        publishFromComposer(sut, uploads: [upload("old"), upload("s1")])

        await sut.model.storyUploadSucceeded(id: "old")?.value

        XCTAssertEqual(sut.model.storyState, .publishing)
        XCTAssertEqual(sut.model.sessionPoints, 0)
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    func test_storyComposerClosed_nothingPublished_keepsTheCardWithoutCredit() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())

        publishFromComposer(sut, uploads: [upload("old")])

        XCTAssertEqual(sut.model.card, .step(.story))
        XCTAssertEqual(sut.model.storyState, .idle)
        XCTAssertEqual(sut.model.sessionPoints, 0)
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    func test_storyUploadsChanged_withoutATrackedUpload_changesNothing() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global]))
        await sut.model.start(user: makeUser())

        sut.model.storyUploadsChanged([upload("other", failed: true)])

        XCTAssertEqual(sut.model.storyState, .idle)
    }

    // MARK: - Carte 4 — trouve ta bande

    func test_addFriend_sendsARealFriendRequestAndMarksItRequested() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global, .story]))
        await sut.model.start(user: makeUser())

        await sut.model.addFriend(id: "u1")

        XCTAssertEqual(sut.friends.sendRequestCallCount, 1)
        XCTAssertEqual(sut.friends.lastSendRequestReceiverId, "u1")
        XCTAssertTrue(sut.model.requestedProfileIds.contains("u1"))
    }

    func test_addFriend_awardsNoImmediatePoints() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global, .story]))
        await sut.model.start(user: makeUser())

        await sut.model.addFriend(id: "u1")

        XCTAssertEqual(sut.model.sessionPoints, 0)
    }

    func test_addFriend_failure_rollsBackTheOptimisticMark() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global, .story]))
        sut.friends.sendRequestResult = .failure(URLError(.timedOut))
        await sut.model.start(user: makeUser())

        await sut.model.addFriend(id: "u1")

        XCTAssertFalse(sut.model.requestedProfileIds.contains("u1"))
    }

    func test_continueFriends_withRequests_recordsDone() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global, .story]))
        await sut.model.start(user: makeUser())
        await sut.model.addFriend(id: "u1")

        await sut.model.continueFromFriends()

        XCTAssertEqual(sut.service.recorded.last?.step, .friends)
        XCTAssertEqual(sut.service.recorded.last?.outcome, .done)
    }

    // MARK: - Carte 5 — notifications, au bon moment

    func test_notificationsCard_offeredAfterSomethingWasProduced() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        await sut.model.start(user: makeUser())
        await sut.model.sendGreeting()
        await sut.model.advance()
        await sut.model.later()
        await sut.model.later()

        XCTAssertEqual(sut.model.card, .step(.notifications))
    }

    func test_notificationsCard_neverOfferedWhenNothingWasProduced() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        await sut.model.start(user: makeUser())
        await sut.model.later()
        await sut.model.later()
        await sut.model.later()

        XCTAssertEqual(sut.model.card, .recap)
        XCTAssertEqual(sut.permission.requestCallCount, 0)
    }

    func test_notificationsCard_neverOfferedWhenAlreadyDecided() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .story, .friends], prefilled: [.global]),
                          permission: .authorized)

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .recap)
    }

    func test_declineNotifications_neverOpensTheSystemPrompt() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .story, .friends], prefilled: [.global]))
        await sut.model.start(user: makeUser())
        XCTAssertEqual(sut.model.card, .step(.notifications))

        await sut.model.later()

        XCTAssertEqual(sut.permission.requestCallCount, 0)
        XCTAssertEqual(sut.service.recorded.last?.outcome, .skipped)
    }

    func test_acceptNotifications_opensTheSystemPromptOnce() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .story, .friends], prefilled: [.global]))
        await sut.model.start(user: makeUser())

        await sut.model.acceptNotifications()

        XCTAssertEqual(sut.permission.requestCallCount, 1)
        XCTAssertEqual(sut.service.recorded.last?.step, .notifications)
        XCTAssertEqual(sut.model.card, .recap)
    }

    // MARK: - « Plus tard », « Passer tout », récapitulatif

    func test_later_recordsSkippedAndMovesOn() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.later()

        XCTAssertEqual(sut.service.recorded.first?.step, .languages)
        XCTAssertEqual(sut.service.recorded.first?.outcome, .skipped)
        XCTAssertEqual(sut.model.card, .step(.global))
    }

    func test_skipAll_finishesOnTheServerAndHides() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.skipAll()

        XCTAssertEqual(sut.service.finishCallCount, 1)
        XCTAssertFalse(sut.model.isPresented)
    }

    func test_recap_readsTheRealProgressFromTheServer() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global, .story, .friends]))
        sut.progress.fetchProgressResult = .success(APIEngagementProgress(
            counters: [],
            milestones: [
                .init(milestoneType: .badge, milestoneKey: "content.text_message:1", reachedAt: "2026-09-24T08:00:00.000Z"),
                .init(milestoneType: .badge, milestoneKey: "content.story:1", reachedAt: "2026-09-24T08:01:00.000Z"),
                .init(milestoneType: .achievement, milestoneKey: "achievement.first_content", reachedAt: "2026-09-24T08:00:00.000Z"),
            ],
            streak: .init(currentStreakDays: 1, longestStreakDays: 1),
            level: .init(engagementScore: 24)
        ))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .recap)
        XCTAssertEqual(sut.model.recap?.points, 24)
        XCTAssertEqual(sut.model.recap?.level, 1)
        XCTAssertEqual(sut.model.recap?.streakDays, 1)
        XCTAssertEqual(sut.model.recap?.badges, 2)
    }

    func test_recap_progressUnavailable_fallsBackToSessionPointsOnly() async {
        let sut = makeSUT(state: makeState(seen: [.languages]))
        sut.progress.fetchProgressResult = .failure(URLError(.notConnectedToInternet))
        await sut.model.start(user: makeUser())
        await sut.model.sendGreeting()
        await sut.model.advance()
        await sut.model.later()
        await sut.model.later()
        await sut.model.later()

        XCTAssertEqual(sut.model.card, .recap)
        XCTAssertEqual(sut.model.recap?.points, 14)
        XCTAssertNil(sut.model.recap?.streakDays)
        XCTAssertNil(sut.model.recap?.badges)
    }

    func test_finish_fromRecap_finishesOnTheServerAndHides() async {
        let sut = makeSUT(state: makeState(seen: [.languages, .global, .story, .friends]))
        await sut.model.start(user: makeUser())

        await sut.model.finish()

        XCTAssertEqual(sut.service.finishCallCount, 1)
        XCTAssertFalse(sut.model.isPresented)
    }

    // MARK: - Gabarits de salut

    func test_greetingTemplates_eightPerLanguage_allCarryTheName() {
        XCTAssertEqual(OnboardingGreeting.templateCount, 8)
        for index in 0..<OnboardingGreeting.templateCount {
            let text = OnboardingGreeting.compose(templateIndex: index, name: "Aïcha", languageNames: ["français"])
            XCTAssertTrue(text.contains("Aïcha"), "gabarit \(index) sans le prénom : \(text)")
            XCTAssertFalse(text.contains("%"), "gabarit \(index) garde un spécificateur : \(text)")
            XCTAssertFalse(text.hasPrefix("onboarding."), "gabarit \(index) absent du catalogue")
        }
    }

    // MARK: - Tenir dans l'écran sans défiler

    func test_illustrationScale_whenTheCardFits_keepsTheIllustrationWhole() {
        XCTAssertEqual(OnboardingCardFit.illustrationScale(natural: 210, room: 260), 1)
    }

    func test_illustrationScale_whenRoomIsShort_shrinksToTheRoomLeft() {
        XCTAssertEqual(OnboardingCardFit.illustrationScale(natural: 200, room: 150), 0.75, accuracy: 0.0001)
    }

    func test_illustrationScale_belowTheLegibleMinimum_dropsTheIllustration() {
        let tooSmall = 210 * OnboardingCardFit.minimumIllustrationScale - 1
        XCTAssertEqual(OnboardingCardFit.illustrationScale(natural: 210, room: tooSmall), 0)
    }

    func test_illustrationScale_atTheLegibleMinimum_keepsTheIllustrationReduced() {
        let atMinimum = 210 * OnboardingCardFit.minimumIllustrationScale
        XCTAssertEqual(OnboardingCardFit.illustrationScale(natural: 210, room: atMinimum),
                       OnboardingCardFit.minimumIllustrationScale, accuracy: 0.0001)
    }

    func test_illustrationScale_beforeMeasuring_changesNothing() {
        XCTAssertEqual(OnboardingCardFit.illustrationScale(natural: 0, room: 10), 1)
    }

    func test_visibleSuggestions_showsThreeFirstUntilExpanded() {
        let six = (1...6).map { APIOnboardingSuggestion(id: "u\($0)", username: "u\($0)", displayName: "U\($0)", avatarUrl: nil, languages: ["fr"]) }

        XCTAssertEqual(OnboardingCardFit.visibleSuggestions(six, expanded: false).map(\.id), ["u1", "u2", "u3"])
        XCTAssertEqual(OnboardingCardFit.visibleSuggestions(six, expanded: true).count, 6)
        XCTAssertEqual(OnboardingCardFit.hiddenSuggestionCount(six, expanded: false), 3)
        XCTAssertEqual(OnboardingCardFit.hiddenSuggestionCount(Array(six.prefix(2)), expanded: false), 0)
    }

    func test_friendsActions_beforeAnyRequest_laterIsTheOnlyAction() {
        XCTAssertEqual(OnboardingCardFit.friendsActions(hasRequests: false), .laterOnly)
        XCTAssertEqual(OnboardingCardFit.friendsActions(hasRequests: true), .continueOnly)
    }
}
