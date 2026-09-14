import XCTest
@testable import MeeshyUI

/// LA PAGE À EN-TÊTE QUI SE RÉDUIT, en un seul composant (#6481).
///
/// Directive porteur 2026-09-14 : toutes les pages ouvertes depuis Réglages
/// portent le retour en verre et un en-tête clair. L'inventaire en a trouvé
/// vingt, dont quinze avec le MÊME en-tête fait main (chevron nu + « Retour »,
/// barre opaque). Réglages et Progression montent `CollapsibleHeader` avec
/// quinze lignes de plomberie (relais, lecteur, préférence, suivi iOS 18,
/// espace réservé) : les recopier vingt fois fabriquerait vingt jumelles qui
/// divergent. La page les porte une fois.
///
/// **Garde de SOURCE, et pourquoi.** Ce qui compte est que la page COMPOSE les
/// cinq pièces — une omission (le suivi iOS 18, par exemple) ne rougit dans
/// aucun rendu hors appareil : l'en-tête reste simplement figé.
final class CollapsibleHeaderPageTests: XCTestCase {

    private func pageSource() throws -> String {
        ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Navigation/CollapsibleHeaderPage.swift"),
                encoding: .utf8
            )
        )
    }

    func test_thePage_mountsTheSharedCollapsibleHeader_readingTheScrollThroughTheRelay() throws {
        let code = try pageSource()
        XCTAssertTrue(code.contains("CollapsibleHeader("), "La page ne monte pas l'en-tête partagé.")
        XCTAssertTrue(code.contains("ScrollOffsetReader(relay:"),
                      "L'en-tête doit lire le défilement par le relais : sinon la page entière se re-rend à chaque image.")
    }

    func test_thePage_tracksTheScrollOnEverySupportedOS() throws {
        let code = try pageSource()
        XCTAssertTrue(code.contains(".onPreferenceChange(ScrollOffsetPreferenceKey.self)"), "Aucun suivi iOS 16–17.")
        XCTAssertTrue(code.contains(".trackScrollContentOffset"), "Aucun suivi iOS 18+ : l'en-tête ne s'y réduirait pas.")
    }

    func test_thePage_reservesTheExpandedHeaderHeight_aboveItsContent() throws {
        XCTAssertTrue(try pageSource().contains("CollapsibleHeaderMetrics.expandedHeight"),
                      "Le contenu démarrerait sous l'en-tête posé par-dessus.")
    }
}
