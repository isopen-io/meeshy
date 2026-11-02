import XCTest
@testable import Meeshy
import MeeshySDK

/// **#7847, #14053 — taper `@` montre d'abord ses contacts depuis le cache,
/// puis cherche les autres au réseau à la troisième lettre — dès la deuxième
/// si aucun contact ni participant ne correspond.** La matrice des directives
/// porteur du 2026-09-24 et du 2026-10-31, compteur d'appels réseau à l'appui.
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
        conversationType: String? = nil,
        interlocutorId: String? = nil,
        isMember: Bool = true,
        isGuest: Bool = false,
        servedMembers: ServedMembersLoader? = nil,
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
        if let conversationType {
            sut.scope(to: ConversationMentionTarget(conversationId: "conv-1", conversationType: conversationType,
                                                    interlocutorId: interlocutorId, isMember: isMember, isGuest: isGuest),
                      servedMembers: servedMembers)
        }
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

    // MARK: - 2 lettres → local s'il y a des correspondances locales, sinon 1 appel

    func test_handleQuery_twoLetters_withLocalMatches_makesZeroNetworkCall() async {
        let contacts = MockMentionContacts(snapshot: [person("c1", "alba")])
        let (sut, service, _) = makeSUT(
            contacts: contacts,
            participants: [person("p1", "alain")],
            remote: [suggestion("o1", "alex")]
        )

        sut.handleQuery(in: "@al")
        await settle()

        XCTAssertEqual(service.suggestionsCallCount, 0,
                       "deux lettres que le cache local porte déjà : le réseau attend la troisième")
        XCTAssertEqual(sut.suggestions.map(\.username), ["alba", "alain"])
    }

    func test_handleQuery_twoLetters_withoutLocalMatch_makesOneNetworkCall() async {
        let (sut, service, _) = makeSUT(
            contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]),
            participants: [person("p1", "bob")],
            remote: [suggestion("o1", "alex")]
        )

        sut.handleQuery(in: "@al")
        await waitUntil { sut.suggestions.count == 1 }

        XCTAssertEqual(service.suggestionsCallCount, 1)
        XCTAssertEqual(service.lastQuery, "al")
        XCTAssertEqual(sut.suggestions.map(\.username), ["alex"])
    }

    // MARK: - 3 lettres → 1 appel, le serveur APRÈS les locaux, dans son ordre

    func test_handleQuery_threeLetters_makesOneNetworkCall_andKeepsLocalsFirst() async {
        let contacts = MockMentionContacts(snapshot: [person("c1", "alix")])
        let (sut, service, _) = makeSUT(
            contacts: contacts,
            participants: [person("p1", "alissa")],
            remote: [suggestion("o1", "alicia"), suggestion("c1", "alix"), suggestion("p1", "alissa")]
        )

        sut.handleQuery(in: "@ali")
        await waitUntil { sut.suggestions.count == 3 }

        XCTAssertEqual(service.suggestionsCallCount, 1)
        XCTAssertEqual(service.lastQuery, "ali")
        XCTAssertEqual(sut.suggestions.map(\.username), ["alix", "alissa", "alicia"],
                       "contacts → participants → serveur, sans doublon")
    }

    /// Le serveur trouve aussi par prénom et nom : sa réponse se sert dans SON
    /// ordre, sans être refiltrée par le pseudo ou le nom affiché.
    func test_handleQuery_threeLetters_servesTheServerListInItsOrder_unfiltered() async {
        let (sut, _, _) = makeSUT(
            remote: [suggestion("o2", "zed"), suggestion("o1", "alicia"), suggestion("moi", "me")]
        )

        sut.handleQuery(in: "@ali")
        await waitUntil { sut.suggestions.count == 2 }

        XCTAssertEqual(sut.suggestions.map(\.username), ["zed", "alicia"], "jamais soi")
    }

    func test_handleQuery_threeLetters_inADraft_searchesTheDirectoryOnce() async {
        let (sut, service, annuaire) = makeSUT(
            context: .composerDraft,
            contacts: MockMentionContacts(snapshot: [person("c1", "alba")]),
            directory: [UserSearchResult(id: "o1", username: "albert")]
        )

        sut.handleQuery(in: "@alb")
        await waitUntil { sut.suggestions.count == 2 }

        XCTAssertEqual(annuaire.callCount, 1)
        XCTAssertEqual(service.suggestionsCallCount, 0)
        XCTAssertEqual(sut.suggestions.map(\.username), ["alba", "albert"])
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
        let (sut, _, _) = makeSUT(remote: [suggestion("o1", "alex"), suggestion("o2", "alma")])
        sut.handleQuery(in: "@al")
        await waitUntil { sut.suggestions.count == 2 }

        sut.handleQuery(in: "@ale")

        XCTAssertEqual(sut.suggestions.map(\.username), ["alex"],
                       "l'affinage est local et immédiat ; ni vide, ni ancienne liste")
    }

    func test_handleQuery_backToOneLetter_dropsTheOthers() async {
        let (sut, _, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "alba")]),
                                  remote: [suggestion("o1", "albert")])
        sut.handleQuery(in: "@alb")
        await waitUntil { sut.suggestions.count == 2 }

        sut.handleQuery(in: "@a")

        XCTAssertEqual(sut.suggestions.map(\.username), ["alba"], "une lettre : la liste redevient locale")
    }

    func test_handleQuery_backToTwoLetters_withALocalMatch_dropsTheOthers() async {
        let (sut, _, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "alba")]),
                                  remote: [suggestion("o1", "albert")])
        sut.handleQuery(in: "@alb")
        await waitUntil { sut.suggestions.count == 2 }

        sut.handleQuery(in: "@al")

        XCTAssertEqual(sut.suggestions.map(\.username), ["alba"],
                       "deux lettres qu'un contact porte : la liste redevient locale")
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

    // MARK: - #14071 — une suggestion sans effet ne s'affiche pas

    func test_handleQuery_group_hidesTheContactAndTheHistoryAuthors_theServerServesTheMembers() async {
        let (sut, service, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]),
                                        participants: [person("p1", "zora")], conversationType: "group",
                                        remote: [suggestion("m1", "zola")])

        sut.handleQuery(in: "@")
        XCTAssertTrue(sut.suggestions.isEmpty,
                      "zoé n'est pas membre, zora a écrit ici mais peut être partie : aucune n'est proposée en local")

        sut.handleQuery(in: "@zo")
        await waitUntil { service.suggestionsCallCount == 1 }
        await waitUntil { sut.suggestions.map(\.username) == ["zola"] }
    }

    func test_handleQuery_direct_offersTheInterlocutorEvenBeforeHeWrote() {
        let contacts = MockMentionContacts(snapshot: [person("c1", "zoe"), person("peer", "paul")])
        let (sut, _, _) = makeSUT(contacts: contacts, conversationType: "direct", interlocutorId: "peer")

        sut.handleQuery(in: "@")

        XCTAssertEqual(sut.suggestions.map(\.username), ["paul"])
    }

    func test_handleQuery_group_contactOutsideMembers_doesNotHoldBackTheEarlyRemoteLookup() async {
        let (sut, service, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]),
                                        conversationType: "group", remote: [suggestion("m1", "zola")])

        sut.handleQuery(in: "@zo")
        await waitUntil { service.suggestionsCallCount == 1 }
        await waitUntil { sut.suggestions.map(\.username) == ["zola"] }
    }

    func test_handleQuery_unknownConversationType_showsNobody() {
        let (sut, _, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("p1", "adam")]),
                                  participants: [person("p1", "adam")], conversationType: "channel")

        sut.handleQuery(in: "@")

        XCTAssertTrue(sut.suggestions.isEmpty)
    }

    // MARK: - #14066 — un non-membre ne cite personne

    func test_handleQuery_nonMemberOfAPublicConversation_showsNobody_andAsksNothing() async {
        let (sut, service, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]),
                                        conversationType: "public", isMember: false,
                                        remote: [suggestion("m1", "zola")])

        sut.handleQuery(in: "@zol")
        await settle()

        XCTAssertTrue(sut.suggestions.isEmpty)
        XCTAssertEqual(service.suggestionsCallCount, 0, "la passerelle refuserait la recherche : rien ne part")
    }

    func test_target_withoutServedRole_isNotAMember_butAGuestSessionIs() {
        let publicRow = MeeshyConversation(id: "c-pub", identifier: "c-pub", type: .public)
        XCTAssertFalse(ConversationMentionScope.target(for: publicRow, anonymousSession: nil).isMember)
        let memberRow = MeeshyConversation(id: "c-pub", identifier: "c-pub", type: .public, currentUserRole: "member")
        XCTAssertTrue(ConversationMentionScope.target(for: memberRow, anonymousSession: nil).isMember)
        XCTAssertEqual(ConversationMentionScope.target(for: nil, anonymousSession: nil), .unknown)
    }

    // MARK: - #14071 — la réponse à une pièce prend la portée de SA conversation

    func test_apply_withoutTarget_failsClosed() {
        let (sut, _, _) = makeSUT(context: .composerDraft, contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]))

        ConversationMentionScope.apply(nil, to: sut, servedMembers: { _ in [] })
        sut.handleQuery(in: "@")

        XCTAssertTrue(sut.suggestions.isEmpty)
    }

    func test_apply_withTarget_asksTheConversationAndKeepsItsMembers() async {
        let (sut, service, annuaire) = makeSUT(context: .composerDraft,
                                               contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]),
                                               remote: [suggestion("m1", "zola")])
        let target = ConversationMentionTarget(conversationId: "conv-9", conversationType: "group",
                                               interlocutorId: nil, isMember: true, isGuest: false)

        ConversationMentionScope.apply(target, to: sut, servedMembers: { _ in [] })
        sut.handleQuery(in: "@zo")
        await waitUntil { service.suggestionsCallCount == 1 }

        XCTAssertEqual(service.lastContextId, "conv-9")
        XCTAssertEqual(annuaire.callCount, 0, "l'annuaire n'est pas la portée d'un groupe")
        await waitUntil { sut.suggestions.map(\.username) == ["zola"] }
    }

    // MARK: - Les membres SERVIS, l'invité, et le rang absent de la ligne

    func test_handleQuery_group_offersTheServedMembers_neverTheHistoryAuthors() async {
        let contacts = MockMentionContacts(snapshot: [person("m1", "mila"), person("c1", "zoe")])
        let (sut, _, _) = makeSUT(contacts: contacts, participants: [person("gone", "gaston")],
                                  conversationType: "group", servedMembers: { _ in ["m1", "m2"] })

        sut.handleQuery(in: "@")

        await waitUntil { sut.suggestions.map(\.username) == ["mila"] }
    }

    func test_handleQuery_guestInAGroup_citesTheThreadAuthors_withoutTheNetwork() async {
        let (sut, service, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("c1", "zoe")]),
                                        participants: [person("a1", "alice")],
                                        conversationType: "group", isGuest: true)

        sut.handleQuery(in: "@al")
        await settle()

        XCTAssertEqual(sut.suggestions.map(\.username), ["alice"])
        XCTAssertEqual(service.suggestionsCallCount, 0, "la passerelle refuse la recherche à un invité")
    }

    func test_handleQuery_rowWithoutRole_isProvenMemberByTheServedParticipants() async {
        let (sut, _, _) = makeSUT(contacts: MockMentionContacts(snapshot: [person("m1", "mila")]),
                                  conversationType: "public", isMember: false,
                                  servedMembers: { _ in ["moi", "m1"] })

        sut.handleQuery(in: "@")

        await waitUntil { sut.suggestions.map(\.username) == ["mila"] }
    }
}
