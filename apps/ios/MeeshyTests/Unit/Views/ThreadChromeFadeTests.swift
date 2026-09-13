import XCTest
import UIKit
@testable import Meeshy

/// **En rangée plate, le fil s'efface sous le chrome posé** (#6013).
///
/// Le chrome de la conversation est transparent par décision produit — l'en-tête
/// (2026-08-22), le composeur (#3920) — et le fil défile dessous jusqu'au bord de
/// l'écran (2026-08-12). En Script et en Focal, la rangée est du TEXTE NU : au
/// repos, il se peignait sous l'heure, sous le bouton Retour et dans le champ
/// du composeur, lisible et superposé à ce qu'on y tape.
///
/// Bulles montre la même collision (#6046) mais garde son chrome posé pendant
/// le défilement : un masque y tiendrait à chaque frame du geste, et ce coût
/// se mesure avant de l'étendre.
///
/// Ni scrim ni fond : le fil s'EFFACE (masque) dans la bande du chrome tant que
/// ce chrome est posé, et retrouve le bord de l'écran dès que le défilement
/// l'escamote.
final class ThreadChromeFadeTests: XCTestCase {

    private let island: CGFloat = 62
    private let headerRow: CGFloat = 52
    private let bottomRest: CGFloat = 180
    private let visible = ThreadChromeFade.Visibility(header: true, composer: true)

    private func flat(_ visibility: ThreadChromeFade.Visibility) -> ThreadChromeFade {
        ThreadChromeFade.resolve(
            usesFlatRow: true,
            topInset: island,
            headerRowClearance: headerRow,
            bottomRest: bottomRest,
            visibility: visibility
        )
    }

    // MARK: - La loi

    func test_resolve_bubbles_leavesTheThreadUnmasked() {
        let fade = ThreadChromeFade.resolve(
            usesFlatRow: false,
            topInset: island,
            headerRowClearance: headerRow,
            bottomRest: bottomRest,
            visibility: visible
        )
        XCTAssertEqual(fade, .none, "Bulles garde son chrome en défilant : hors de ce voile (#6046)")
        XCTAssertEqual(ThreadChromeFade.headClearance(usesFlatRow: false), 0)
    }

    func test_resolve_flatRow_clearsEverythingUnderTheHeaderRow() throws {
        let top = try XCTUnwrap(flat(visible).top)
        XCTAssertEqual(
            top.clearExtent, island + headerRow,
            "Rien du fil ne se lit sous l'heure ni sous le bouton Retour."
        )
        XCTAssertGreaterThan(top.opaqueExtent, top.clearExtent)
        XCTAssertFalse(top.isLifted)
    }

    func test_resolve_flatRow_clearsEverythingUnderTheComposer() throws {
        let bottom = try XCTUnwrap(flat(visible).bottom)
        XCTAssertEqual(
            bottom.opaqueExtent, bottomRest,
            "Au repos, le dernier message reste entièrement lisible au-dessus du composeur."
        )
        XCTAssertLessThan(bottom.clearExtent, bottom.opaqueExtent)
        XCTAssertFalse(bottom.isLifted)
    }

    /// Le repos du plus ancien message tombe sur la ligne où le fil redevient
    /// lisible : sans cette réserve, le voile le cacherait pour toujours.
    func test_headClearance_restsTheOldestRowOnTheOpaqueLine() throws {
        let top = try XCTUnwrap(flat(visible).top)
        XCTAssertEqual(island + ThreadChromeFade.headClearance(usesFlatRow: true), top.opaqueExtent)
    }

    /// Le défilement escamote le chrome : chaque bande rend le bord au fil, et
    /// seulement la sienne — panneau emoji ouvert, le composeur reste posé.
    func test_resolve_chromeHiddenForScroll_liftsEachBandIndependently() {
        let headerGone = flat(ThreadChromeFade.Visibility(header: false, composer: true))
        XCTAssertEqual(headerGone.top?.isLifted, true)
        XCTAssertEqual(headerGone.bottom?.isLifted, false)
        XCTAssertFalse(headerGone.isFullyLifted)

        XCTAssertTrue(flat(.hidden).isFullyLifted)
    }

    func test_resolve_restShorterThanTheRamp_neverProducesANegativeExtent() throws {
        let fade = ThreadChromeFade.resolve(
            usesFlatRow: true,
            topInset: 0,
            headerRowClearance: headerRow,
            bottomRest: 4,
            visibility: visible
        )
        let bottom = try XCTUnwrap(fade.bottom)
        XCTAssertGreaterThanOrEqual(bottom.clearExtent, 0)
    }

    // MARK: - Le rendu

    private var visibleFade: ThreadChromeFade {
        ThreadChromeFade(
            top: ThreadChromeFade.Band(clearExtent: 114, opaqueExtent: 122, isLifted: false),
            bottom: ThreadChromeFade.Band(clearExtent: 164, opaqueExtent: 180, isLifted: false)
        )
    }

    private var liftedFade: ThreadChromeFade {
        ThreadChromeFade(
            top: ThreadChromeFade.Band(clearExtent: 114, opaqueExtent: 122, isLifted: true),
            bottom: ThreadChromeFade.Band(clearExtent: 164, opaqueExtent: 180, isLifted: true)
        )
    }

    @MainActor
    func test_container_masksItsContentOnlyWhileABandIsPosed() {
        let content = UIView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        let container = ThreadChromeFadeContainer(hosting: content)
        XCTAssertTrue(content.superview === container)
        XCTAssertNil(container.mask, "Sans voile, aucun masque : aucun rendu hors écran en Bulles.")

        container.apply(visibleFade, transition: nil)
        XCTAssertNotNil(container.mask)

        container.apply(liftedFade, transition: nil)
        XCTAssertNil(container.mask, "Chrome escamoté : le fil retrouve le bord, le masque part.")

        container.apply(visibleFade, transition: nil)
        container.apply(.none, transition: nil)
        XCTAssertNil(container.mask)
    }

    @MainActor
    func test_container_pinsEachBandToItsEdge() {
        let container = ThreadChromeFadeContainer(
            hosting: UIView(frame: CGRect(x: 0, y: 0, width: 400, height: 800))
        )
        container.apply(visibleFade, transition: nil)
        container.layoutIfNeeded()
        XCTAssertEqual(container.topBandFrame, CGRect(x: 0, y: 0, width: 400, height: 122))
        XCTAssertEqual(container.bottomBandFrame, CGRect(x: 0, y: 620, width: 400, height: 180))

        container.frame.size.height = 500
        container.layoutIfNeeded()
        XCTAssertEqual(
            container.bottomBandFrame?.minY, 320,
            "Clavier levé, la liste raccourcit : le voile bas suit son bord bas."
        )
    }

    // MARK: - Le câblage

    private func source(_ file: String) throws -> String {
        try AppSourceGuard.unit("Meeshy/Features/Main/Views/\(file)")
    }

    /// Les pilules de jour et d'heure sont montées dans la vue du contrôleur :
    /// le conteneur n'enveloppe QUE la liste, elles restent hors du masque.
    func test_theFadeContainerWrapsOnlyTheList() throws {
        let code = try source("MessageListViewController.swift")
        XCTAssertTrue(code.contains("view.addSubview(ThreadChromeFadeContainer(hosting: collectionView))"))
    }

    func test_theOldestRowRestsBelowTheHeaderRowInFlatRow() throws {
        let code = try source("MessageListViewController.swift")
        XCTAssertTrue(
            code.contains("topInset + ThreadChromeFade.headClearance(usesFlatRow: readingMode.usesFlatRow)"),
            "L'inset de repos haut doit réserver la rangée de l'en-tête en rangée plate."
        )
    }

    func test_everyListPassRepaintsTheFade() throws {
        let code = try source("MessageListView.swift")
        XCTAssertEqual(
            code.components(separatedBy: "vc.applyChromeFade(").count - 1, 2,
            "Le voile se pose au montage ET à chaque mise à jour (insets, mode, chrome)."
        )
    }

    func test_theConversationSaysWhichChromeIsPosed() throws {
        let code = try source("ConversationView.swift")
        XCTAssertTrue(code.contains("!hidesEntireHeaderForScroll"))
        XCTAssertTrue(code.contains("!hidesComposerChromeForScroll"))
        XCTAssertTrue(code.contains("chromeVisibility: previewMode ? .hidden : ThreadChromeFade.Visibility("))
    }
}
