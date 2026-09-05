import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// Le consentement « trouvable à proximité » doit ATTEINDRE le fil, sur les
/// DEUX chemins qu'une publication texte + lieu peut emprunter.
///
/// `FeedViewModel.createPost` bifurque : un post TEXTE non vide part par la
/// file durable (`isDurableTextOnly`), un post SANS texte — une position
/// seule, cas parfaitement réel de cette fonctionnalité — part directement par
/// `PostService.create`. Câbler un seul des deux livrerait une case à cocher
/// qui marche une fois sur deux, sans que rien ne le dise.
///
/// Et la règle de vie privée du §2 tient dans le dernier témoin : le client
/// n'arrondit JAMAIS. La coordonnée voyage au chiffre près, quel que soit le
/// palier revendiqué — c'est le serveur, seul, qui quantifie.
@MainActor
final class FeedViewModelDiscoverabilityTests: XCTestCase {

    /// Coordonnées à sept décimales : un arrondi client, même au palier le
    /// plus fin, se verrait immédiatement.
    private static let exactLatitude = 48.8583736
    private static let exactLongitude = 2.2944813

    private func makeSUT() -> (sut: FeedViewModel, postService: MockPostService, queue: MockOfflineQueue) {
        let postService = MockPostService()
        let queue = MockOfflineQueue()
        let sut = FeedViewModel(
            api: MockAPIClientForApp(),
            socialSocket: MockSocialSocket(),
            postService: postService,
            languageProvider: MockLanguageProvider(preferredLanguages: []),
            offlineQueue: queue
        )
        return (sut, postService, queue)
    }

    private func makePlace() -> SharedPlace {
        SharedPlace(
            latitude: Self.exactLatitude,
            longitude: Self.exactLongitude,
            name: "Tour Eiffel"
        )
    }

    // MARK: - Chemin durable (post TEXTE + lieu — le cas nominal)

    func test_createPost_textWithPlace_carriesThePrecisionIntoTheDurablePayload() async {
        let (sut, _, queue) = makeSUT()

        await sut.createPost(
            content: "Ici, c'est beau",
            location: makePlace(),
            discoverabilityPrecision: .neighborhood
        )

        let payload = queue.lastPayload as? CreatePostPayload
        XCTAssertEqual(payload?.discoverabilityPrecision, .neighborhood)
    }

    /// Off par défaut : sans consentement, la charge durable ne porte aucun
    /// palier — et le gateway laisse `geoPoint`/`geoPrecision` nuls.
    func test_createPost_textWithPlace_withoutConsent_carriesNoPrecision() async {
        let (sut, _, queue) = makeSUT()

        await sut.createPost(content: "Ici, c'est beau", location: makePlace())

        let payload = queue.lastPayload as? CreatePostPayload
        XCTAssertNotNil(payload, "le post texte doit passer par la file durable")
        XCTAssertNil(payload?.discoverabilityPrecision)
    }

    func test_createPost_textWithPlace_sendsTheExactCoordinate() async {
        let (sut, _, queue) = makeSUT()

        await sut.createPost(
            content: "Ici, c'est beau",
            location: makePlace(),
            discoverabilityPrecision: .region
        )

        let payload = queue.lastPayload as? CreatePostPayload
        XCTAssertEqual(payload?.location?.latitude, Self.exactLatitude)
        XCTAssertEqual(payload?.location?.longitude, Self.exactLongitude)
    }

    // MARK: - Chemin direct (position SEULE, sans texte)

    func test_createPost_placeWithoutText_carriesThePrecisionToTheService() async {
        let (sut, postService, _) = makeSUT()

        await sut.createPost(content: "", location: makePlace(), discoverabilityPrecision: .city)

        XCTAssertEqual(postService.lastCreateDiscoverabilityPrecision, .city)
    }

    func test_createPost_placeWithoutText_withoutConsent_carriesNoPrecision() async {
        let (sut, postService, _) = makeSUT()

        await sut.createPost(content: "", location: makePlace())

        XCTAssertEqual(postService.createCallCount, 1, "la position seule doit partir par le chemin direct")
        XCTAssertNil(postService.lastCreateDiscoverabilityPrecision)
    }

    func test_createPost_placeWithoutText_sendsTheExactCoordinate() async {
        let (sut, postService, _) = makeSUT()

        await sut.createPost(content: "", location: makePlace(), discoverabilityPrecision: .exact)

        XCTAssertEqual(postService.lastCreateLocation?.latitude, Self.exactLatitude)
        XCTAssertEqual(postService.lastCreateLocation?.longitude, Self.exactLongitude)
    }

    // MARK: - Chemin média (REEL) — le périmètre que la spec réclame

    /// **Un REEL est dans le périmètre de la spec, et son consentement doit
    /// atteindre la file.** `location` y survivait déjà au flush pendant que la
    /// précision se perdait entre le composer et la file : le consentement
    /// n'avait alors aucun effet, et rien ne le disait.
    func test_createOfflineMediaPost_carriesThePrecisionIntoTheDurableRow() async {
        let (sut, _, queue) = makeSUT()

        await sut.createOfflineMediaPost(
            localMediaURLs: [URL(fileURLWithPath: "/tmp/concert.mp4")],
            content: "Concert",
            type: "REEL",
            location: makePlace(),
            discoverabilityPrecision: .city,
            mobileTranscription: nil,
            storyEffects: nil
        )

        XCTAssertEqual(queue.enqueuePostMediaCalls.count, 1)
        XCTAssertEqual(queue.enqueuePostMediaCalls.first?.discoverabilityPrecision, .city)
        XCTAssertEqual(
            queue.enqueuePostMediaCalls.first?.location?.latitude, Self.exactLatitude,
            "la coordonnée exacte voyage aussi sur le chemin média : le serveur seul quantifie"
        )
    }

    func test_createOfflineMediaPost_withoutConsent_carriesNoPrecision() async {
        let (sut, _, queue) = makeSUT()

        await sut.createOfflineMediaPost(
            localMediaURLs: [URL(fileURLWithPath: "/tmp/concert.mp4")],
            content: "Concert",
            type: "REEL",
            location: makePlace(),
            mobileTranscription: nil,
            storyEffects: nil
        )

        XCTAssertNil(queue.enqueuePostMediaCalls.first?.discoverabilityPrecision)
    }

    /// Le témoin qui refuse le second juge : quel que soit le palier
    /// revendiqué, la coordonnée est identique. Un arrondi client se serait
    /// glissé ici, et il aurait fait diverger deux règles pour un seul
    /// résultat persisté — celui du serveur.
    func test_createPost_neverRoundsTheCoordinate_whateverTheTierClaimed() async {
        for tier in DiscoverabilityPrecision.allCases {
            let (sut, postService, _) = makeSUT()

            await sut.createPost(content: "", location: makePlace(), discoverabilityPrecision: tier)

            XCTAssertEqual(
                postService.lastCreateLocation?.latitude, Self.exactLatitude,
                "latitude arrondie sous \(tier.rawValue)"
            )
            XCTAssertEqual(
                postService.lastCreateLocation?.longitude, Self.exactLongitude,
                "longitude arrondie sous \(tier.rawValue)"
            )
        }
    }
}
