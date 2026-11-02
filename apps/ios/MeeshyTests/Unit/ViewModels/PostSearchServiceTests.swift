import XCTest
@testable import Meeshy
import MeeshySDK

final class MockPostSearch: PostSearchProviding, @unchecked Sendable {
    var result: GlobalSearchLeg<GlobalSearchPostResult> = .served([])
    private(set) var callCount = 0

    func searchPosts(query: String, reader: MeeshyUser?) async -> GlobalSearchLeg<GlobalSearchPostResult> {
        callCount += 1
        return result
    }
}

final class PostSearchServiceTests: XCTestCase {

    private func page(_ items: String) -> PaginatedAPIResponse<[APIPost]> {
        JSONStub.decode("""
        {"success":true,"data":[\(items)],"pagination":{"limit":30,"hasMore":false,"nextCursor":null}}
        """)
    }

    private func post(id: String, type: String, content: String, translations: String = "null") -> String {
        """
        {"id":"\(id)","type":"\(type)","visibility":"PUBLIC","content":"\(content)","originalLanguage":"en",
         "createdAt":"2026-11-02T10:00:00.000Z","translations":\(translations),
         "author":{"id":"u1","username":"ami","displayName":"Aminata"}}
        """
    }

    func test_searchPosts_servesEachKind_withThePrismText() async {
        let api = MockAPIClientForApp()
        api.stub("/posts/search", result: page([
            post(id: "p1", type: "POST", content: "Hello world", translations: #"{"fr":{"text":"Bonjour le monde"}}"#),
            post(id: "r1", type: "REEL", content: "dance"),
            post(id: "s1", type: "STORY", content: "sunset"),
        ].joined(separator: ",")))
        let service = PostSearchService(api: api)

        let leg = await service.searchPosts(
            query: "hello",
            reader: MeeshyUser(id: "me", username: "lecteur", systemLanguage: "fr")
        )

        XCTAssertNil(leg.failure)
        XCTAssertEqual(leg.items.map(\.kind), [.post, .reel, .story])
        XCTAssertEqual(leg.items.first?.text, "Bonjour le monde", "le texte d'un post suit le Prisme du lecteur")
        XCTAssertEqual(leg.items.first?.authorName, "Aminata")
    }

    func test_searchPosts_aKindTheSearchDoesNotCover_isLeftOut() async {
        let api = MockAPIClientForApp()
        api.stub("/posts/search", result: page(post(id: "m1", type: "STATUS", content: "hello")))

        let leg = await PostSearchService(api: api).searchPosts(query: "hello", reader: nil)

        XCTAssertTrue(leg.items.isEmpty)
    }

    func test_searchPosts_networkFailure_saysSo() async {
        let api = MockAPIClientForApp()
        api.errorToThrow = URLError(.notConnectedToInternet)

        let leg = await PostSearchService(api: api).searchPosts(query: "hello", reader: nil)

        XCTAssertTrue(leg.items.isEmpty)
        XCTAssertNotNil(leg.failure, "une panne ne se confond pas avec un vide")
    }
}
