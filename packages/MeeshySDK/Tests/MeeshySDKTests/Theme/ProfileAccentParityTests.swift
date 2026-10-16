import XCTest
@testable import MeeshySDK

/// #10754 — la couleur d'un profil (avatar sans photo, bannière de design) a UNE source,
/// graine = l'identifiant d'utilisateur, miroir d'`authorAccentColor`
/// (`packages/shared/utils/conversation-colors.ts`). Valeurs de référence calculées par le web.
final class ProfileAccentParityTests: XCTestCase {

    func test_profileAccent_isTheWebValue_forAReferenceIdentifier() {
        XCTAssertEqual(DynamicColorGenerator.profileAccentHex(userId: "6ad153f7c71ebcd0cd7f8c47", name: "Recette Boutique").uppercased(), "27AE60")
        XCTAssertEqual(DynamicColorGenerator.profileAccentHex(userId: "68f2a81417a557e8ce4ddfc1", name: "Demo").uppercased(), "16A34A")
    }

    func test_profileAccent_withoutIdentifier_fallsBackToTheName_likeTheWeb() {
        XCTAssertEqual(DynamicColorGenerator.profileAccentHex(userId: nil, name: "Recette Boutique").uppercased(), "16A34A")
        XCTAssertEqual(DynamicColorGenerator.profileAccentHex(userId: "", name: "Amina").uppercased(), "F97316")
    }

    func test_profileAccent_dependsOnTheIdentifier_notOnTheName() {
        XCTAssertEqual(
            DynamicColorGenerator.profileAccentHex(userId: "6ad153f7c71ebcd0cd7f8c47", name: "Recette Boutique"),
            DynamicColorGenerator.profileAccentHex(userId: "6ad153f7c71ebcd0cd7f8c47", name: "Un autre nom")
        )
    }
}

final class MeeshyUserProfileAccentTests: XCTestCase {
    func test_myOwnProfile_paintsTheSameColorAsTheWebAndAsTheSheetOthersSee() throws {
        let user = try JSONDecoder().decode(MeeshyUser.self, from: Data(#"{"id":"6ad153f7c71ebcd0cd7f8c47","username":"recetteboutiqb","displayName":"Recette Boutique"}"#.utf8))
        XCTAssertEqual(user.profileAccentHex.uppercased(), "27AE60")
        XCTAssertEqual(user.profileAccentHex, DynamicColorGenerator.profileAccentHex(userId: user.id, name: "n'importe quel nom"))
    }
}
