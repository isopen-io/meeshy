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

    // MARK: - stage(for:localMatchCount:) — miroir de `mentionLookupStage` (#14053)

    @Test func test_stage_bareAt_isLocal_evenWithoutLocalMatch() {
        #expect(MentionLookupRule.stage(for: "", localMatchCount: 0) == .local)
    }

    @Test func test_stage_blankOnly_isLocal() {
        #expect(MentionLookupRule.stage(for: "  ", localMatchCount: 0) == .local)
    }

    @Test func test_stage_oneLetter_isLocal_evenWithoutLocalMatch() {
        #expect(MentionLookupRule.stage(for: "a", localMatchCount: 0) == .local)
    }

    @Test func test_stage_twoLetters_withLocalMatches_isLocal() {
        #expect(MentionLookupRule.stage(for: "al", localMatchCount: 2) == .local)
    }

    @Test func test_stage_twoLetters_withoutLocalMatch_isRemote() {
        #expect(MentionLookupRule.stage(for: "al", localMatchCount: 0) == .remote)
    }

    @Test func test_stage_threeLetters_isRemote_whateverTheLocalMatches() {
        #expect(MentionLookupRule.stage(for: "ali", localMatchCount: 5) == .remote)
        #expect(MentionLookupRule.stage(for: "ali", localMatchCount: 0) == .remote)
    }

    @Test func test_stage_blanksDoNotCount() {
        #expect(MentionLookupRule.stage(for: " al ", localMatchCount: 1) == .local)
        #expect(MentionLookupRule.stage(for: " a ", localMatchCount: 0) == .local)
    }

    @Test func test_stage_thresholds_areThoseOfTheSharedLaw() {
        #expect(MentionLookupRule.remoteMinimumLength == 3)
        #expect(MentionLookupRule.remoteEarlyLength == 2)
    }

    // MARK: - localMatches

    @Test func test_localMatches_contactsThenParticipants_filtered_withoutSelfNorDuplicate() {
        let result = MentionSuggestionRule.localMatches(
            contacts: [person("c1", "alba"), person("me", "alfa"), person("c2", "bob")],
            participants: [person("c1", "alba"), person("p1", "alain")],
            query: "al",
            excludingUserId: "me"
        )
        #expect(result.map(\.id) == ["c1", "p1"])
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

    @Test func test_ordered_twoLetters_withLocalMatches_staysLocal() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alba")],
            participants: [person("p1", "alain")],
            others: [person("o1", "alex")],
            othersQuery: "al",
            query: "al",
            excludingUserId: nil
        )
        #expect(result.map(\.username) == ["alba", "alain"],
                "deux lettres avec des correspondances locales : la liste reste locale")
    }

    @Test func test_ordered_threeLetters_servesLocalsThenOthers() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alix")],
            participants: [person("p1", "alissa")],
            others: [person("o1", "alicia")],
            query: "ali",
            excludingUserId: nil
        )
        #expect(result.map(\.username) == ["alix", "alissa", "alicia"])
    }

    @Test func test_ordered_twoLetters_withoutLocalMatch_servesOthers() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "zoe")],
            participants: [person("p1", "bob")],
            others: [person("o1", "alex")],
            query: "al",
            excludingUserId: nil
        )
        #expect(result.map(\.username) == ["alex"])
    }

    /// Le serveur trouve aussi par prénom et nom, que l'identité locale ne
    /// porte pas : sa réponse à la requête courante se sert dans SON ordre,
    /// sans être refiltrée.
    @Test func test_ordered_othersAnsweringTheCurrentQuery_areServedInServerOrder_unfiltered() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alix")],
            participants: [],
            others: [person("o2", "zed", "Zed"), person("o1", "alicia"), person("c1", "alix")],
            othersQuery: "ali",
            query: "ali",
            excludingUserId: nil
        )
        #expect(result.map(\.id) == ["c1", "o2", "o1"])
    }

    @Test func test_ordered_oneLetter_neverServesOthers() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alba")],
            participants: [],
            others: [person("o1", "alex")],
            othersQuery: "a",
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
            query: "ali",
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
            othersQuery: "al",
            query: "ale",
            excludingUserId: nil
        )
        #expect(result.map(\.id) == ["o1"])
    }

    // MARK: - ordered: sans doublon, sans soi

    @Test func test_ordered_personInSeveralGroups_appearsOnceInItsFirstGroup() {
        let result = MentionSuggestionRule.ordered(
            contacts: [person("u1", "alice")],
            participants: [person("u1", "alice"), person("u2", "alicia")],
            others: [person("u1-bis", "Alice"), person("u2", "alicia"), person("u3", "alix")],
            othersQuery: "ali",
            query: "ali",
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

    // MARK: - reach — une suggestion sans effet ne s'affiche pas (#14071)

    @Test func test_scope_mirrorsTheGatewayTable() {
        #expect(MentionableScope(conversationType: "direct") == .interlocutor)
        #expect(MentionableScope(conversationType: "group") == .members)
        #expect(MentionableScope(conversationType: "public") == .directory)
        #expect(MentionableScope(conversationType: "global") == .directory)
        #expect(MentionableScope(conversationType: "broadcast") == .directory)
        #expect(MentionableScope(conversationType: "channel") == nil)
        #expect(MentionableScope(conversationType: nil) == nil)
    }

    @Test func test_reach_nonMember_hasNoScope() {
        let reach = MentionReach(conversationType: "public", isMember: false, memberIds: ["a"])
        #expect(reach.scope == nil)
    }

    @Test func test_ordered_group_dropsLocalContactOutsideMembers_keepsServer() {
        let reach = MentionReach(conversationType: "group", memberIds: ["me", "p1"])
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alba"), person("p1", "albert")],
            participants: [],
            others: [person("o1", "alberto")],
            othersQuery: "alb",
            query: "alb",
            excludingUserId: "me",
            reach: reach
        )
        #expect(result.map(\.id) == ["p1", "o1"])
    }

    @Test func test_localMatches_direct_keepsOnlyTheInterlocutor_andCountsOnlyHim() {
        let reach = MentionReach(conversationType: "direct", memberIds: ["me", "p1"])
        let result = MentionSuggestionRule.localMatches(
            contacts: [person("c1", "alba"), person("p1", "albert")],
            participants: [],
            query: "al",
            excludingUserId: "me",
            reach: reach
        )
        #expect(result.map(\.id) == ["p1"])
    }

    @Test func test_ordered_withoutScope_showsNothing_evenFromServer() {
        let reach = MentionReach(scope: nil, memberIds: ["p1"])
        let result = MentionSuggestionRule.ordered(
            contacts: [person("p1", "albert")],
            participants: [],
            others: [person("o1", "alberto")],
            othersQuery: "alb",
            query: "alb",
            excludingUserId: "me",
            reach: reach
        )
        #expect(result.isEmpty)
    }

    @Test func test_ordered_publicConversation_keepsEveryone() {
        let reach = MentionReach(conversationType: "public", memberIds: ["me"])
        let result = MentionSuggestionRule.ordered(
            contacts: [person("c1", "alba")],
            participants: [],
            others: [],
            query: "",
            excludingUserId: "me",
            reach: reach
        )
        #expect(result.map(\.id) == ["c1"])
    }
}
