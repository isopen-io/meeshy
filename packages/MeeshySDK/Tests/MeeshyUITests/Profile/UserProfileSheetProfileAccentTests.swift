import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #10754 — l'avatar sans photo et la bannière de design d'une fiche vue par les autres
/// prennent la couleur du PROFIL (graine = l'identifiant), jamais l'accent de l'écran qui
/// l'a ouverte : la même personne ne change pas de couleur selon qu'on vient d'une
/// conversation, d'une story ou d'un message.
@MainActor
final class UserProfileSheetProfileAccentTests: XCTestCase {

    func test_profileAccent_isTheProfileColor_whateverAccentTheCallerPassed() {
        let fromAConversation = UserProfileSheet(user: ProfileSheetUser(userId: "6ad153f7c71ebcd0cd7f8c47", username: "recetteboutiqb", accentColor: "E0604E"))
        let fromAStory = UserProfileSheet(user: ProfileSheetUser(userId: "6ad153f7c71ebcd0cd7f8c47", username: "recetteboutiqb", accentColor: "6366F1"))

        XCTAssertEqual(fromAConversation.profileAccent.uppercased(), "27AE60", "la valeur que le web peint pour cet identifiant")
        XCTAssertEqual(fromAStory.profileAccent, fromAConversation.profileAccent)
    }

    func test_profileAccent_isTheSameSourceAsMyOwnProfile() {
        let sheet = UserProfileSheet(user: ProfileSheetUser(userId: "68f2a81417a557e8ce4ddfc1", username: "atabeth", displayName: "Demo", accentColor: "E0604E"))

        XCTAssertEqual(sheet.profileAccent, DynamicColorGenerator.profileAccentHex(userId: "68f2a81417a557e8ce4ddfc1", name: "Demo"))
    }
}
