import XCTest
@testable import MeeshySDK

/// LES LECTURES DU FIL (#6611) — chaque famille relit une date servie par la
/// passerelle AVEC millisecondes (`toISOString`) et SANS fractions, à la
/// milliseconde près. Une famille qui ne relit qu'une des deux formes perd la
/// date en silence (`nil`, ou un décodage entier qui échoue).
final class WireDateReadsTests: XCTestCase {

    private static let avecMillisecondes = "2026-09-15T09:34:23.563Z"
    private static let sansFractions = "2026-09-15T09:34:23Z"
    private static let formes = [(avecMillisecondes, Int64(1_789_464_863_563)), (sansFractions, Int64(1_789_464_863_000))]

    private static func millisecondes(_ date: Date?) -> Int64? {
        date.map { Int64(($0.timeIntervalSince1970 * 1_000).rounded()) }
    }

    private struct Horodate: Decodable { let at: Date }

    // MARK: - Décodeur REST (APIClient)

    func test_apiPayloadDecoder_relitLesDeuxFormes() throws {
        let decoder = APIClient.makeAPIPayloadDecoder()
        for (servie, attendu) in Self.formes {
            let lue = try decoder.decode(Horodate.self, from: Data(#"{"at":"\#(servie)"}"#.utf8))
            XCTAssertEqual(Self.millisecondes(lue.at), attendu, servie)
        }
    }

    func test_apiPayloadDecoder_refuseUneHeureSeule() {
        let decoder = APIClient.makeAPIPayloadDecoder()
        XCTAssertThrowsError(try decoder.decode(Horodate.self, from: Data(#"{"at":"09:34:23.563"}"#.utf8)))
    }

    // MARK: - Décodeur socket

    func test_socketPayloadDecoder_relitLesDeuxFormes() throws {
        let decoder = SocialSocketManager.makeSocketPayloadDecoder()
        for (servie, attendu) in Self.formes {
            let lue = try decoder.decode(Horodate.self, from: Data(#"{"at":"\#(servie)"}"#.utf8))
            XCTAssertEqual(Self.millisecondes(lue.at), attendu, servie)
        }
    }

    // MARK: - Modèles de message

    func test_postReplyTarget_createdAt_relitLesDeuxFormes() throws {
        for (servie, attendu) in Self.formes {
            let json = #"{"id":"p1","reactionCount":0,"commentCount":0,"createdAt":"\#(servie)","previewText":"Soleil"}"#
            let cible = try JSONDecoder().decode(APIPostReplyTarget.self, from: Data(json.utf8))
            XCTAssertEqual(Self.millisecondes(cible.createdAt), attendu, servie)
        }
    }

    func test_messagePinnedAt_relitLesDeuxFormes() throws {
        for (servie, attendu) in Self.formes {
            let json = """
            {"id":"m1","conversationId":"c1","senderId":"s1","content":"Bonjour",
             "createdAt":"2026-09-15T09:00:00.000Z","updatedAt":"2026-09-15T09:00:00.000Z",
             "pinnedAt":"\(servie)"}
            """
            let message = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
            XCTAssertEqual(Self.millisecondes(message.toMessage(currentUserId: "u1").pinnedAt), attendu, servie)
        }
    }

    // MARK: - Notifications

    func test_notificationParseISODate_relitLesDeuxFormes() {
        for (servie, attendu) in Self.formes {
            XCTAssertEqual(Self.millisecondes(APINotification.parseISODate(servie)), attendu, servie)
        }
        XCTAssertNil(APINotification.parseISODate("09:34:23.563"))
    }

    // MARK: - Progression

    func test_engagementReachedDate_relitLesDeuxFormes() {
        for (servie, attendu) in Self.formes {
            XCTAssertEqual(Self.millisecondes(EngagementProgressResolver.reachedDate(servie)), attendu, servie)
        }
    }
}
