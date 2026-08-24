import XCTest
import SwiftUI
@testable import Meeshy
import MeeshyUI

@MainActor
final class CharacterCountLabelTests: XCTestCase {

    // MARK: - resolvedThreshold

    func test_resolvedThreshold_usesExplicitValueWhenProvided() {
        XCTAssertEqual(
            CharacterCountLabel.resolvedThreshold(limit: 500, warningThreshold: 450),
            450
        )
    }

    func test_resolvedThreshold_defaultsToEightyPercentRoundedUp() {
        XCTAssertEqual(
            CharacterCountLabel.resolvedThreshold(limit: 122, warningThreshold: nil),
            98 // ceil(122 * 0.8) == ceil(97.6)
        )
        XCTAssertEqual(
            CharacterCountLabel.resolvedThreshold(limit: 500, warningThreshold: nil),
            400
        )
    }

    // MARK: - isNearLimit

    func test_isNearLimit_falseBelowThreshold() {
        XCTAssertFalse(
            CharacterCountLabel.isNearLimit(count: 449, limit: 500, warningThreshold: 450)
        )
    }

    func test_isNearLimit_trueAtThreshold() {
        XCTAssertTrue(
            CharacterCountLabel.isNearLimit(count: 450, limit: 500, warningThreshold: 450)
        )
    }

    func test_isNearLimit_trueAboveThreshold() {
        XCTAssertTrue(
            CharacterCountLabel.isNearLimit(count: 500, limit: 500, warningThreshold: 450)
        )
    }

    func test_isNearLimit_honorsDefaultThresholdWhenUnspecified() {
        // limit 122 -> default threshold 98
        XCTAssertFalse(
            CharacterCountLabel.isNearLimit(count: 97, limit: 122, warningThreshold: nil)
        )
        XCTAssertTrue(
            CharacterCountLabel.isNearLimit(count: 98, limit: 122, warningThreshold: nil)
        )
    }

    // MARK: - accessibilityLabel

    func test_accessibilityLabel_announcesBothCountAndLimit() {
        let label = CharacterCountLabel.accessibilityLabel(count: 158, limit: 500)
        XCTAssertTrue(label.contains("158"), "should announce the current count")
        XCTAssertTrue(label.contains("500"), "should announce the limit")
    }

    func test_accessibilityLabel_isNotTheRawSlashString() {
        // The whole point of the component: VoiceOver must not read "158/500".
        let label = CharacterCountLabel.accessibilityLabel(count: 158, limit: 500)
        XCTAssertFalse(label.contains("158/500"))
    }

    // MARK: - normalForeground (lot 4 — le compteur monté sur le plateau)

    /// **Un jeton de thème posé sur un fond qui n'est pas celui du thème n'est
    /// pas un jeton, c'est un pari.**
    ///
    /// Le composer monte ce compteur sur le PLATEAU, sombre par construction
    /// quel que soit le thème de l'app. `theme.textMuted` y mesure 1,68:1 en
    /// thème clair — illisible. Le site de montage peut donc imposer son
    /// premier plan, et c'est ce que fait `ComposerMoodSurface`.
    func test_normalForeground_letsTheMountingSiteImposeItsForeground() {
        let impose = MeeshyColors.textSecondary(isDark: true)

        XCTAssertTrue(
            WCAGContrast.rendersIdentically(
                CharacterCountLabel.normalForeground(mutedColor: impose, themeMuted: MeeshyColors.error),
                impose
            ),
            "Le premier plan donné par le site doit primer : c'est lui qui connaît son fond."
        )
    }

    /// Et sans override, RIEN ne change pour les appelants existants —
    /// `ReportUserView` et l'écran de status historique n'ont pas bougé d'une
    /// ligne. Un défaut qui change le rendu des appelants d'origine ne serait
    /// pas un défaut, ce serait une migration silencieuse.
    func test_normalForeground_fallsBackToTheThemeTokenForEveryExistingCaller() {
        let jetonDuTheme = MeeshyColors.textMuted(isDark: true)

        XCTAssertTrue(
            WCAGContrast.rendersIdentically(
                CharacterCountLabel.normalForeground(mutedColor: nil, themeMuted: jetonDuTheme),
                jetonDuTheme
            ),
            "Sans override, le compteur reste sur le jeton du thème — le comportement de tous ses appelants."
        )
    }
}
