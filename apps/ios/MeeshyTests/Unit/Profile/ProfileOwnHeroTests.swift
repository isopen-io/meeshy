import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// L'en-tête de ma vitrine (#19589, planches `Main`, `Moi-Edition`, `Sys-Mouvement`) : K28 sur la bannière vivante K27,
/// la roue Réglages au début, « Vue par : Moi » et le crayon à la fin ; en édition, Annuler et Enregistrer du cadre K16.
@MainActor
final class ProfileOwnHeroTests: XCTestCase {

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    /// La valeur SERVIE par le catalogue pour la langue du simulateur : le témoin tient en français comme en anglais.
    private func served(_ key: String) -> String { Bundle.main.localizedString(forKey: key, value: nil, table: nil) }

    // MARK: - Les commandes

    func test_atRest_settingsLeads_andViewedByThenThePencilTrail() {
        XCTAssertEqual(ProfileOwnHeroPlan.leading(isEditing: false), [.settings])
        XCTAssertEqual(ProfileOwnHeroPlan.trailing(isEditing: false, progress: 0), [.viewedBy, .edit])
    }

    func test_collapsedBar_keepsThePencil_andLeavesViewedByToTheBanner() {
        XCTAssertEqual(ProfileOwnHeroPlan.trailing(isEditing: false, progress: 1), [.edit])
        XCTAssertEqual(ProfileOwnHeroPlan.trailing(isEditing: false, progress: 0.5), [.viewedBy, .edit],
                       "tant que le héros porte l'identité, « Vue par » reste")
        XCTAssertEqual(ProfileOwnHeroPlan.leading(isEditing: false), [.settings], "la roue reste dans la barre repliée")
    }

    func test_editing_handsTheTopToTheModeHeader_andHidesLevelAndRank() {
        XCTAssertTrue(ProfileOwnHeroPlan.leading(isEditing: true).isEmpty)
        XCTAssertTrue(ProfileOwnHeroPlan.trailing(isEditing: true, progress: 0).isEmpty)
        XCTAssertTrue(ProfileOwnHeroPlan.usesModeHeader(isEditing: true))
        XCTAssertFalse(ProfileOwnHeroPlan.usesModeHeader(isEditing: false))
        XCTAssertFalse(ProfileOwnHeroPlan.showsGameBadges(isEditing: true))
        XCTAssertTrue(ProfileOwnHeroPlan.showsGameBadges(isEditing: false))
    }

    func test_controls_eachSayTheirOwnName_toVoiceOver() {
        let labels = ProfileOwnHeroControl.allCases.map(ProfileOwnHeroPlan.label)
        XCTAssertEqual(Set(labels).count, ProfileOwnHeroControl.allCases.count, "trois commandes, trois noms")
        XCTAssertFalse(labels.contains(where: \.isEmpty))
        XCTAssertEqual(ProfileOwnHeroPlan.label(.settings), served("settings.title"))
        XCTAssertEqual(ProfileOwnHeroPlan.label(.viewedBy), VitrineSeenAsCopy.viewedByMe)
        XCTAssertEqual(ProfileOwnHeroPlan.label(.edit), served("profile.hero.edit"))
        XCTAssertEqual(ProfileOwnHeroPlan.systemImage(.settings), "gearshape")
        XCTAssertEqual(ProfileOwnHeroPlan.systemImage(.viewedBy), "eye")
        XCTAssertEqual(ProfileOwnHeroPlan.systemImage(.edit), "pencil")
        XCTAssertEqual(Set(ProfileOwnHeroControl.allCases.map(ProfileOwnHeroPlan.identifier)).count, 3)
    }

    func test_modeHeader_saysCancelAndSave_andNamesTheMode() {
        XCTAssertEqual(ProfileOwnHeroPlan.cancelTitle, served("common.cancel"))
        XCTAssertEqual(ProfileOwnHeroPlan.saveTitle, served("profile.save"))
        XCTAssertEqual(ProfileOwnHeroPlan.modeLabel, ProfileOwnHeroPlan.label(.edit))
        XCTAssertNotEqual(ProfileOwnHeroPlan.cancelTitle, ProfileOwnHeroPlan.saveTitle)
    }

    // MARK: - Le repli

    func test_atRest_theFingerLeadsTheFold_fromBannerToGlassBar() {
        let distance = MeeshyCollapsingHeroRecipe.scrollDistance()
        XCTAssertEqual(ProfileOwnHeroPlan.progress(scrollOffset: 0, isEditing: false), 0)
        XCTAssertEqual(ProfileOwnHeroPlan.progress(scrollOffset: -distance, isEditing: false), 1, accuracy: 0.0001)
        XCTAssertEqual(ProfileOwnHeroPlan.progress(scrollOffset: -distance / 2, isEditing: false), 0.5, accuracy: 0.0001)
        XCTAssertLessThan(ProfileOwnHeroPlan.progress(scrollOffset: 40, isEditing: false), 0, "tirée vers le bas, la bannière s'étire")
        XCTAssertEqual(ProfileOwnHeroPlan.progress(scrollOffset: .nan, isEditing: false), 0)
    }

    func test_editing_theBannerScrollsAway_withoutFolding() {
        XCTAssertEqual(ProfileOwnHeroPlan.progress(scrollOffset: -300, isEditing: true), 0)
        XCTAssertFalse(ProfileOwnHeroPlan.isPinned(isEditing: true), "en édition, la bannière part avec le formulaire")
        XCTAssertTrue(ProfileOwnHeroPlan.isPinned(isEditing: false))
    }

    func test_geometry_isTheKitHero_318to96_andTheContentStartsUnderTheIdentity() {
        XCTAssertEqual(ProfileOwnHeroPlan.expandedHeight, 318)
        XCTAssertEqual(ProfileOwnHeroPlan.collapsedHeight, 96)
        XCTAssertEqual(ProfileOwnHeroPlan.contentTop,
                       MeeshyCollapsingHeroRecipe.expandedHeight + MeeshyCollapsingHeroRecipe.identityOverflow)
    }

    func test_bannerHeight_coversTheHero_andStretchesWhenPulledDown() {
        XCTAssertEqual(ProfileOwnHeroPlan.bannerHeight(progress: 0), 318)
        XCTAssertEqual(ProfileOwnHeroPlan.bannerHeight(progress: 1), 318, "repliée, la bannière garde sa hauteur sous la barre")
        XCTAssertGreaterThan(ProfileOwnHeroPlan.bannerHeight(progress: -0.2), 318)
    }

    // MARK: - Fait du kit (loi 12)

    func test_profileView_noLongerMountsTheOldHeader_andIsMadeOfTheKitHero() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertFalse(profile.contains("CollapsibleHeader("), "l'ancien en-tête « Profil » a quitté ma vitrine")
        XCTAssertFalse(profile.contains("CollapsibleHeaderMetrics"))
        XCTAssertTrue(profile.contains("MeeshyCollapsingHero("), "l'en-tête repliable est K28")
        XCTAssertTrue(profile.contains("MeeshyModeHeader("), "Annuler et Enregistrer sont les capsules du cadre K16")
        XCTAssertTrue(profile.contains("MeeshyGlassButton(systemImage: ProfileOwnHeroPlan.systemImage(control)"),
                      "Réglages et le crayon sont K02")
        XCTAssertTrue(profile.contains("GameBannerBadge(userId: userId)"), "le niveau et le rang restent aux angles")
        XCTAssertFalse(profile.contains(".frame(height: 120)"), "plus de bannière de 120 dans une carte")
        XCTAssertFalse(profile.contains("frame(width: 90, height: 90)"), "plus d'avatar de 90")
    }

    func test_cancel_restoresTheFields_beforeLeavingTheEdition() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        let start = try XCTUnwrap(profile.range(of: "private func cancelEditing()"))
        let body = profile[start.upperBound...].prefix(240)
        XCTAssertTrue(body.contains("setEditing(false)"))
        XCTAssertTrue(body.contains("loadUserData()"), "Annuler rétablit les champs")
        XCTAssertTrue(profile.contains("action: { cancelEditing() }"))
        XCTAssertTrue(profile.contains("action: { saveProfile() }"))
    }

    func test_vitrine_stillLeavesThroughTheSystemBackGesture_andVoiceOverEscape() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertTrue(profile.contains(".background(InteractivePopEnabler())"), "le glissé du bord ramène en arrière")
        XCTAssertTrue(profile.contains(".accessibilityAction(.escape)"), "le geste d'échappement de VoiceOver aussi")
    }
}
