import XCTest
@testable import MeeshySDK

/// Le parrainage de la planche (#19507) : l'entonnoir, l'activité des filleuls, ce que ça rapporte, et mes
/// invitations envoyées, tels que la passerelle les SERT (#19207, #19508) — et une passerelle plus ancienne qui
/// ne les sert pas.
final class AffiliateReferralFunnelTests: XCTestCase {

    private func makeSUT() -> (AffiliateService, MockAPIClient) {
        let mock = MockAPIClient()
        return (AffiliateService(api: mock), mock)
    }

    func test_fetchStats_whenTheGatewayServesTheFunnel_readsVisitsRegistrationsActiveAndThisMonth() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/affiliate/stats", json: """
        { "success": true, "data": { "totalReferrals": 17, "completedReferrals": 15, "pendingReferrals": 2,
          "visits": 38, "registrations": 17, "registrationsThisMonth": 9, "active": 14,
          "referrals": [ { "id": "r1", "status": "completed", "activity": "active",
                           "referredUser": { "id": "u1", "username": "koffi_beats" } } ] } }
        """)

        let stats = try await sut.fetchStats()

        XCTAssertEqual(stats.visits, 38)
        XCTAssertEqual(stats.registrations, 17)
        XCTAssertEqual(stats.registrationsThisMonth, 9)
        XCTAssertEqual(stats.active, 14)
        XCTAssertEqual(stats.referrals?.first?.activity, "active")
        XCTAssertNil(stats.rewards)
    }

    func test_fetchStats_whenTheGatewayIsOlder_leavesEveryNewFieldAbsent() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/affiliate/stats", json: """
        { "success": true, "data": { "totalReferrals": 3, "referrals": [ { "id": "r1", "status": "pending" } ] } }
        """)

        let stats = try await sut.fetchStats()

        XCTAssertEqual(stats.totalReferrals, 3)
        XCTAssertNil(stats.visits)
        XCTAssertNil(stats.registrations)
        XCTAssertNil(stats.registrationsThisMonth)
        XCTAssertNil(stats.active)
        XCTAssertNil(stats.referrals?.first?.activity)
    }

    func test_fetchStats_whenActivityIsNotMeasured_servesActiveAsNull() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/affiliate/stats", json: """
        { "success": true, "data": { "visits": 4, "registrations": 1, "registrationsThisMonth": 0, "active": null } }
        """)

        let stats = try await sut.fetchStats()

        XCTAssertEqual(stats.visits, 4)
        XCTAssertNil(stats.active)
    }

    func test_fetchStats_whenTheGameServesRewards_readsTheGainTheTotalAndTheNextTier() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/affiliate/stats", json: """
        { "success": true, "data": { "rewards": { "perActiveReferral": 50, "earned": 700,
          "nextTier": { "reached": 14, "target": 15, "reward": "Contour d'avatar Parrain" } } } }
        """)

        let rewards = try XCTUnwrap(try await sut.fetchStats().rewards)

        XCTAssertEqual(rewards.perActiveReferral, 50)
        XCTAssertEqual(rewards.earned, 700)
        XCTAssertEqual(rewards.nextTier, AffiliateRewardTier(reached: 14, target: 15, reward: "Contour d'avatar Parrain"))
    }

    func test_listSentInvitations_readsMaskedAddressesStatesAndResendRights() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/invitations/email", json: """
        { "success": true, "data": [
          { "id": "i1", "maskedEmail": "ma•••••@gmail.com", "sentAt": "2026-11-14T09:00:00.000Z", "state": "sent",
            "resendCount": 0, "resendsLeft": 3, "canResend": true, "nextResendAt": null },
          { "id": "i2", "maskedEmail": "ib•••••@outlook.fr", "sentAt": "2026-11-10T09:00:00.000Z", "state": "opened",
            "resendCount": 3, "resendsLeft": 0, "canResend": false, "nextResendAt": null } ],
          "pagination": { "total": 2, "limit": 20, "offset": 0, "hasMore": false } }
        """)

        let invitations = try await sut.listSentInvitations()

        XCTAssertEqual(mock.lastRequest?.endpoint, "/invitations/email")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        XCTAssertEqual(invitations.map(\.maskedEmail), ["ma•••••@gmail.com", "ib•••••@outlook.fr"])
        XCTAssertEqual(invitations.map(\.phase), [.sent, .opened])
        XCTAssertEqual(invitations.map(\.canResend), [true, false])
    }

    func test_resendInvitation_postsToTheInvitationResendRoute_andReadsTheServedInvitation() async throws {
        let (sut, mock) = makeSUT()
        mock.stubWire("/invitations/email/i1/resend", json: """
        { "success": true, "data": { "id": "i1", "maskedEmail": "ma•••••@gmail.com", "state": "sent",
          "resendsLeft": 2, "canResend": false, "nextResendAt": "2026-11-21T09:00:00.000Z" } }
        """)

        let served = try await sut.resendInvitation(id: "i1")

        XCTAssertEqual(mock.lastRequest?.endpoint, "/invitations/email/i1/resend")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
        XCTAssertEqual(served.resendsLeft, 2)
        XCTAssertEqual(served.canResend, false)
    }

    func test_sentInvitation_whenTheStateIsUnknown_readsAsSent() {
        let invitation = SentEmailInvitation(id: "i", maskedEmail: "a•••••@b.c", state: "bounced")
        XCTAssertEqual(invitation.phase, .sent)
    }

    func test_sentInvitation_resent_spendsOneResendAndClosesTheButton() {
        let invitation = SentEmailInvitation(id: "i", maskedEmail: "a•••••@b.c", state: "opened",
                                             resendsLeft: 2, canResend: true)
        let resent = invitation.resent(at: "2026-11-18T10:00:00.000Z")
        XCTAssertEqual(resent.resendsLeft, 1)
        XCTAssertEqual(resent.canResend, false)
        XCTAssertEqual(resent.sentAt, "2026-11-18T10:00:00.000Z")
        XCTAssertEqual(resent.phase, .opened)
    }
}
