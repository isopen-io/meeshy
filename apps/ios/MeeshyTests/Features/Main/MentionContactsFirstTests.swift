import XCTest
@testable import Meeshy
import MeeshySDK

/// **#7847 — taper `@` montre d'abord ses contacts depuis le cache, puis
/// cherche les autres au réseau dès la deuxième lettre.** La matrice de la
/// directive porteur du 2026-09-24, compteur d'appels réseau à l'appui.
@MainActor
final class MentionContactsFirstTests: XCTestCase {

    private func person(_ id: String, _ username: String, _ name: String? = nil) -> MentionCandidate {
        MentionCandidate(id: id, username: username, displayName: name ?? username.capitalized, avatarURL: nil)
    }

    private func suggestion(_ id: String, _ username: String) -> MentionSuggestion {
        MentionSuggestion(id: id, username: username, displayName: username.capitalized,
                          avatar: nil, badge: nil, inConversation: nil, isFriend: nil)
    }

    private func makeSUT(
        context: MentionComposerController.Context = .conversation(id: "conv-1"),
        contacts: MockMentionContacts = MockMentionContacts(),
        participants: [MentionCandidate] = [],
        remote: [MentionSuggestion] = [],
        directory: [UserSearchResult] = []
    ) -> (sut: MentionComposerController, service: MockMentionService, annuaire: MockUserDirectorySearch) {
        let service = MockMentionService()
        service.suggestionsResult = .success(remote)
        let annuaire = MockUserDirectorySearch()
        annuaire.result = .success(directory)
        let sut = MentionComposerController(
            context: context,
            participants: { participants },
            service: service,
            directory: annuaire,
            contacts: contacts,
            currentUserId: "moi",
            debounceNanoseconds: 20_000_000
        )
        return (sut, service, annuaire)
    }

    private func settle(_ nanoseconds: UInt64 = 120_000_000) async {
        try? await Task.sleep(nanoseconds: nanoseconds)
    }

    private func waitUntil(_ condition: () -> Bool, file: StaticString = #filePath, line: UInt = #line) async {
        let deadline = Date().addingTimeInterval(10)
        while !condition(), Date() < deadline { try? await Task.sleep(nanoseconds: 10_000_000) }
        XCTAssertTrue(condition(), file: file, line: line)
    }

    // MARK: - `@` → 0 appel, contacts puis participants, immédiatement

    func test_handleQuery_bareAt_servesContactsThenParticipants_immediately() {
        let contacts = MockMentionContacts(snapshot: [person("c1", "zoe")])
        let (sut, _, _) = makeSUT(contacts: contacts, participants: [person("p1", "adam")])

        sut.handleQuery(in: "Salut @")

        XCTAssertEqual(sut.suggestions.map(\.username), ["zoe", "adam"],
                       "les contacts d'abord, puis les participants — sans attendre quoi que ce soit")
    }

    func test_handleQuery_bareAt_makesZeroNetworkCall() async {
        let (sut, service, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]))

        sut.handleQuery(in: "@")
        await settle()

        XCTAssertEqual(service.suggestionsCallCount, 0)
    }

    func test_handleQuery_bareAt_warmsAnEmptyContactsCache() async {
        let contacts = MockMentionContacts(cached: [], refreshed: [person("c1", "zoe")])
        let (sut, _, _) = makeSUT(contacts: contacts, participants: [person("p1", "adam")])

        sut.handleQuery(in: "@")
        await waitUntil { sut.suggestions.count == 2 }

        XCTAssertEqual(contacts.refreshCallCount, 1, "le `@` réchauffe le cache des contacts")
        XCTAssertEqual(sut.suggestions.map(\.username), ["zoe", "adam"])
    }

    func test_handleQuery_bareAt_readsTheDiskCacheWhenMemoryIsEmpty() async {
        let contacts = MockMentionContacts(cached: [person("c1", "zoe")])
        let (sut, _, _) = makeSUT(contacts: contacts)

        sut.handleQuery(in: "@")
        await waitUntil { !sut.suggestions.isEmpty }

        XCTAssertEqual(contacts.loadCachedCallCount, 1)
        XCTAssertEqual(sut.suggestions.map(\.username), ["zoe"])
    }

    func test_handleQuery_furtherLetters_doNotWarmAgain() async {
        let contacts = MockMentionContacts(snapshot: [person("c1", "zoe")])
        let (sut, _, _) = makeSUT(contacts: contacts)

        sut.handleQuery(in: "@")
        sut.handleQuery(in: "@z")
        sut.handleQuery(in: "@zo")
        await settle()

        XCTAssertEqual(contacts.refreshCallCount, 1, "un seul réchauffement par ouverture de la liste")
    }

    // MARK: - 1 lettre → 0 appel, filtre local

    func test_handleQuery_oneLetter_filtersLocally_withZeroNetworkCall() async {
        let contacts = MockMentionContacts(snapshot: [person("c1", "zoe"), person("c2", "bob")])
        let (sut, service, _) = makeSUT(contacts: contacts, participants: [person("p1", "zack")])

        sut.handleQuery(in: "@z")
        await settle()

        XCTAssertEqual(sut.suggestions.map(\.username), ["zoe", "zack"])
        XCTAssertEqual(service.suggestionsCallCount, 0)
    }

    // MARK: - 2 lettres → 1 appel, les autres APRÈS les locaux

    func test_handleQuery_twoLetters_makesOneNetworkCall_andKeepsLocalsFirst() async {
        let contacts = MockMentionContacts(snapshot: [person("c1", "alba")])
        let (sut, service, _) = makeSUT(
            contacts: contacts,
            participants: [person("p1", "alain")],
            remote: [suggestion("o1", "alex"), suggestion("c1", "alba"), suggestion("p1", "alain")]
        )

        sut.handleQuery(in: "@al")
        await waitUntil { sut.suggestions.count == 3 }

        XCTAssertEqual(service.suggestionsCallCount, 1)
        XCTAssertEqual(service.lastQuery, "al")
        XCTAssertEqual(sut.suggestions.map(\.username), ["alba", "alain", "alex"],
                       "contacts → participants → autres, sans doublon")
    }

    func test_handleQuery_twoLetters_inADraft_searchesTheDirectoryOnce() async {
        let (sut, service, annuaire) = makeSUT(
            context: .composerDraft,
            contacts: MockMentionContacts(snapshot: [person("c1", "alba")]),
            directory: [UserSearchResult(id: "o1", username: "alex")]
        )

        sut.handleQuery(in: "@al")
        await waitUntil { sut.suggestions.count == 2 }

        XCTAssertEqual(annuaire.callCount, 1)
        XCTAssertEqual(service.suggestionsCallCount, 0)
        XCTAssertEqual(sut.suggestions.map(\.username), ["alba", "alex"])
    }

    // MARK: - lettres suivantes → affinage local instantané + débounce

    func test_handleQuery_rapidTyping_debouncesToASingleCall() async {
        let (sut, service, _) = makeSUT(remote: [suggestion("o1", "alexandre")])

        sut.handleQuery(in: "@al")
        sut.handleQuery(in: "@ale")
        sut.handleQuery(in: "@alex")
        await waitUntil { !sut.suggestions.isEmpty }
        await settle()

        XCTAssertEqual(service.suggestionsCallCount, 1)
        XCTAssertEqual(service.lastQuery, "alex")
    }

    func test_handleQuery_eachPausedLetter_relaunchesTheSearch() async {
        let (sut, service, _) = makeSUT(remote: [suggestion("o1", "alexandre")])

        sut.handleQuery(in: "@al")
        await waitUntil { service.suggestionsCallCount == 1 }
        sut.handleQuery(in: "@ale")
        await waitUntil { service.suggestionsCallCount == 2 }

        XCTAssertEqual(service.lastQuery, "ale")
    }

    /// Sans clignotement : la frappe suivante affine À L'INSTANT ce qui est
    /// déjà affiché, sans le vider pendant que la recherche est en vol.
    func test_handleQuery_refining_keepsKnownResultsWhileTheNextSearchIsPending() async {
        let contacts = MockMentionContacts(snapshot: [person("c1", "alba")])
        let (sut, _, _) = makeSUT(contacts: contacts,
                                  remote: [suggestion("o1", "alex"), suggestion("o2", "alma")])
        sut.handleQuery(in: "@al")
        await waitUntil { sut.suggestions.count == 3 }

        sut.handleQuery(in: "@ale")

        XCTAssertEqual(sut.suggestions.map(\.username), ["alex"],
                       "l'affinage est local et immédiat ; ni vide, ni ancienne liste")
    }

    func test_handleQuery_backToOneLetter_dropsTheOthers() async {
        let (sut, _, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "alba")]),
                                  remote: [suggestion("o1", "alex")])
        sut.handleQuery(in: "@al")
        await waitUntil { sut.suggestions.count == 2 }

        sut.handleQuery(in: "@a")

        XCTAssertEqual(sut.suggestions.map(\.username), ["alba"], "une lettre : la liste redevient locale")
    }

    // MARK: - Participants vivants et soi

    func test_updateParticipants_recomposesTheOpenList() {
        let (sut, _, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]))
        sut.handleQuery(in: "@")

        sut.updateParticipants([person("p1", "adam"), person("c1", "zoe")])

        XCTAssertEqual(sut.suggestions.map(\.username), ["zoe", "adam"])
    }

    func test_handleQuery_neverProposesTheCurrentUser() {
        let (sut, _, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("moi", "me")]),
                                  participants: [person("moi", "me"), person("p1", "adam")])

        sut.handleQuery(in: "@")

        XCTAssertEqual(sut.suggestions.map(\.username), ["adam"])
    }

    func test_primeContacts_readsTheCacheWithoutWarming() async {
        let contacts = MockMentionContacts(cached: [person("c1", "zoe")])
        let (sut, _, _) = makeSUT(contacts: contacts)

        await sut.primeContacts()
        sut.handleQuery(in: "@")

        XCTAssertEqual(contacts.refreshCallCount, 0, "amorcer au montage ne coûte aucun réseau")
        XCTAssertEqual(sut.suggestions.map(\.username), ["zoe"], "…et le `@` sert les contacts à l'instant")
    }
}
