import XCTest
@testable import MeeshySDK

/// V3-3 — **le format choisi commande le type PUBLIÉ.**
///
/// `CreateStoryRequest.type` était `public let type = "STORY"` : un littéral
/// figé, qui commandait l'envoi quoi qu'il arrive. Tant qu'il commandait,
/// monter l'éventail de formats app-side aurait offert un choix que l'envoi
/// ignore — « Post » aurait publié une story. C'est le pire des deux mondes,
/// puisque le choix aurait eu l'air de marcher.
///
/// Ces tests éprouvent le fil complet, du corps encodé jusqu'à l'octet remis à
/// `POST /posts` : ils rougissent si le type redevient figé, s'il cesse d'être
/// envoyé, ou si le CANEVAS cesse de voyager avec lui.
final class CanvasPostTypeTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: PostService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = PostService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func stubbedPost(id: String = "created-1") -> APIPost {
        APIPost(
            id: id, type: "POST", visibility: "PUBLIC", visibilityUserIds: nil, content: nil,
            originalLanguage: nil, createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: APIAuthor(id: "a1", username: "alice", displayName: "Alice", avatar: nil),
            likeCount: 0, commentCount: 0, repostCount: 0, viewCount: 0, postOpenCount: nil,
            qualifiedViewCount: nil, playCount: nil,
            bookmarkCount: 0, shareCount: 0, reactionSummary: nil, isPinned: false,
            isEdited: false, media: nil, comments: nil, repostOf: nil,
            originalRepostOfId: nil, isQuote: nil,
            moodEmoji: nil, audioUrl: nil, audioDuration: nil, storyEffects: nil,
            translations: nil, isLikedByMe: nil, isBookmarkedByMe: nil, isRepostedByMe: nil,
            isViewedByMe: nil, currentUserReactions: nil, viaUsername: nil
        )
    }

    private func stubCreation() {
        mock.stub("/posts", result: APIResponse(success: true, data: stubbedPost(), error: nil))
    }

    private func encoded(_ body: CreateStoryRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(body)
        return try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    /// Un canevas non vide — la matière que `create(content:type:…)` ne saurait
    /// pas transporter, et qui est la raison pour laquelle le type voyage dans
    /// CE corps-ci.
    private func canvas() -> StoryEffects {
        StoryEffects(background: "#101010")
    }

    // MARK: - Le corps encodé

    /// Non-régression de TOUS les appelants historiques : ils créent des
    /// stories et ne passent aucun type. Le jour où le défaut bascule, chacun
    /// d'eux publie autre chose sans qu'une seule ligne d'appel n'ait changé.
    func test_theCanvasBodyStillDefaultsToAStory() throws {
        let json = try encoded(CreateStoryRequest(content: "coucou"))

        XCTAssertEqual(json["type"] as? String, "STORY")
    }

    func test_theCanvasBodyEncodesTheTypeItIsGiven() throws {
        for type in PostType.allCases {
            let json = try encoded(CreateStoryRequest(type: type.rawValue, content: "coucou"))

            XCTAssertEqual(
                json["type"] as? String, type.rawValue,
                "Le corps doit dire « \(type.rawValue) » — un littéral figé le contredirait en silence."
            )
        }
    }

    /// La raison d'être du choix : le canevas voyage AVEC le type. Le router
    /// vers une création sans `storyEffects` aurait perdu chaque objet texte,
    /// autocollant et dessin sans erreur de compilation — et l'aperçu du
    /// composer (`MeeshyScenePlayer`, loi 6) aurait alors menti sur ce qui part.
    func test_theCanvasTravelsWithANonStoryType() throws {
        let json = try encoded(
            CreateStoryRequest(type: PostType.reel.rawValue, storyEffects: canvas())
        )

        XCTAssertEqual(json["type"] as? String, "REEL")
        XCTAssertNotNil(
            json["storyEffects"],
            "Un réel composé au canevas part avec son canevas, sinon il part amputé."
        )
    }

    // MARK: - Ce qui est réellement remis à POST /posts

    func test_creatingACanvasPost_sendsTheChosenFormatAsTheWireType() async throws {
        for type in PostType.allCases {
            mock.reset()
            stubCreation()

            _ = try await service.createCanvasPost(
                type: type, content: "coucou", storyEffects: canvas(),
                visibility: "PUBLIC", visibilityUserIds: nil, originalLanguage: nil,
                mediaIds: nil, repostOfId: nil, mentions: nil,
                allowSoundExtraction: nil, mediaAlt: nil
            )

            XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
            XCTAssertEqual(
                mock.lastRequest?.bodyJSON?["type"] as? String, type.rawValue,
                "Le format choisi doit atteindre le fil — c'est tout l'objet de ce lot."
            )
            XCTAssertNotNil(
                mock.lastRequest?.bodyJSON?["storyEffects"],
                "…sans laisser le canevas derrière lui."
            )
        }
    }

    /// Le chemin historique reste EXACTEMENT ce qu'il était : les trois
    /// surcharges `createStory` publient une story, et rien d'autre.
    func test_theHistoricStoryPath_stillSendsSTORY() async throws {
        stubCreation()

        _ = try await service.createStory(content: "coucou", storyEffects: canvas())

        XCTAssertEqual(mock.lastRequest?.bodyJSON?["type"] as? String, "STORY")
    }

    /// Les champs que V3-4 vient de brancher ne doivent pas tomber en chemin :
    /// la création par canevas est le SEUL envoi du composer, tous formats
    /// confondus, donc tout ce qui partait avec une story doit partir avec un
    /// post.
    func test_theCanvasCreation_keepsCarryingTheAccessibilityPayload() async throws {
        stubCreation()

        _ = try await service.createCanvasPost(
            type: .post, content: nil, storyEffects: canvas(),
            visibility: "PUBLIC", visibilityUserIds: nil, originalLanguage: "fr",
            mediaIds: ["m1"], repostOfId: "root-1", mentions: nil,
            allowSoundExtraction: true, mediaAlt: ["m1": "Une plage au couchant"]
        )

        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertEqual(body["allowSoundExtraction"] as? Bool, true)
        XCTAssertEqual((body["mediaAlt"] as? [String: String])?["m1"], "Une plage au couchant")
        XCTAssertEqual(body["repostOfId"] as? String, "root-1")
        XCTAssertEqual(body["originalLanguage"] as? String, "fr")
    }

    // MARK: - Garde de source POSITIVE

    /// Le type est une PROPRIÉTÉ posée par l'appelant, pas une constante.
    ///
    /// Garde tenue par son assertion POSITIVE : chercher l'absence de
    /// `let type = "STORY"` seul serait vert le jour où le littéral revient
    /// écrit autrement. Exiger la forme stockée rougit dans les deux cas.
    func test_theTypeIsAStoredProperty_notAFrozenLiteral() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Services
            .deletingLastPathComponent()   // MeeshySDKTests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshySDK/Services/ServiceModels.swift")
        let code = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(
            code.contains("public struct CreateStoryRequest"),
            "Le fichier lu n'est pas celui du corps de création — la garde ne mesurerait RIEN."
        )
        XCTAssertTrue(
            code.contains("public let type: String"),
            "Le type doit être une propriété stockée que l'appelant renseigne."
        )
        XCTAssertFalse(
            code.contains("public let type = \"STORY\""),
            "Le littéral figé est revenu : choisir « Post » publierait une story."
        )
    }
}
