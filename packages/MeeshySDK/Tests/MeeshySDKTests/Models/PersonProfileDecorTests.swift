import XCTest
@testable import MeeshySDK

/// #10945 — chaque résumé de personne servi par la passerelle porte son contour équipé
/// (`profileDecor.avatarRing`, la forme des participants) : auteur de post, de commentaire et de
/// story, résultat de recherche, demande d'ami, membre de communauté, suggestion de mention,
/// contact rapproché, dernier expéditeur. Décodage ADDITIF et TOLÉRANT : absent ⇒ `nil`, illisible
/// ⇒ jamais d'échec du résumé entier.
final class PersonProfileDecorTests: XCTestCase {

    private let ring = ServedProfileDecorItem(pack: "contours-essentiels", item: "filet", origin: .builtin)
    private let decor = #","profileDecor":{"avatarRing":{"pack":"contours-essentiels","item":"filet","origin":"builtin","contract":null}}"#
    private let broken = #","profileDecor":"cassé""#

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    private func assertCarries<T: Decodable & ProfileDecorWearer>(_ type: T.Type, base: String, file: StaticString = #filePath, line: UInt = #line) throws {
        XCTAssertEqual(try decode(T.self, "{\(base)\(decor)}").avatarRing, ring, file: file, line: line)
        XCTAssertNil(try decode(T.self, "{\(base)}").avatarRing, file: file, line: line)
        XCTAssertNil(try decode(T.self, "{\(base)\(broken)}").avatarRing, file: file, line: line)
    }

    func test_postCommentAndStoryAuthor_carryTheirRing() throws {
        try assertCarries(APIAuthor.self, base: #""id":"u1","username":"ana""#)
    }

    func test_userSearchResult_carriesItsRing() throws {
        try assertCarries(UserSearchResult.self, base: #""id":"u1","username":"ana""#)
    }

    func test_friendRequestParty_carriesItsRing() throws {
        try assertCarries(FriendRequestUser.self, base: #""id":"u1","username":"ana""#)
    }

    func test_communityMember_carriesItsRing() throws {
        try assertCarries(APICommunityUser.self, base: #""id":"u1","username":"ana""#)
    }

    func test_mentionSuggestion_carriesItsRing() throws {
        try assertCarries(MentionSuggestion.self, base: #""id":"u1","username":"ana""#)
    }

    func test_matchedContact_carriesItsRing() throws {
        try assertCarries(MatchedContactUser.self, base: #""id":"u1","username":"ana""#)
    }

    func test_lastMessageSender_carriesItsRing() throws {
        try assertCarries(APIConversationUser.self, base: #""id":"p1""#)
    }

    func test_messageSender_isAWearerToo() throws {
        try assertCarries(APIMessageSender.self, base: #""id":"p1""#)
    }

    func test_aCachedAuthor_roundTripsItsRing() throws {
        let author = APIAuthor(id: "u1", username: "ana", displayName: nil, avatar: nil, profileDecor: ServedProfileDecor(avatarRing: ring))
        let decoded = try JSONDecoder().decode(APIAuthor.self, from: JSONEncoder().encode(author))
        XCTAssertEqual(decoded.avatarRing, ring)
    }

    func test_aFriendRequestParty_whoseRingChanged_isNotEqualToItsFormerSelf() {
        let before = FriendRequestUser(id: "u1", username: "ana")
        let after = FriendRequestUser(id: "u1", username: "ana", profileDecor: ServedProfileDecor(avatarRing: ring))
        XCTAssertNotEqual(before, after)
    }
}
