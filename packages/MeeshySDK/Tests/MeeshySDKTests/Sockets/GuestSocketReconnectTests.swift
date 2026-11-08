import XCTest
@testable import MeeshySDK

/// #16750 — un INVITÉ de lien partagé que le serveur coupe se reconnecte.
///
/// Les trois portes de reconnexion automatique du gestionnaire de messages
/// étaient gardées par `APIClient.shared.authToken != nil`. Un invité n'a pas
/// de JWT : son identifiant valide vit dans un champ DISTINCT
/// (`anonymousSessionToken`), et son transport est bâti par une autre porte
/// (`connectAnonymous`). Toute la population était donc exclue du remède que
/// l'échelle de backoff existe pour appliquer.
///
/// La passerelle coupe les sockets invité PAR CONCEPTION et sans code
/// d'erreur : `guestLinkWatch` fail-close à la revérification périodique
/// (`socket.disconnect(true)`), ce qu'une erreur Mongo transitoire — bascule de
/// réplique, déploiement — suffit à déclencher sur un lien parfaitement valide.
/// Le lecteur `.error` du client ne trouve alors rien de terminal, la politique
/// de déconnexion rend `retries: true` (Socket.IO ne réessaie donc PAS
/// lui-même, c'est sa raison d'être documentée), et l'échelle rendait la main.
/// L'invité restait devant « Reconnexion… » définitif, sans plus rien recevoir
/// en temps réel, pour seule échappatoire de mettre l'app en arrière-plan.
///
/// Et élargir le seul GARDE aurait été PIRE : `forceReconnect()` exécute
/// `suspendTransport()` — qui détruit la socket de l'invité — puis
/// `establishTransport()`, qui ne savait bâtir qu'un transport d'INSCRIT. Une
/// échelle armée tuait donc une socket vivante sans rien rebâtir. C'est la
/// RECONSTRUCTION qui apprend le credential, et c'est ce que cette suite prouve.
final class GuestSocketReconnectTests: XCTestCase {

    private static let guestSessionToken = "anon_guest_16750"

    private var savedTokens: (auth: String?, anon: String?) = (nil, nil)

    /// #10854 — les sockets de cette suite s'arment contre le loopback, dont le
    /// sondage tombe sous le sceau réseau : aucune ne joint un serveur. Sans
    /// cette origine, `SocketConfig.baseURL` est nil dans le paquet de tests et
    /// toute reconstruction rendrait `.notArmed` pour une raison étrangère au
    /// lot — le témoin ne pourrait plus distinguer « pas de credential » de
    /// « pas d'adresse ».
    override func invokeTest() {
        SocketConfig.$loopbackOrigin.withValue(URL(string: "http://127.0.0.1:9")) { super.invokeTest() }
    }

    override func setUp() {
        super.setUp()
        savedTokens = APIClient.shared.currentTokens()
        MessageSocketManager.shared.isCallActiveGuard = nil
        MessageSocketManager.shared.disconnect()
        // La paire est posée D'UN SEUL TENANT : un invité est « pas de JWT ET un
        // jeton de session », jamais l'un des deux laissé au hasard de l'ordre
        // des suites.
        APIClient.shared.setTokens(auth: nil, anonymous: Self.guestSessionToken)
    }

    override func tearDown() {
        MessageSocketManager.shared.disconnect()
        APIClient.shared.setTokens(auth: savedTokens.auth, anonymous: savedTokens.anon)
        super.tearDown()
    }

    // MARK: - La reconstruction connaît l'invité

    func test_establishTransport_withGuestSessionOnly_buildsTheGuestTransport() {
        let sut = MessageSocketManager.shared

        XCTAssertEqual(
            sut.establishTransport(), .armed,
            "« pas de JWT » n'est pas « pas de session » : la reconstruction doit router sur le credential, "
            + "sinon l'échelle de backoff tourne à vide pour tous les invités de lien partagé"
        )
        XCTAssertNotNil(sut.socket, "Un `.armed` sans socket serait un mensonge d'issue")
    }

    func test_guestTransport_presentsNoAccount() {
        let sut = MessageSocketManager.shared

        XCTAssertEqual(sut.establishTransport(), .armed)

        XCTAssertNil(
            sut.connectionAccountId,
            "Le jeton d'un invité n'est pas un JWT : le présenter en `Bearer` fait répondre « Invalid JWT "
            + "token » — un refus qui ressemble à une panne d'authentification alors que l'identité est valide"
        )
    }

    // MARK: - Le serveur coupe, l'invité revient

    func test_forceReconnect_withGuestSessionOnly_rebuildsInsteadOfArmingAnEmptyLadder() {
        let sut = MessageSocketManager.shared

        sut.forceReconnect()

        XCTAssertNotNil(
            sut.socket,
            "`forceReconnect()` démonte inconditionnellement : s'il ne rebâtit pas pour un invité, il laisse "
            + "l'app sans transport ET sans la boucle de reprise de Socket.IO"
        )
        XCTAssertFalse(
            sut.hasPendingReconnect,
            "Un transport rebâti n'a pas besoin de l'échelle — Socket.IO reprend la main de là"
        )
    }

    // MARK: - Ce que le correctif ne doit PAS élargir

    /// La garde d'origine est JUSTE pour une app déconnectée : `requireReauthentication`
    /// efface le jeton, et aucune reconnexion n'aide — seule une nouvelle
    /// connexion le fait. Le correctif distingue « aucun credential » de
    /// « credential d'invité » ; il ne retire pas la garde.
    func test_withoutAnyCredential_nothingIsBuiltAndNothingIsArmed() {
        APIClient.shared.setTokens(auth: nil, anonymous: nil)
        let sut = MessageSocketManager.shared

        XCTAssertEqual(sut.establishTransport(), .notArmed)

        sut.forceReconnect()

        XCTAssertFalse(
            sut.hasPendingReconnect,
            "A logged-out app must not schedule reconnect attempts that cannot succeed"
        )
        XCTAssertNil(sut.socket)
    }
}
