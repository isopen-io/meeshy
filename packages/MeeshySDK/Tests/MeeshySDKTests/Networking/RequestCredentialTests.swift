import XCTest
@testable import MeeshySDK

/// Qui suis-je, et SOUS QUEL EN-TÊTE.
///
/// Le gateway connaît deux populations et deux protocoles : un compte inscrit
/// s'annonce par `Authorization: Bearer <JWT>`, un invité de lien partagé par
/// `X-Session-Token: <anon_…>`. Le second n'est pas un JWT — le présenter en
/// `Bearer` fait répondre « Invalid JWT token », c'est-à-dire un refus qui
/// ressemble à une panne alors que l'identité est valide.
///
/// La règle vivait en clair dans `request(...)`, et le siège de test `#if DEBUG`
/// en portait une COPIE qui avait déjà divergé : elle ne connaissait que le
/// compte. Aucun témoin porté par la copie ne pouvait montrer le trou de la
/// branche anonyme, puisque la copie n'avait pas cette branche. Ces témoins
/// portent sur la règle elle-même.
final class RequestCredentialTests: XCTestCase {

    override func tearDown() {
        APIClient.shared.setTokens(auth: nil, anonymous: nil)
        super.tearDown()
    }

    func test_compteInscrit_sAnnonceEnBearer() {
        APIClient.shared.setTokens(auth: "jwt.abc.def", anonymous: nil)

        XCTAssertEqual(
            APIClient.shared.requestCredential,
            MeeshyRequestCredential(header: "Authorization", value: "Bearer jwt.abc.def")
        )
    }

    func test_invitéDeLien_sAnnonceParSessionToken() {
        APIClient.shared.setTokens(auth: nil, anonymous: "anon_1787081726022_18456d20e")

        XCTAssertEqual(
            APIClient.shared.requestCredential,
            MeeshyRequestCredential(header: "X-Session-Token", value: "anon_1787081726022_18456d20e")
        )
    }

    /// Le cœur du défaut côté web, transposé : un jeton anonyme envoyé en
    /// `Bearer` n'est pas une absence d'identifiant, c'est un identifiant
    /// présenté dans la mauvaise langue.
    func test_jetonAnonyme_nEstJamaisPrésentéCommeUnJWT() {
        APIClient.shared.setTokens(auth: nil, anonymous: "anon_x")

        XCTAssertNotEqual(APIClient.shared.requestCredential?.header, "Authorization")
        XCTAssertFalse(APIClient.shared.requestCredential?.value.hasPrefix("Bearer") ?? true)
    }

    /// Le COMPTE prime : quelqu'un de connecté qui garde une session invitée
    /// dormante reste lui-même.
    func test_leCompte_primeSurUneSessionInvitéeDormante() {
        APIClient.shared.setTokens(auth: "jwt.abc.def", anonymous: "anon_dormant")

        XCTAssertEqual(APIClient.shared.requestCredential?.header, "Authorization")
    }

    func test_sansIdentité_rienÀPrésenter() {
        APIClient.shared.setTokens(auth: nil, anonymous: nil)

        XCTAssertNil(APIClient.shared.requestCredential)
    }

    // MARK: - Ce que le type garantit

    func test_bearer_porteLePréfixe_etSessionToken_nonSurtout() {
        XCTAssertEqual(MeeshyRequestCredential.bearer("t").value, "Bearer t")
        XCTAssertEqual(MeeshyRequestCredential.anonymousSession("anon_t").value, "anon_t")
    }

    /// `isAccount` sert de garde locale aux ressources que le gateway réserve
    /// aux comptes (médias de post, story, statut, commentaire — cf.
    /// `isPostMediaUploadContext`). Les pièces jointes de MESSAGE n'en
    /// dépendent pas : le gateway les accorde aux invités de lien.
    func test_isAccount_distingueLesDeuxProtocoles() {
        XCTAssertTrue(MeeshyRequestCredential.bearer("t").isAccount)
        XCTAssertFalse(MeeshyRequestCredential.anonymousSession("anon_t").isAccount)
    }

    // MARK: - Le siège de test ne ment plus

    /// Il lisait `authToken` seul là où la production lit les DEUX identités.
    /// Un témoin d'en-tête porté par lui était donc structurellement aveugle à
    /// la moitié des requêtes de l'application.
    func test_siègeDeTest_poseLEnTêteAnonymeCommeLaProduction() async throws {
        APIClient.shared.setTokens(auth: nil, anonymous: "anon_seam")

        let request = try await APIClient.shared._buildURLRequestForTesting(ConversationsEndpoint.root)

        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Session-Token"), "anon_seam")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
    }

    /// Un jeton passé explicitement continue de gagner — les suites existantes
    /// s'appuient dessus pour décrire un compte sans toucher à l'état global.
    func test_siègeDeTest_unJetonExpliciteResteSouverain() async throws {
        APIClient.shared.setTokens(auth: nil, anonymous: "anon_ignoré")

        let request = try await APIClient.shared._buildURLRequestForTesting(
            ConversationsEndpoint.root,
            authToken: "jwt.explicite"
        )

        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer jwt.explicite")
    }
}
