import XCTest
@testable import MeeshySDK

/// #10006 — l'entrée World Wide : `GET /world` dit où entrer, la porte
/// canonique `POST /links/:key/members` fait entrer un invité par la clé SERVIE,
/// jamais par un identifiant écrit en dur.
final class WorldServiceTests: XCTestCase {

    private func makeSUT() -> (sut: WorldService, api: MockAPIClient) {
        let api = MockAPIClient()
        return (WorldService(api: api), api)
    }

    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try JSONDecoder().decode(T.self, from: Data(json.utf8))
    }

    // MARK: - GET /world

    func test_fetchWorldEntry_callsWorldEndpoint_andReturnsServedEntry() async throws {
        let (sut, api) = makeSUT()
        let entry = WorldEntry(identifier: "world", title: "World Wide", shareLinkIdentifier: "lien-servi", memberCount: 199, memberCountCapped: true)
        api.stub("/world", result: APIResponse<WorldEntry>(success: true, data: entry, error: nil))

        let result = try await sut.fetchWorldEntry()

        XCTAssertEqual(api.lastRequest?.endpoint, "/world")
        XCTAssertEqual(api.lastRequest?.method, "GET")
        XCTAssertEqual(result, entry)
    }

    func test_worldEntry_decodesServedShape_withoutCapFlag() throws {
        let entry = try decode(WorldEntry.self, #"{"identifier":"world","title":"World Wide","shareLinkIdentifier":"lien-servi","memberCount":42}"#)
        XCTAssertEqual(entry.shareLinkIdentifier, "lien-servi")
        XCTAssertEqual(entry.memberCountCapped, nil)
        XCTAssertEqual(entry.formattedMemberCount, "42")
    }

    func test_worldEntry_withoutAvatarOrBanner_decodesThemAsAbsent() throws {
        let entry = try decode(WorldEntry.self, #"{"identifier":"world","title":"World Wide","shareLinkIdentifier":"k","memberCount":1}"#)
        XCTAssertNil(entry.avatar)
        XCTAssertNil(entry.banner)
    }

    func test_worldEntry_decodesItsAbsoluteAvatarAndBanner() throws {
        let entry = try decode(WorldEntry.self, #"{"identifier":"world","title":"World Wide","shareLinkIdentifier":"k","memberCount":1,"avatar":"https://staging.meeshy.me/brand/world-wide/avatar.png","banner":"https://staging.meeshy.me/brand/world-wide/banner.png"}"#)
        XCTAssertEqual(entry.avatar, "https://staging.meeshy.me/brand/world-wide/avatar.png")
        XCTAssertEqual(entry.banner, "https://staging.meeshy.me/brand/world-wide/banner.png")
        XCTAssertEqual(entry.avatar.flatMap { MeeshyConfig.resolveMediaURL($0) }?.absoluteString, entry.avatar)
    }

    func test_worldEntry_withoutMemberCount_forAVisitorWithoutAccount_stillDecodes() throws {
        let entry = try decode(WorldEntry.self, #"{"identifier":"world","title":"World Wide","shareLinkIdentifier":"k"}"#)
        XCTAssertEqual(entry.shareLinkIdentifier, "k")
        XCTAssertEqual(entry.memberCount, 0)
    }

    func test_formattedMemberCount_capped_appendsPlus() {
        let entry = WorldEntry(identifier: "world", title: "World Wide", shareLinkIdentifier: "k", memberCount: 199, memberCountCapped: true)
        XCTAssertEqual(entry.formattedMemberCount, "199+")
    }

    // MARK: - POST /links/:key/members

    func test_joinAsGuest_postsNicknameAndLanguage_toServedKey() async throws {
        let (sut, api) = makeSUT()
        let response = try decode(LinkMembershipResponse.self, Self.guestJoinJSON)
        api.stub("/links/lien-servi/members", result: APIResponse<LinkMembershipResponse>(success: true, data: response, error: nil))

        _ = try await sut.joinAsGuest(key: "lien-servi", nickname: "Amina", language: "ar")

        XCTAssertEqual(api.lastRequest?.endpoint, "/links/lien-servi/members")
        XCTAssertEqual(api.lastRequest?.method, "POST")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["nickname"] as? String, "Amina")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["language"] as? String, "ar")
    }

    func test_linkMembershipResponse_decodesGuestEntry_withAttachmentKinds() throws {
        let response = try decode(LinkMembershipResponse.self, Self.guestJoinJSON)

        XCTAssertEqual(response.sessionToken, "anon_tok")
        XCTAssertEqual(response.conversationId, "conv1")
        XCTAssertEqual(response.participantId, "part1")
        XCTAssertEqual(response.entry.rights?.canSendMessages, true)
        XCTAssertEqual(response.entry.rights?.canSendImages, false)
        XCTAssertEqual(response.entry.attachmentAllowance, GuestAttachmentAllowance(kinds: [.text, .audio]))
    }

    func test_linkMembershipResponse_nullKinds_isUnrestricted() throws {
        let json = #"{"sessionToken":"t","conversationId":"c","participantId":"p","entry":{"outcome":"new","allowedAttachmentKinds":null}}"#
        let response = try decode(LinkMembershipResponse.self, json)
        XCTAssertEqual(response.entry.attachmentAllowance, .unrestricted)
    }

    func test_joinedConversation_readsAllowedAttachmentKinds_fromLegacyJoin() throws {
        let json = #"{"id":"c","title":"World Wide","type":"global","allowViewHistory":false,"allowedAttachmentKinds":["text","audio"]}"#
        let conversation = try decode(JoinedConversation.self, json)
        XCTAssertEqual(conversation.attachmentAllowance, GuestAttachmentAllowance(kinds: [.text, .audio]))
    }

    func test_joinedConversation_withoutField_isUnrestricted() throws {
        let json = #"{"id":"c","title":"Ami","type":"group","allowViewHistory":true}"#
        let conversation = try decode(JoinedConversation.self, json)
        XCTAssertEqual(conversation.attachmentAllowance, .unrestricted)
    }

    private static let guestJoinJSON = """
    {
      "sessionToken": "anon_tok",
      "conversationId": "conv1",
      "participantId": "part1",
      "entry": {
        "outcome": "new",
        "canViewHistory": false,
        "rights": {
          "canSendMessages": true, "canSendFiles": false, "canSendImages": false,
          "canSendVideos": false, "canSendAudios": true, "canSendLocations": false,
          "canSendLinks": false, "canViewHistory": false
        },
        "allowedAttachmentKinds": ["audio", "text"]
      }
    }
    """
}
