import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// Mes langues du Prisme sur ma fiche (#19534) : au repos, des pastilles à lire sous ma bio ; en édition, une liste
/// K52 dont l'ordre EST l'ordre des trois champs que la passerelle reçoit.
@MainActor
final class ProfilePrismLanguagesTests: XCTestCase {

    private func languages(_ system: String, _ regional: String, _ custom: String) -> ProfilePrismLanguages {
        ProfilePrismLanguages(system: system, regional: regional, custom: custom)
    }

    private func fields(_ value: ProfilePrismLanguages) -> [String] {
        [value.system, value.regional, value.custom]
    }

    // MARK: - Réordonner

    func test_moving_theThirdLanguageToTheTop_rewritesTheThreeFieldsInTheNewOrder() {
        let moved = languages("fr", "wo", "en").moving(from: 2, to: 0)
        XCTAssertEqual(fields(moved), ["en", "fr", "wo"])
    }

    func test_moving_thePrimaryLanguageDownOneRank_swapsPrimaryAndSecondChoice() {
        let moved = languages("fr", "wo", "en").moving(from: 0, to: 1)
        XCTAssertEqual(fields(moved), ["wo", "fr", "en"])
    }

    func test_moving_toItsOwnRank_changesNothing() {
        let original = languages("fr", "wo", "en")
        XCTAssertEqual(original.moving(from: 1, to: 1), original)
    }

    func test_moving_withTwoLanguages_leavesTheThirdChoiceEmpty() {
        let moved = languages("fr", "en", "").moving(from: 1, to: 0)
        XCTAssertEqual(fields(moved), ["en", "fr", ""])
    }

    // MARK: - Les rangs ne gardent ni trou ni doublon

    func test_aSecondChoiceGap_isClosed_theThirdChoiceBecomesTheSecond() {
        let value = languages("fr", "", "en")
        XCTAssertEqual(value.codes, ["fr", "en"])
        XCTAssertEqual(fields(value), ["fr", "en", ""])
    }

    func test_aLanguageNamedTwice_keepsItsBestRankOnly() {
        XCTAssertEqual(languages("fr", "fr", "en").codes, ["fr", "en"])
    }

    // MARK: - Ajouter et retirer passent par le sélecteur

    func test_choosing_aNewLanguageOnTheFirstFreeRank_addsIt() {
        let added = languages("fr", "", "").choosing("wo", at: 1)
        XCTAssertEqual(fields(added), ["fr", "wo", ""])
    }

    func test_choosing_aLanguageAlreadyRankedElsewhere_swapsTheTwoRanks() {
        let chosen = languages("fr", "wo", "en").choosing("en", at: 0)
        XCTAssertEqual(fields(chosen), ["en", "wo", "fr"])
    }

    func test_clearing_theSecondChoice_removesIt_andTheThirdMovesUp() {
        let cleared = languages("fr", "wo", "en").choosing("", at: 1)
        XCTAssertEqual(fields(cleared), ["fr", "en", ""])
    }

    func test_clearing_thePrimaryLanguage_isRefused() {
        let original = languages("fr", "wo", "")
        XCTAssertEqual(original.choosing("", at: 0), original)
    }

    func test_canAdd_onlyWhileARankIsFree() {
        XCTAssertTrue(languages("fr", "wo", "").canAdd)
        XCTAssertFalse(languages("fr", "wo", "en").canAdd)
    }

    // MARK: - Au repos : des pastilles, aucun contrôle

    func test_mode_atRest_isTheChipLine_andInEditing_theReorderableList() {
        XCTAssertEqual(ProfilePrismLanguagesMode.resolve(isEditing: false), .chips)
        XCTAssertEqual(ProfilePrismLanguagesMode.resolve(isEditing: true), .reorderable)
    }

    func test_chips_nameEachLanguageInTheInterfaceLanguage_theTranslateGlyphOnThePrimaryOnly() {
        let chips = ProfileLanguageChip.make(languages("fr", "wo", "en"), locale: Locale(identifier: "fr"))
        XCTAssertEqual(chips.map(\.code), ["fr", "wo", "en"])
        XCTAssertEqual(chips.map(\.isPrimary), [true, false, false])
        XCTAssertEqual(chips.first?.name, "Français")
        XCTAssertEqual(chips.last?.name, "Anglais")
    }

    func test_chips_withoutAnyLanguage_renderNothing() {
        XCTAssertTrue(ProfileLanguageChip.make(languages("", "", ""), locale: Locale(identifier: "fr")).isEmpty)
    }

    private func code(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    func test_chipLine_isMadeOfInertBadges_noPressableRow() throws {
        let source = try code("Meeshy/Features/Profile/Views/ProfilePrismLanguagesSection.swift")
        let chipLine = try XCTUnwrap(source.components(separatedBy: "struct ProfilePrismLanguagesSection").first)
        XCTAssertTrue(chipLine.contains("MeeshyBadge("), "les pastilles sont K41")
        XCTAssertFalse(chipLine.contains("onPress"), "une pastille au repos ne se touche pas")
        XCTAssertFalse(chipLine.contains("Button("), "aucune rangée pressable au repos")
    }

    func test_editingSection_isTheReorderListOfTheKit_withItsRanks_andTheAutoTranslateToggleBelow() throws {
        let source = try code("Meeshy/Features/Profile/Views/ProfilePrismLanguagesSection.swift")
        XCTAssertTrue(source.contains("MeeshyReorderList("), "la liste est K52")
        XCTAssertTrue(source.contains("rank: .ordinal"), "rangs numérotés")
        XCTAssertTrue(source.contains("MeeshySectionHeader("), "l'en-tête est K44")
        XCTAssertFalse(source.contains("ProfileSectionHeader("), "aucun en-tête redessiné sur place (loi 12)")
        let list = try XCTUnwrap(source.range(of: "reorderList\n"))
        let toggle = try XCTUnwrap(source.range(of: "MeeshyToggleRow("))
        XCTAssertLessThan(list.lowerBound, toggle.lowerBound, "« Traduire automatiquement » reste sous la liste")
    }

    func test_vitrine_atRest_hasNoIdentityFormCard_andReadsIdentityBeforeCircles() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        let face = try XCTUnwrap(profile.components(separatedBy: "private var vitrineFace: some View {").last)
        let identity = try XCTUnwrap(profile.components(separatedBy: "private var identityBlock: some View {").last)
        let editing = try XCTUnwrap(identity.range(of: "if isEditing {"))
        let form = try XCTUnwrap(identity.range(of: "ProfileIdentitySection("))
        let otherwise = try XCTUnwrap(identity.range(of: "} else {"))
        let rest = try XCTUnwrap(identity.range(of: "restingIdentity"))
        XCTAssertLessThan(editing.lowerBound, form.lowerBound, "la carte Identité n'existe qu'en édition")
        XCTAssertLessThan(form.lowerBound, otherwise.lowerBound, "et le repos rend l'identité en texte, sans elle")
        XCTAssertLessThan(otherwise.lowerBound, rest.lowerBound, "et le repos rend l'identité en texte, sans elle")
        let order = ["identityBlock.meeshyCascade(rank: 0)", "ProfileCirclesSection(", "activitySection.meeshyCascade(rank: 2)",
                     "voiceBlock.meeshyCascade(rank: 3)", "ProfilePublicationsSection("]
        let positions = try order.map { try XCTUnwrap(face.range(of: $0), $0).lowerBound }
        XCTAssertEqual(positions, positions.sorted(), "identité, cercles, activité, voix, publications")
    }

    func test_restingBio_saysNothingWhenEmpty_neverAPlaceholder() {
        XCTAssertNil(ProfileView.restingBio(nil))
        XCTAssertNil(ProfileView.restingBio("  \n"))
        XCTAssertEqual(ProfileView.restingBio(" J'écris en trois langues. "), "J'écris en trois langues.")
    }

    func test_profile_restsTheChipsUnderTheBio_andNoLongerDrawsTheOldLanguageRows() throws {
        let profile = try code("Meeshy/Features/Profile/Views/ProfileView.swift")
        XCTAssertFalse(profile.contains("ProfileLanguageRow("))
        let identity = try XCTUnwrap(profile.range(of: "Self.restingBio(bio)"))
        let chips = try XCTUnwrap(profile.range(of: "ProfileLanguageChips("))
        let badge = try XCTUnwrap(profile.range(of: "showsEncryptionBadge(isEditing"))
        XCTAssertLessThan(identity.lowerBound, chips.lowerBound, "les pastilles suivent la bio")
        XCTAssertLessThan(chips.lowerBound, badge.lowerBound, "et précèdent la puce de chiffrement")
    }
}
