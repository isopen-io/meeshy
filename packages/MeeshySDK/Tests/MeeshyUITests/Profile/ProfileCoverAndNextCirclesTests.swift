import XCTest
import MeeshySDK
@testable import MeeshyUI

/// #19674 — la fiche d'un profil s'ouvre en plein écran et se quitte par « Retour » ou un glissement depuis le bord ;
/// elle ne montre plus ce que le cercle tient fermé, elle dit le chemin vers le cercle suivant.
@MainActor
final class ProfileCoverAndNextCirclesTests: XCTestCase {

    // MARK: - Plein écran et retour

    func test_presentationStyle_saysBackInFullScreen_andCloseInASheet() {
        XCTAssertEqual(ProfilePresentationStyle.cover.leadingSymbol, "chevron.backward")
        XCTAssertEqual(ProfilePresentationStyle.sheet.leadingSymbol, "chevron.down")
    }

    func test_backSwipe_followsTheFingerRightward_neverLeftward() {
        XCTAssertEqual(ProfileCoverBackSwipe.offset(translation: 120), 120)
        XCTAssertEqual(ProfileCoverBackSwipe.offset(translation: -40), 0)
    }

    func test_backSwipe_releasedBeforeThreeQuarters_isCancelled() {
        XCTAssertFalse(ProfileCoverBackSwipe.commits(translation: 200, predictedEnd: 260, width: 400))
        XCTAssertFalse(ProfileCoverBackSwipe.commits(translation: 0, predictedEnd: 600, width: 400))
        XCTAssertFalse(ProfileCoverBackSwipe.commits(translation: -20, predictedEnd: -80, width: 400))
    }

    func test_backSwipe_beyondThreeQuarters_orFlungToTheEdge_leaves() {
        XCTAssertTrue(ProfileCoverBackSwipe.commits(translation: 300, predictedEnd: 310, width: 400))
        XCTAssertTrue(ProfileCoverBackSwipe.commits(translation: 120, predictedEnd: 420, width: 400))
    }

    func test_backSwipe_withoutAMeasuredWidth_neverLeaves() {
        XCTAssertFalse(ProfileCoverBackSwipe.commits(translation: 300, predictedEnd: 900, width: 0))
    }

    // MARK: - Pour aller plus loin

    func test_ladder_fromAStranger_readsFriendThenCloseThenBlood_friendFirst() {
        let steps = ProfileNextCircleLadder.steps(above: .public)
        XCTAssertEqual(steps.map(\.level), [.friend, .close, .blood])
        XCTAssertEqual(steps.map(\.isNext), [true, false, false])
    }

    func test_ladder_fromAnAcquaintanceOrACommunity_stillStartsAtFriend() {
        XCTAssertEqual(ProfileNextCircleLadder.steps(above: .community).first?.level, .friend)
        XCTAssertEqual(ProfileNextCircleLadder.steps(above: .acquaintance).first?.level, .friend)
    }

    func test_ladder_fromAFriend_startsAtClose_andIsEmptyAtBlood() {
        XCTAssertEqual(ProfileNextCircleLadder.steps(above: .friend).map(\.level), [.close, .blood])
        XCTAssertEqual(ProfileNextCircleLadder.steps(above: .close).map(\.level), [.blood])
        XCTAssertTrue(ProfileNextCircleLadder.steps(above: .blood).isEmpty)
    }

    /// Ce qu'un cran ouvre vient de la loi d'accès, jamais d'une liste recopiée : rien qui soit déjà ouvert plus bas,
    /// et jamais bloquer ni signaler.
    func test_ladder_opens_onlyWhatThatCircleAdds_fromTheAccessLaw() {
        for rung in ProfileNextCircleLadder.rungs {
            for action in ProfileNextCircleLadder.opens(at: rung) {
                XCTAssertEqual(action.feature?.minimumLevel, rung, "\(action)")
                XCTAssertFalse(action.isDestructive)
            }
        }
        XCTAssertTrue(ProfileNextCircleLadder.opens(at: .close).contains(.talkie))
        XCTAssertTrue(ProfileNextCircleLadder.opens(at: .friend).contains(.bring))
    }

    func test_nextCircles_sayHowToReachEachCircle_andNameThePerson_forFriend() {
        XCTAssertTrue(ProfileNextCirclesCopy.how(to: .friend, name: "Léo").contains("Léo"))
        for level in ProfileNextCircleLadder.rungs {
            XCTAssertFalse(ProfileNextCirclesCopy.how(to: level, name: "Léo").isEmpty)
            XCTAssertFalse(ProfileNextCirclesCopy.title(of: level).isEmpty)
        }
        XCTAssertNotNil(ProfileNextCirclesCopy.opens(ProfileNextCircleLadder.steps(above: .close)[0]))
    }

    // MARK: - Écoute en ce moment

    func test_listeningPill_fadesWithTheAvatar_whenTheHeroCollapses() {
        XCTAssertEqual(ProfileAvatarListening.opacity(avatarSize: 120), 1)
        XCTAssertEqual(ProfileAvatarListening.opacity(avatarSize: ProfileAvatarListening.minimumAvatarSize), 0)
        XCTAssertEqual(ProfileAvatarListening.opacity(avatarSize: 30), 0)
        let midway = ProfileAvatarListening.opacity(avatarSize: ProfileAvatarListening.minimumAvatarSize + 12)
        XCTAssertGreaterThan(midway, 0)
        XCTAssertLessThan(midway, 1)
    }

    // MARK: - Le jeu d'un autre se dit une fois (#19773)

    /// La bannière d'un autre ne porte plus ni niveau ni gloire : « Sa Légende », dans la Vitrine, les dit seule.
    func test_otherBanner_carriesNoGame_theVitrineCardSaysItOnce() throws {
        let header = try profileSource("UserProfileSheet+Header.swift")
        XCTAssertFalse(header.contains("gameSection"), "la bannière d'un autre ne redit pas son jeu")
        XCTAssertFalse(try profileSource("ProfileGameSection.swift").contains("build:"), "l'emplacement n'offre plus de bannière")
        XCTAssertTrue(try profileSource("UserProfileSheet+VitrineBlocks.swift").contains("gameSection?.card"))
    }

    /// « Sa Légende » en miroir de « Ma Légende », dans les sept langues.
    func test_gameCard_isNamedTheirLegend_inEveryLanguage() throws {
        let catalog = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Resources/Localizable.xcstrings")
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: catalog)) as? [String: Any])
        let strings = try XCTUnwrap(root["strings"] as? [String: Any])
        let entry = try XCTUnwrap(strings["profile.vitrine.game.title"] as? [String: Any])
        let localizations = try XCTUnwrap(entry["localizations"] as? [String: [String: [String: String]]])
        XCTAssertEqual(localizations["fr"]?["stringUnit"]?["value"], "Sa Légende")
        XCTAssertEqual(localizations.count, 7)
        XCTAssertFalse(ProfileVitrineCopy.gameTitle.isEmpty)
    }

    private func profileSource(_ name: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI/Profile/\(name)")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
