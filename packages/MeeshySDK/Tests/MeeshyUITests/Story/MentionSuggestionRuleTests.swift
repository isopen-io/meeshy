import Foundation
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// La règle PURE de la liste `@` (#7847) : à quelle ÉTAPE est une frappe, et
/// dans quel ORDRE se servent contacts, participants et autres.
@Suite("MentionSuggestionRule")
struct MentionSuggestionRuleTests {

    private func person(_ id: String, _ username: String, _ name: String? = nil) -> MentionCandidate {
        MentionCandidate(id: id, username: username, displayName: name ?? username.capitalized, avatarURL: nil)
    }

    // MARK: - stage(for:)

    @Test func test_stage_bareAt_isBare() {
        #expect(MentionLookupRule.stage(for: "") == .bare)
    }

    @Test func test_stage_blankOnly_isBare() {
        #expect(MentionLookupRule.stage(for: "  ") == .bare)
    }

    @Test func test_stage_oneLetter_isLocalFilter() {
        #expect(MentionLookupRule.stage(for: "a") == .localFilter)
    }

    @Test func test_stage_twoLetters_isRemote() {
        #expect(MentionLookupRule.stage(for: "al") == .remote)
    }

    @Test func test_stage_moreLetters_isRemote() {
        #expect(MentionLookupRule.stage(for: "alice") == .remote)
    }

    @Test func test_stage_remote_agreesWithQueriesRemote() {
        for query in ["", "a", "al", " a", "alic"] {
            #expect((MentionLookupRule.stage(for: query) == .remote) == MentionLookupRule.queriesRemote(query))
        }
    }

    // MARK: - ordered: l'ordre des groupes

    @Test func test_ordered_bareAt_servesContactsThenParticipants() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "zoe")],
            participants: [person("p1", "adam")],
            others: [],
            query: "",
            excludingUserId: nil
        )
        #expect(result.map(\.username) == ["zoe", "adam"])
    }

    @Test func test_ordered_remote_servesContactsThenParticipantsThenOthers() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alba")],
            participants: [person("p1", "alain")],
            others: [person("o1", "alex")],
            query: "al",
            excludingUserId: nil
        )
        #expect(result.map(\.username) == ["alba", "alain", "alex"])
    }

    @Test func test_ordered_oneLetter_neverServesOthers() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alba")],
            participants: [],
            others: [person("o1", "alex")],
            query: "a",
            excludingUserId: nil
        )
        #expect(result.map(\.username) == ["alba"])
    }

    @Test func test_ordered_bareAt_neverServesOthers() {
        let result = MentionSuggestionRule.ordered(
            contacts: [],
            participants: [],
            others: [person("o1", "alex")],
            query: "",
            excludingUserId: nil
        )
        #expect(result.isEmpty)
    }

    // MARK: - ordered: le filtre local

    @Test func test_ordered_filtersByUsernameOrDisplayName_caseInsensitive() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "zed", "Alice Martin"), person("c2", "bob")],
            participants: [person("p1", "ALINE")],
            others: [],
            query: "al",
            excludingUserId: nil
        )
        #expect(result.map(\.id) == ["c1", "p1"])
    }

    /// Affinage sans clignotement : un « autre » déjà rendu qui correspond
    /// toujours reste à l'écran, celui qui ne correspond plus s'en va.
    @Test func test_ordered_refiningQuery_keepsMatchingOthers_dropsTheRest() {
        let result = MentionSuggestionRule.ordered(
            contacts: [],
            participants: [],
            others: [person("o1", "alex"), person("o2", "alma")],
            query: "ale",
            excludingUserId: nil
        )
        #expect(result.map(\.id) == ["o1"])
    }

    // MARK: - ordered: sans doublon, sans soi

    @Test func test_ordered_personInSeveralGroups_appearsOnceInItsFirstGroup() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("u1", "alice")],
            participants: [person("u1", "alice"), person("u2", "alan")],
            others: [person("u1-bis", "Alice"), person("u2", "alan"), person("u3", "alfred")],
            query: "al",
            excludingUserId: nil
        )
        #expect(result.map(\.id) == ["u1", "u2", "u3"])
    }

    @Test func test_ordered_neverServesTheCurrentUser() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("me", "moi")],
            participants: [person("me", "moi"), person("p1", "paul")],
            others: [],
            query: "",
            excludingUserId: "me"
        )
        #expect(result.map(\.id) == ["p1"])
    }

    // MARK: - ordered: générique (UserSearchResult des surfaces SDK)

    @Test func test_ordered_worksOnUserSearchResults() {
        let contact = UserSearchResult(id: "c1", username: "alba", displayName: nil, avatar: nil)
        let other = UserSearchResult(id: "o1", username: "albert", displayName: "Albert", avatar: nil)
        let result = MentionSuggestionRule.ordered(
            contacts: [contact],
            participants: [],
            others: [other, contact],
            query: "alb",
            excludingUserId: nil,
            identity: MentionIdentity.init(userSearchResult:)
        )
        #expect(result.map(\.id) == ["c1", "o1"])
    }
}
