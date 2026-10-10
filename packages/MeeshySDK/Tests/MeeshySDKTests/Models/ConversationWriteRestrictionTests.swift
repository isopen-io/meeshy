import XCTest
@testable import MeeshySDK

/// #9929 — un mineur lit Global sans pouvoir y écrire. La passerelle sert
/// `viewerWriteRestriction` sur la liste et le détail ; le client le lit, le
/// garde en cache, et range Global dans les archives tant qu'il est servi.
final class ConversationWriteRestrictionTests: XCTestCase {

    private func decodeAPIConversation(_ json: String) throws -> APIConversation {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(APIConversation.self, from: Data(json.utf8))
    }

    private func makeConversation(restriction: ConversationWriteRestriction?, archived: Bool = false) -> MeeshyConversation {
        var conversation = MeeshyConversation(
            id: "global", identifier: "meeshy", type: .global,
            lastMessageAt: Date(timeIntervalSince1970: 1_700_000_000),
            createdAt: Date(timeIntervalSince1970: 1_700_000_000),
            updatedAt: Date(timeIntervalSince1970: 1_700_000_000),
            userState: ConversationUserState(isArchived: archived)
        )
        conversation.viewerWriteRestriction = restriction
        return conversation
    }

    // MARK: - Décodage

    func test_decode_minorGlobal_readsTheKnownRestriction() throws {
        let api = try decodeAPIConversation(#"{"id":"c1","type":"global","identifier":"meeshy","createdAt":"2026-09-01T00:00:00Z","viewerWriteRestriction":"minor-global"}"#)

        XCTAssertEqual(api.viewerWriteRestriction, .minorGlobal)
        XCTAssertEqual(api.toConversation(currentUserId: "me").viewerWriteRestriction, .minorGlobal)
    }

    func test_decode_null_readsNoRestriction() throws {
        let api = try decodeAPIConversation(#"{"id":"c1","type":"global","createdAt":"2026-09-01T00:00:00Z","viewerWriteRestriction":null}"#)

        XCTAssertNil(api.viewerWriteRestriction)
    }

    func test_decode_absentKey_readsNoRestriction() throws {
        let api = try decodeAPIConversation(#"{"id":"c1","type":"group","createdAt":"2026-09-01T00:00:00Z"}"#)

        XCTAssertNil(api.toConversation(currentUserId: "me").viewerWriteRestriction)
    }

    func test_decode_unknownValue_keepsTheConversation() throws {
        let api = try decodeAPIConversation(#"{"id":"c1","type":"group","createdAt":"2026-09-01T00:00:00Z","viewerWriteRestriction":"future-rule"}"#)

        XCTAssertEqual(api.viewerWriteRestriction, .unknown("future-rule"))
        XCTAssertEqual(api.viewerWriteRestriction?.closesComposer, false)
    }

    func test_decode_malformedValue_keepsTheConversation() throws {
        let api = try decodeAPIConversation(#"{"id":"c1","type":"group","createdAt":"2026-09-01T00:00:00Z","viewerWriteRestriction":42}"#)

        XCTAssertEqual(api.id, "c1")
        XCTAssertEqual(api.viewerWriteRestriction?.closesComposer, false)
    }

    func test_cacheRoundTrip_keepsTheRestriction() throws {
        let conversation = makeConversation(restriction: .minorGlobal, archived: true)

        let data = try JSONEncoder().encode(conversation)
        let decoded = try JSONDecoder().decode(MeeshyConversation.self, from: data)

        XCTAssertEqual(decoded.viewerWriteRestriction, .minorGlobal)
    }

    // MARK: - Global dans les archives

    func test_toConversation_minorGlobalWithoutArchivedPreference_isArchived() throws {
        let api = try decodeAPIConversation(#"{"id":"c1","type":"global","identifier":"meeshy","createdAt":"2026-09-01T00:00:00Z","viewerWriteRestriction":"minor-global","userPreferences":[{"isArchived":false}]}"#)

        let conversation = api.toConversation(currentUserId: "me")

        XCTAssertTrue(conversation.userState.isArchived)
        XCTAssertFalse(conversation.userState.isVisible)
    }

    func test_toConversation_servedArchivedWithoutRestriction_followsTheServedValue() throws {
        let api = try decodeAPIConversation(#"{"id":"c1","type":"global","identifier":"meeshy","createdAt":"2026-09-01T00:00:00Z","viewerWriteRestriction":null,"userPreferences":[{"isArchived":false}]}"#)

        XCTAssertFalse(api.toConversation(currentUserId: "me").userState.isArchived)
    }

    func test_imposingServedArchive_withoutRestriction_leavesThePreference() {
        let conversation = makeConversation(restriction: nil, archived: false)

        XCTAssertFalse(conversation.imposingServedArchive().userState.isArchived)
    }

    func test_imposingServedArchive_minorGlobal_archives() {
        let conversation = makeConversation(restriction: .minorGlobal, archived: false)

        XCTAssertTrue(conversation.imposingServedArchive().userState.isArchived)
        XCTAssertTrue(conversation.isArchiveImposed)
    }

    // MARK: - Le refus d'écriture

    func test_initRefusal_globalAdultsOnly403_isMinorGlobal() {
        let error = MeeshyError.forbidden(reason: "Global", body: Data(#"{"success":false,"error":"Global","code":"GLOBAL_ADULTS_ONLY"}"#.utf8))

        XCTAssertEqual(ConversationWriteRestriction(refusal: error), .minorGlobal)
    }

    func test_initRefusal_otherForbiddenCode_isNil() {
        let error = MeeshyError.forbidden(reason: nil, body: Data(#"{"code":"USER_BLOCKED"}"#.utf8))

        XCTAssertNil(ConversationWriteRestriction(refusal: error))
    }

    func test_initRefusal_nonForbiddenError_isNil() {
        XCTAssertNil(ConversationWriteRestriction(refusal: URLError(.notConnectedToInternet)))
        XCTAssertNil(ConversationWriteRestriction(refusal: MeeshyError.forbidden(reason: nil, body: nil)))
    }
}
