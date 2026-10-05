import XCTest
import Contacts
import MeeshySDK
@testable import Meeshy

/// La carte 4 propose de retrouver ses amis depuis le carnet (#8105). Ces
/// témoins suivent ce que l'utilisateur voit (la carte, la phase de la
/// proposition, les rangées) et ce qui part (la fenêtre système, la
/// synchronisation du Répertoire, la demande d'ami).
@MainActor
final class OnboardingContactsFlowTests: XCTestCase {

    private struct SUT {
        let model: OnboardingViewModel
        let service: MockOnboardingService
        let friends: MockFriendService
        let contacts: MockContactSyncService
        let directory: MockContactDirectoryService
    }

    private static let lina = APIOnboardingSuggestion(id: "u1", username: "lina", displayName: "Lina", avatarUrl: nil, languages: ["fr"])

    private func makeSUT(
        suggestions: [APIOnboardingSuggestion] = [OnboardingContactsFlowTests.lina],
        contactsStatus: CNAuthorizationStatus = .notDetermined,
        notifications: OnboardingNotificationStatus = .authorized
    ) -> SUT {
        let service = MockOnboardingService()
        service.fetchStateResult = .success(APIOnboardingState(
            eligible: true,
            completedAt: nil,
            seenSteps: [.languages, .global, .story],
            prefilledSteps: [],
            globalConversationId: nil,
            protectedRegime: false,
            storyDefaultVisibility: .public,
            suggestions: suggestions
        ))
        let friends = MockFriendService()
        friends.sendRequestResult = .success(FriendRequest(id: "fr1", senderId: "me", receiverId: "u9", status: "pending", createdAt: Date()))
        let contacts = MockContactSyncService()
        contacts.authorizationStatusResult = contactsStatus
        let directory = MockContactDirectoryService()
        let permission = MockOnboardingNotificationPermission()
        permission.status = notifications
        let model = OnboardingViewModel(
            service: service,
            messages: MockMessageService(),
            friends: friends,
            users: MockUserService(),
            progress: MockEngagementProgressService(),
            permission: permission,
            pickTemplate: { _ in 0 },
            applyUser: { _ in },
            settled: MockOnboardingSettledStore(),
            pause: { _ in },
            contacts: contacts,
            directory: directory
        )
        return SUT(model: model, service: service, friends: friends, contacts: contacts, directory: directory)
    }

    private func makeUser() -> MeeshyUser {
        MeeshyUser(id: "me", username: "aicha", displayName: "Aïcha", systemLanguage: "fr")
    }

    private func matched(_ contactId: String, name: String, userId: String, username: String) -> DirectoryContact {
        DirectoryContact(
            id: contactId,
            contactKey: "k-\(contactId)",
            displayName: name,
            isOnMeeshy: true,
            matchedUser: MatchedContactUser(id: userId, username: username, displayName: username)
        )
    }

    // MARK: - La carte existe

    func test_start_withoutSuggestions_contactsOfferable_showsTheFriendsCardWithTheOffer() async {
        let sut = makeSUT(suggestions: [])

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.friends))
        XCTAssertEqual(sut.model.contactsPhase, .offer)
    }

    func test_start_withoutSuggestions_contactsDeniedBySystem_skipsTheFriendsCard() async {
        let sut = makeSUT(suggestions: [], contactsStatus: .denied)

        await sut.model.start(user: makeUser())

        XCTAssertNotEqual(sut.model.card, .step(.friends))
    }

    func test_start_withSuggestions_contactsDeniedBySystem_leadsToSettings() async {
        let sut = makeSUT(contactsStatus: .denied)

        await sut.model.start(user: makeUser())

        XCTAssertEqual(sut.model.card, .step(.friends))
        XCTAssertEqual(sut.model.contactsPhase, .deniedBySystem)
    }

    // MARK: - « Retrouver mes amis »

    func test_findFriends_granted_syncsTheDirectoryAndShowsFriendsUnderTheirAddressBookName() async {
        let sut = makeSUT()
        sut.directory.listResult = .success([
            matched("c1", name: "Maman", userId: "u9", username: "awa"),
            matched("c2", name: "Moi", userId: "me", username: "aicha"),
        ])
        await sut.model.start(user: makeUser())

        await sut.model.findFriendsInContacts()

        XCTAssertEqual(sut.contacts.requestAccessCallCount, 1)
        XCTAssertEqual(sut.contacts.lastSyncDirectoryMode, .replace)
        XCTAssertEqual(sut.directory.lastListFilter, .meeshy)
        guard case .found(let found) = sut.model.contactsPhase else {
            return XCTFail("attendu : amis trouvés, obtenu \(sut.model.contactsPhase)")
        }
        XCTAssertEqual(found.map(\.displayName), ["Maman"])
        XCTAssertEqual(sut.model.friendRows.map(\.id), ["u9", "u1"])
    }

    func test_findFriends_found_thenLeaving_offersNotificationsToKeepThePromise() async {
        let sut = makeSUT(notifications: .notDetermined)
        await sut.model.start(user: makeUser())
        await sut.model.findFriendsInContacts()

        await sut.model.continueFromFriends()

        XCTAssertEqual(sut.model.card, .step(.notifications))
    }

    func test_declineContacts_thenLeaving_doesNotInventNotifications() async {
        let sut = makeSUT(notifications: .notDetermined)
        await sut.model.start(user: makeUser())
        await sut.model.declineContacts()

        await sut.model.continueFromFriends()

        XCTAssertEqual(sut.model.card, .recap)
    }

    func test_findFriends_nobodyFound_showsTheEmptyFoundState() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.findFriendsInContacts()

        XCTAssertEqual(sut.model.contactsPhase, .found([]))
        XCTAssertEqual(sut.model.card, .step(.friends))
    }

    func test_findFriends_refusedAtTheSystemPrompt_fallsBackToSuggestions() async {
        let sut = makeSUT()
        sut.contacts.requestAccessResult = false
        await sut.model.start(user: makeUser())

        await sut.model.findFriendsInContacts()

        XCTAssertEqual(sut.model.contactsPhase, .declined)
        XCTAssertEqual(sut.model.card, .step(.friends))
        XCTAssertEqual(sut.contacts.syncDirectoryCallCount, 0)
        XCTAssertEqual(sut.model.friendRows.map(\.id), ["u1"])
    }

    func test_findFriends_refusedWithoutSuggestions_movesOnAndRecordsSkipped() async {
        let sut = makeSUT(suggestions: [])
        sut.contacts.requestAccessResult = false
        await sut.model.start(user: makeUser())

        await sut.model.findFriendsInContacts()

        XCTAssertNotEqual(sut.model.card, .step(.friends))
        XCTAssertEqual(sut.service.recorded.last?.step, .friends)
        XCTAssertEqual(sut.service.recorded.last?.outcome, .skipped)
    }

    func test_findFriends_syncFails_offersARetryThatSucceeds() async {
        let sut = makeSUT()
        sut.contacts.syncDirectoryResult = .failure(URLError(.notConnectedToInternet))
        await sut.model.start(user: makeUser())

        await sut.model.findFriendsInContacts()
        XCTAssertEqual(sut.model.contactsPhase, .failed)

        sut.contacts.syncDirectoryResult = .success(
            DirectorySyncResult(totalContacts: 1, processedContacts: 1, syncedCount: 1, matchedCount: 1, removedCount: 0)
        )
        sut.directory.listResult = .success([matched("c1", name: "Maman", userId: "u9", username: "awa")])
        await sut.model.findFriendsInContacts()

        XCTAssertEqual(sut.model.contactsPhase, .found(OnboardingContacts.friends(
            from: [matched("c1", name: "Maman", userId: "u9", username: "awa")], excluding: "me")))
    }

    func test_foundFriend_connect_sendsTheExistingFriendRequest() async {
        let sut = makeSUT()
        sut.directory.listResult = .success([matched("c1", name: "Maman", userId: "u9", username: "awa")])
        await sut.model.start(user: makeUser())
        await sut.model.findFriendsInContacts()

        await sut.model.addFriend(id: "u9")

        XCTAssertEqual(sut.friends.lastSendRequestReceiverId, "u9")
        XCTAssertTrue(sut.model.requestedProfileIds.contains("u9"))
    }

    // MARK: - « Plus tard »

    func test_declineContacts_withSuggestions_keepsTheCardWithoutAskingTheSystem() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.declineContacts()

        XCTAssertEqual(sut.model.contactsPhase, .declined)
        XCTAssertEqual(sut.model.card, .step(.friends))
        XCTAssertEqual(sut.contacts.requestAccessCallCount, 0)
    }

    func test_declineContacts_withoutSuggestions_movesOn() async {
        let sut = makeSUT(suggestions: [])
        await sut.model.start(user: makeUser())

        await sut.model.declineContacts()

        XCTAssertNotEqual(sut.model.card, .step(.friends))
        XCTAssertEqual(sut.contacts.requestAccessCallCount, 0)
    }

    // MARK: - Accès déjà décidé

    func test_friendsCardAppeared_accessAlreadyGranted_searchesWithoutAButton() async {
        let sut = makeSUT(contactsStatus: .authorized)
        sut.directory.listResult = .success([matched("c1", name: "Maman", userId: "u9", username: "awa")])
        await sut.model.start(user: makeUser())

        await sut.model.friendsCardAppeared()

        XCTAssertEqual(sut.contacts.syncDirectoryCallCount, 1)
        guard case .found(let found) = sut.model.contactsPhase else {
            return XCTFail("attendu : amis trouvés, obtenu \(sut.model.contactsPhase)")
        }
        XCTAssertEqual(found.map(\.id), ["u9"])
    }

    func test_friendsCardAppeared_accessNotDetermined_waitsForTheGesture() async {
        let sut = makeSUT()
        await sut.model.start(user: makeUser())

        await sut.model.friendsCardAppeared()

        XCTAssertEqual(sut.model.contactsPhase, .offer)
        XCTAssertEqual(sut.contacts.requestAccessCallCount, 0)
        XCTAssertEqual(sut.contacts.syncDirectoryCallCount, 0)
    }

    func test_refreshContactsAccess_grantedInSettings_searches() async {
        let sut = makeSUT(contactsStatus: .denied)
        await sut.model.start(user: makeUser())

        sut.contacts.authorizationStatusResult = .authorized
        await sut.model.refreshContactsAccess()

        XCTAssertEqual(sut.contacts.syncDirectoryCallCount, 1)
        XCTAssertEqual(sut.model.contactsPhase, .found([]))
    }

    func test_refreshContactsAccess_stillDenied_changesNothing() async {
        let sut = makeSUT(contactsStatus: .denied)
        await sut.model.start(user: makeUser())

        await sut.model.refreshContactsAccess()

        XCTAssertEqual(sut.model.contactsPhase, .deniedBySystem)
        XCTAssertEqual(sut.contacts.syncDirectoryCallCount, 0)
    }
}
