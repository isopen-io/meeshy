import XCTest
@testable import MeeshySDK

/// #10872 — le lien de connexion est lié à l'appareil qui l'a demandé : la
/// demande porte l'EMPREINTE d'un secret gardé au trousseau, la consommation
/// présente le secret ; une réponse « confirmation requise » n'ouvre rien.
final class LinkDeviceBindingTests: XCTestCase {

    private func makeSUT() -> (service: AuthService, api: MockAPIClient, keychain: InMemoryLinkKeychain) {
        let api = MockAPIClient()
        let keychain = InMemoryLinkKeychain()
        let service = AuthService(api: api, linkDevice: KeychainLinkDeviceBinding(keychain: keychain))
        return (service, api, keychain)
    }

    private func storedSecret(_ keychain: InMemoryLinkKeychain) -> String? {
        keychain.load(forKey: KeychainLinkDeviceBinding.key, account: nil)
    }

    private func sessionResponse() -> APIResponse<LoginResponseData> {
        APIResponse(success: true, data: LoginResponseData(
            user: MeeshyUser(id: "u1", username: "marie"), token: "jwt", sessionToken: "s",
            expiresIn: 86400, requires2FA: nil, twoFactorToken: nil
        ), error: nil)
    }

    private func confirmationResponse() -> APIResponse<LoginResponseData> {
        APIResponse(success: true, data: LoginResponseData(
            user: nil, token: nil, sessionToken: nil, expiresIn: nil, requires2FA: nil, twoFactorToken: nil,
            requiresConfirmation: true,
            account: LinkSignInAccount(id: "attacker", username: "mallory", displayName: "Mallory")
        ), error: nil)
    }

    // MARK: - Demande

    func test_requestMagicLink_sendsTheHashOfTheSecretKeptInTheKeychain() async throws {
        let (service, api, keychain) = makeSUT()
        api.stub("/auth/magic-link/request", result: MagicLinkResponse(success: true, message: nil, expiresInSeconds: 600, error: nil))

        _ = try await service.requestMagicLink(email: "marie@example.com")

        let secret = try XCTUnwrap(storedSecret(keychain))
        XCTAssertEqual(secret.count, 43, "32 octets en base64url sans remplissage")
        XCTAssertNil(secret.range(of: "[^A-Za-z0-9_-]", options: .regularExpression))
        let hash = try XCTUnwrap(api.lastRequest?.bodyJSON?["linkDeviceHash"] as? String)
        XCTAssertEqual(hash, LinkDeviceBinding.hash(of: secret))
        XCTAssertNotNil(hash.range(of: "^[0-9a-f]{64}$", options: .regularExpression))
    }

    func test_requestEmailCode_bindsTheLinkToo() async throws {
        let (service, api, keychain) = makeSUT()
        api.stub("/auth/magic-link/request", result: APIResponse(success: true, data: EmailCodeDispatch(expiresInSeconds: 900, pendingSessionToken: nil), error: nil))

        _ = try await service.requestEmailCode(email: "marie@example.com")

        let secret = try XCTUnwrap(storedSecret(keychain))
        XCTAssertEqual(api.lastRequest?.bodyJSON?["linkDeviceHash"] as? String, LinkDeviceBinding.hash(of: secret))
    }

    func test_eachRequest_drawsAFreshSecret() async throws {
        let (service, api, keychain) = makeSUT()
        api.stub("/auth/magic-link/request", result: MagicLinkResponse(success: true, message: nil, expiresInSeconds: 600, error: nil))

        _ = try await service.requestMagicLink(email: "marie@example.com")
        let first = storedSecret(keychain)
        _ = try await service.requestMagicLink(email: "marie@example.com")

        XCTAssertNotEqual(first, storedSecret(keychain))
    }

    func test_hash_isTheLowercaseHexSHA256OfTheUTF8Secret() {
        XCTAssertEqual(LinkDeviceBinding.hash(of: "abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    // MARK: - Consommation — même appareil

    func test_validateMagicLink_onTheRequestingDevice_presentsTheSecret_andForgetsItOnceSettled() async throws {
        let (service, api, keychain) = makeSUT()
        try keychain.save("secret-de-cet-appareil-0123456789", forKey: KeychainLinkDeviceBinding.key, account: nil)
        api.stub("/auth/magic-link/validate", result: sessionResponse())

        let data = try await service.validateMagicLink(token: "tok")

        XCTAssertEqual(data.token, "jwt")
        XCTAssertEqual(api.lastRequest?.bodyJSON?["linkDeviceSecret"] as? String, "secret-de-cet-appareil-0123456789")
        XCTAssertNil(api.lastRequest?.bodyJSON?["confirm"], "aucun « oui » n'a été donné")
        XCTAssertNil(storedSecret(keychain), "le secret ne sert qu'une fois")
    }

    func test_confirmEmail_byLink_presentsTheSecret_byCode_never() async throws {
        let (service, api, keychain) = makeSUT()
        try keychain.save("secret-de-cet-appareil-0123456789", forKey: KeychainLinkDeviceBinding.key, account: nil)
        api.stub("/auth/verify-email", result: confirmationResponse())

        _ = try await service.confirmEmail(.code("123456", email: "marie@example.com"))
        XCTAssertNil(api.lastRequest?.bodyJSON?["linkDeviceSecret"])

        _ = try await service.confirmEmail(.link(token: "tok", email: "marie@example.com"))
        XCTAssertEqual(api.lastRequest?.bodyJSON?["linkDeviceSecret"] as? String, "secret-de-cet-appareil-0123456789")
    }

    // MARK: - Autre appareil / lien forgé

    func test_noSecret_sendsNoSecretField() async throws {
        let (service, api, _) = makeSUT()
        api.stub("/auth/magic-link/validate", result: confirmationResponse())

        _ = try await service.validateMagicLink(token: "tok")

        XCTAssertNil(api.lastRequest?.bodyJSON?["linkDeviceSecret"])
        XCTAssertNil(api.lastRequest?.bodyJSON?["confirm"])
    }

    func test_confirmationRequired_keepsTheSecret_andServesNoSession() async throws {
        let (service, api, keychain) = makeSUT()
        try keychain.save("secret-de-cet-appareil-0123456789", forKey: KeychainLinkDeviceBinding.key, account: nil)
        api.stub("/auth/magic-link/validate", result: confirmationResponse())

        let data = try await service.validateMagicLink(token: "tok")

        XCTAssertNotNil(storedSecret(keychain), "le jeton n'est pas consommé : le secret reste")
        XCTAssertThrowsError(try EmailProvenSession.served(by: data)) { error in
            XCTAssertEqual(error as? LinkConfirmationRequired,
                           LinkConfirmationRequired(account: LinkSignInAccount(id: "attacker", username: "mallory", displayName: "Mallory")))
        }
    }

    func test_confirmed_replaysWithConfirmTrue() async throws {
        let (service, api, _) = makeSUT()
        api.stub("/auth/magic-link/validate", result: sessionResponse())
        api.stub("/auth/verify-email", result: sessionResponse())

        _ = try await service.validateMagicLink(token: "tok", confirmed: true)
        XCTAssertEqual(api.lastRequest?.bodyJSON?["confirm"] as? Bool, true)

        _ = try await service.confirmEmail(.link(token: "tok", email: "marie@example.com", confirmed: true))
        XCTAssertEqual(api.lastRequest?.bodyJSON?["confirm"] as? Bool, true)
    }

    // MARK: - Décodage

    func test_decodesTheConfirmationBranch() throws {
        let json = #"{"requiresConfirmation":true,"account":{"id":"u9","username":"mallory","displayName":"Mallory","avatar":null}}"#
        let data = try JSONDecoder().decode(LoginResponseData.self, from: Data(json.utf8))

        XCTAssertEqual(data.requiresConfirmation, true)
        XCTAssertEqual(data.account, LinkSignInAccount(id: "u9", username: "mallory", displayName: "Mallory"))
        XCTAssertNil(data.token)
    }

    func test_anIllegibleAccount_readsAbsent_neverFailsTheDecoding() throws {
        let json = #"{"token":"jwt","requiresConfirmation":"oui","account":{"id":4}}"#
        let data = try JSONDecoder().decode(LoginResponseData.self, from: Data(json.utf8))

        XCTAssertEqual(data.token, "jwt")
        XCTAssertNil(data.requiresConfirmation)
        XCTAssertNil(data.account)
    }

    // MARK: - #10883 — ce que le oui fera, et l'adresse en jeu

    private func question(_ json: String) throws -> LinkConfirmationRequired? {
        let data = try JSONDecoder().decode(LoginResponseData.self, from: Data(json.utf8))
        do {
            _ = try EmailProvenSession.served(by: data)
            return nil
        } catch let pending as LinkConfirmationRequired {
            return pending
        }
    }

    func test_aClaimQuestion_carriesItsIntent_andTheMaskedAddress() throws {
        let pending = try question(#"{"requiresConfirmation":true,"account":{"id":"u9","username":"mallory"},"intent":"claim-email","maskedEmail":"ma....e@e*****om"}"#)

        XCTAssertEqual(pending, LinkConfirmationRequired(
            account: LinkSignInAccount(id: "u9", username: "mallory"),
            intent: .claimEmail,
            maskedEmail: "ma....e@e*****om"))
    }

    func test_aSignInQuestion_carriesItsIntent_andTheMaskedAddress() throws {
        let pending = try question(#"{"requiresConfirmation":true,"account":{"id":"u9","username":"mallory"},"intent":"sign-in","maskedEmail":"te....r@e*****om"}"#)

        XCTAssertEqual(pending?.intent, .signIn)
        XCTAssertEqual(pending?.maskedEmail, "te....r@e*****om")
    }

    func test_aGatewayBefore10879_withoutIntentNorAddress_asksASimpleSignIn() throws {
        let pending = try question(#"{"requiresConfirmation":true,"account":{"id":"u9","username":"mallory"}}"#)

        XCTAssertEqual(pending, LinkConfirmationRequired(account: LinkSignInAccount(id: "u9", username: "mallory")))
        XCTAssertEqual(pending?.intent, .signIn)
        XCTAssertNil(pending?.maskedEmail)
    }

    func test_anUnknownOrIllegibleIntent_readsSignIn_neverFailsTheDecoding() throws {
        let unknown = try question(#"{"requiresConfirmation":true,"account":{"id":"u9","username":"mallory"},"intent":"merge","maskedEmail":4}"#)
        let illegible = try question(#"{"requiresConfirmation":true,"account":{"id":"u9","username":"mallory"},"intent":7}"#)

        XCTAssertEqual(unknown?.intent, .signIn)
        XCTAssertNil(unknown?.maskedEmail)
        XCTAssertEqual(illegible?.intent, .signIn)
    }
}

final class InMemoryLinkKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws {
        lock.lock(); defer { lock.unlock() }
        store[key] = value
    }

    func load(forKey key: String, account: String?) -> String? {
        lock.lock(); defer { lock.unlock() }
        return store[key]
    }

    func delete(forKey key: String, account: String?) {
        lock.lock(); defer { lock.unlock() }
        store[key] = nil
    }

    func saveAsync(_ value: String, forKey key: String, account: String?) async throws {
        try save(value, forKey: key, account: account)
    }

    func loadAsync(forKey key: String, account: String?) async -> String? {
        load(forKey: key, account: account)
    }
}
