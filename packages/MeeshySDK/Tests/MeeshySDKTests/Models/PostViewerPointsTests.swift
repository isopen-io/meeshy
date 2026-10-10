import XCTest
@testable import MeeshySDK

/// #9571 — ce qu'un post a rapporté au lecteur, les trois formes des points
/// d'une conversation, et la limite quotidienne de gestes (miroirs de
/// `keptViewerPoints`, `engagementPillModel` et des refus `DAILY_*`).
final class PostViewerPointsTests: XCTestCase {

    // MARK: - keptViewerPoints

    func test_kept_newerAnnouncement_winsUpOrDown() {
        let known = KnownViewerPoints(viewerPoints: 102, at: 2_000)
        XCTAssertEqual(PostViewerPoints.kept(known, viewerPoints: 120, at: 3_000), KnownViewerPoints(viewerPoints: 120, at: 3_000))
        XCTAssertEqual(PostViewerPoints.kept(known, viewerPoints: 90, at: 3_000), KnownViewerPoints(viewerPoints: 90, at: 3_000))
    }

    func test_kept_olderAnnouncement_arrivingLate_isIgnored() {
        let known = KnownViewerPoints(viewerPoints: 102, at: 2_000)
        XCTAssertEqual(PostViewerPoints.kept(known, viewerPoints: 99, at: 1_000), known)
    }

    func test_kept_read_appliesAndKeepsTheKnownInstant() {
        let known = KnownViewerPoints(viewerPoints: 102, at: 2_000)
        XCTAssertEqual(PostViewerPoints.kept(known, viewerPoints: 80, at: nil), KnownViewerPoints(viewerPoints: 80, at: 2_000))
        XCTAssertEqual(PostViewerPoints.kept(nil, viewerPoints: 0, at: nil), KnownViewerPoints(viewerPoints: 0, at: nil))
    }

    func test_kept_absentField_changesNothing() {
        let known = KnownViewerPoints(viewerPoints: 102, at: 2_000)
        XCTAssertEqual(PostViewerPoints.kept(known, viewerPoints: nil, at: nil), known)
        XCTAssertNil(PostViewerPoints.kept(nil, viewerPoints: nil, at: 5))
    }

    func test_shown_onlyAGainMakesAMark() {
        XCTAssertNil(PostViewerPoints.shown(nil))
        XCTAssertNil(PostViewerPoints.shown(0))
        XCTAssertEqual(PostViewerPoints.shown(99), 99)
    }

    // MARK: - Décodage

    private func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date: \(str)")
        }
        return decoder
    }

    private func post(extra: String) throws -> APIPost {
        let json = """
        { "id": "p1", "content": "x", "createdAt": "2026-10-07T10:00:00.000Z",
          "author": { "id": "u1", "name": "Marie", "username": "marie" }\(extra) }
        """
        return try makeDecoder().decode(APIPost.self, from: Data(json.utf8))
    }

    func test_apiPost_decodesViewerPoints_andCarriesItToTheFeedPost() throws {
        let api = try post(extra: #", "viewerPoints": 99"#)
        XCTAssertEqual(api.viewerPoints, 99)
        XCTAssertEqual(api.toFeedPost().viewerPoints, 99)
        XCTAssertEqual(try post(extra: #", "viewerPoints": 0"#).viewerPoints, 0)
    }

    func test_apiPost_withoutViewerPoints_orMalformed_isNil_neverZero() throws {
        XCTAssertNil(try post(extra: "").viewerPoints)
        XCTAssertNil(try post(extra: #", "viewerPoints": -3"#).viewerPoints)
        XCTAssertNil(try post(extra: #", "viewerPoints": "99""#).viewerPoints)
    }

    func test_feedPost_cacheRoundTrip_keepsViewerPoints() throws {
        var feedPost = FeedPost(author: "A", content: "c")
        feedPost.viewerPoints = 42
        let decoded = try JSONDecoder().decode(FeedPost.self, from: JSONEncoder().encode(feedPost))
        XCTAssertEqual(decoded.viewerPoints, 42)
        let bare = try JSONDecoder().decode(FeedPost.self, from: JSONEncoder().encode(FeedPost(author: "A", content: "c")))
        XCTAssertNil(bare.viewerPoints)
    }

    func test_postEngagementSnapshot_decodes_andRefusesAMalformedCharge() throws {
        let ok = try JSONDecoder().decode(PostEngagementSnapshot.self,
                                          from: Data(#"{"postId":"p1","viewerPoints":102,"at":1700}"#.utf8))
        XCTAssertEqual(ok, PostEngagementSnapshot(postId: "p1", viewerPoints: 102, at: 1700))
        for bad in [#"{"postId":"","viewerPoints":1,"at":1}"#, #"{"postId":"p","viewerPoints":-1,"at":1}"#,
                    #"{"postId":"p","viewerPoints":1}"#] {
            XCTAssertThrowsError(try JSONDecoder().decode(PostEngagementSnapshot.self, from: Data(bad.utf8)), bad)
        }
    }

    // MARK: - Les trois formes des points d'une conversation

    private func snapshot(total: Int, streak: Int) -> ConversationEngagementSnapshot {
        ConversationEngagementSnapshot(conversationId: "c", totalPoints: total, todayPoints: 0, streakDays: streak, day: "2026-10-07")
    }

    func test_pointsForm_streak_total_nothing() {
        XCTAssertEqual(ConversationPointsForm.of(snapshot(total: 120, streak: 4)), .streak(days: 4, total: 120))
        XCTAssertEqual(ConversationPointsForm.of(snapshot(total: 120, streak: 0)), .total(120))
        XCTAssertNil(ConversationPointsForm.of(snapshot(total: 0, streak: 0)))
        XCTAssertNil(ConversationPointsForm.of(nil))
    }

    // MARK: - La limite quotidienne de gestes

    func test_dailyLimit_readsTheRestEnvelope() throws {
        let body = #"{"success":false,"error":"x","code":"DAILY_COMMENT_LIMIT","retryAfter":7200,"resetAt":"2026-10-07T22:00:00.000Z","limit":50,"path":"original"}"#
        let limit = try XCTUnwrap(DailyGestureLimit.fromBody(Data(body.utf8)))
        XCTAssertEqual(limit.gesture, .comment)
        XCTAssertEqual(limit.limit, 50)
        XCTAssertEqual(limit.resetAt, DailyGestureLimit.parseInstant("2026-10-07T22:00:00Z"))
        XCTAssertNotNil(limit.resetAt)
        XCTAssertNil(DailyGestureLimit.fromBody(Data(#"{"code":"RATE_LIMITED"}"#.utf8)))
    }

    func test_dailyLimit_readsTheSocketAck() {
        let ack: [String: Any] = ["success": false, "code": "DAILY_REACTION_LIMIT", "resetAt": "2026-10-07T22:00:00.000Z", "limit": 100]
        XCTAssertEqual(DailyGestureLimit.fromAck(ack)?.gesture, .reaction)
        XCTAssertNil(DailyGestureLimit.fromAck(["success": false, "error": "Post not found"]))
    }

    func test_dailyLimit_unwrapsTheTransportRejection() {
        let rejection = MeeshyError.rejected(APIRejection(statusCode: 429, code: "DAILY_REACTION_LIMIT", message: "x", limit: 100))
        XCTAssertEqual(DailyGestureLimit.from(rejection)?.gesture, .reaction)
        XCTAssertNil(DailyGestureLimit.from(MeeshyError.server(statusCode: 429, message: "Trop de requetes")))
    }

    func test_outbox_treatsTheDailyLimitAsTerminal_butAPlain429AsRetryable() {
        let daily = MeeshyError.rejected(APIRejection(statusCode: 429, code: "DAILY_COMMENT_LIMIT", message: "x"))
        XCTAssertTrue(OutboxFlusher.isPermanentServerRejection(daily))
        XCTAssertTrue(OutboxFlusher.isPermanentServerRejection(DailyGestureLimit(gesture: .reaction, resetAt: nil, limit: nil)))
        XCTAssertFalse(OutboxFlusher.isPermanentServerRejection(MeeshyError.server(statusCode: 429, message: "x")))
    }

    func test_ledger_givesTheRefusalBackOnce() {
        let ledger = DailyGestureLimitLedger()
        ledger.record(DailyGestureLimit(gesture: .comment, resetAt: nil, limit: 50), clientMutationId: "cmid-1")
        XCTAssertEqual(ledger.take(clientMutationId: "cmid-1")?.gesture, .comment)
        XCTAssertNil(ledger.take(clientMutationId: "cmid-1"))
    }

    func test_reactionAckFailure_isTheDailyLimit_orTheServerPhrase() {
        let limited = SocialSocketManager.postReactionAckFailure(["success": false, "code": "DAILY_REACTION_LIMIT"])
        XCTAssertEqual(DailyGestureLimit.from(limited)?.gesture, .reaction)
        let other = SocialSocketManager.postReactionAckFailure(["success": false, "error": "Post not found"])
        XCTAssertNil(DailyGestureLimit.from(other))
    }
}
