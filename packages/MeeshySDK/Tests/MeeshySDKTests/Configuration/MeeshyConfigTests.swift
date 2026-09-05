import XCTest
@testable import MeeshySDK

final class MeeshyConfigTests: XCTestCase {

    private let defaultAPIURL = "https://gate.meeshy.me/api/v1"

    override func tearDown() {
        super.tearDown()
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL, bundleId: "me.meeshy.app")
    }

    // MARK: - Default Values

    func testDefaultApiBaseURL() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL)
        XCTAssertEqual(config.apiBaseURL, "https://gate.meeshy.me/api/v1")
    }

    func testDefaultAppBundleId() {
        let config = MeeshyConfig.shared
        XCTAssertEqual(config.appBundleId, "me.meeshy.app")
    }

    // MARK: - configure()

    func testConfigureSetsApiBaseURL() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://custom.api.com/api/v2")
        XCTAssertEqual(config.apiBaseURL, "https://custom.api.com/api/v2")
    }

    func testConfigureSetsBundleId() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL, bundleId: "com.custom.bundle")
        XCTAssertEqual(config.appBundleId, "com.custom.bundle")
    }

    func testConfigureWithNilBundleIdPreservesExisting() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL, bundleId: "com.test.app")
        config.configure(apiURL: defaultAPIURL)
        XCTAssertEqual(config.appBundleId, "com.test.app")
    }

    // MARK: - serverOrigin Computed Property

    func testServerOriginExtractsSchemeAndHost() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")
        XCTAssertEqual(config.serverOrigin, "https://gate.meeshy.me")
    }

    func testServerOriginPreservesPort() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "http://localhost:3000/api/v1")
        XCTAssertEqual(config.serverOrigin, "http://localhost:3000")
    }

    func testServerOriginWithDeepPath() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://api.example.com/v2/deep/path")
        XCTAssertEqual(config.serverOrigin, "https://api.example.com")
    }

    // MARK: - webOrigin Computed Property
    //
    // Regression guard: user-facing share / deep links MUST resolve to the
    // public web origin (which serves apple-app-site-association + matches the
    // in-app DeepLinkParser host set), NOT the `gate.` API origin. A
    // `gate.meeshy.me/join/…` link neither verifies as a Universal Link nor
    // routes in-app — it falls through to an API 404.

    func testWebOriginStripsGateSubdomainInProduction() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")
        XCTAssertEqual(config.webOrigin, "https://meeshy.me")
    }

    func testWebOriginStripsGateSubdomainInStaging() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.staging.meeshy.me/api/v1")
        XCTAssertEqual(config.webOrigin, "https://staging.meeshy.me")
    }

    func testWebOriginRemapsLocalhostPort() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "http://localhost:3000/api/v1")
        XCTAssertEqual(config.webOrigin, "http://localhost:3100")
    }

    func testWebOriginReturnsHostWithoutGatePrefixVerbatim() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://custom.example.com/api/v1")
        XCTAssertEqual(config.webOrigin, "https://custom.example.com")
    }

    // MARK: - socketBaseURL Computed Property

    func testSocketBaseURLMatchesServerOrigin() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")
        XCTAssertEqual(config.socketBaseURL, config.serverOrigin)
    }

    // MARK: - resolveMediaURL()

    func testResolveMediaURLResolvesRelativePath() {
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL)
        let url = MeeshyConfig.resolveMediaURL("/api/v1/attachments/file/abc123")
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/api/v1/attachments/file/abc123")
    }

    func testResolveMediaURLResolvesRelativePathWithoutLeadingSlash() {
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL)
        let url = MeeshyConfig.resolveMediaURL("api/v1/attachments/file/abc123")
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/api/v1/attachments/file/abc123")
    }

    func testResolveMediaURLReturnsAbsoluteHTTPSAsIs() {
        let url = MeeshyConfig.resolveMediaURL("https://cdn.example.com/image.png")
        XCTAssertEqual(url?.absoluteString, "https://cdn.example.com/image.png")
    }

    func testResolveMediaURLRejectsPlainHTTPForRemote() {
        let url = MeeshyConfig.resolveMediaURL("http://cdn.example.com/image.png")
        XCTAssertNil(url)
    }

    // MARK: - file:// Passthrough (Sprint 3 RC3.1)

    func test_resolveMediaURL_withFileScheme_returnsURLUnchanged() {
        let local = "file:///var/mobile/Containers/Data/Application/ABC/tmp/camera_42.jpg"
        let url = MeeshyConfig.resolveMediaURL(local)
        XCTAssertEqual(url?.absoluteString, local)
        XCTAssertTrue(url?.isFileURL == true)
    }

    func test_resolveMediaURL_withFileScheme_isNotPrefixedWithServerOrigin() {
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL)
        let url = MeeshyConfig.resolveMediaURL("file:///private/var/tmp/recording.m4a")
        XCTAssertEqual(url?.scheme, "file")
        XCTAssertEqual(url?.absoluteString, "file:///private/var/tmp/recording.m4a")
        XCTAssertFalse(url?.absoluteString.contains("meeshy.me") ?? true,
                       "A file:// URL must never be prefixed with the server origin")
    }

    func test_resolveMediaURL_withFileScheme_skipsSSRFChecks() {
        // A file path that happens to embed "127.0.0.1" must NOT be rejected:
        // the file:// fast-path short-circuits before the SSRF host checks.
        let url = MeeshyConfig.resolveMediaURL("file:///var/tmp/127.0.0.1/photo.png")
        XCTAssertNotNil(url)
        XCTAssertTrue(url?.isFileURL == true)
        // A genuine network URL pointing at loopback is still rejected.
        XCTAssertNil(MeeshyConfig.resolveMediaURL("https://127.0.0.1/secret"))
    }

    // MARK: - SSRF Protection

    func testResolveMediaURLRejectsLoopback127() {
        let url = MeeshyConfig.resolveMediaURL("https://127.0.0.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLRejects10Network() {
        let url = MeeshyConfig.resolveMediaURL("https://10.0.0.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLRejects192168Network() {
        let url = MeeshyConfig.resolveMediaURL("https://192.168.1.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLRejects172PrivateRange() {
        for second in [16, 20, 31] {
            let url = MeeshyConfig.resolveMediaURL("https://172.\(second).0.1/secret")
            XCTAssertNil(url, "Should reject 172.\(second).x.x")
        }
    }

    func testResolveMediaURLRejectsLinkLocal169254() {
        let url = MeeshyConfig.resolveMediaURL("https://169.254.1.1/secret")
        XCTAssertNil(url)
    }

    func testResolveMediaURLAllows172OutsidePrivateRange() {
        let url = MeeshyConfig.resolveMediaURL("https://172.32.0.1/page")
        XCTAssertNotNil(url)
    }

    // MARK: - Localhost in Dev

    func testResolveMediaURLAllowsLocalhostHTTPWhenConfiguredLocally() {
        MeeshyConfig.shared.setUseLocalGateway(true)
        let url = MeeshyConfig.resolveMediaURL("http://localhost:3000/api/v1/attachments/file/abc")
        XCTAssertNotNil(url)
        XCTAssertEqual(url?.host, "localhost")
    }

    func testResolveMediaURLAllowsLocalhostHTTPAlways() {
        let url = MeeshyConfig.resolveMediaURL("http://localhost/resource")
        XCTAssertNotNil(url)
    }

    // MARK: - Nil/Empty Input

    func testResolveMediaURLResolvesEmptyStringToServerRoot() {
        MeeshyConfig.shared.configure(apiURL: defaultAPIURL)
        let url = MeeshyConfig.resolveMediaURL("")
        XCTAssertEqual(url?.absoluteString, "https://gate.meeshy.me/")
    }

    // MARK: - setUseLocalGateway

    func testSetUseLocalGatewayTrueSwitchesToLocalhost() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL)
        config.setUseLocalGateway(true)
        XCTAssertTrue(config.apiBaseURL.hasPrefix("http://localhost:3000"))
        XCTAssertTrue(config.apiBaseURL.hasSuffix("/api/v1"))
    }

    func testSetUseLocalGatewayFalseRestoresRemoteURL() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: defaultAPIURL)
        config.setUseLocalGateway(true)
        config.setUseLocalGateway(false)
        XCTAssertEqual(config.apiBaseURL, "https://gate.meeshy.me/api/v1")
    }

    func testSetUseLocalGatewayPreservesAPIPath() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v2")
        config.setUseLocalGateway(true)
        XCTAssertEqual(config.apiBaseURL, "http://localhost:3000/api/v2")
    }

    // MARK: - Version Constant

    func testVersionConstant() {
        XCTAssertEqual(MeeshySDK.version, "1.0.0")
    }

    // MARK: - Une CLÉ DE STOCKAGE est une route que le SDK doit poser (#4324)

    /// La base ne porte que la clé du média — `2025/10/<id>/photo.png` —, jamais
    /// l'adresse par laquelle on le sert : ni hôte, ni préfixe d'API, ni version,
    /// qui sont des décisions de déploiement. C'est au SDK de poser la route.
    ///
    /// Sans cela, `serverOrigin + "/" + clé` rendait
    /// `https://gate.meeshy.me/2025/10/…` — le segment `/attachments/file/`
    /// manquait, et les 514 attachements déjà stockés sous cette forme étaient
    /// illisibles sur iOS comme sur Android. Le web, lui, composait déjà.
    func testResolveMediaURLPosesTheRouteForAStorageKey() {
        MeeshyConfig.shared.configure(apiURL: "https://gate.meeshy.me/api/v1", bundleId: nil)

        let url = MeeshyConfig.resolveMediaURL("2025/10/68c07400/photo.png")

        XCTAssertEqual(
            url?.absoluteString,
            "https://gate.meeshy.me/api/v1/attachments/file/2025/10/68c07400/photo.png"
        )
    }

    /// La route posée SUIT le préfixe configuré : la version n'est pas une
    /// constante du SDK, elle vient de `apiBaseURL`.
    func testResolveMediaURLFollowsTheConfiguredApiPath() {
        MeeshyConfig.shared.configure(apiURL: "https://gate.meeshy.me/api/v2", bundleId: nil)

        let url = MeeshyConfig.resolveMediaURL("2025/10/68c07400/photo.png")

        XCTAssertEqual(
            url?.absoluteString,
            "https://gate.meeshy.me/api/v2/attachments/file/2025/10/68c07400/photo.png"
        )
    }

    /// Les caractères qu'une URL ne peut pas porter tels quels sont encodés —
    /// mais JAMAIS les barres obliques, qui sont les séparateurs du chemin.
    func testResolveMediaURLEncodesSegmentsWithoutBreakingThePath() {
        MeeshyConfig.shared.configure(apiURL: "https://gate.meeshy.me/api/v1", bundleId: nil)

        let url = MeeshyConfig.resolveMediaURL("2025/10/id/Rapport final.pdf")

        XCTAssertEqual(
            url?.absoluteString,
            "https://gate.meeshy.me/api/v1/attachments/file/2025/10/id/Rapport%20final.pdf"
        )
    }

    /// Un chemin ABSOLU garde son sens : il porte déjà sa route, le SDK n'en
    /// pose pas une seconde.
    func testResolveMediaURLLeavesAnAbsolutePathAlone() {
        MeeshyConfig.shared.configure(apiURL: "https://gate.meeshy.me/api/v1", bundleId: nil)

        XCTAssertEqual(
            MeeshyConfig.resolveMediaURL("/api/v1/attachments/file/2025/10/id/photo.png")?.absoluteString,
            "https://gate.meeshy.me/api/v1/attachments/file/2025/10/id/photo.png"
        )
        XCTAssertEqual(
            MeeshyConfig.resolveMediaURL("https://gate.meeshy.me/api/v1/attachments/file/x.png")?.absoluteString,
            "https://gate.meeshy.me/api/v1/attachments/file/x.png"
        )
    }


    // MARK: - Magasin statique (#4625)
    //
    // 272 avatars de staging portaient leur adresse absolue et ne s'affichaient
    // QUE pour cette raison : reduits a leur cle, ils partaient se chercher sur
    // la passerelle, ou ils ne sont pas. Le schema `static:` est ce qui les rend
    // migrables, et ces temoins sont le pendant iOS de ceux de
    // `packages/shared/api/__tests__/media-ref.test.ts`.

    func test_staticOrigin_estDeriveDuDomaineWeb_jamaisConfigureAPart() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")
        XCTAssertEqual(config.staticOrigin, "https://static.meeshy.me")

        config.configure(apiURL: "https://gate.staging.meeshy.me/api/v1")
        XCTAssertEqual(config.staticOrigin, "https://static.staging.meeshy.me")
    }

    func test_staticOrigin_enDeveloppement_estLOrigineWebAvecSonPORT() {
        // Next sert `public/` a la racine de son origine : il n'y a pas de
        // sous-domaine a poser, et le port doit survivre — c'est ce qu'un
        // `URL.host` aurait perdu.
        let config = MeeshyConfig.shared
        config.configure(apiURL: "http://localhost:3000/api/v1")
        XCTAssertEqual(config.staticOrigin, "http://localhost:3100")
    }

    func test_uneCleStatique_vaSurLHOTE_STATIQUE_jamaisSurLaPasserelle() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")

        let url = MeeshyConfig.resolveMediaURL("static:u/i/2025/11/avatar_1763143871947_o0.jpg")

        XCTAssertEqual(
            url?.absoluteString,
            "https://static.meeshy.me/u/i/2025/11/avatar_1763143871947_o0.jpg"
        )
    }

    func test_deuxClesQuAucuneFORMENeDistinguait_vontADeuxMagasins() {
        // Le temoin decisif : ni `u/i/2025/11/a.jpg` ni `avatars/user/<id>.jpg`
        // ne ressemble a une cle datee, et les deux partaient au meme hote.
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")

        XCTAssertEqual(
            MeeshyConfig.resolveMediaURL("static:u/i/2025/11/a.jpg")?.absoluteString,
            "https://static.meeshy.me/u/i/2025/11/a.jpg"
        )
        XCTAssertEqual(
            MeeshyConfig.resolveMediaURL("avatars/user/68f2a814.jpg")?.absoluteString,
            "https://gate.meeshy.me/api/v1/attachments/file/avatars/user/68f2a814.jpg"
        )
    }

    func test_unSchemaSansCle_neDesigneAucunMedia() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")

        XCTAssertNil(MeeshyConfig.resolveMediaURL("static:"))
        XCTAssertNil(MeeshyConfig.resolveMediaURL("static:/"))
    }

    func test_uneAdresseAbsolueDuMagasinStatique_traverseSansEtreRecomposee() {
        let config = MeeshyConfig.shared
        config.configure(apiURL: "https://gate.meeshy.me/api/v1")

        let heritee = "https://static.meeshy.me/u/i/2025/11/a.jpg"
        XCTAssertEqual(MeeshyConfig.resolveMediaURL(heritee)?.absoluteString, heritee)
    }

}
