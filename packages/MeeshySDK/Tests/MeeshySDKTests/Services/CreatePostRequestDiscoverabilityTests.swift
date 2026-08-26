import XCTest
@testable import MeeshySDK

/// Le CONTRAT de découvrabilité, mesuré sur la charge RÉELLEMENT encodée.
///
/// Un champ déclaré dans une struct ne prouve rien : un schéma de réponse
/// tronque en silence, un `Encodable` synthétisé omet ce qu'on croit qu'il
/// émet, et une surcharge qui n'est jamais appelée en production livre un
/// canal mort testé vert. Tous les témoins ci-dessous lisent donc
/// `MockAPIClient.lastRequest?.bodyJSON` — le JSON tel qu'il partirait sur le
/// fil — jamais la struct elle-même.
///
/// Trois affirmations, dans l'ordre où elles peuvent tomber :
/// 1. la clé ARRIVE dans le corps quand un palier est choisi ;
/// 2. elle est ABSENTE (pas `null`) quand aucun ne l'est — le schéma Zod du
///    gateway est un `z.enum().optional()`, qui REJETTE un `null` explicite,
///    et son absence vaut « non découvrable » (`geoPoint`/`geoPrecision`
///    restent nuls) ;
/// 3. la coordonnée part TELLE QUELLE. Le client ne quantifie jamais : un
///    second arrondi côté client ferait deux juges d'une même règle.
final class CreatePostRequestDiscoverabilityTests: XCTestCase {

    private func encoded(_ request: CreatePostRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    func test_encode_whenPrecisionSet_emitsDiscoverabilityPrecisionKey() throws {
        let json = try encoded(CreatePostRequest(content: "Ici", discoverabilityPrecision: .city))

        XCTAssertEqual(json["discoverabilityPrecision"] as? String, "CITY")
    }

    func test_encode_whenPrecisionNil_omitsKeyEntirely() throws {
        let json = try encoded(CreatePostRequest(content: "Ici", discoverabilityPrecision: nil))

        XCTAssertFalse(json.keys.contains("discoverabilityPrecision"),
                       "un null explicite serait rejeté par le z.enum().optional() du gateway")
    }

    /// Aucun défaut non nul, nulle part : un contenu ne devient jamais
    /// trouvable parce qu'un appelant a oublié de dire le contraire.
    func test_encode_defaultInit_omitsKeyEntirely() throws {
        let json = try encoded(CreatePostRequest(content: "Ici"))

        XCTAssertFalse(json.keys.contains("discoverabilityPrecision"))
    }

    func test_encode_carriesTheExactCoordinate_neverARoundedOne() throws {
        let place = SharedPlace(latitude: 48.8583736, longitude: 2.2944813, name: "Tour Eiffel")
        let json = try encoded(CreatePostRequest(content: "Ici", location: place,
                                                 discoverabilityPrecision: .region))

        let location = try XCTUnwrap(json["location"] as? [String: Any])
        XCTAssertEqual(location["latitude"] as? Double, 48.8583736)
        XCTAssertEqual(location["longitude"] as? Double, 2.2944813)
        XCTAssertEqual(json["discoverabilityPrecision"] as? String, "REGION",
                       "le palier voyage à côté de la coordonnée exacte, il ne la modifie pas")
    }
}

/// Les mêmes trois affirmations, mais sur la SURCHARGE que l'application
/// emprunte réellement.
///
/// `PostService` portait DEUX terminaux qui assemblaient chacun leur
/// `CreatePostRequest` et appelaient `POST /posts` sans déléguer l'un à
/// l'autre — et le seul chemin de publication de l'app
/// (`FeedViewModel.createPost`) passe par celui qui porte `visibilityUserIds`.
/// Brancher le champ sur « le terminal le plus large » aurait livré un canal
/// que rien n'emprunte. Les deux délèguent désormais au même site unique,
/// mesuré ici depuis les deux entrées.
final class PostServiceDiscoverabilityWireTests: XCTestCase {
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

    private func stubCreatedPost() {
        let post = APIPost(
            id: "p1", type: "POST", visibility: "PUBLIC", visibilityUserIds: nil, content: "Ici",
            originalLanguage: "fr", createdAt: Date(), updatedAt: nil, expiresAt: nil,
            author: APIAuthor(id: "a1", username: "alice", displayName: "Alice", avatar: nil),
            likeCount: 0, commentCount: 0, repostCount: 0, viewCount: 0, postOpenCount: nil,
            qualifiedViewCount: nil, playCount: nil, bookmarkCount: 0, shareCount: 0,
            reactionSummary: nil, isPinned: false, isEdited: false, media: nil, comments: nil,
            repostOf: nil, originalRepostOfId: nil, isQuote: nil, moodEmoji: nil, audioUrl: nil,
            audioDuration: nil, storyEffects: nil, translations: nil, isLikedByMe: nil,
            isBookmarkedByMe: nil, isRepostedByMe: nil, isViewedByMe: nil,
            currentUserReactions: nil, viaUsername: nil
        )
        mock.stub("/posts", result: APIResponse(success: true, data: post, error: nil))
    }

    private let paris = SharedPlace(latitude: 48.8583736, longitude: 2.2944813, name: "Tour Eiffel")

    /// LE chemin de production : `FeedViewModel.createPost` appelle exactement
    /// cette surcharge.
    func test_create_onNamedAudienceOverload_sendsDiscoverabilityPrecision() async throws {
        stubCreatedPost()

        _ = try await service.create(
            content: "Ici", type: "POST", visibility: "PUBLIC", visibilityUserIds: nil,
            moodEmoji: nil, mediaIds: nil, audioUrl: nil, audioDuration: nil,
            originalLanguage: "fr", mobileTranscription: nil, repostOfId: nil,
            location: paris, mentions: nil,
            allowSoundExtraction: nil, mediaAlt: nil,
            discoverabilityPrecision: .neighborhood
        )

        XCTAssertEqual(mock.lastRequest?.endpoint, "/posts")
        XCTAssertEqual(mock.lastRequest?.bodyJSON?["discoverabilityPrecision"] as? String, "NEIGHBORHOOD")
    }

    func test_create_onNamedAudienceOverload_withoutPrecision_omitsKey() async throws {
        stubCreatedPost()

        _ = try await service.create(
            content: "Ici", type: "POST", visibility: "PUBLIC", visibilityUserIds: nil,
            moodEmoji: nil, mediaIds: nil, audioUrl: nil, audioDuration: nil,
            originalLanguage: "fr", mobileTranscription: nil, repostOfId: nil,
            location: paris, mentions: nil
        )

        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertFalse(body.keys.contains("discoverabilityPrecision"),
                       "un lieu AFFICHÉ ne rend pas un contenu trouvable : les deux opt-in sont indépendants")
        XCTAssertNotNil(body["location"], "le badge d'affichage, lui, part comme avant")
    }

    /// Le second terminal historique — celui qui porte l'extraction de son et
    /// le texte alternatif. Il ne doit pas diverger du premier.
    func test_create_onSoundExtractionOverload_sendsDiscoverabilityPrecision() async throws {
        stubCreatedPost()

        _ = try await service.create(
            content: nil, type: "REEL", visibility: "PUBLIC", visibilityUserIds: nil,
            moodEmoji: nil,
            mediaIds: ["media-1"], audioUrl: nil, audioDuration: nil, originalLanguage: nil,
            mobileTranscription: nil, repostOfId: nil, location: paris, mentions: nil,
            allowSoundExtraction: true, mediaAlt: ["media-1": "Le parvis"],
            discoverabilityPrecision: .city
        )

        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertEqual(body["discoverabilityPrecision"] as? String, "CITY")
        XCTAssertEqual(body["allowSoundExtraction"] as? Bool, true)
    }

    /// Non-régression du site unique : la convergence des deux terminaux ne
    /// doit rien perdre de ce que chacun transportait déjà.
    func test_create_convergedTerminal_stillCarriesAudienceSoundAndAlt() async throws {
        stubCreatedPost()

        _ = try await service.create(
            content: "Ici", type: "POST", visibility: "ONLY", visibilityUserIds: ["u1", "u2"],
            moodEmoji: "🎈", mediaIds: ["media-1"], audioUrl: nil, audioDuration: nil,
            originalLanguage: "fr", mobileTranscription: nil, repostOfId: nil,
            location: paris, mentions: nil, allowSoundExtraction: false,
            mediaAlt: ["media-1": "Le parvis"], discoverabilityPrecision: .exact
        )

        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertEqual(body["visibility"] as? String, "ONLY")
        XCTAssertEqual(body["visibilityUserIds"] as? [String], ["u1", "u2"])
        XCTAssertEqual(body["allowSoundExtraction"] as? Bool, false)
        XCTAssertEqual((body["mediaAlt"] as? [String: String])?["media-1"], "Le parvis")
        XCTAssertEqual(body["discoverabilityPrecision"] as? String, "EXACT")
    }

    /// Le client n'arrondit JAMAIS : quel que soit le palier revendiqué, la
    /// coordonnée remise part au chiffre près. Le serveur seul quantifie.
    func test_create_sendsTheExactCoordinateWhateverTheTierClaimed() async throws {
        for tier in DiscoverabilityPrecision.allCases {
            mock.reset()
            stubCreatedPost()

            _ = try await service.create(
                content: "Ici", type: "POST", visibility: "PUBLIC", visibilityUserIds: nil,
                moodEmoji: nil, mediaIds: nil, audioUrl: nil, audioDuration: nil,
                originalLanguage: "fr", mobileTranscription: nil, repostOfId: nil,
                location: paris, mentions: nil,
                allowSoundExtraction: nil, mediaAlt: nil,
                discoverabilityPrecision: tier
            )

            let location = try XCTUnwrap(mock.lastRequest?.bodyJSON?["location"] as? [String: Any])
            XCTAssertEqual(location["latitude"] as? Double, 48.8583736, "palier \(tier.rawValue)")
            XCTAssertEqual(location["longitude"] as? Double, 2.2944813, "palier \(tier.rawValue)")
        }
    }

    /// Le champ ne peut pas rendre un contenu découvrable tout seul : sans
    /// `location`, le gateway laisse `geoPoint` nul quoi qu'il arrive. Le
    /// client ne fabrique donc aucune position de substitution.
    func test_create_withoutLocation_sendsNoLocationEvenWhenATierIsClaimed() async throws {
        stubCreatedPost()

        _ = try await service.create(
            content: "Ici", type: "POST", visibility: "PUBLIC", visibilityUserIds: nil,
            moodEmoji: nil, mediaIds: nil, audioUrl: nil, audioDuration: nil,
            originalLanguage: "fr", mobileTranscription: nil, repostOfId: nil,
            location: nil, mentions: nil,
            allowSoundExtraction: nil, mediaAlt: nil,
            discoverabilityPrecision: .city
        )

        let body = try XCTUnwrap(mock.lastRequest?.bodyJSON)
        XCTAssertFalse(body.keys.contains("location"))
        XCTAssertEqual(body["discoverabilityPrecision"] as? String, "CITY")
    }
}
