import Foundation
import Testing
@testable import MeeshySDK

/// #10552 — le lot de COMPTAGE déclare le consentement d'analyse, par la même
/// source que le lot v2. La passerelle ne retire d'une impression ses colonnes
/// de mesure que si le lot dit `denied`.
@Suite("PostService.recordSocialEvents — le lot de comptage déclare le consentement")
struct SocialEventsCountingConsentTests {

    private func receiptStub() throws -> APIResponse<SocialEventsReceipt> {
        let data = Data(#"{"success":true,"data":{"recorded":1,"rejected":0}}"#.utf8)
        return try JSONDecoder().decode(APIResponse<SocialEventsReceipt>.self, from: data)
    }

    private func sentContext(
        standing: SocialEventContext.Consent??,
        credential: SocialEventsCredential = .account
    ) async throws -> [String: Any] {
        let api = MockAPIClient()
        api.stub("/social/events", result: try receiptStub())
        let source = SocialEventsConsentSource()
        if let standing { source.install { standing } }
        let service = PostService(api: api, clock: { Date(timeIntervalSince1970: 1_700_000_060) }, consent: source)

        _ = try await service.recordSocialEvents([.impression(postId: "p1", source: "feed", surface: .feed)], credential: credential)

        let body = try #require(api.lastRequest?.bodyJSON)
        return try #require(body["context"] as? [String: Any])
    }

    @Test func test_recordSocialEvents_toggleOff_declaresDenied() async throws {
        let context = try await sentContext(standing: .denied)
        #expect(context["consent"] as? String == "denied")
        #expect(context["sentAt"] as? String == "2023-11-14T22:14:20.000Z")
    }

    @Test func test_recordSocialEvents_serverConfirmed_declaresGranted() async throws {
        #expect(try await sentContext(standing: .granted)["consent"] as? String == "granted")
    }

    @Test func test_recordSocialEvents_nothingSettled_declaresUnknown() async throws {
        #expect(try await sentContext(standing: .unknown)["consent"] as? String == "unknown")
    }

    @Test func test_recordSocialEvents_visitorBatch_declaresTheSameStanding() async throws {
        let context = try await sentContext(standing: .denied, credential: .visitor("visitor_abc"))
        #expect(context["consent"] as? String == "denied")
    }

    /// Sans source installée (extension, test), ou quand l'app ne sait rien
    /// dire, la clé n'existe pas : le lot reste celui qu'un ancien serveur lit.
    @Test func test_recordSocialEvents_noSourceInstalled_omitsTheKey() async throws {
        let context = try await sentContext(standing: nil)
        #expect(context["consent"] == nil)
        #expect(context["sentAt"] as? String == "2023-11-14T22:14:20.000Z")
    }

    @Test func test_recordSocialEvents_sourceSaysNothing_omitsTheKey() async throws {
        #expect(try await sentContext(standing: .some(nil))["consent"] == nil)
    }
}
