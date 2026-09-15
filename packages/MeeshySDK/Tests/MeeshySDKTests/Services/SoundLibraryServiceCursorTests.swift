import XCTest
@testable import MeeshySDK

/// LE CURSEUR DE SONS FAIT L'ALLER-RETOUR (#6609) — la passerelle sert un
/// `nextCursor` en date-heure ISO 8601 à millisecondes (`toISOString`) ; la page
/// suivante doit le RENVOYER tel quel. Un curseur qui ne se relit pas arrête la
/// pagination à la première page ; un curseur réécrit sans date (`09:34:23.563`)
/// est refusé par la passerelle.
final class SoundLibraryServiceCursorTests: XCTestCase {

    private let curseurServi = "2026-09-15T09:34:23.563Z"

    private func pageAvecCurseur(_ curseur: String?) -> PaginatedSoundResponse {
        PaginatedSoundResponse(
            success: true,
            data: [],
            pagination: SoundPagination(limit: 30, hasMore: curseur != nil, nextCursor: curseur)
        )
    }

    private func curseurEnvoye(_ api: MockAPIClient) -> String? {
        api.lastRequest?.queryItems?.first(where: { $0.name == "cursor" })?.value
    }

    func test_mySounds_curseurServiAMillisecondes_seRelitEtRepartIdentique() async throws {
        let api = MockAPIClient()
        api.stub("/sounds/mine", result: pageAvecCurseur(curseurServi))
        let service = SoundLibraryService(api: api)

        let premiere = try await service.mySounds(query: nil, cursor: nil, limit: 30)
        let curseur = try XCTUnwrap(premiere.nextCursor,
            "le curseur à millisecondes servi par la passerelle doit se relire — sinon la pagination s'arrête")

        _ = try await service.mySounds(query: nil, cursor: curseur, limit: 30)

        XCTAssertEqual(curseurEnvoye(api), curseurServi,
            "la page suivante renvoie le curseur servi, date comprise")
    }

    func test_posts_curseurServiAMillisecondes_seRelitEtRepartIdentique() async throws {
        let api = MockAPIClient()
        api.stub("/sounds/s1/posts", result: PaginatedSoundPostResponse(
            success: true,
            data: [],
            pagination: SoundPagination(limit: 24, hasMore: true, nextCursor: curseurServi)
        ))
        let service = SoundLibraryService(api: api)

        let premiere = try await service.posts(soundId: "s1", cursor: nil, limit: 24)
        let curseur = try XCTUnwrap(premiere.nextCursor)

        _ = try await service.posts(soundId: "s1", cursor: curseur, limit: 24)

        XCTAssertEqual(curseurEnvoye(api), curseurServi)
    }
}
