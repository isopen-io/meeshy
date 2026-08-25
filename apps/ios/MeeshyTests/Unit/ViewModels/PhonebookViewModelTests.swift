import XCTest
import Contacts
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
        listError: Error? = nil,
        platformResults: [UserSearchResult] = [],
        contactsAuthorization: CNAuthorizationStatus = .denied
    ) -> (sut: PhonebookViewModel, directory: MockContactDirectoryService, sync: MockContactSyncService, creator: MockConversationCreator, users: MockUserService) {
        let directory = MockContactDirectoryService()
        directory.listResult = listError.map { .failure($0) } ?? .success(contacts)
        let sync = MockContactSyncService()
        // Par défaut refusé : les tests qui ne parlent PAS du remplissage
        // automatique ne doivent pas le déclencher par accident.
        sync.authorizationStatusResult = contactsAuthorization
        let creator = MockConversationCreator()
        let users = MockUserService()
        users.searchUsersResult = .success(platformResults)
        let sut = PhonebookViewModel(
            directoryService: directory,
            contactSync: sync,
            userService: users,
            conversationCreator: creator,
            currentUserId: "me",
            searchDebounce: .zero
        )
        return (sut, directory, sync, creator, users)
    }

    // MARK: - Load

    func test_load_populatesDirectoryFromNetwork() async {
        let (sut, directory, _, _, _) = makeSUT(contacts: [makeContact()])

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sut.contacts.count, 1)
        XCTAssertEqual(sut.loadState, .loaded)
        XCTAssertEqual(directory.listCallCount, 1)
    }

    func test_load_networkFailureOnEmptyDirectory_surfacesError() async {
        let (sut, _, _, _, _) = makeSUT(listError: URLError(.notConnectedToInternet))

        await sut.load(forceNetwork: true)

        guard case .error = sut.loadState else {
            return XCTFail("Expected an error state, got \(sut.loadState)")
        }
    }

    func test_load_networkFailureWithContactsAlreadyShown_keepsThemVisible() async {
        let (sut, directory, _, _, _) = makeSUT(contacts: [makeContact()])
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
        let (sut, _, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa", onMeeshy: true),
            makeContact(id: "2", displayName: "Ghost", onMeeshy: false),
        ])
        await sut.load(forceNetwork: true)

        sut.setFilter(.meeshy)

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Awa"])
        XCTAssertEqual(sut.meeshyCount, 1)
    }

    func test_visibleContacts_invitableFilter_keepsOnlyUnmatchedContacts() async {
        let (sut, _, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa", onMeeshy: true),
            makeContact(id: "2", displayName: "Ghost", onMeeshy: false),
        ])
        await sut.load(forceNetwork: true)

        sut.setFilter(.invitable)

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Ghost"])
    }

    func test_visibleContacts_searchMatchesAddressBookName() async {
        let (sut, _, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa Diallo"),
            // Email/téléphone explicitement distincts du défaut de la factory
            // (qui vaut "awa@test.com" / "+221771234567") : sans ça, "Bob
            // Marley" matcherait quand même la requête "awa" par son email
            // hérité, et le test ne discriminerait plus rien.
            makeContact(id: "2", displayName: "Bob Marley", phoneNumbers: ["+33612345678"], emails: ["bob@test.com"], username: "bob"),
        ])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "awa"

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Awa Diallo"])
    }

    func test_visibleContacts_searchMatchesMeeshyUsername() async {
        let (sut, _, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Le voisin", username: "awa"),
            // Idem : "Bob" doit rester hors des résultats sur ses seuls nom et
            // pseudo, pas grâce à un email/téléphone par défaut qui contient
            // accidentellement "awa".
            makeContact(id: "2", displayName: "Bob", phoneNumbers: ["+33612345678"], emails: ["bob@test.com"], username: "bob"),
        ])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "awa"

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Le voisin"])
    }

    func test_visibleContacts_searchMatchesPhoneNumber() async {
        let (sut, _, _, _, _) = makeSUT(contacts: [
            makeContact(id: "1", displayName: "Awa", phoneNumbers: ["+221771234567"]),
            makeContact(id: "2", displayName: "Bob", phoneNumbers: ["+33612345678"]),
        ])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "+22177"

        XCTAssertEqual(sut.visibleContacts.map(\.displayName), ["Awa"])
    }

    // MARK: - Recherche relayée (répertoire → plateforme)

    private func platformUser(id: String = "p1", username: String = "awa_pro") -> UserSearchResult {
        UserSearchResult(id: id, username: username, displayName: "Awa Pro", avatar: nil, isOnline: true)
    }

    func test_search_whenTheDirectoryAnswers_doesNotQueryThePlatform() async {
        let (sut, _, _, _, users) = makeSUT(contacts: [makeContact(displayName: "Awa Diallo")])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "awa"
        await sut.searchQueryChanged()

        XCTAssertFalse(sut.showsPlatformResults)
        XCTAssertEqual(users.searchUsersCallCount, 0)
        XCTAssertTrue(sut.platformResults.isEmpty)
    }

    func test_search_whenTheDirectoryFindsNothing_relaysToThePlatform() async {
        let (sut, _, _, _, users) = makeSUT(
            // Email/téléphone explicitement distincts du défaut de la factory
            // ("awa@test.com" / "+221771234567") : sinon "Bob" matcherait
            // quand même la requête "awa" par cet email hérité, le répertoire
            // répondrait, et le relais plateforme ne se déclencherait jamais.
            contacts: [makeContact(displayName: "Bob", phoneNumbers: ["+33612345678"], emails: ["bob@test.com"], username: "bob")],
            platformResults: [platformUser()]
        )
        await sut.load(forceNetwork: true)

        sut.searchQuery = "awa"
        await sut.searchQueryChanged()

        XCTAssertTrue(sut.showsPlatformResults)
        XCTAssertEqual(users.searchUsersCallCount, 1)
        XCTAssertEqual(users.lastSearchUsersQuery, "awa")
        XCTAssertEqual(sut.platformResults.map(\.id), ["p1"])
    }

    func test_search_relayNeverReturnsTheCurrentUser() async {
        let (sut, _, _, _, _) = makeSUT(
            platformResults: [platformUser(id: "me"), platformUser(id: "p2", username: "other")]
        )
        await sut.load(forceNetwork: true)

        sut.searchQuery = "awa"
        await sut.searchQueryChanged()

        XCTAssertEqual(sut.platformResults.map(\.id), ["p2"])
    }

    func test_search_shorterThanTwoCharacters_doesNotRelay() async {
        let (sut, _, _, _, users) = makeSUT(platformResults: [platformUser()])
        await sut.load(forceNetwork: true)

        sut.searchQuery = "a"
        await sut.searchQueryChanged()

        XCTAssertFalse(sut.showsPlatformResults)
        XCTAssertEqual(users.searchUsersCallCount, 0)
    }

    func test_search_clearingTheQuery_dropsThePlatformResults() async {
        let (sut, _, _, _, _) = makeSUT(platformResults: [platformUser()])
        await sut.load(forceNetwork: true)
        sut.searchQuery = "awa"
        await sut.searchQueryChanged()
        XCTAssertFalse(sut.platformResults.isEmpty)

        sut.searchQuery = ""
        await sut.searchQueryChanged()

        XCTAssertTrue(sut.platformResults.isEmpty)
        XCTAssertFalse(sut.isSearchingPlatform)
    }

    func test_search_platformFailure_leavesNoStaleResults() async {
        let (sut, _, _, _, users) = makeSUT(platformResults: [platformUser()])
        await sut.load(forceNetwork: true)
        users.searchUsersResult = .failure(URLError(.timedOut))

        sut.searchQuery = "awa"
        await sut.searchQueryChanged()

        XCTAssertTrue(sut.platformResults.isEmpty)
        XCTAssertFalse(sut.isSearchingPlatform)
    }

    func test_startConversation_fromAPlatformResult_opensDirectConversation() async {
        let (sut, _, _, creator, _) = makeSUT()

        let conversation = await sut.startConversation(withUserId: "p1")

        XCTAssertNotNil(conversation)
        XCTAssertEqual(creator.lastUserId, "p1")
    }

    // MARK: - Remplissage automatique à l'ouverture

    func test_load_emptyDirectoryWithContactsAlreadyAuthorized_fillsItSilently() async {
        let (sut, _, sync, _, _) = makeSUT(contactsAuthorization: .authorized)

        await sut.load(forceNetwork: true)

        // L'onglet ne doit pas s'ouvrir vide quand la permission est déjà là.
        XCTAssertEqual(sync.syncDirectoryCallCount, 1)
    }

    func test_load_emptyDirectoryWithoutContactPermission_neverPromptsForIt() async {
        let (sut, _, sync, _, _) = makeSUT(contactsAuthorization: .notDetermined)

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sync.syncDirectoryCallCount, 0)
        XCTAssertEqual(sync.requestAccessCallCount, 0)
    }

    func test_load_directoryAlreadyPopulated_doesNotResyncOnItsOwn() async {
        let (sut, _, sync, _, _) = makeSUT(contacts: [makeContact()], contactsAuthorization: .authorized)

        await sut.load(forceNetwork: true)

        XCTAssertEqual(sync.syncDirectoryCallCount, 0)
    }

    func test_load_twiceOnAnEmptyDirectory_onlyAttemptsTheAutomaticFillOnce() async {
        let (sut, _, sync, _, _) = makeSUT(contactsAuthorization: .authorized)

        await sut.load(forceNetwork: true)
        await sut.load(forceNetwork: true)

        XCTAssertEqual(sync.syncDirectoryCallCount, 1)
    }

    // MARK: - Sync

    func test_synchronize_readsDeviceBookInReplaceModeAndReloads() async {
        let (sut, directory, sync, _, _) = makeSUT(contacts: [makeContact()])
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
        let (sut, _, sync, _, _) = makeSUT(contacts: [makeContact()])
        await sut.load(forceNetwork: true)
        sync.syncDirectoryResult = .failure(ContactSyncError.accessDenied)

        await sut.synchronize()

        XCTAssertEqual(sut.contacts.count, 1)
    }

    func test_synchronize_whileAlreadySyncing_doesNotStartASecondRun() async {
        let (sut, _, sync, _, _) = makeSUT()

        async let first: Void = sut.synchronize()
        async let second: Void = sut.synchronize()
        _ = await (first, second)

        // Le garde `isSyncing` est posé avant toute suspension : le second
        // appel repart sans relire le carnet.
        XCTAssertEqual(sync.syncDirectoryCallCount, 1)
    }

    // MARK: - « Lui écrire »

    func test_startConversation_matchedContact_opensDirectConversation() async {
        let (sut, _, _, creator, _) = makeSUT()
        let contact = makeContact()

        let conversation = await sut.startConversation(with: contact)

        XCTAssertNotNil(conversation)
        XCTAssertEqual(creator.lastUserId, "user-contact-1")
        XCTAssertEqual(creator.createCallCount, 1)
    }

    func test_startConversation_unmatchedContact_doesNothing() async {
        let (sut, _, _, creator, _) = makeSUT()
        let contact = makeContact(onMeeshy: false)

        let conversation = await sut.startConversation(with: contact)

        XCTAssertNil(conversation)
        XCTAssertEqual(creator.createCallCount, 0)
    }

    func test_startConversation_creationFailure_returnsNil() async {
        let (sut, _, _, creator, _) = makeSUT()
        creator.result = .failure(URLError(.badServerResponse))

        let conversation = await sut.startConversation(with: makeContact())

        XCTAssertNil(conversation)
    }

    // MARK: - Erase

    func test_eraseDirectory_clearsServerAndLocalList() async {
        let (sut, directory, _, _, _) = makeSUT(contacts: [makeContact()])
        await sut.load(forceNetwork: true)

        await sut.eraseDirectory()

        XCTAssertEqual(directory.clearCallCount, 1)
        XCTAssertTrue(sut.contacts.isEmpty)
    }

    func test_eraseDirectory_failure_keepsTheDirectory() async {
        let (sut, directory, _, _, _) = makeSUT(contacts: [makeContact()])
        await sut.load(forceNetwork: true)
        directory.clearResult = .failure(URLError(.badServerResponse))

        await sut.eraseDirectory()

        XCTAssertEqual(sut.contacts.count, 1)
    }

    // MARK: - Invitation

    func test_invitationMessage_namesTheContact() {
        let (sut, _, _, _, _) = makeSUT()

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

// MARK: - Pagination complète du répertoire (2026-08-21 : au-delà de 200)

/// Service paginé par `offset` : `total` contacts, servis par tranches de
/// `limit`, avec ou sans `hasMore` côté serveur (le mock historique renvoie
/// `pagination: nil`, comme le fait le gateway sur certaines routes).
private final class PagedDirectoryStub: ContactDirectoryServiceProviding, @unchecked Sendable {
    let total: Int
    var listOffsets: [Int] = []
    init(total: Int) { self.total = total }

    func sync(_ request: DirectorySyncRequest) async throws -> DirectorySyncResult {
        DirectorySyncResult(totalContacts: 0, processedContacts: 0, syncedCount: 0, matchedCount: 0, removedCount: 0)
    }

    func list(offset: Int, limit: Int, filter: DirectoryFilter, query: String?) async throws
        -> OffsetPaginatedAPIResponse<[DirectoryContact]> {
        listOffsets.append(offset)
        let ids = Array(offset..<min(offset + limit, total))
        let page = ids.map {
            DirectoryContact(id: "c\($0)", contactKey: "k\($0)", displayName: "Contact \($0)", isOnMeeshy: false)
        }
        return OffsetPaginatedAPIResponse(success: true, data: page, pagination: nil, error: nil)
    }

    func clear() async throws -> DirectoryClearResult { DirectoryClearResult(removedCount: 0) }
}

final class DirectoryPagingTests: XCTestCase {

    func test_hasMore_trustsTheServer_whenItSpeaks() {
        XCTAssertTrue(DirectoryPaging.hasMore(received: 3, pageSize: 200, serverHasMore: true))
        XCTAssertFalse(DirectoryPaging.hasMore(received: 200, pageSize: 200, serverHasMore: false))
    }

    func test_hasMore_withoutServerHint_aFullPageAnnouncesAnother_aShortOneCloses() {
        XCTAssertTrue(DirectoryPaging.hasMore(received: 200, pageSize: 200, serverHasMore: nil))
        XCTAssertFalse(DirectoryPaging.hasMore(received: 199, pageSize: 200, serverHasMore: nil))
        XCTAssertFalse(DirectoryPaging.hasMore(received: 0, pageSize: 200, serverHasMore: true), "une page vide clôt toujours")
    }

    func test_listAll_readsEveryPage_pastTheOld200Cap() async throws {
        let stub = PagedDirectoryStub(total: 450)
        let all = try await stub.listAll(filter: .all, query: nil)
        XCTAssertEqual(all.count, 450, "450 contacts ⇒ 450 lignes, plus de plafond à 200")
        XCTAssertEqual(stub.listOffsets, [0, 200, 400])
        XCTAssertEqual(all.first?.id, "c0")
        XCTAssertEqual(all.last?.id, "c449")
    }

    func test_listAll_exactMultipleOfThePage_stopsOnTheEmptyPage_neverLoopsForever() async throws {
        let stub = PagedDirectoryStub(total: 400)
        let all = try await stub.listAll(filter: .all, query: nil)
        XCTAssertEqual(all.count, 400)
        XCTAssertEqual(stub.listOffsets.count, 3, "2 pages pleines + la page vide qui clôt")
    }

    func test_listAll_isCappedByMaxPages() async throws {
        let stub = PagedDirectoryStub(total: 10_000)
        let all = try await stub.listAll(filter: .all, query: nil, pageSize: 200, maxPages: 3)
        XCTAssertEqual(all.count, 600)
        XCTAssertEqual(stub.listOffsets.count, 3)
    }

    /// Le filet de lecture était calibré sur l'ÉCRITURE tronquée à 2 000 fiches
    /// (25 × 200 = 5 000). Depuis que la synchronisation part en lots sans
    /// plafond, un répertoire peut légitimement dépasser 5 000 — le filet doit
    /// rester un filet, jamais une troncature de fait.
    func test_maxPages_coversADirectoryFarBeyondTheOldFiveThousandCap() {
        XCTAssertEqual(DirectoryPaging.maxPages, 250)
        XCTAssertEqual(DirectoryPaging.maxPages * DirectoryPaging.pageSize, 50_000)
    }

    func test_listAll_defaultCap_readsWellPastFiveThousandContacts() async throws {
        let stub = PagedDirectoryStub(total: 6_000)
        let all = try await stub.listAll(filter: .all, query: nil)
        XCTAssertEqual(all.count, 6_000, "l'ancien plafond de 25 pages en perdait 1 000 en silence")
    }
}
