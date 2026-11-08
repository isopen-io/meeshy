import XCTest
@testable import Meeshy

/// **La barre du mode sélection flotte au-dessus de l'indicateur d'accueil, en
/// Liquid Glass, sur petit comme sur grand écran** (#16532).
///
/// Le dock du composer ignore la zone sûre basse : chaque zone qu'il porte se
/// relève elle-même. La barre de sélection REMPLACE le composer, elle se pose
/// donc sur le MÊME sol — jamais sous l'indicateur d'accueil d'un iPhone à
/// Face ID, jamais collée au bord d'un iPhone SE.
final class ConversationSelectionBarTests: XCTestCase {

    // MARK: - Le sol : celui du composer

    func test_floor_faceIDiPhone_clearsTheHomeIndicator() {
        let floor = ConversationSelectionBarLayout.floor(safeAreaBottom: 34)
        XCTAssertGreaterThanOrEqual(floor, 34, "Les boutons ne doivent jamais passer sous l'indicateur d'accueil.")
        XCTAssertEqual(floor, ComposerBottomClearance.required(safeAreaBottom: 34),
                       "La barre de sélection remplace le composer : elle se pose sur son sol, sans saut.")
    }

    func test_floor_homeButtoniPhone_neverTouchesTheScreenEdge() {
        XCTAssertEqual(ConversationSelectionBarLayout.floor(safeAreaBottom: 0),
                       ComposerBottomClearance.required(safeAreaBottom: 0))
        XCTAssertGreaterThan(ConversationSelectionBarLayout.floor(safeAreaBottom: 0), 0)
    }

    func test_floor_insetLargerThanTheComposerFloor_keepsTheInset() {
        XCTAssertEqual(ConversationSelectionBarLayout.floor(safeAreaBottom: 60), 60)
    }

    func test_floor_negativeInset_isTreatedAsNoInset() {
        XCTAssertEqual(ConversationSelectionBarLayout.floor(safeAreaBottom: -5),
                       ConversationSelectionBarLayout.floor(safeAreaBottom: 0))
    }

    // MARK: - La largeur : des marges sur iPhone, une capsule bornée et centrée sur grand écran

    func test_width_iPhoneSE_keepsSideMargins() {
        let margin = ConversationSelectionBarLayout.sideMargin
        XCTAssertEqual(ConversationSelectionBarLayout.width(available: 320), 320 - 2 * margin)
    }

    func test_width_iPhoneProMax_keepsSideMargins() {
        let margin = ConversationSelectionBarLayout.sideMargin
        XCTAssertEqual(ConversationSelectionBarLayout.width(available: 440), 440 - 2 * margin)
    }

    func test_width_iPad_isCappedSoTheBarNeverStretchesAcrossTheScreen() {
        XCTAssertEqual(ConversationSelectionBarLayout.width(available: 1366),
                       ConversationSelectionBarLayout.maxWidth)
        XCTAssertLessThan(ConversationSelectionBarLayout.maxWidth, 768)
    }

    func test_width_degenerateWindow_neverGoesNegative() {
        XCTAssertEqual(ConversationSelectionBarLayout.width(available: 10), 0)
    }

    func test_minimumTarget_isTheHIGHitTarget() {
        XCTAssertEqual(ConversationSelectionBarLayout.minimumTarget, 44)
    }

    // MARK: - Gardes de source : la vue applique la loi

    private func source(_ relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy")
        return AppSourceGuard.stripComments(
            try AppSourceGuard.text(at: root.appendingPathComponent(relativePath))
        )
    }

    func test_bar_isALiquidGlassCapsule() throws {
        let code = try source("Features/Main/Views/ConversationSelectionBar.swift")
        XCTAssertTrue(code.contains(".adaptiveLiquidGlass(in: Capsule()"),
                      "La barre est une capsule Liquid Glass : verre réel sur iOS 26, recette faite main en dessous.")
        XCTAssertFalse(code.contains(".regularMaterial"),
                       "Plus de bandeau en matériau plat plein bord.")
    }

    func test_bar_sitsOnTheLawFloor_andIsWidthBounded() throws {
        let code = try source("Features/Main/Views/ConversationSelectionBar.swift")
        XCTAssertTrue(code.contains("ConversationSelectionBarLayout.floor(safeAreaBottom: safeAreaBottom)"),
                      "Le relèvement sous la barre vient de la loi, jamais d'un nombre recopié.")
        XCTAssertTrue(code.contains(".frame(maxWidth: ConversationSelectionBarLayout.maxWidth)"),
                      "Sur grand écran, la capsule est bornée.")
        XCTAssertTrue(code.contains(".padding(.horizontal, ConversationSelectionBarLayout.sideMargin)"),
                      "Sur iPhone, la capsule garde ses marges latérales.")
    }

    func test_bar_fallsBackToIconsWhenTheLabelledRowDoesNotFit() throws {
        let code = try source("Features/Main/Views/ConversationSelectionBar.swift")
        XCTAssertTrue(code.contains("ViewThatFits(in: .horizontal)"),
                      "Petit écran ou grande taille de texte : la rangée libellée cède à la rangée d'icônes.")
    }

    func test_selectionToolbar_mountsTheBarWithTheWindowInset() throws {
        let code = try source("Features/Main/Views/ConversationView+Selection.swift")
        XCTAssertTrue(code.contains("ConversationSelectionBar("),
                      "`selectionToolbar` monte la barre extraite.")
        XCTAssertTrue(code.contains("safeAreaBottom: windowInsets.bottom"),
                      "La barre reçoit l'encart bas de la FENÊTRE : le dock, lui, l'ignore.")
        XCTAssertFalse(code.contains(".background(.regularMaterial)"))
    }
}
