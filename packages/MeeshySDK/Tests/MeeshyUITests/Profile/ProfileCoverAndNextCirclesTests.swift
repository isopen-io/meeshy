import XCTest
import SwiftUI
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

    // MARK: - L'entrée latérale

    func test_entrance_comesFromTheTrailingEdge_likeAPush() {
        XCTAssertEqual(ProfileCoverEntrance.startOffset(width: 390, reduceMotion: false), 390)
        XCTAssertEqual(ProfileCoverEntrance.startOpacity(width: 390, reduceMotion: false), 1)
    }

    func test_entrance_underReduceMotion_fadesInPlace() {
        XCTAssertEqual(ProfileCoverEntrance.startOffset(width: 390, reduceMotion: true), 0)
        XCTAssertEqual(ProfileCoverEntrance.startOpacity(width: 390, reduceMotion: true), 0)
    }

    func test_entrance_beforeTheWidthIsMeasured_staysHidden() {
        XCTAssertEqual(ProfileCoverEntrance.startOpacity(width: 0, reduceMotion: false), 0)
    }

    /// La montée du plein écran d'iOS n'est pas jouée : c'est la fiche qui entre par le côté.
    func test_entrance_presentsTheCoverWithoutItsRisingAnimation() {
        XCTAssertTrue(ProfileCoverEntrance.presentationTransaction().disablesAnimations)
    }

    // MARK: - Les sites du SDK qui présentent la fiche

    /// La boutique présente elle-même la fiche de l'éditeur : elle passe par `profileCover` comme les sites de l'app,
    /// jamais par une feuille à détentes. Le dossier Profile la construit sans la présenter.
    func test_sdkSitesPresentingTheProfile_useTheFullScreenCover_neverASheetWithDetents() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshyUI")
        let enumerator = FileManager.default.enumerator(at: sources, includingPropertiesForKeys: nil)
        let files = (enumerator?.allObjects as? [URL] ?? [])
            .filter { $0.pathExtension == "swift" && !$0.path.contains("/MeeshyUI/Profile/") }
        let sites = try files.compactMap { url -> (name: String, code: String)? in
            let code = try String(contentsOf: url, encoding: .utf8)
            return code.contains("UserProfileSheet(") ? (url.lastPathComponent, code) : nil
        }
        XCTAssertFalse(sites.isEmpty, "les sites du SDK qui présentent la fiche sont trouvés")
        for site in sites {
            XCTAssertTrue(site.code.contains(".profileCover("), "\(site.name) présente la fiche en plein écran")
            XCTAssertFalse(site.code.contains(".presentationDetents("), "\(site.name) ne pose plus de détentes")
        }
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
        XCTAssertEqual(ProfileHeroSignals.opacity(avatarSize: 120), 1)
        XCTAssertEqual(ProfileHeroSignals.opacity(avatarSize: ProfileHeroSignals.minimumAvatarSize), 0)
        XCTAssertEqual(ProfileHeroSignals.opacity(avatarSize: 30), 0)
        let midway = ProfileHeroSignals.opacity(avatarSize: ProfileHeroSignals.minimumAvatarSize + 12)
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

    // MARK: - Les crans vivants (#19785)

    /// Le contour organique de la planche (`mxMorph`, 8 s) : il ondule en continu, jamais sous mouvement réduit.
    func test_blobMedallion_morphsContinuously_butNeverUnderReducedMotion() {
        func recipe(reduce: Bool, shape: MeeshyMedallionShape) -> MeeshyMedallionRecipe {
            MeeshyMedallionRecipe.resolve(kind: .accent, shape: shape, fill: .solid, decor: .halo, size: .s44,
                                          state: .current, reduceMotion: reduce, supportsShape: true)
        }
        XCTAssertTrue(recipe(reduce: false, shape: .blob).morphs)
        XCTAssertFalse(recipe(reduce: true, shape: .blob).morphs)
        XCTAssertFalse(recipe(reduce: false, shape: .disc).morphs)
        XCTAssertEqual(MeeshyMedallionRecipe.morphPhase(elapsed: 0), 0, accuracy: 0.0001)
        XCTAssertEqual(MeeshyMedallionRecipe.morphPhase(elapsed: 4), Double.pi, accuracy: 0.0001)
        XCTAssertEqual(MeeshyMedallionRecipe.morphPhase(elapsed: 8), 0, accuracy: 0.0001)
        XCTAssertEqual(MeeshyMedallionRecipe.morphPhase(elapsed: .nan), 0)
    }

    func test_nextCircles_areDrawnAsLivingBlobs() throws {
        let source = try profileSource("ProfileNextCircles.swift")
        XCTAssertTrue(source.contains("shape: .blob"))
    }

    // MARK: - Un changement de vue ne vibre pas (#19783)

    /// Les haptiques restent aux actions ; changer de face ou d'onglet, épingler l'en-tête en défilant, revenir en
    /// arrière par glissement ou déplier une pilule ne vibrent plus.
    func test_viewChanges_carryNoHaptic() throws {
        let sources = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().appendingPathComponent("Sources/MeeshyUI")
        for path in ["Kit/MeeshySegmented.swift", "Kit/MeeshyCollapsingHero.swift",
                     "Profile/ProfileCoverPresentation.swift", "Profile/AvatarListeningSource.swift"] {
            let code = try String(contentsOf: sources.appendingPathComponent(path), encoding: .utf8)
            XCTAssertFalse(code.contains("HapticFeedback."), "\(path) : un changement de vue ne vibre pas")
        }
    }
}
