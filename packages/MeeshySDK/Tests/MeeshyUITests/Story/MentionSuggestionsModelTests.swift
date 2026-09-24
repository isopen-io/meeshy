import XCTest
@testable import MeeshyUI
import MeeshySDK

private final class WarmingContacts: AudienceContactsProviding, @unchecked Sendable {
    var cached: [UserSearchResult] = []
    var refreshed: [UserSearchResult]?
    private(set) var refreshCount = 0
    func cachedContacts() async -> [UserSearchResult] { cached }
    func refreshedContacts() async -> [UserSearchResult]? {
        refreshCount += 1
        return refreshed
    }
}

/// #7847 — la matrice de la frappe `@` sur les surfaces SDK (mood, éditeur de
/// texte de story, composer unifié, feuille « Mentionner »).
@MainActor
final class MentionSuggestionsModelTests: XCTestCase {

    private func user(_ id: String, _ username: String) -> UserSearchResult {
        UserSearchResult(id: id, username: username)
    }

    private func makeSUT(
        contacts: [UserSearchResult] = [],
        refreshed: [UserSearchResult]? = nil,
        directory: [UserSearchResult] = []
    ) -> (sut: MentionSuggestionsModel, search: MockAudienceUserSearching, provider: WarmingContacts) {
        let search = MockAudienceUserSearching()
        search.stub = .success(directory)
        let provider = WarmingContacts()
        provider.cached = contacts
        provider.refreshed = refreshed
        let sut = MentionSuggestionsModel(currentUserId: "me", userService: search,
                                          contactsProvider: provider, debounce: .milliseconds(10))
        return (sut, search, provider)
    }

    private func waitUntil(_ condition: () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        let deadline = Date().addingTimeInterval(5)
        while !condition(), Date() < deadline { try? await Task.sleep(nanoseconds: 10_000_000) }
        XCTAssertTrue(condition(), file: file, line: line)
    }

    func test_update_bareAt_servesContacts_withoutNetwork() async {
        let (sut, search, _) = makeSUT(contacts: [user("c1", "zoe"), user("me", "moi")])
        await sut.loadContactsIfNeeded()
        sut.update(query: "")
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.candidates.map(\.id), ["c1"])
        XCTAssertEqual(search.callCount, 0)
    }

    func test_update_oneLetter_filtersLocally_withoutNetwork() async {
        let (sut, search, _) = makeSUT(contacts: [user("c1", "zoe"), user("c2", "bob")])
        await sut.loadContactsIfNeeded()
        sut.update(query: "z")
        try? await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(sut.candidates.map(\.id), ["c1"])
        XCTAssertEqual(search.callCount, 0)
    }

    func test_update_twoLetters_searchesOnce_andAppendsOthersAfterContacts() async {
        let (sut, search, _) = makeSUT(contacts: [user("c1", "alba")],
                                       directory: [user("o1", "alex"), user("c1", "alba")])
        await sut.loadContactsIfNeeded()
        sut.update(query: "al")
        await waitUntil { sut.candidates.count == 2 }
        XCTAssertEqual(sut.candidates.map(\.id), ["c1", "o1"])
        XCTAssertEqual(search.callCount, 1)
    }

    func test_update_rapidKeystrokes_debounceToASingleSearch() async {
        let (sut, search, _) = makeSUT(directory: [user("o1", "alexandre")])
        await sut.loadContactsIfNeeded()
        sut.update(query: "al")
        sut.update(query: "ale")
        sut.update(query: "alex")
        await waitUntil { !sut.candidates.isEmpty }
        XCTAssertEqual(search.callCount, 1)
        XCTAssertEqual(search.lastQuery, "alex")
    }

    /// Sans clignotement : pendant que la recherche suivante est en vol, les
    /// autres déjà trouvés qui correspondent toujours restent affichés.
    func test_update_refining_keepsKnownOthersWhileTheNextSearchIsPending() async {
        let (sut, _, _) = makeSUT(directory: [user("o1", "alex"), user("o2", "alma")])
        await sut.loadContactsIfNeeded()
        sut.update(query: "al")
        await waitUntil { sut.candidates.count == 2 }
        sut.update(query: "ale")
        XCTAssertEqual(sut.candidates.map(\.id), ["o1"])
    }

    func test_loadContacts_emptyCache_isWarmedByTheProvider() async {
        let (sut, _, provider) = makeSUT(contacts: [], refreshed: [user("c1", "zoe")])
        sut.update(query: "")
        await sut.loadContactsIfNeeded()
        XCTAssertEqual(provider.refreshCount, 1)
        XCTAssertEqual(sut.candidates.map(\.id), ["c1"])
    }

    func test_loadContacts_injectedProvider_replacesTheDefault() async {
        let (sut, _, _) = makeSUT(contacts: [user("c1", "zoe")])
        let injected = WarmingContacts()
        injected.cached = [user("c9", "yann")]
        await sut.loadContactsIfNeeded(provider: injected)
        sut.update(query: "")
        XCTAssertEqual(sut.candidates.map(\.id), ["c9"])
    }
}
