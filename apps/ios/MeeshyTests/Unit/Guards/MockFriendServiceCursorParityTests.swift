import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un double qui répond par le PONT d'un protocole n'exerce pas l'exigence.**
///
/// `FriendServiceProviding.friendRequests(direction:status:q:cursor:limit:)` a
/// une implémentation par défaut : elle sert la première page depuis
/// `allFriendRequests`, puis rend une page VIDE dès qu'un curseur est présent.
/// Elle existe pour ne pas casser les conformants HORS dépôt, et c'est le bon
/// choix pour eux.
///
/// Pour un double DU dépôt, elle est un piège d'un genre précis : elle ne casse
/// rien, elle ne ment sur rien, et elle rend simplement le double incapable de
/// jouer le seul scénario qui compte — « il y a une seconde page ». Les suites
/// bâties dessus continuent de passer, puisque « une page, puis fin » est un
/// résultat valide. C'est ainsi que trois écrans (contacts, création de
/// conversation, transfert) ont pu tronquer leur liste à 100 relations sans
/// qu'aucun test ne le dise (#4342).
///
/// Ce témoin appelle le double **par le protocole**, jamais par son type
/// concret : c'est la seule façon de savoir laquelle des deux implémentations
/// répond. Il rougirait le jour où `MockFriendService` perdrait sa méthode et
/// retomberait sur le pont.
@MainActor
final class MockFriendServiceCursorParityTests: XCTestCase {

    private func page(_ ids: [String], hasMore: Bool?) -> OffsetPaginatedAPIResponse<[FriendRequest]> {
        let json = """
        {"success":true,"data":[\(ids.map { id in
            "{\"id\":\"\(id)\",\"senderId\":\"\(id)\",\"receiverId\":\"me\",\"status\":\"accepted\",\"createdAt\":\"2026-01-01T00:00:00.000Z\"}"
        }.joined(separator: ","))],
         "pagination":{\(hasMore.map { "\"hasMore\":\($0)" } ?? "\"total\":0")}}
        """
        return JSONStub.decode(json)
    }

    func test_leDouble_sertLaSecondePage_parLeProtocole_etNonParLePont() async throws {
        let mock = MockFriendService()
        mock.allFriendRequestsResults = [
            .success(page(["a"], hasMore: true)),
            .success(page(["b"], hasMore: false))
        ]

        // Par le PROTOCOLE : c'est ce qui distingue la méthode du double du pont.
        let service: FriendServiceProviding = mock
        let premiere = try await service.friendRequests(
            direction: .any, status: "accepted", q: nil, cursor: nil, limit: 1
        )
        XCTAssertEqual(premiere.data.map(\.id), ["a"])
        let suite = try XCTUnwrap(
            premiere.pagination?.nextCursor,
            "le double doit rendre un curseur tant qu'il reste une page — sans lui, "
            + "toute boucle d'appelant s'arrête à la première, et le pont du SDK est ce "
            + "qui a rendu ce silence possible"
        )

        let seconde = try await service.friendRequests(
            direction: .any, status: "accepted", q: nil, cursor: suite, limit: 1
        )
        XCTAssertEqual(
            seconde.data.map(\.id), ["b"],
            "le pont rendrait ici une page VIDE : c'est exactement le mode de panne "
            + "que ce témoin existe pour attraper"
        )
        XCTAssertNil(seconde.pagination?.nextCursor)
        XCTAssertEqual(mock.friendRequestsCursors, [nil, suite])
    }

    /// Le curseur du double encode une POSITION, comme celui du gateway. Sans
    /// cette propriété, les suites d'écran ne pourraient plus asserter que le
    /// second appel demande ce qui vient APRÈS la première page — elles
    /// n'auraient qu'un opaque, vrai mais muet.
    /// **`direction` décide quel stub répond.** Le pont du SDK route
    /// `.received` vers `receivedRequests` et `.any` vers `allFriendRequests` ;
    /// un double qui ignorerait ce paramètre ferait répondre le mauvais stub, et
    /// le symptôme serait un test d'un TOUT AUTRE écran qui rougit — c'est
    /// exactement ce qui est arrivé à `NotificationActionHandlerTests` quand ce
    /// double a repris l'exigence sans la reprendre entière.
    func test_leDouble_routeParDirection_commeLePont() async throws {
        let mock = MockFriendService()
        mock.receivedRequestsResult = .success(page(["recu"], hasMore: false))
        mock.allFriendRequestsResult = .success(page(["tous"], hasMore: false))
        let service: FriendServiceProviding = mock

        let recu = try await service.friendRequests(
            direction: .received, status: "pending", q: nil, cursor: nil, limit: 50
        )
        XCTAssertEqual(recu.data.map(\.id), ["recu"],
                       "`.received` doit passer par `receivedRequests`, jamais par `allFriendRequests`")

        let tous = try await service.friendRequests(
            direction: .any, status: "accepted", q: nil, cursor: nil, limit: 50
        )
        XCTAssertEqual(tous.data.map(\.id), ["tous"])
    }

    func test_leCurseur_encodeLaPosition_etSeRelitEnDecalage() {
        XCTAssertEqual(MockFriendService.offset(fromCursor: MockFriendService.cursor(forOffset: 100)), 100)
        XCTAssertEqual(MockFriendService.offset(fromCursor: nil), 0,
                       "aucun curseur = la première page")
        XCTAssertEqual(MockFriendService.offset(fromCursor: "opaque"), 0,
                       "un curseur étranger ne doit pas fabriquer un décalage")
    }
}
