import XCTest
@testable import MeeshySDK

final class MeeshyUserProfileMutationTests: XCTestCase {

    private func makeUser() -> MeeshyUser {
        MeeshyUser(
            id: "u1", username: "alice",
            email: "a@b.com", firstName: "Alice", lastName: "Smith",
            displayName: "Alice", bio: "Hello world", avatar: "https://cdn/old.jpg",
            banner: "https://cdn/banner.jpg", role: "USER",
            systemLanguage: "fr", regionalLanguage: "en",
            isOnline: true, lastActiveAt: "2026-05-12T10:00:00Z",
            createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-05-12T10:00:00Z",
            blockedUserIds: ["u999"],
            isActive: true, deactivatedAt: nil,
            isAnonymous: false, isMeeshyer: false,
            phoneNumber: "+33612345678",
            emailVerifiedAt: "2026-01-01T00:00:00Z", phoneVerifiedAt: nil,
            customDestinationLanguage: "es",
            autoTranslateEnabled: true,
            timezone: "Europe/Paris",
            registrationCountry: "FR",
            profileCompletionRate: 85,
            signalIdentityKeyPublic: "signal_key_123"
        )
    }

    func test_withProfileChanges_updatesOnlySpecifiedFields() {
        let user = makeUser()
        let updated = user.withProfileChanges(
            displayName: "Bob",
            bio: nil,
            avatar: "https://cdn/new.jpg"
        )

        XCTAssertEqual(updated.displayName, "Bob")
        XCTAssertEqual(updated.bio, "Hello world", "nil = unchanged, not erase")
        XCTAssertEqual(updated.avatar, "https://cdn/new.jpg")
        XCTAssertEqual(updated.id, user.id)
        XCTAssertEqual(updated.username, user.username)
        XCTAssertEqual(updated.email, user.email)
        XCTAssertEqual(updated.firstName, user.firstName)
        XCTAssertEqual(updated.banner, user.banner)
        XCTAssertEqual(updated.systemLanguage, user.systemLanguage)
    }

    func test_withProfileChanges_allNil_returnsEquivalentUser() {
        let user = makeUser()
        let updated = user.withProfileChanges(
            displayName: nil, bio: nil, avatar: nil
        )

        XCTAssertEqual(updated.displayName, user.displayName)
        XCTAssertEqual(updated.bio, user.bio)
        XCTAssertEqual(updated.avatar, user.avatar)
        XCTAssertEqual(updated.id, user.id)
        XCTAssertEqual(updated.username, user.username)
        XCTAssertEqual(updated.email, user.email)
        XCTAssertEqual(updated.firstName, user.firstName)
        XCTAssertEqual(updated.lastName, user.lastName)
        XCTAssertEqual(updated.banner, user.banner)
        XCTAssertEqual(updated.role, user.role)
        XCTAssertEqual(updated.systemLanguage, user.systemLanguage)
        XCTAssertEqual(updated.regionalLanguage, user.regionalLanguage)
        XCTAssertEqual(updated.isOnline, user.isOnline)
        XCTAssertEqual(updated.lastActiveAt, user.lastActiveAt)
        XCTAssertEqual(updated.createdAt, user.createdAt)
        XCTAssertEqual(updated.updatedAt, user.updatedAt)
        XCTAssertEqual(updated.blockedUserIds, user.blockedUserIds)
        XCTAssertEqual(updated.isActive, user.isActive)
        XCTAssertEqual(updated.deactivatedAt, user.deactivatedAt)
        XCTAssertEqual(updated.isAnonymous, user.isAnonymous)
        XCTAssertEqual(updated.isMeeshyer, user.isMeeshyer)
        XCTAssertEqual(updated.phoneNumber, user.phoneNumber)
        XCTAssertEqual(updated.emailVerifiedAt, user.emailVerifiedAt)
        XCTAssertEqual(updated.phoneVerifiedAt, user.phoneVerifiedAt)
        XCTAssertEqual(updated.customDestinationLanguage, user.customDestinationLanguage)
        XCTAssertEqual(updated.autoTranslateEnabled, user.autoTranslateEnabled)
        XCTAssertEqual(updated.timezone, user.timezone)
        XCTAssertEqual(updated.registrationCountry, user.registrationCountry)
        XCTAssertEqual(updated.profileCompletionRate, user.profileCompletionRate)
        XCTAssertEqual(updated.signalIdentityKeyPublic, user.signalIdentityKeyPublic)
    }
}
