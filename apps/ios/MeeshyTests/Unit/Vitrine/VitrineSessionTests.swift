import XCTest
import MeeshySDK
@testable import Meeshy

final class VitrineSessionTests: XCTestCase {
    func test_verifierIsolement_loopback_isAccepted() {
        XCTAssertNoThrow(try VitrineSession.verifierIsolement(origine: "http://127.0.0.1:9"))
        XCTAssertNoThrow(try VitrineSession.verifierIsolement(origine: "http://localhost:9"))
    }

    func test_verifierIsolement_realServers_areRefused() {
        XCTAssertThrowsError(try VitrineSession.verifierIsolement(origine: "https://gate.meeshy.me")) { erreur in
            XCTAssertEqual(erreur as? VitrineSessionRefus, .serveurReel("https://gate.meeshy.me"))
        }
        XCTAssertThrowsError(try VitrineSession.verifierIsolement(origine: "https://gate.staging.meeshy.me"))
    }

    /// Une boucle locale n'est pas un hôte mort : la passerelle de dev écoute sur `localhost:3000`.
    func test_verifierIsolement_liveLocalGateway_isRefused() {
        XCTAssertThrowsError(try VitrineSession.verifierIsolement(origine: "http://localhost:3000"))
        XCTAssertThrowsError(try VitrineSession.verifierIsolement(origine: "http://127.0.0.1:3000"))
    }

    func test_poser_writesTheThreeKeysRestoreStoredSessionReads() throws {
        let keychain = VitrineKeychain()
        let lecteur = MeeshyUser(id: "68f0000000000000000000aa", username: "lea.mtn", displayName: "Léa Martin")
        try VitrineSession.poser(lecteur, keychain: keychain)
        XCTAssertEqual(keychain.load(forKey: "meeshy_active_user_id", account: nil), lecteur.id)
        XCTAssertEqual(keychain.load(forKey: "meeshy_token_\(lecteur.id)", account: nil), VitrineSession.jetonFictif)
        let json = try XCTUnwrap(keychain.load(forKey: "meeshy_user_\(lecteur.id)", account: nil))
        XCTAssertEqual(try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8)).username, "lea.mtn")
    }

    func test_retirer_forgetsTheActiveUser() throws {
        let keychain = VitrineKeychain()
        try VitrineSession.poser(MeeshyUser(id: "68f0000000000000000000aa", username: "lea.mtn"), keychain: keychain)
        VitrineSession.retirer(keychain: keychain)
        XCTAssertNil(keychain.load(forKey: "meeshy_active_user_id", account: nil))
    }

    /// Lancée sur un appareil qui porte une vraie session, la vitrine refuse au lieu de la remplacer.
    func test_verifierProprietaire_foreignActiveSession_isRefused() throws {
        let keychain = VitrineKeychain()
        try keychain.save("68f0000000000000000000ee", forKey: "meeshy_active_user_id", account: nil)
        XCTAssertThrowsError(try VitrineSession.verifierProprietaire(lecteur: "68f0000000000000000000aa", keychain: keychain)) { erreur in
            XCTAssertEqual(erreur as? VitrineSessionRefus, .sessionReelle("68f0000000000000000000ee"))
        }
    }

    func test_verifierProprietaire_foreignSavedAccount_isRefused() throws {
        let keychain = VitrineKeychain()
        try keychain.save(Self.comptes(["68f0000000000000000000ee"]), forKey: "meeshy_saved_accounts", account: nil)
        XCTAssertThrowsError(try VitrineSession.verifierProprietaire(lecteur: "68f0000000000000000000aa", keychain: keychain)) { erreur in
            XCTAssertEqual(erreur as? VitrineSessionRefus, .sessionReelle("68f0000000000000000000ee"))
        }
    }

    /// Changer de langue entre deux captures remplace le lecteur que la vitrine a posé elle-même.
    func test_verifierProprietaire_aReaderTheVitrinePosed_isAccepted() throws {
        let keychain = VitrineKeychain()
        try VitrineSession.poser(MeeshyUser(id: "68f0000000000000000000aa", username: "lea.mtn"), keychain: keychain)
        try keychain.save(Self.comptes(["68f0000000000000000000aa"]), forKey: "meeshy_saved_accounts", account: nil)
        XCTAssertNoThrow(try VitrineSession.verifierProprietaire(lecteur: "68f0000000000000000000bb", keychain: keychain))
    }

    func test_retirer_leavesAForeignActiveSessionUntouched() throws {
        let keychain = VitrineKeychain()
        try keychain.save("68f0000000000000000000ee", forKey: "meeshy_active_user_id", account: nil)
        VitrineSession.retirer(keychain: keychain)
        XCTAssertEqual(keychain.load(forKey: "meeshy_active_user_id", account: nil), "68f0000000000000000000ee")
    }

    private static func comptes(_ ids: [String]) throws -> String {
        let comptes = ids.map { SavedAccount(id: $0, username: $0, displayName: nil, avatarURL: nil, lastActiveAt: Date()) }
        return String(decoding: try JSONEncoder().encode(comptes), as: UTF8.self)
    }

    func test_jetonFictif_isAStructurallyValidJwtThatNeverExpires() {
        XCTAssertFalse(AuthManager.isTokenExpired(VitrineSession.jetonFictif, now: Date()))
    }
}

private final class VitrineKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
