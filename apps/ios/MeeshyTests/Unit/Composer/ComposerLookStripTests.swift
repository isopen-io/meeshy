import XCTest
@testable import Meeshy

/// **La bande : un atlas, des cases vivantes, un rail** (#9351, spec § 3.1 / § 5).
@MainActor
final class ComposerLookStripTests: XCTestCase {

    func test_pixelRect_flipsIntoCoreImageSpace_atTheContentScale() {
        let rect = ComposerLookStripGeometry.pixelRect(CGRect(x: 64, y: 0, width: 56, height: 100),
                                                       contentHeight: 100, scale: 3)
        XCTAssertEqual(rect, CGRect(x: 192, y: 0, width: 168, height: 300))
    }

    func test_paintedWindow_spansOnlyThePaintedCells_andFitsAMetalTexture() throws {
        XCTAssertEqual(ComposerLookStripGeometry.paintedWindow([4, 2, 7]), 2...7)
        XCTAssertNil(ComposerLookStripGeometry.paintedWindow([]))
        let cases = ComposerLookStripRule.paintedIndices(visible: 60...66, count: 170, cells: 8, chosen: 3, recording: false)
        let fenetre = try XCTUnwrap(ComposerLookStripGeometry.paintedWindow(cases))
        XCTAssertLessThanOrEqual(CGFloat(fenetre.count) * ComposerLookStripRule.pitch * 3,
                                 ComposerLookStripGeometry.maxTexturePixels,
                                 "la vue Metal de la bande tient dans une texture, quelle que soit la longueur du catalogue")
    }

    func test_atlasSlot_keepsEveryPaintedCellOfTheWindowApart() {
        let fenetre = ComposerLookStripRule.paintedIndices(visible: 60...66, count: 170, cells: 8, chosen: 63,
                                                           recording: false)
        let places = ComposerLookStripGeometry.slotCount(for: fenetre)
        let cases = Set(fenetre.map { ComposerLookStripGeometry.slot(of: $0, slots: places) })
        XCTAssertEqual(cases.count, fenetre.count, "deux cases peintes ne partagent jamais une place de l'atlas")
        XCTAssertGreaterThanOrEqual(places, ComposerLookStripGeometry.minimumSlots)
    }

    func test_lockPendingTake_filmsLocked_andFreesTheHold() {
        let session = ComposerCaptureSession(stage: .armed)
        session.beginHold()
        session.lockPendingTake()
        XCTAssertEqual(session.holdPhase, .locked, "la prise part verrouillée : rien ne la retient au doigt")
        XCTAssertNil(session.holdStartedAt, "une seconde demande VoiceOver n'est pas bloquée par une tenue fantôme")
    }

    func test_lockPendingTake_withoutAHold_changesNothing() {
        let session = ComposerCaptureSession(stage: .armed)
        session.lockPendingTake()
        XCTAssertNil(session.holdPhase, "aucune prise demandée : rien ne se verrouille")
    }

    func test_toggleFamily_opensThenCloses_andSwitches() {
        let session = ComposerCaptureSession(stage: .armed)
        session.toggleFamily(.filters)
        XCTAssertEqual(session.openFamily, .filters)
        session.toggleFamily(.frames)
        XCTAssertEqual(session.openFamily, .frames)
        session.toggleFamily(.frames)
        XCTAssertNil(session.openFamily)
    }

    func test_toggleFamily_whileTheLookIsLocked_keepsTheBandAsItIs() {
        let session = ComposerCaptureSession(stage: .armed)
        session.toggleFamily(.filters)
        session.stage = .recording
        session.toggleFamily(.filters)
        XCTAssertEqual(session.openFamily, .filters, "pendant la prise, toucher le rail ne replie pas la bande")
        session.toggleFamily(.frames)
        XCTAssertEqual(session.openFamily, .filters, "ni n'en ouvre une autre")
    }

    func test_perform_selectAFrame_keepsTheFilter() throws {
        let session = ComposerCaptureSession(stage: .armed)
        session.look = ComposerPhotoLook(filter: .warm)
        let cadre = try XCTUnwrap(Self.firstRealFrame())
        session.perform(.select, item: .frame(cadre))
        XCTAssertEqual(session.look.frame, cadre, "le cadre choisi est posé")
        XCTAssertEqual(session.look.filter, .warm, "choisir un cadre garde le filtre")
    }

    func test_perform_selectAFilter_keepsTheFrame() throws {
        let session = ComposerCaptureSession(stage: .armed)
        let cadre = try XCTUnwrap(Self.firstRealFrame())
        session.look = ComposerPhotoLook(filter: .natural, frame: cadre)
        session.perform(.select, item: .filter(.cool))
        XCTAssertEqual(session.look.filter, .cool, "le filtre choisi est posé")
        XCTAssertEqual(session.look.frame, cadre, "choisir un filtre garde le cadre")
    }

    private static func firstRealFrame() -> ComposerPhotoFrame? {
        ComposerLookStripRule.items(.frames).lazy.compactMap { item -> ComposerPhotoFrame? in
            guard case .frame(let cadre) = item, cadre != ComposerPhotoFrame.none else { return nil }
            return cadre
        }.first
    }

    func test_stripNeedsFeed_armedWithCells_offOrCriticalWithout() {
        let thermique = MockThermalStateMonitor(state: .nominal)
        let session = ComposerCaptureSession(stage: .armed, thermal: thermique)
        session.watchThermalState()
        XCTAssertFalse(session.stripNeedsFeed, "sans look ni bande ouverte, rien ne recopie la caméra : aucune trame retenue")
        session.openFamily = .filters
        XCTAssertTrue(session.stripNeedsFeed, "la bande ouverte est vivante")
        session.openFamily = nil
        session.look = ComposerPhotoLook(filter: .warm)
        XCTAssertTrue(session.stripNeedsFeed, "la miniature d'un look choisi est vivante")
        thermique.emit(.critical)
        XCTAssertFalse(session.stripNeedsFeed, "au palier critique, les miniatures sont coupées")
        session.disarm()
        XCTAssertFalse(session.stripNeedsFeed)
    }

    /// **Chaque miniature vivante est dans le contour de sa case** (#9557) : le
    /// libellé, plus large que la case, ne doit pas en élargir le pas — l'atlas
    /// avance de `pitch`, les contours aussi.
    /// Une case n'écrit plus rien (#9566) : elle a exactement la taille de sa
    /// miniature, donc la bande avance du pas de l'atlas.
    func test_cells_advanceByThePitch_eachTheSizeOfItsThumbnail() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        let debut = try XCTUnwrap(bande.range(of: "private func cell(item: ComposerLookStripItem, chosen: Bool)"))
        let fin = try XCTUnwrap(bande.range(of: "private func glyph(", range: debut.upperBound..<bande.endIndex))
        XCTAssertTrue(bande[debut.upperBound..<fin.lowerBound].contains(".frame(width: cellule.width, height: cellule.height)"))
    }

    /// **Sans filtre ni cadre, rien ne recopie la caméra en bas** (#9557) : la
    /// bande repliée montre un déclencheur simple, et aucune trame n'est retenue.
    func test_collapsedStrip_showsAPlainShutter_andHoldsNoFrame_untilALookIsChosen() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("ComposerLookStripRule.collapsedTrigger("), "la règle dit ce que la bande repliée montre")
        let thermique = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Thermal.swift")
        XCTAssertTrue(thermique.contains("ComposerLookStripRule.paintsLive("), "le guet des trames suit la même règle")
    }

    func test_collapsedTrigger_isAShutterWithoutALook_theThumbnailWithOne_andNothingWhileEditing() {
        let nu = ComposerPhotoLook()
        let chaud = ComposerPhotoLook(filter: .warm)
        XCTAssertEqual(ComposerLookStripRule.collapsedTrigger(look: nu, editing: false), .shutter)
        XCTAssertEqual(ComposerLookStripRule.collapsedTrigger(look: chaud, editing: false), .thumbnail)
        XCTAssertEqual(ComposerLookStripRule.collapsedTrigger(look: nu, editing: true), .hidden)
        XCTAssertEqual(ComposerLookStripRule.collapsedTrigger(look: chaud, editing: true), .hidden,
                       "la miniature seule n'existe que pendant la capture, où elle déclenche (#9567)")
        XCTAssertFalse(ComposerLookStripRule.paintsLive(look: nu, familyOpen: false))
        XCTAssertTrue(ComposerLookStripRule.paintsLive(look: nu, familyOpen: true))
    }

    /// « Aucun » ouvre les deux familles : on revient au viseur nu d'un toucher.
    func test_bothFamilies_startWithNone() {
        XCTAssertEqual(ComposerLookStripRule.items(.filters).first, .filter(.natural))
        XCTAssertEqual(ComposerLookStripRule.items(.frames).first, .frame(.none))
    }

    /// Le déclencheur simple photographie d'UN toucher et filme à l'appui long.
    func test_shutter_shootsOnASingleTap_filmsOnAHold_andStopsALockedTake() {
        let arme = ComposerCaptureGestureContext()
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .shutter, gesture: .tap, context: arme), .photoToEdit)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .shutter, gesture: .longPress, context: arme), .filmSegment)
        let issue = ComposerCaptureGesture.tap(zone: .shutter, context: arme, now: Date(), lastTap: nil, armedAt: nil)
        XCTAssertEqual(issue.action, .photoToEdit, "le premier toucher photographie, sans attendre un second")
        var verrouillee = ComposerCaptureGestureContext(stage: .recording)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .shutter, gesture: .tap, context: verrouillee), .none)
        verrouillee.locked = true
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .shutter, gesture: .tap, context: verrouillee), .stopTake)
        let segments = ComposerCaptureGestureContext(pendingSegments: 1)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .shutter, gesture: .tap, context: segments), .none,
                       "des segments en attente : pas de photo isolée")
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .shutter, gesture: .longPress, context: segments), .filmSegment)
        let sansPhoto = ComposerCaptureGestureContext(allowsPhoto: false)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .shutter, gesture: .tap, context: sansPhoto), .none)
        XCTAssertEqual(ComposerCaptureGesture.accessibilityActions(zone: .shutter, context: arme), [.photoToEdit, .filmSegment])
        XCTAssertEqual(ComposerCaptureGesture.accessibilityActions(zone: .shutter, context: verrouillee), [.stopTake])
    }

    /// Le toucher du déclencheur se reconnaît À CÔTÉ de la tenue (#9557) : derrière
    /// elle, il ne partait jamais. La levée d'une tenue, elle, n'est pas un toucher.
    func test_triggerTap_isRecognisedBesideTheHold_andAHoldReleaseIsNotATap() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains(".simultaneously(with: TapGesture()"), "le toucher n'attend pas l'échec de l'appui long")
        XCTAssertFalse(bande.contains(".exclusively(before: TapGesture()"))
        let fin = Date(timeIntervalSince1970: 1_000)
        XCTAssertTrue(ComposerCaptureTapRule.followsAHold(fin, now: fin.addingTimeInterval(0.05)))
        XCTAssertFalse(ComposerCaptureTapRule.followsAHold(fin, now: fin.addingTimeInterval(0.5)))
        XCTAssertFalse(ComposerCaptureTapRule.followsAHold(nil, now: fin))
    }

    // MARK: - La case au centre, un seul nom, un rail sans cadre (#9566)

    func test_band_choosesTheCentredCell_andSnapsCellByCell() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("ComposerLookStripRule.centeredIndex("), "le centre se lit du défilement")
        XCTAssertTrue(bande.contains(".centered(on:"), "le suivi dit quelle case choisir")
        XCTAssertTrue(bande.contains(".scrollTargetBehavior(.viewAligned(limitBehavior: .never))"),
                      "la bande s'accroche case par case, aussi loin que le lancer porte")
        XCTAssertTrue(bande.contains(".scrollTargetLayout()"))
    }

    func test_band_writesOneName_theChosenOne_largeUnderTheCells() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        let debut = try XCTUnwrap(bande.range(of: "private func cell(item: ComposerLookStripItem, chosen: Bool)"))
        let fin = try XCTUnwrap(bande.range(of: "private func glyph(", range: debut.upperBound..<bande.endIndex))
        let cellule = String(bande[debut.upperBound..<fin.lowerBound])
        XCTAssertFalse(cellule.contains("Text("), "aucune case n'écrit son nom : seul le choix se nomme")
        XCTAssertEqual(bande.components(separatedBy: "Text(chosenItemName)").count - 1, 1, "UN nom, celui du choix")
        XCTAssertTrue(bande.contains("MeeshyFont.relative(ComposerLookStripRule.chosenNameSize, weight: .bold)"))
        XCTAssertGreaterThanOrEqual(ComposerLookStripRule.chosenNameSize, 20, "en grand")
    }

    func test_rail_framesWearTheCallFrameSymbol_andNoGlassSurroundsTheFamilies() throws {
        XCTAssertEqual(ComposerCaptureCopy.familySymbol(.frames), "photo.artframe")
        let appel = try Self.code("Meeshy/Features/Main/Views/CallModeControls.swift")
        XCTAssertTrue(appel.contains("symbol: \"photo.artframe\""),
                      "le même pictogramme que le cadre de l'appel vidéo")
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        let debut = try XCTUnwrap(bande.range(of: "struct ComposerLookRail: View {"))
        let fin = try XCTUnwrap(bande.range(of: "struct ComposerLookStrip: View {", range: debut.upperBound..<bande.endIndex))
        let rail = String(bande[debut.upperBound..<fin.lowerBound])
        XCTAssertFalse(rail.contains("adaptiveLiquidGlass"), "ni verre ni cadre : le pictogramme et le nom")
        XCTAssertTrue(rail.contains(".shadow("), "lisibles sur une image claire")
        XCTAssertTrue(rail.contains("MeeshyControlSize.tapTarget"), "la cible reste de 44 pt")
    }

    func test_hint_isSilentWhileAFamilyIsOpen_theChosenNameTakesItsPlace() throws {
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("session.openFamily == nil"))
    }

    func test_chosenLookName_saysBothHalvesOfTheLook() {
        let nom = ComposerCaptureCopy.chosenLookName(ComposerPhotoLook(filter: .natural))
        XCTAssertTrue(nom.contains(ComposerCaptureCopy.itemName(.filter(.natural))))
        XCTAssertTrue(nom.contains(ComposerCaptureCopy.itemName(.frame(.none))))
    }

    func test_strip_isOneMetalAtlas_paintedOnlyWhereVisible() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStripSurface.swift")
        XCTAssertEqual(surface.components(separatedBy: "MTKView(frame:").count - 1, 1, "UNE vue Metal pour toute la bande")
        XCTAssertTrue(surface.contains("ComposerLookPainter.paint("), "les miniatures sortent du peintre unique")
        XCTAssertTrue(surface.contains("makeBlitCommandEncoder"), "l'atlas garde les cases qui ne se repeignent pas")
        XCTAssertTrue(surface.contains("ComposerLookStripPaintRule.tilesToPaint("), "le dessin applique la règle de repeint")
        XCTAssertTrue(surface.contains("gate.requestFrame()"), "une case sans image réclame sa trame")
        XCTAssertTrue(surface.contains("scenes.scene(for:"), "les scènes passent par la cuisson bornée")
        XCTAssertTrue(surface.contains("reduced(frame, buffer: buffer)"), "la trame se réduit dans le passage du dessin")
        XCTAssertEqual(surface.components(separatedBy: "makeCommandBuffer").count - 1, 1,
                       "UN command buffer par dessin")
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("ComposerLookStripRule.paintedIndices("), "seules les cases visibles ±1 se peignent")
        XCTAssertTrue(bande.contains("ComposerCaptureGesture.action("), "la miniature choisie obéit à la table des gestes")
        XCTAssertTrue(bande.contains("ComposerCaptureGesture.tap("), "le toucher de la miniature passe par le seul décideur")
        XCTAssertTrue(bande.contains("ComposerCaptureGesture.accessibilityActions("),
                      "les actions VoiceOver de la miniature sont la projection de la table")
        XCTAssertFalse(bande.contains("TapGesture(count: 2)"), "un double toucher ne retarde jamais le toucher simple")
    }

    func test_draw_asksForAFrame_withAndWithoutADrawable_withinTheBound() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStripSurface.swift")
        let dessin = try XCTUnwrap(Self.body(of: "func draw(in view: MTKView)", in: surface))
        XCTAssertEqual(dessin.components(separatedBy: "requestFrameIfNeeded()").count - 1, 2,
                       "le dessin réclame sa trame après avoir peint ET quand il n'a pas eu de drawable")
        let aide = try XCTUnwrap(Self.body(of: "private func requestFrameIfNeeded()", in: surface))
        XCTAssertTrue(aide.contains("ComposerLookStripPaintRule.mayRequestFrame("), "la demande passe par la borne")
        XCTAssertTrue(aide.contains("gate.requestFrame()"))
    }

    /// Le corps d'une fonction : de sa signature à l'accolade fermante de même retrait.
    private static func body(of signature: String, in source: String) -> String? {
        guard let debut = source.range(of: signature),
              let fin = source.range(of: "\n    }\n", range: debut.upperBound..<source.endIndex) else { return nil }
        return String(source[debut.upperBound..<fin.lowerBound])
    }

    func test_strip_reducesTheFrameInsideItsOwnCommandBuffer() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStripSurface.swift")
        XCTAssertFalse(surface.contains("CVPixelBuffer"),
                       "aucun rendu synchrone vers un tampon réécrit pendant qu'un dessin précédent le lit")
        XCTAssertTrue(surface.contains("CIImage(mtlTexture:"), "la trame réduite est une texture du même passage")
    }

    func test_strip_laysItsCellsLeftToRight_whateverTheLanguage() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains(".environment(\\.layoutDirection, .leftToRight)"),
                      "en arabe, l'atlas Metal et les cases gardent le même ordre")
        XCTAssertFalse(bande.contains("@State private var scrollSettle"),
                       "le minuteur du défilement n'invalide pas la vue à chaque image")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
