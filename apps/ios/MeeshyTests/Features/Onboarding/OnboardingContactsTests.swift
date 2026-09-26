import XCTest
import Contacts
import MeeshySDK
@testable import Meeshy

/// La proposition « retrouver tes amis » (#8105) : quand elle existe, d'où
/// elle part, et ce que la carte montre des contacts rapprochés.
final class OnboardingContactsTests: XCTestCase {

    private func contact(
        _ id: String,
        name: String?,
        user: MatchedContactUser?
    ) -> DirectoryContact {
        DirectoryContact(id: id, contactKey: "k-\(id)", displayName: name, isOnMeeshy: user != nil, matchedUser: user)
    }

    func test_initialPhase_followsTheSystemAuthorization() {
        XCTAssertEqual(OnboardingContacts.initialPhase(for: .notDetermined), .offer)
        XCTAssertEqual(OnboardingContacts.initialPhase(for: .authorized), .offer)
        XCTAssertEqual(OnboardingContacts.initialPhase(for: .denied), .deniedBySystem)
        XCTAssertEqual(OnboardingContacts.initialPhase(for: .restricted), .unavailable)
    }

    func test_isOfferable_onlyWhenTheGestureCanSucceedWithoutSettings() {
        XCTAssertTrue(OnboardingContacts.isOfferable(.notDetermined))
        XCTAssertTrue(OnboardingContacts.isOfferable(.authorized))
        XCTAssertFalse(OnboardingContacts.isOfferable(.denied))
        XCTAssertFalse(OnboardingContacts.isOfferable(.restricted))
    }

    func test_searchesOnArrival_onlyWhenAccessIsAlreadyGranted() {
        XCTAssertTrue(OnboardingContacts.searchesOnArrival(.authorized))
        XCTAssertFalse(OnboardingContacts.searchesOnArrival(.notDetermined))
        XCTAssertFalse(OnboardingContacts.searchesOnArrival(.denied))
    }

    func test_friends_keepsOnlyMatchedAccounts_underTheirAddressBookName() {
        let contacts = [
            contact("c1", name: "Maman", user: MatchedContactUser(id: "u1", username: "awa", displayName: "Awa D.", avatar: "https://a/1.png")),
            contact("c2", name: "Plombier", user: nil),
        ]

        let friends = OnboardingContacts.friends(from: contacts, excluding: "me")

        XCTAssertEqual(friends.map(\.id), ["u1"])
        XCTAssertEqual(friends.first?.displayName, "Maman")
        XCTAssertEqual(friends.first?.username, "awa")
        XCTAssertEqual(friends.first?.avatarUrl, "https://a/1.png")
    }

    func test_friends_neverListsTheReaderNorTheSameAccountTwice() {
        let contacts = [
            contact("c1", name: "Moi", user: MatchedContactUser(id: "me", username: "aicha")),
            contact("c2", name: "Tom pro", user: MatchedContactUser(id: "u2", username: "tom")),
            contact("c3", name: "Tom perso", user: MatchedContactUser(id: "u2", username: "tom")),
        ]

        let friends = OnboardingContacts.friends(from: contacts, excluding: "me")

        XCTAssertEqual(friends.map(\.id), ["u2"])
    }

    func test_rows_putsFoundFriendsFirst_withoutRepeatingASuggestion() {
        let found = [APIOnboardingSuggestion(id: "u2", username: "tom", displayName: "Tom", avatarUrl: nil, languages: [])]
        let suggestions = [
            APIOnboardingSuggestion(id: "u1", username: "lina", displayName: "Lina", avatarUrl: nil, languages: ["fr"]),
            APIOnboardingSuggestion(id: "u2", username: "tom", displayName: "Tom", avatarUrl: nil, languages: ["en"]),
        ]

        XCTAssertEqual(OnboardingContacts.rows(found: found, suggestions: suggestions).map(\.id), ["u2", "u1"])
    }
}
