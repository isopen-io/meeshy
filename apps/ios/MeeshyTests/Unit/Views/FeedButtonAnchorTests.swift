import XCTest
import SwiftUI
@testable import Meeshy

/// Verrouille `FeedButtonAnchor` — le mapping pur "x,y" persistée → point écran /
/// UnitPoint qui place le foyer du liquid reveal Reels au centre EXACT du bouton
/// feed. Doit rester un miroir parfait de `FreeFloatingButton.screenPosition`
/// (mêmes constantes : buttonSize 52, minEdgePadding 20, topSafeZone 50,
/// bottomSafeZone 110/50). Si l'un bouge sans l'autre, le disque naît à côté du
/// bouton — ce test casse alors volontairement.
@MainActor
final class FeedButtonAnchorTests: XCTestCase {

    private let screen = CGSize(width: 390, height: 844)
    private let safeArea = EdgeInsets(top: 59, leading: 0, bottom: 34, trailing: 0)

    // MARK: - parse

    func test_parse_validPair_returnsClampedPoint() {
        XCTAssertEqual(FeedButtonAnchor.parse("0.0,0.0"), CGPoint(x: 0, y: 0))
        XCTAssertEqual(FeedButtonAnchor.parse("1.0,1.0"), CGPoint(x: 1, y: 1))
        XCTAssertEqual(FeedButtonAnchor.parse("0.5,0.25"), CGPoint(x: 0.5, y: 0.25))
    }

    func test_parse_outOfRange_clampsTo01() {
        XCTAssertEqual(FeedButtonAnchor.parse("2.0,-1.0"), CGPoint(x: 1, y: 0))
    }

    func test_parse_malformed_defaultsToTopLeft() {
        XCTAssertEqual(FeedButtonAnchor.parse("garbage"), CGPoint(x: 0, y: 0))
        XCTAssertEqual(FeedButtonAnchor.parse(""), CGPoint(x: 0, y: 0))
        XCTAssertEqual(FeedButtonAnchor.parse("1.0"), CGPoint(x: 0, y: 0))
    }

    // MARK: - screenPoint mirrors FreeFloatingButton math

    func test_screenPoint_topLeft_matchesBoundsMinCorner() {
        // pos (0,0) → button center = (minX, minY) with search bar visible.
        let p = FeedButtonAnchor.screenPoint(
            fromRaw: "0.0,0.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let half = FeedButtonAnchor.buttonSize / 2
        let expectedX = safeArea.leading + FeedButtonAnchor.minEdgePadding + half       // 0 + 20 + 26
        let expectedY = safeArea.top + FeedButtonAnchor.topSafeZone + half               // 59 + 50 + 26
        XCTAssertEqual(p.x, expectedX, accuracy: 0.001)
        XCTAssertEqual(p.y, expectedY, accuracy: 0.001)
    }

    func test_screenPoint_bottomRight_searchVisible_usesLargerBottomSafeZone() {
        let p = FeedButtonAnchor.screenPoint(
            fromRaw: "1.0,1.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let half = FeedButtonAnchor.buttonSize / 2
        let expectedX = screen.width - safeArea.trailing - FeedButtonAnchor.minEdgePadding - half
        let expectedY = screen.height - safeArea.bottom - FeedButtonAnchor.bottomSafeZoneWithSearch - half
        XCTAssertEqual(p.x, expectedX, accuracy: 0.001)
        XCTAssertEqual(p.y, expectedY, accuracy: 0.001)
    }

    func test_screenPoint_searchHidden_movesAnchorLower() {
        // No search bar → smaller bottom safe-zone → the bottom-anchored button
        // sits LOWER on screen (larger y).
        let visible = FeedButtonAnchor.screenPoint(
            fromRaw: "0.0,1.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let hidden = FeedButtonAnchor.screenPoint(
            fromRaw: "0.0,1.0", screenSize: screen, safeArea: safeArea, isSearchBarVisible: false
        )
        XCTAssertGreaterThan(hidden.y, visible.y)
    }

    // MARK: - unitPoint

    func test_unitPoint_isScreenPointFraction() {
        let p = FeedButtonAnchor.screenPoint(
            fromRaw: "0.5,0.5", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        let u = FeedButtonAnchor.unitPoint(
            fromRaw: "0.5,0.5", screenSize: screen, safeArea: safeArea, isSearchBarVisible: true
        )
        XCTAssertEqual(u.x, p.x / screen.width, accuracy: 0.0001)
        XCTAssertEqual(u.y, p.y / screen.height, accuracy: 0.0001)
    }

    func test_unitPoint_zeroSize_returnsTopLeading() {
        let u = FeedButtonAnchor.unitPoint(
            fromRaw: "0.5,0.5", screenSize: .zero, safeArea: safeArea, isSearchBarVisible: true
        )
        XCTAssertEqual(u, .topLeading)
    }

    // MARK: - D2 — la zone sûre du haut ne dégageait pas l'en-tête

    /// **Le défaut mesuré au simulateur (iPhone 16 Pro, 402x874 pt).**
    /// Position par défaut du bouton Flux (`"0.0,0.0"`, RootView.swift:254) :
    /// centre relevé à `y = 75.95`, rayon 26 ⇒ le disque commence à **y = 50**,
    /// c'est-à-dire DANS la Dynamic Island, et il recouvre « Créer une story »
    /// (cadre 16,74,44x44) sur 40.8 x 28.7 pt — 60 % de sa surface. Même défaut
    /// à droite : le bouton Menu recouvre « Nouvelle conversation » (334,80)
    /// sur 40.0 x 22.7 pt. Deux cibles tactiles superposées, livrées PAR DÉFAUT :
    /// aucune position n'était persistée sur le simulateur, donc c'est bien la
    /// valeur du code qu'on voit, pas un glisser de l'utilisateur.
    ///
    /// **La cause racine est ailleurs, et ce témoin ne la couvre pas.**
    /// `FreeFloatingButtonsContainer` (FloatingButtons.swift:124-176) lit
    /// `geometry.safeAreaInsets` dans un `GeometryReader` que le
    /// `.ignoresSafeArea()` de la ligne 176 étend à tout l'écran : les insets
    /// retombent donc à ZÉRO. La formule `minY = safeArea.top + topSafeZone
    /// + half` est juste — c'est son ENTRÉE qui est fausse en production.
    /// `test_screenPoint_topLeft_matchesBoundsMinCorner` ne l'a jamais vu parce
    /// qu'il CHOISIT LUI-MÊME `safeArea.top = 59` : il valide la formule sur une
    /// entrée que l'appelant réel ne fournit pas. Test vert, produit faux.
    ///
    /// Ce témoin assied donc la garantie sur l'entrée RÉELLE (`.zero`) : quelle
    /// que soit la safe area transmise, le disque ne doit pas mordre l'en-tête.
    func test_screenPoint_topLeft_withRealZeroSafeArea_clearsTheHeader() {
        // L'entrée que l'appelant fournit VRAIMENT — pas celle que les autres
        // témoins se donnent.
        let p = FeedButtonAnchor.screenPoint(
            fromRaw: "0.0,0.0", screenSize: screen, safeArea: EdgeInsets(), isSearchBarVisible: true
        )
        let discTop = p.y - FeedButtonAnchor.buttonSize / 2

        // Fin de l'en-tête relevée au simulateur : l'encoche (jusqu'à 62 pt sur
        // les iPhone à Dynamic Island) plus `CollapsibleHeaderMetrics.expandedHeight`
        // (64). « Créer une story » y finit à 118.
        XCTAssertGreaterThanOrEqual(
            discTop, 118,
            "Le disque flottant par défaut commence à \(discTop) pt et mord l'en-tête : "
            + "il recouvre « Créer une story » (jusqu'à y=118) et la Dynamic Island. "
            + "topSafeZone doit dégager l'en-tête ENTIER, encoche comprise, puisque "
            + "l'appelant transmet une safe area nulle (FloatingButtons.swift:176)."
        )
    }
}
