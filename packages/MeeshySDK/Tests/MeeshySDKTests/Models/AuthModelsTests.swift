import XCTest
@testable import MeeshySDK

final class AuthModelsTests: XCTestCase {

    // MARK: - LoginRequest

    func testLoginRequestEncodable() throws {
        let request = LoginRequest(username: "atabeth", password: "secret123", rememberDevice: true)
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["username"] as? String, "atabeth")
        XCTAssertEqual(dict["password"] as? String, "secret123")
        XCTAssertEqual(dict["rememberDevice"] as? Bool, true)
    }

    func testLoginRequestRememberDeviceDefaultTrue() throws {
        let request = LoginRequest(username: "user1", password: "pass")
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["rememberDevice"] as? Bool, true)
    }

    // MARK: - RegisterRequest

    func testRegisterRequestEncodable() throws {
        let request = RegisterRequest(
            username: "newuser", password: "strongpass",
            firstName: "Jean", lastName: "Dupont",
            email: "jean@example.com", phoneNumber: "+33612345678",
            phoneCountryCode: "FR", systemLanguage: "fr", regionalLanguage: "oc"
        )
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["username"] as? String, "newuser")
        XCTAssertEqual(dict["password"] as? String, "strongpass")
        XCTAssertEqual(dict["firstName"] as? String, "Jean")
        XCTAssertEqual(dict["lastName"] as? String, "Dupont")
        XCTAssertEqual(dict["email"] as? String, "jean@example.com")
        XCTAssertEqual(dict["phoneNumber"] as? String, "+33612345678")
        XCTAssertEqual(dict["phoneCountryCode"] as? String, "FR")
        XCTAssertEqual(dict["systemLanguage"] as? String, "fr")
        XCTAssertEqual(dict["regionalLanguage"] as? String, "oc")
    }

    func testRegisterRequestDefaultLanguages() throws {
        let request = RegisterRequest(
            username: "u", password: "p", firstName: "A", lastName: "B", email: "a@b.c"
        )
        let data = try JSONEncoder().encode(request)
        let dict = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertEqual(dict["systemLanguage"] as? String, "fr")
        XCTAssertEqual(dict["regionalLanguage"] as? String, "fr")
        XCTAssertNil(dict["phoneNumber"] as? String)
    }

    // MARK: - MeeshyUser

    func testMeeshyUserCodableRoundtrip() throws {
        let original = MeeshyUser(
            id: "user123", username: "atabeth", email: "ata@example.com",
            firstName: "Ata", lastName: "Beth", displayName: "Ata Beth",
            bio: "Hello world", avatar: "avatar.png", banner: "banner.jpg",
            role: "USER", systemLanguage: "fr", regionalLanguage: "oc",
            isOnline: true, lastActiveAt: "2026-01-15T10:30:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-15T10:30:00.000Z",
            isActive: true, isAnonymous: false, isMeeshyer: true,
            customDestinationLanguage: "en", autoTranslateEnabled: true,
            translateToSystemLanguage: true, translateToRegionalLanguage: false,
            useCustomDestination: true,
            timezone: "Europe/Paris", registrationCountry: "FR", profileCompletionRate: 85
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(MeeshyUser.self, from: data)
        XCTAssertEqual(decoded.id, "user123")
        XCTAssertEqual(decoded.username, "atabeth")
        XCTAssertEqual(decoded.email, "ata@example.com")
        XCTAssertEqual(decoded.firstName, "Ata")
        XCTAssertEqual(decoded.lastName, "Beth")
        XCTAssertEqual(decoded.displayName, "Ata Beth")
        XCTAssertEqual(decoded.bio, "Hello world")
        XCTAssertEqual(decoded.role, "USER")
        XCTAssertEqual(decoded.systemLanguage, "fr")
        XCTAssertEqual(decoded.regionalLanguage, "oc")
        XCTAssertEqual(decoded.isOnline, true)
        XCTAssertEqual(decoded.isActive, true)
        XCTAssertEqual(decoded.isAnonymous, false)
        XCTAssertEqual(decoded.isMeeshyer, true)
    }

    func testMeeshyUserWithNilOptionals() {
        let user = MeeshyUser(id: "u1", username: "minimal")
        XCTAssertNil(user.email)
        XCTAssertNil(user.firstName)
        XCTAssertNil(user.lastName)
        XCTAssertNil(user.displayName)
        XCTAssertNil(user.bio)
        XCTAssertNil(user.avatar)
        XCTAssertNil(user.banner)
        XCTAssertNil(user.role)
        XCTAssertNil(user.systemLanguage)
        XCTAssertNil(user.regionalLanguage)
        XCTAssertNil(user.isOnline)
        XCTAssertNil(user.blockedUserIds)
        XCTAssertNil(user.isAnonymous)
        XCTAssertNil(user.phoneNumber)
        XCTAssertNil(user.customDestinationLanguage)
        XCTAssertNil(user.autoTranslateEnabled)
        XCTAssertNil(user.timezone)
        XCTAssertNil(user.profileCompletionRate)
    }

    func testMeeshyUserTranslationPreferences() {
        let user = MeeshyUser(
            id: "u2", username: "translator",
            customDestinationLanguage: "es",
            autoTranslateEnabled: true,
            translateToSystemLanguage: false,
            translateToRegionalLanguage: true,
            useCustomDestination: true
        )
        XCTAssertEqual(user.customDestinationLanguage, "es")
        XCTAssertEqual(user.autoTranslateEnabled, true)
        XCTAssertEqual(user.translateToSystemLanguage, false)
        XCTAssertEqual(user.translateToRegionalLanguage, true)
        XCTAssertEqual(user.useCustomDestination, true)
    }

    func testMeeshyUserDecodableFromJSON() throws {
        let json = """
        {
            "id": "abc123",
            "username": "testuser",
            "email": "test@meeshy.me",
            "isAnonymous": false,
            "systemLanguage": "en",
            "profileCompletionRate": 50
        }
        """.data(using: .utf8)!
        let user = try JSONDecoder().decode(MeeshyUser.self, from: json)
        XCTAssertEqual(user.id, "abc123")
        XCTAssertEqual(user.username, "testuser")
        XCTAssertEqual(user.email, "test@meeshy.me")
        XCTAssertEqual(user.isAnonymous, false)
        XCTAssertEqual(user.systemLanguage, "en")
        XCTAssertEqual(user.profileCompletionRate, 50)
        XCTAssertNil(user.firstName)
    }

    // MARK: - SavedAccount

    func testSavedAccountCodableRoundtrip() throws {
        let now = Date()
        let original = SavedAccount(
            id: "sa1", username: "atabeth",
            displayName: "Ata Beth", avatarURL: "https://example.com/avatar.png",
            lastActiveAt: now
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let data = try encoder.encode(original)
        let decoded = try decoder.decode(SavedAccount.self, from: data)
        XCTAssertEqual(decoded.id, "sa1")
        XCTAssertEqual(decoded.username, "atabeth")
        XCTAssertEqual(decoded.displayName, "Ata Beth")
        XCTAssertEqual(decoded.avatarURL, "https://example.com/avatar.png")
    }

    func testSavedAccountShortNameReturnsDisplayName() {
        let account = SavedAccount(id: "1", username: "user1", displayName: "Display Name", avatarURL: nil, lastActiveAt: Date())
        XCTAssertEqual(account.shortName, "Display Name")
    }

    func testSavedAccountShortNameFallsBackToUsername() {
        let account = SavedAccount(id: "2", username: "user2", displayName: nil, avatarURL: nil, lastActiveAt: Date())
        XCTAssertEqual(account.shortName, "user2")
    }

    // MARK: - AvailabilityResponse

    func testAvailabilityResponseDecodable() throws {
        let json = """
        {
            "usernameAvailable": true,
            "emailAvailable": false,
            "suggestions": ["user123", "user456"]
        }
        """.data(using: .utf8)!
        let response = try JSONDecoder().decode(AvailabilityResponse.self, from: json)
        XCTAssertEqual(response.usernameAvailable, true)
        XCTAssertEqual(response.emailAvailable, false)
        XCTAssertNil(response.phoneNumberAvailable)
        XCTAssertEqual(response.suggestions, ["user123", "user456"])
        XCTAssertTrue(response.available)
    }

    func testAvailabilityResponseAvailableComputed() throws {
        let json = """
        {
            "usernameAvailable": false,
            "emailAvailable": true
        }
        """.data(using: .utf8)!
        let response = try JSONDecoder().decode(AvailabilityResponse.self, from: json)
        XCTAssertFalse(response.available)
    }

    // MARK: - MagicLinkResponse

    func testMagicLinkResponseDecodable() throws {
        let json = """
        {
            "success": true,
            "message": "Magic link sent",
            "expiresInSeconds": 600
        }
        """.data(using: .utf8)!
        let response = try JSONDecoder().decode(MagicLinkResponse.self, from: json)
        XCTAssertTrue(response.success)
        XCTAssertEqual(response.message, "Magic link sent")
        XCTAssertEqual(response.expiresInSeconds, 600)
        XCTAssertNil(response.error)
    }

    func testMagicLinkResponseWithError() throws {
        let json = """
        {
            "success": false,
            "error": "User not found"
        }
        """.data(using: .utf8)!
        let response = try JSONDecoder().decode(MagicLinkResponse.self, from: json)
        XCTAssertFalse(response.success)
        XCTAssertEqual(response.error, "User not found")
        XCTAssertNil(response.message)
    }
}
