import XCTest
@testable import Meeshy

/// LWS-6 (contrat §4.3) — `LentilleSticker`, vue pure. Pas de framework de
/// rendu SwiftUI dans ce bundle de tests (ni ViewInspector, ni snapshot) :
/// la logique testable est extraite en fonctions/propriétés PURES sur le
/// type lui-même (`displayTitle`, `letterSpacing`), exercées directement —
/// même patron que `LentilleSectionResolver`/`ScrollTimePillLaw`.
final class LentilleStickerTests: XCTestCase {

    // MARK: - Majuscules (§4.3 « majuscules »)

    func test_displayTitle_uppercasesLowercaseInput() {
        XCTAssertEqual(LentilleSticker.displayTitle("aujourd'hui"), "AUJOURD'HUI")
    }

    func test_displayTitle_leavesAlreadyUppercaseUnchanged() {
        XCTAssertEqual(LentilleSticker.displayTitle("PINNED"), "PINNED")
    }

    func test_displayTitle_uppercasesMixedCaseAccentedInput() {
        XCTAssertEqual(LentilleSticker.displayTitle("Épinglées"), "ÉPINGLÉES")
    }

    // MARK: - Letter-spacing `.1em` (§4.3) dérivé de LentilleMetrics, jamais un point fixe

    func test_letterSpacing_isDerivedFromMetricsSizeAndEm() {
        let expected = LentilleMetrics.Sticker.size * LentilleMetrics.Sticker.letterSpacingEm
        XCTAssertEqual(LentilleSticker.letterSpacing, expected)
    }

    func test_letterSpacing_isPositive() {
        // Un tracking négatif ou nul romprait la lisibilité du sticker —
        // garde de sanité minimale sur la valeur dérivée.
        XCTAssertGreaterThan(LentilleSticker.letterSpacing, 0)
    }

    // MARK: - D5 — le sticker ne disait pas qu'il était replié

    /// **Le défaut mesuré.** Replier une section rend deux bandes
    /// RIGOUREUSEMENT identiques empilées — `MEESHY TEAM` à y=199.3 puis
    /// `CETTE SEMAINE` à y=228.7, aucun rang entre les deux — et rien à
    /// l'écran ne distingue « section repliée » d'un défaut de rendu.
    ///
    /// La cause n'est pas le groupeur : les DEUX chemins filtrent bien les
    /// buckets vides (`ConversationListViewModel` pour le drapeau OFF,
    /// `LentilleSectionResolver` pour le chemin réellement emprunté sous ON).
    /// La cause est que `LentilleSticker` DÉCLARE et STOCKE `isExpanded` sans
    /// jamais le lire : son `label` n'en tire ni chevron, ni compte, ni
    /// atténuation. Un paramètre mort, qu'aucun test ne couvrait — ce témoin
    /// est le premier à nommer `isExpanded` dans toute la suite Lentille.
    ///
    /// Garde de SOURCE plutôt que de rendu : la vue est un `View` SwiftUI sans
    /// hôte de test dans ce bundle, et c'est la CONSOMMATION du paramètre qui
    /// est en cause, pas sa valeur.
    func test_sticker_consumesIsExpanded_soACollapsedSectionLooksCollapsed() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Lentille/Chrome/LentilleSticker.swift"),
            encoding: .utf8
        )
        let code = AppSourceGuard.stripComments(source)
        XCTAssertTrue(
            code.contains("isExpanded ?"),
            "LentilleSticker déclare `isExpanded` mais son `label` ne le lit pas : "
            + "replier une section rend deux bandes identiques empilées, que rien ne "
            + "distingue d'un défaut de rendu. Le paramètre doit produire une "
            + "affordance visible — ou disparaître."
        )
    }

    /// L'affordance ne s'affiche QUE sur une section pliable : une section
    /// calculée (`onToggle == nil`) n'est pas repliable, un chevron y
    /// mentirait sur ce que le toucher fait.
    func test_sticker_affordance_isGatedOnTheSectionBeingToggleable() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Lentille/Chrome/LentilleSticker.swift"),
            encoding: .utf8
        )
        let code = AppSourceGuard.stripComments(source)
        XCTAssertTrue(
            code.contains("onToggle != nil"),
            "Le chevron doit être conditionné à `onToggle != nil` : une section non "
            + "repliable ne doit annoncer aucune pliabilité."
        )
    }
}
