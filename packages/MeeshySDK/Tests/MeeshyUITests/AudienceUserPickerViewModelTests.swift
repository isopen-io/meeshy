import XCTest
@testable import MeeshyUI
import MeeshySDK

final class MockAudienceUserSearching: AudienceUserSearching, @unchecked Sendable {
    var stub: Result<[UserSearchResult], Error> = .success([])
    private(set) var callCount = 0
    private(set) var lastQuery: String?
    func searchUsers(query: String, limit: Int, offset: Int) async throws -> [UserSearchResult] {
        callCount += 1
        lastQuery = query
        return try stub.get()
    }
}

final class MockAudienceContacts: AudienceContactsProviding, @unchecked Sendable {
    var contacts: [UserSearchResult] = []
    func cachedContacts() async -> [UserSearchResult] { contacts }
}

final class AudienceUserPickerViewModelTests: XCTestCase {
    @MainActor
    func test_performSearch_populatesResults_excludingSelf() async {
        let mock = MockAudienceUserSearching()
        mock.stub = .success([
            UserSearchResult(id: "me", username: "me"),
            UserSearchResult(id: "u1", username: "ana"),
        ])
        let vm = AudienceUserPickerViewModel(initialSelection: [], currentUserId: "me", userService: mock)
        vm.query = "a"
        await vm.performSearch()
        XCTAssertEqual(vm.results.map(\.id), ["u1"])
        XCTAssertEqual(mock.callCount, 1)
        XCTAssertEqual(mock.lastQuery, "a")
    }

    @MainActor
    func test_performSearch_blankQuery_doesNotCallService() async {
        let mock = MockAudienceUserSearching()
        mock.stub = .success([UserSearchResult(id: "u1", username: "ana")])
        let vm = AudienceUserPickerViewModel(initialSelection: [], currentUserId: nil, userService: mock)
        vm.query = "   "
        await vm.performSearch()
        XCTAssertTrue(vm.results.isEmpty)
        XCTAssertEqual(mock.callCount, 0)
    }

    @MainActor
    func test_toggle_addsThenRemoves() {
        let vm = AudienceUserPickerViewModel(initialSelection: [], currentUserId: nil, userService: MockAudienceUserSearching())
        let u = UserSearchResult(id: "u1", username: "ana")
        vm.toggle(u)
        XCTAssertEqual(vm.selectedIds, ["u1"])
        XCTAssertTrue(vm.isSelected("u1"))
        XCTAssertEqual(vm.selectedUsers.map(\.id), ["u1"])
        vm.toggle(u)
        XCTAssertTrue(vm.selectedIds.isEmpty)
        XCTAssertFalse(vm.isSelected("u1"))
        XCTAssertTrue(vm.selectedUsers.isEmpty)
    }

    @MainActor
    func test_initialSelection_seedsSelectedIds() {
        let vm = AudienceUserPickerViewModel(initialSelection: ["x", "y"], currentUserId: nil, userService: MockAudienceUserSearching())
        XCTAssertEqual(vm.selectedIds, ["x", "y"])
    }

    // MARK: - Cache-first seeding

    @MainActor
    func test_loadInitialContacts_seedsResults_excludingSelf_whenQueryEmpty() async {
        let contacts = MockAudienceContacts()
        contacts.contacts = [
            UserSearchResult(id: "me", username: "me"),
            UserSearchResult(id: "u1", username: "ana"),
            UserSearchResult(id: "u2", username: "bob"),
        ]
        let vm = AudienceUserPickerViewModel(
            initialSelection: [], currentUserId: "me",
            userService: MockAudienceUserSearching(), contactsProvider: contacts
        )
        await vm.loadInitialContacts()
        XCTAssertEqual(vm.results.map(\.id), ["u1", "u2"])
    }

    @MainActor
    func test_performSearch_blankQuery_restoresCachedContacts() async {
        let contacts = MockAudienceContacts()
        contacts.contacts = [UserSearchResult(id: "u1", username: "ana")]
        let mock = MockAudienceUserSearching()
        let vm = AudienceUserPickerViewModel(
            initialSelection: [], currentUserId: nil,
            userService: mock, contactsProvider: contacts
        )
        await vm.loadInitialContacts()
        vm.query = "   "
        await vm.performSearch()
        XCTAssertEqual(vm.results.map(\.id), ["u1"])
        XCTAssertEqual(mock.callCount, 0)
    }

    @MainActor
    func test_performSearch_mergesCachedThenNetwork_deduplicated() async {
        let contacts = MockAudienceContacts()
        contacts.contacts = [UserSearchResult(id: "u1", username: "ana")]
        let mock = MockAudienceUserSearching()
        mock.stub = .success([
            UserSearchResult(id: "u1", username: "ana"),        // duplicate of cached
            UserSearchResult(id: "u2", username: "anabelle"),   // network-only
        ])
        let vm = AudienceUserPickerViewModel(
            initialSelection: [], currentUserId: nil,
            userService: mock, contactsProvider: contacts
        )
        await vm.loadInitialContacts()
        vm.query = "ana"
        await vm.performSearch()
        XCTAssertEqual(vm.results.map(\.id), ["u1", "u2"])
        XCTAssertEqual(mock.callCount, 1)
    }
}
