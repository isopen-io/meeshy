import XCTest
@testable import Meeshy

/// **Recette porteur sur iPhone 16 Pro Max, 2026-10-12** — les retours sur la
/// caméra du composer (#10336 à #10342).
@MainActor
final class ComposerCaptureRecetteTests: XCTestCase {

    // MARK: - #10336 — « Aucun » nettement choisi, jamais un cercle

    func test_collapsedTriggerWithoutLook_isTheNoneCell_withTheChosenMark_noCircle() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        let debut = try XCTUnwrap(bande.range(of: "private var shutter: some View {"))
        let fin = try XCTUnwrap(bande.range(of: "private var chosenAlone", range: debut.upperBound..<bande.endIndex))
        let declencheur = String(bande[debut.upperBound..<fin.lowerBound])
        XCTAssertFalse(declencheur.contains("Circle()"), "aucun cercle d'enregistrement en plus des cadres")
        XCTAssertTrue(declencheur.contains("ComposerTriggerOutlineStyle(recording: recording)"), "la marque de la case choisie")
        XCTAssertTrue(declencheur.contains("glyph(symbol: \"circle.slash\")"), "la case « Aucun »")
    }

    // MARK: - #10337 — la bascule se voile, scène et vignettes

    func test_switchVeil_blursFadesAndRecedes_whileSwitching_only() {
        XCTAssertGreaterThan(ComposerCameraSwitchVeil.blur(switching: true), 0)
        XCTAssertEqual(ComposerCameraSwitchVeil.blur(switching: false), 0)
        XCTAssertLessThan(ComposerCameraSwitchVeil.opacity(switching: true), 1)
        XCTAssertGreaterThan(ComposerCameraSwitchVeil.opacity(switching: true), 0, "la dernière image reste lisible")
        XCTAssertLessThan(ComposerCameraSwitchVeil.scale(switching: true, reduceMotion: false), 1)
        XCTAssertEqual(ComposerCameraSwitchVeil.scale(switching: true, reduceMotion: true), 1, "Réduire les animations")
    }

    func test_switchVeil_coversTheSceneAndEveryLiveThumbnail() throws {
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("ComposerCameraSwitchVeilStyle(switching: editedSource == nil"))
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertEqual(bande.components(separatedBy: ".modifier(ComposerCameraSwitchVeilStyle(switching: switchingCamera))")
                        .count - 1, 2, "la miniature seule et la bande")
    }

    // MARK: - #10338 — vignettes arrondies

    func test_bandThumbnails_areMaskedToTheCellCorners() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        let surface = try XCTUnwrap(bande.range(of: "ComposerLookStripSurface(tiles: tuiles"))
        let masque = try XCTUnwrap(bande.range(of: ".mask {", range: surface.upperBound..<bande.endIndex))
        let suite = bande[masque.upperBound...].prefix(400)
        XCTAssertTrue(suite.contains("RoundedRectangle(cornerRadius: MeeshyRadius.sm"), "le rayon de la case")
    }

    // MARK: - #10339 — la colonne a la hauteur exacte des cases

    func test_railColumn_matchesTheCellsHeight_andSpacing() {
        let familles = CGFloat(ComposerLookFamily.allCases.count)
        let colonne = familles * ComposerLookStripRule.railEntryHeight + (familles - 1) * ComposerLookStripRule.spacing
        XCTAssertEqual(colonne, ComposerLookStripRule.cellSize.height, accuracy: 0.001)
    }

    func test_railIsAlignedWithTheCells_inCaptureAndInRetouch() throws {
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertEqual(bas.components(separatedBy: "alignedWithCells: true").count - 1, 2)
        XCTAssertTrue(bas.contains(".padding(.top, ComposerTriggerOutline.outset)"), "en retouche, haut sur haut")
    }

    // MARK: - #10340 — la photo figée ne se décode plus à chaque image

    func test_stillSource_displaySize_isBoundedToTheScreen() {
        let grande = ComposerStillSource.displaySize(of: CGSize(width: 4032, height: 3024))
        XCTAssertEqual(max(grande.width, grande.height), ComposerStillSource.displayLongSide)
        XCTAssertEqual(grande.width / grande.height, 4032.0 / 3024.0, accuracy: 0.01)
        XCTAssertEqual(ComposerStillSource.displaySize(of: CGSize(width: 800, height: 600)), CGSize(width: 800, height: 600))
    }

    func test_stillSource_showsADecodedScreenCopy() throws {
        let contexte = try XCTUnwrap(CGContext(data: nil, width: 3000, height: 4000, bitsPerComponent: 8, bytesPerRow: 0,
                                               space: CGColorSpaceCreateDeviceRGB(),
                                               bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        let photo = try XCTUnwrap(contexte.makeImage())
        let source = ComposerStillSource(photo)
        let montree = try XCTUnwrap(source.latestImage())
        XCTAssertEqual(max(montree.extent.width, montree.extent.height), ComposerStillSource.displayLongSide)
    }

    // MARK: - #10341 — le son sur la bande vidéo, 100 % au milieu

    func test_volume_isHundredPercentInTheMiddle_upToTwoHundred() {
        XCTAssertEqual(ComposerTakeSound.range, 0...2)
        XCTAssertEqual(ComposerTakeSound.gain(atY: 26, height: 52), 1, accuracy: 0.0001)
        XCTAssertEqual(ComposerTakeSound.percent(ComposerTakeSound.gain(atY: 0, height: 52)), 200)
    }

    func test_soundSitsOverTheVideoBand_withTheSoundIconInsideBeforeTheHandle() throws {
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerSoundTrack(session: session, url: trimClip.url, overlaid: true)"))
        XCTAssertTrue(bas.contains(".padding(.horizontal, ComposerTrimTrack.trackInset)"), "entre les deux poignées")
        // #10356 : le son se montre sur la bande par l'OUTIL, sans panneau à lui
        // tant que la coupe est montrée — plus de seconde rangée sous la vidéo.
        XCTAssertTrue(bas.contains("session.shownEditTools.contains(.sound)"))
        XCTAssertEqual(ComposerEditTools.panels(familyOpen: false, active: [.trim, .sound]), [.trim],
                       "plus de seconde rangée de spectre sous la vidéo")
    }

    // MARK: - #10342 — (x) en retouche photo : confirmation, et aucun gel

    func test_closingAPhotoRetouch_alwaysAsks() {
        for etat in [ComposerTakeSaveState.idle, .saving, .saved] {
            XCTAssertTrue(ComposerCaptureDiscardRule.asksBeforeClosing(stage: .armed, editing: true, segments: [],
                                                                      takeSave: etat))
        }
    }

    func test_mount_keepsOnePreview_acrossCaptureAndRetouch() throws {
        let montage = AppSourceGuard.stripComments(try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureMount.swift"))
        let corps = try XCTUnwrap(montage.range(of: "var body: some View {"))
        let fin = try XCTUnwrap(montage.range(of: "private func rect(", range: corps.upperBound..<montage.endIndex))
        XCTAssertEqual(montage[corps.upperBound..<fin.lowerBound].components(separatedBy: "image(rect:").count - 1, 1,
                       "un seul aperçu : sortir de la retouche ne rattache plus la couche à la session")
    }

    private static func code(_ relative: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent(relative)
        return try String(contentsOf: url, encoding: .utf8)
    }
}
