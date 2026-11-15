import XCTest
@testable import MeeshySDK

/// Mes permissions se lisent à UNE adresse (#4152).
///
/// Le serveur en portait quatre définitions concurrentes, et les clients
/// lisaient les moins fiables : un ANALYST recevait `canAccessAdmin: true` à la
/// connexion et voyait s'afficher une console que le serveur lui refusait.
final class PermissionsServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: PermissionsService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = PermissionsService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    func test_myPermissions_readsTheSingleAddress() async throws {
        let response = APIResponse<MyPermissions>(
            success: true,
            data: MyPermissions(role: "ANALYST", permissions: MeeshyPermissions(canViewAnalytics: true)),
            error: nil
        )
        mock.stub("/admin/me/permissions", result: response)

        let mine = try await service.myPermissions()

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/admin/me/permissions")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
        // Le rôle voyage AVEC : sans lui, un client qui constate un changement
        // ne peut pas dire ce qui a changé.
        XCTAssertEqual(mine.role, "ANALYST")
        XCTAssertFalse(mine.permissions.canAccessAdmin)
        XCTAssertTrue(mine.permissions.canViewAnalytics)
    }

    func test_absentFlagsDecodeAsFalse_neverAsAccess() async throws {
        // Un drapeau que le serveur n'enverrait pas ne doit jamais OUVRIR une
        // porte. Le défaut d'un `Bool` manquant est l'échec de décodage ; les
        // valeurs par défaut de l'initialiseur sont donc toutes `false`.
        let permissions = MeeshyPermissions()

        XCTAssertFalse(permissions.canAccessAdmin)
        XCTAssertFalse(permissions.canManageUsers)
        XCTAssertFalse(permissions.canModerateContent)
    }
}
