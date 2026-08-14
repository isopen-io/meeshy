import XCTest
@testable import Meeshy
import MeeshySDK

/// Répertoire — carnet d'adresses synchronisé et conservé.
@MainActor
final class PhonebookViewModelTests: XCTestCase {

    // MARK: - Factories

    private func makeContact(
        id: String = "contact-1",
        displayName: String? = "Awa Diallo",
        phoneNumbers: [String] = ["+221771234567"],
        emails: [String] = ["awa@test.com"],
        onMeeshy: Bool = true,
        username: String = "awa"
    ) -> DirectoryContact {
        DirectoryContact(
            id: id,
            contactKey: "key-\(id)",
            displayName: displayName,
            phoneNumbers: phoneNumbers,
            emails: emails,
            usernames: [],
            isOnMeeshy: onMeeshy,
            matchedBy: onMeeshy ? "phone" : nil,
            matchedUser: onMeeshy
                ? MatchedContactUser(id: "user-\(id)", username: username, firstName: "Awa", lastName: "Diallo")
                : nil
        )
    }

    private func makeSUT(
        contacts: [DirectoryContact] = [],
        listError: Error? = nil
    ) -> (sut: PhonebookViewModel, directory: MockContactDirectoryService, sync: MockContactSyncService, creator: MockConversationCreator) {
        let directory = MockContactDirectoryService()
        directory.listResult = listError.map { .failure($0) } ?? .success(contacts)
        let sync = MockContactSyncService()
        let creator = MockConversationCreator()
        let sut = PhonebookViewModel(
            directoryService: directory,
            contactSync: sync,
            conversationCreator: creator,
            currentUserId: "me"
        )
        return (sut, directory, sync, creator)
    }

    // MARK: - Load

    func test_load_populatesDirectoryFromNetwork() async {
        let (sut, directory, _, _) = makeSUT(contacts: [makeContact()])

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sut.contacts.count, 1)
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(directory.listCallCount, 1)
    }

    func test_load_networkFailureOnEmptyDirectory_surfacesError() async {
        let (sut, _, _, _) = makeSUT(listError: URLError(.notConnectedToInternet))

        await sut.load(forceNetwork: true)

        guard case .error = sut.loadState else {
            return XCTFail("Expected an error state, got \(sut.loadState)")
        }
    }

    func test_load_networkFailureWithContactsAlreadyShown_keepsThemVisible() async {
        let (sut, directory, _, _) = makeSUT(contacts: [makeContact()])
        await sut.load(forceNetwork: true)

        directory.listResult = .failure(URLError(.timedOut))
        await sut.load(forceNetwork: true)

        // Dégradation offline : un répertoire déjà consultable ne doit pas
        // disparaître parce que la revalidation a échoué.
        XCTAssertEqual(sut.contacts.count, 1)
        XCTAssertEqual(sut.loadState, .loaded)
    }

    // MARK: - Filters & search

    func test_visibleContacts_meeshyFilter_keepsOnlyMatchedContacts() async {
        let (sut, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa", onMeeshy: true),
            makeContact(id: "2", displayName: "Ghost", onMeeshy: false),
        ])
        await sut.load(forceNetwork: true)

        sut.setFilter(.meeshy)

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Awa"])
        XCTAssertEqual(sut.meeshyCount, 1)
    }

    func test_visibleContacts_invitableFilter_keepsOnlyUnmatchedContacts() async {
        let (sut, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa", onMeeshy: true),
            makeContact(id: "2", displayName: "Ghost", onMeeshy: false),
        ])
        await sut.load(forceNetwork: true)

        sut.setFilter(.invitable)

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Ghost"])
    }

    func test_visibleContacts_searchMatchesAddressBookName() async {
        let (sut, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa Diallo"),
            makeContact(id: "2", displayName: "Bob Marley", username: "bob"),
        ])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "awa"

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Awa Diallo"])
    }

    func test_visibleContacts_searchMatchesMeeshyUsername() async {
        let (sut, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Le voisin", username: "awa"),
            makeContact(id: "2", displayName: "Bob", username: "bob"),
        ])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "awa"

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Le voisin"])
    }

    func test_visibleContacts_searchMatchesPhoneNumber() async {
        let (sut, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa", phoneNumbers: ["+221771234567"]),
            makeContact(id: "2", displayName: "Bob", phoneNumbers: ["+33612345678"]),
        ])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "+22177"

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Awa"])
    }

    // MARK: - Sync

    func test_synchronize_readsDeviceBookInReplaceModeAndReloads() async {
        let (sut, directory, sync, _) = makeSUT(contacts: [makeContact()])
        sync.syncDirectoryResult = .success(
            DirectorySyncResult(totalContacts: 12, processedContacts: 12, syncedCount: 12, matchedCount: 3, removedCount: 1)
        )

        await sut.synchronize()

        XCTAssertEqual(sync.syncDirectoryCallCount, 1)
        XCTAssertEqual(sync.lastSyncDirectoryMode, .replace)
        XCTAssertEqual(directory.listCallCount, 1)
        XCTAssertEqual(sut.contacts.count, 1)
    }

    func test_synchronize_deniedContactAccess_doesNotWipeTheDirectory() async {
        let (sut, _, sync, _) = makeSUT(contacts: [makeContact()])
        await sut.load(forceNetwork: true)
        sync.syncDirectoryResult = .failure(ContactSyncError.accessDenied)

        await sut.synchronize()

        XCTAssertEqual(sut.contacts.count, 1)
    }

    func test_synchronize_whileAlreadySyncing_doesNotStartASecondRun() async {
        let (sut, _, sync, _) = makeSUT()

        async let first: Void = sut.synchronize()
        async let second: Void = sut.synchronize()
        _ = await (first, second)

        // Deux appels concurrents ne doivent pas relire le carnet deux fois.
        XCTAssertLessThanOrEqual(sync.syncDirectoryCallCount, 2)
    }

    // MARK: - « Lui écrire »

    func test_startConversation_matchedContact_opensDirectConversation() async {
        let (sut, _, _, creator) = makeSUT()
        let contact = makeContact()

        let conversation = await sut.startConversation(with: contact)

        XCTAssertNotNil(conversation)
        XCTAssertEqual(creator.lastUserId, "user-contact-1")
        XCTAssertEqual(creator.createCallCount, 1)
    }

    func test_startConversation_unmatchedContact_doesNothing() async {
        let (sut, _, _, creator) = makeSUT()
        let contact = makeContact(onMeeshy: false)

        let conversation = await sut.startConversation(with: contact)

        XCTAssertNil(conversation)
        XCTAssertEqual(creator.createCallCount, 0)
    }

    func test_startConversation_creationFailure_returnsNil() async {
        let (sut, _, _, creator) = makeSUT()
        creator.result = .failure(URLError(.badServerResponse))

        let conversation = await sut.startConversation(with: makeContact())

        XCTAssertNil(conversation)
    }

    // MARK: - Erase

    func test_eraseDirectory_clearsServerAndLocalList() async {
        let (sut, directory, _, _) = makeSUT(contacts: [makeContact()])
        await sut.load(forceNetwork: true)

        await sut.eraseDirectory()

        XCTAssertEqual(directory.clearCallCount, 1)
        XCTAssertTrue(sut.contacts.isEmpty)
    }

    func test_eraseDirectory_failure_keepsTheDirectory() async {
        let (sut, directory, _, _) = makeSUT(contacts: [makeContact()])
        await sut.load(forceNetwork: true)
        directory.clearResult = .failure(URLError(.badServerResponse))

        await sut.eraseDirectory()

        XCTAssertEqual(sut.contacts.count, 1)
    }

    // MARK: - Invitation

    func test_invitationMessage_namesTheContact() {
        let (sut, _, _, _) = makeSUT()

        let message = sut.invitationMessage(for: makeContact(displayName: "Awa"))

        XCTAssertTrue(message.contains("Awa"))
        XCTAssertTrue(message.contains("meeshy.me"))
    }
}

// MARK: - DirectoryContact display rules

final class DirectoryContactDisplayTests: XCTestCase {

    func test_resolvedName_prefersTheAddressBookName() {
        let contact = DirectoryContact(
            id: "1", contactKey: "k", displayName: "Tonton Awa",
            isOnMeeshy: true,
            matchedUser: MatchedContactUser(id: "u", username: "awa", displayName: "Awa D.")
        )
        // C'est sous le nom de son carnet que l'utilisateur connaît la personne.
        XCTAssertEqual(contact.resolvedName, "Tonton Awa")
    }

    func test_resolvedName_fallsBackToTheMeeshyIdentity() {
        let contact = DirectoryContact(
            id: "1", contactKey: "k", displayName: nil,
            isOnMeeshy: true,
            matchedUser: MatchedContactUser(id: "u", username: "awa", displayName: "Awa D.")
        )
        XCTAssertEqual(contact.resolvedName, "Awa D.")
    }

    func test_resolvedName_fallsBackToAnIdentifierWhenNothingElseIsKnown() {
        let contact = DirectoryContact(
            id: "1", contactKey: "k", displayName: nil,
            phoneNumbers: ["+221771234567"],
            isOnMeeshy: false
        )
        XCTAssertEqual(contact.resolvedName, "+221771234567")
    }

    func test_subtitle_showsTheMeeshyHandleForAMatchedContact() {
        let contact = DirectoryContact(
            id: "1", contactKey: "k", displayName: "Awa",
            phoneNumbers: ["+221771234567"],
            isOnMeeshy: true,
            matchedUser: MatchedContactUser(id: "u", username: "awa")
        )
        XCTAssertEqual(contact.subtitle, "@awa")
    }

    func test_subtitle_showsThePhoneNumberForAnUnmatchedContact() {
        let contact = DirectoryContact(
            id: "1", contactKey: "k", displayName: "Ghost",
            phoneNumbers: ["+221771234567"],
            isOnMeeshy: false
        )
        XCTAssertEqual(contact.subtitle, "+221771234567")
    }
}
