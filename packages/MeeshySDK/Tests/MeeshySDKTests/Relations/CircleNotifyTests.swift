import Foundation
import Testing
@testable import MeeshySDK

/// « QUI EST PRÉVENU » (#14062) — les dix-neuf crans `notification.circle*`
/// (ADR gateway 2026-10-31 #13929), lus et écrits dans la forme que la
/// passerelle sert.
struct CircleNotifyTests {

    private func decode(_ json: String) throws -> CircleNotifyPreferences {
        try JSONDecoder().decode(CircleNotifyEnvelope.self, from: Data(json.utf8)).notification
    }

    private func key(_ family: CircleNotifyFamily, _ action: CircleNotifyAction) -> CircleNotifyKey {
        CircleNotifyKey(family: family, action: action)
    }

    @Test func lesDixNeufCles_portentLeNomDeLaPasserelle() {
        let names = CircleNotifyKey.all.map(\.wireName)
        #expect(names.count == 19)
        #expect(Set(names).count == 19)
        #expect(names.contains("circlePublicationPost"))
        #expect(names.contains("circlePublicationMood"))
        #expect(names.contains("circleOnMyContentReference"))
        #expect(names.contains("circleElsewhereMention"))
        #expect(!names.contains("circleElsewhereRepost"))
    }

    @Test func lesCrans_seProposentDuPlusEtroitAuPlusLarge() {
        #expect(RelationAudienceChoice.allCases.map(\.rawValue)
                == ["NOBODY", "BLOOD", "CLOSE", "FRIEND", "ACQUAINTANCE", "COMMUNITY", "PUBLIC"])
    }

    @Test func unCompteQuiNaRienRegle_litProcheProcheSang() throws {
        let prefs = try decode(#"{"notification":{}}"#)
        #expect(prefs == .defaults)
        #expect(prefs[key(.publication, .post)] == .close)
        #expect(prefs[key(.onMyContent, .comment)] == .close)
        #expect(prefs[key(.elsewhere, .comment)] == .blood)
        #expect(try decode("{}") == .defaults)
    }

    @Test func unCranServi_remplaceLeDefautDeSaCleSeulement() throws {
        let prefs = try decode(#"{"notification":{"circlePublicationReel":"PUBLIC","pushEnabled":true}}"#)
        #expect(prefs[key(.publication, .reel)] == .public)
        #expect(prefs == CircleNotifyPreferences.defaults.setting(.public, for: key(.publication, .reel)))
        #expect(prefs.uniformChoice(of: .publication) == nil)
        #expect(prefs.uniformChoice(of: .elsewhere) == .blood)
    }

    @Test func unCranInconnu_rendLaLectureIllisible() {
        #expect(throws: DecodingError.self) {
            try decode(#"{"notification":{"circleElsewhereMention":"EVERYONE"}}"#)
        }
    }

    @Test func laLecture_neDemandeQueLesDixNeufCles() async throws {
        let api = MockAPIClient()
        api.stub("/me/preferences", result: APIResponse<CircleNotifyEnvelope>(
            success: true, data: try JSONDecoder().decode(CircleNotifyEnvelope.self, from: Data(#"{"notification":{"circleElsewhereShare":"FRIEND"}}"#.utf8)), error: nil))
        let prefs = try await CircleNotifyService(api: api).load()
        #expect(prefs[key(.elsewhere, .share)] == .friend)
        let fields = api.lastRequest?.queryItems?.first { $0.name == "fields" }?.value ?? ""
        #expect(fields.split(separator: ",").count == 19)
        #expect(fields.split(separator: ",").allSatisfy { $0.hasPrefix("notification.circle") })
    }

    @Test func lEcriture_neToucheQuUneClePlate_etRendLeCranRetenu() async throws {
        let api = MockAPIClient()
        api.stub("/me/preferences", result: APIResponse<CircleNotifyEnvelope>(
            success: true, data: try JSONDecoder().decode(CircleNotifyEnvelope.self, from: Data(#"{"notification":{"circleOnMyContentQuote":"COMMUNITY"}}"#.utf8)), error: nil))
        let served = try await CircleNotifyService(api: api).update(key(.onMyContent, .quote), to: .community)
        #expect(served == .community)
        #expect(api.lastRequest?.method == "PATCH")
        let notification = api.lastRequest?.bodyJSON?["notification"] as? [String: Any]
        #expect(notification?.count == 1)
        #expect(notification?["circleOnMyContentQuote"] as? String == "COMMUNITY")
    }
}
