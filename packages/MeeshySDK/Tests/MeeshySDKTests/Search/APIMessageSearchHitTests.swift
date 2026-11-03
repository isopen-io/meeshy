import Foundation
import Testing
@testable import MeeshySDK

struct APIMessageSearchHitTests {

    private static func decodePage(_ json: String) throws -> PaginatedAPIResponse<[APIMessageSearchHit]> {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let raw = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            guard let date = formatter.date(from: raw) else {
                throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: raw))
            }
            return date
        }
        return try decoder.decode(PaginatedAPIResponse<[APIMessageSearchHit]>.self, from: Data(json.utf8))
    }

    @Test func decodesTheContractPage_withServedTextAndCursor() throws {
        let page = try Self.decodePage("""
        {"success":true,"data":[{
          "id":"m1","conversationId":"c1","createdAt":"2026-11-02T10:00:00.000Z","messageType":"text",
          "content":"Bonjour","servedLanguage":"fr","originalContent":"Hello","originalLanguage":"en",
          "sender":{"id":"p1","userId":"u1","displayName":"Aminata","username":"ami","avatar":null},
          "conversation":{"id":"c1","identifier":null,"type":"group","title":"Equipe","avatar":null}
        }],"pagination":{"limit":20,"hasMore":true,"nextCursor":"abc"}}
        """)

        #expect(page.data.map(\.content) == ["Bonjour"])
        #expect(page.data.first?.originalContent == "Hello")
        #expect(page.data.first?.conversation.title == "Equipe")
        #expect(page.data.first?.senderLabel == "Aminata")
        #expect(page.pagination?.nextCursor == "abc")
        #expect(page.pagination?.hasMore == true)
    }

    @Test func guestSenderWithoutAccount_andNoSender_decode() throws {
        let page = try Self.decodePage("""
        {"success":true,"data":[
          {"id":"m1","conversationId":"c1","createdAt":"2026-11-02T10:00:00.000Z","messageType":"text",
           "content":"x","servedLanguage":null,"originalContent":"x","originalLanguage":null,
           "sender":{"id":"p9","userId":null,"displayName":"","username":"invite","avatar":null},
           "conversation":{"id":"c1","identifier":"mshy_1","type":"public","title":"Salon","avatar":null}},
          {"id":"m2","conversationId":"c1","createdAt":"2026-11-02T10:00:00.000Z","messageType":"text",
           "content":"y","servedLanguage":null,"originalContent":"y","originalLanguage":null,"sender":null,
           "conversation":{"id":"c1","identifier":null,"type":"public","title":"Salon","avatar":null}}
        ],"pagination":{"limit":20,"hasMore":false,"nextCursor":null}}
        """)

        #expect(page.data.map(\.senderLabel) == ["invite", "?"])
        #expect(page.pagination?.nextCursor == nil)
    }
}
