import XCTest
import Contacts
import MeeshySDK
@testable import Meeshy

/// #9929 — l'âge se demande pendant l'onboarding, et se passe. Ces témoins
/// suivent ce que l'utilisateur voit (la carte courante, l'écran de refus) et
/// ce qui part au réseau (la date, l'étape écrite, la déconnexion).
@MainActor
final class OnboardingAgeTests: XCTestCase {

    private static let globalId = "000000000000000000000abc"

    private func makeState(
        seen: [OnboardingStepId] = [.languages],
        prefilled: [OnboardingStepId] = [],
        servesAgeStep: Bool = true,
        restriction: ConversationWriteRestriction? = nil
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
            servesAgeStep: servesAgeStep,
            viewerWriteRestriction: restriction
        )
    }

    private func makeUser() -> MeeshyUser {
        MeeshyUser(id: "me", username: "aicha", displayName: "Aïcha", systemLanguage: "fr")
    }

    private final class SignOutSpy {
        var callCount = 0
    }

    private struct SUT {
        let model: OnboardingViewModel
        let service: MockOnboardingService
        let messages: MockMessageService
        let birthDates: MockBirthDateService
        let settled: MockOnboardingSettledStore
        let signOut: SignOutSpy
    }

    private func makeSUT(state: APIOnboardingState? = nil) -> SUT {
        let service = MockOnboardingService()
        service.fetchStateResult = .success(state ?? makeState())
        let messages = MockMessageService()
        let birthDates = MockBirthDateService()
        let settled = MockOnboardingSettledStore()
        let notifications = MockOnboardingNotificationPermission()
        notifications.status = .authorized
        let contacts = MockContactSyncService()
        contacts.authorizationStatusResult = .restricted
        let spy = SignOutSpy()
        let model = OnboardingViewModel(
            service: service,
            messages: messages,
            friends: MockFriendService(),
            users: MockUserService(),
            progress: MockEngagementProgressService(),
            permission: notifications,
            pickTemplate: { _ in 0 },
            applyUser: { _ in },
            settled: settled,
            pause: { _ in },
            contacts: contacts,
            directory: MockContactDirectoryService(),
            birthDates: birthDates,
            signOut: { spy.callCount += 1 }
        )
        return SUT(model: model, service: service, messages: messages, birthDates: birthDates,
                   settled: settled, signOut: spy)
    }

    private func birthDate(yearsAgo: Int) -> Date {
        Calendar.current.date(byAdding: .year, value: -yearsAgo, to: Date()) ?? Date()
    }

    // MARK: - Présentation

    func test_start_gatewayServesAge_presentsTheAgeCardAfterLanguages() async {
        let sut = makeSUT()

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.age))
        XCTAssertEqual(sut.model.plannedSteps.first, .age)
    }

    func test_start_gatewayWithoutAge_skipsTheAgeCard() async {
        let sut = makeSUT(state: makeState(servesAgeStep: false))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertFalse(sut.model.plannedSteps.contains(.age))
    }

    func test_start_ageAlreadyKnownAndMinor_skipsAgeAndGreetingCards() async {
        let sut = makeSUT(state: makeState(prefilled: [.age], restriction: .minorGlobal))

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.story))
        XCTAssertFalse(sut.model.plannedSteps.contains(.global))
    }

    // MARK: - Déclaration

    func test_declareBirthDate_withoutPickingADate_sendsNothing() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.declareBirthDate()

        XCTAssertEqual(sut.birthDates.setBirthDateCallCount, 0)
        XCTAssertEqual(sut.model.card, .step(.age))
    }

    func test_declareBirthDate_adult_recordsDoneAndKeepsTheGreetingCard() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())
        let picked = birthDate(yearsAgo: 30)
        sut.model.pickBirthDate(picked)

        await sut.model.declareBirthDate()

        XCTAssertEqual(sut.birthDates.lastBirthDate, picked)
        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.service.recorded.last, MockOnboardingService.Recorded(step: .age, outcome: .done))
    }

    func test_declareBirthDate_minor_removesTheGreetingCard() async {
        let sut = makeSUT()
        sut.birthDates.setBirthDateResult = .success(APIBirthDateDeclaration(ageClass: .minor, viewerWriteRestrictionGlobal: true))
        await sut.model.start(user: makeUser())
        sut.model.pickBirthDate(birthDate(yearsAgo: 15))

        await sut.model.declareBirthDate()

        XCTAssertEqual(sut.model.card, .step(.story))
        XCTAssertFalse(sut.model.plannedSteps.contains(.global))
        XCTAssertEqual(sut.service.recorded.last, MockOnboardingService.Recorded(step: .age, outcome: .done))
    }

    func test_declareBirthDate_alreadySet_marksTheStepDone() async {
        let sut = makeSUT()
        sut.birthDates.setBirthDateResult = .failure(BirthDateDeclarationError.alreadySet)
        await sut.model.start(user: makeUser())
        sut.model.pickBirthDate(birthDate(yearsAgo: 25))

        await sut.model.declareBirthDate()

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.service.recorded.last, MockOnboardingService.Recorded(step: .age, outcome: .done))
    }

    func test_declareBirthDate_belowMinimumAge_showsTheRefusalAndWritesNoStep() async {
        let sut = makeSUT()
        sut.birthDates.setBirthDateResult = .failure(BirthDateDeclarationError.belowMinimumAge)
        await sut.model.start(user: makeUser())
        sut.model.pickBirthDate(birthDate(yearsAgo: 10))

        await sut.model.declareBirthDate()

        XCTAssertEqual(sut.model.ageState, .refused)
        XCTAssertEqual(sut.model.card, .step(.age))
        XCTAssertTrue(sut.service.recorded.isEmpty)
        XCTAssertEqual(sut.signOut.callCount, 0)
    }

    func test_acknowledgeAgeRefusal_signsOutWithoutSettlingTheJourney() async {
        let sut = makeSUT()
        sut.birthDates.setBirthDateResult = .failure(BirthDateDeclarationError.belowMinimumAge)
        await sut.model.start(user: makeUser())
        sut.model.pickBirthDate(birthDate(yearsAgo: 10))
        await sut.model.declareBirthDate()

        await sut.model.acknowledgeAgeRefusal()

        XCTAssertEqual(sut.signOut.callCount, 1)
        XCTAssertFalse(sut.model.isPresented)
        XCTAssertFalse(sut.settled.isSettled(userId: "me"))
    }

    func test_acknowledgeAgeRefusal_withoutRefusal_doesNotSignOut() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.acknowledgeAgeRefusal()

        XCTAssertEqual(sut.signOut.callCount, 0)
        XCTAssertTrue(sut.model.isPresented)
    }

    func test_declareBirthDate_networkFailure_staysOnTheCardToRetry() async {
        let sut = makeSUT()
        sut.birthDates.setBirthDateResult = .failure(BirthDateDeclarationError.unavailable)
        await sut.model.start(user: makeUser())
        sut.model.pickBirthDate(birthDate(yearsAgo: 30))

        await sut.model.declareBirthDate()

        XCTAssertEqual(sut.model.ageState, .failed)
        XCTAssertEqual(sut.model.card, .step(.age))
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    func test_pickBirthDate_afterFailure_clearsTheNotice() async {
        let sut = makeSUT()
        sut.birthDates.setBirthDateResult = .failure(BirthDateDeclarationError.invalidDate)
        await sut.model.start(user: makeUser())
        sut.model.pickBirthDate(birthDate(yearsAgo: 30))
        await sut.model.declareBirthDate()

        sut.model.pickBirthDate(birthDate(yearsAgo: 31))

        XCTAssertEqual(sut.model.ageState, .idle)
    }

    func test_declareBirthDate_unsupportedGateway_movesOnWithoutWritingTheStep() async {
        let sut = makeSUT()
        sut.birthDates.setBirthDateResult = .failure(BirthDateDeclarationError.unsupported)
        await sut.model.start(user: makeUser())
        sut.model.pickBirthDate(birthDate(yearsAgo: 30))

        await sut.model.declareBirthDate()

        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertTrue(sut.service.recorded.isEmpty)
    }

    // MARK: - Passer

    func test_later_onTheAgeCard_recordsSkippedAndSendsNoDate() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.later()

        XCTAssertEqual(sut.birthDates.setBirthDateCallCount, 0)
        XCTAssertEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.service.recorded.last, MockOnboardingService.Recorded(step: .age, outcome: .skipped))
    }

    // MARK: - Le salut d'un mineur

    func test_sendGreeting_globalAdultsOnly_skipsTheGreetingCard() async {
        let sut = makeSUT(state: makeState(servesAgeStep: false))
        sut.messages.sendResult = .failure(MeeshyError.forbidden(
            reason: "Global", body: Data(#"{"success":false,"error":"Global","code":"GLOBAL_ADULTS_ONLY"}"#.utf8)))
        await sut.model.start(user: makeUser())

        await sut.model.sendGreeting()

        XCTAssertNotEqual(sut.model.card, .step(.global))
        XCTAssertEqual(sut.model.greetingState, .idle)
        XCTAssertEqual(sut.service.recorded.last, MockOnboardingService.Recorded(step: .global, outcome: .skipped))
    }

    // MARK: - Bornes du sélecteur

    func test_range_coversOneHundredTwentyYearsUpToToday() {
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let calendar = Calendar(identifier: .gregorian)

        let range = OnboardingAgeRules.range(now: now, calendar: calendar)

        XCTAssertEqual(range.upperBound, now)
        XCTAssertEqual(calendar.dateComponents([.year], from: range.lowerBound, to: now).year, 120)
    }
}
