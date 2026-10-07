import XCTest
@testable import Meeshy

/// **Un seul objet vise, filme et retouche** (#9351, spec § 2 / § 4.3 / § 7) —
/// et un seul montage le pose, celui du composer (décision porteur 2026-10-05).
@MainActor
final class ComposerCaptureStageWiringTests: XCTestCase {

    func test_theReviewAndItsParameter_haveLeft() throws {
        let racine = Self.racine()
        for parti in ["ComposerPhotoLookReview.swift", "ComposerLiveLookPanel.swift"] {
            XCTAssertFalse(FileManager.default.fileExists(atPath: racine.appendingPathComponent(
                "Meeshy/Features/Main/Composer/\(parti)").path), "\(parti) a quitté le dépôt")
        }
        for fichier in ["ComposerViewfinder.swift", "ComposerViewfinder+Provider.swift", "ComposerCaptureViews.swift",
                        "ComposerCaptureSession.swift", "ComposerCaptureSession+Takes.swift", "ComposerPhotoLook.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            for absent in ["reviewsPhoto", "deliversRawPhoto", "looksOpen", "ComposerPhotoLookReview",
                           "ComposerPhotoLookRenderer", "ComposerPhotoLookThumbnails", "ComposerLiveLookPanel"] {
                XCTAssertFalse(code.contains(absent), "\(fichier) : \(absent)")
            }
        }
    }

    func test_theShutterHasLeftTheBar_theChosenThumbnailReplacesIt() throws {
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertFalse(barre.contains("shutterGesture"), "le déclencheur ( o ) est retiré")
        XCTAssertFalse(barre.contains("onToggleLooks"), "le rail remplace le bouton « Filtres et cadres »")
        XCTAssertFalse(barre.contains("\"camera.filters\""), "plus de bouton filtre en haut à droite")
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerLookStrip("))
        XCTAssertTrue(bas.contains("ComposerLookRail("))
        XCTAssertTrue(bas.contains("ComposerCaptureLockTrack("), "le cadenas reste à droite")
    }

    /// Le toucher n'est jamais reconnu par un `TapGesture(count: 2)`, qui
    /// retarderait la mise au point : c'est le seul décideur du toucher qui dit
    /// si un toucher est le second d'un double (#9464).
    func test_theChrome_readsEveryGestureFromTheTable() throws {
        let chrome = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("ComposerCaptureGesture.action("))
        XCTAssertTrue(chrome.contains("session.tapAction(context: context)"),
                      "le toucher passe par son seul décideur, avec ce que le format permet")
        XCTAssertTrue(chrome.contains("SpatialTapGesture(count: 1, coordinateSpace: .global)"), "un toucher vise")
        XCTAssertFalse(chrome.contains("TapGesture(count: 2)"), "un double reconnu ainsi retarderait le toucher")
        XCTAssertTrue(chrome.contains("composerCaptureAccessibilityActions(zone: .scene"),
                      "VoiceOver reçoit les prises de la table, jamais une liste réécrite")
    }

    func test_theStage_mountsTheImageAndTheControls() throws {
        let montage = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureMount.swift")
        XCTAssertTrue(montage.contains("layer: .image"))
        XCTAssertTrue(montage.contains("layer: .controls"))
        let scene = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureStage.swift")
        XCTAssertTrue(scene.contains("ComposerCapturePreview("))
        XCTAssertTrue(scene.contains("ComposerCaptureChrome("))
    }

    /// **Un seul plein écran, celui du composer** (décision porteur 2026-10-05).
    func test_bothHosts_mountTheSingleMount_andNoLongerWireTheLayersThemselves() throws {
        for hote in ["Meeshy/Features/Main/Composer/ComposerViewfinder.swift",
                     "Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift"] {
            let code = try Self.code(hote)
            XCTAssertTrue(code.contains("ComposerCaptureMount("), "\(hote) monte le montage unique")
            XCTAssertFalse(code.contains("ComposerCaptureChrome("), "\(hote) recâble le chrome")
            XCTAssertFalse(code.contains("ComposerCapturePreview("), "\(hote) recâble l'aperçu")
        }
        let viseur = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("size: $size, offersSizeToggle: false"),
                      "la conversation n'a pas de carte : sa taille ne joue que sous le flash d'écran (#9566)")
        let composer = try Self.code("Meeshy/Features/Main/Composer/MeeshyComposerHost+Viewfinder.swift")
        XCTAssertTrue(composer.contains("size: $sceneCameraSize"), "le composer pilote carte ↔ plein écran")
        XCTAssertFalse(composer.contains("offersSizeToggle: false"))
    }

    func test_contextFromTheSession_carriesStageSegmentsAndFormat() {
        let session = ComposerCaptureSession(stage: .armed)
        let contexte = session.gestureContext(allowsPhoto: false, allowsVideo: true)
        XCTAssertEqual(contexte.stage, .armed)
        XCTAssertFalse(contexte.allowsPhoto)
        XCTAssertTrue(contexte.allowsVideo)
        XCTAssertEqual(contexte.pendingSegments, 0)
    }

    // MARK: - La barre du haut (porteur 2026-10-05)

    func test_theTopRow_putsTheCrossLeft_andTheFlashRight() throws {
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        guard let debut = barre.range(of: "private var topControls: some View {"),
              let fin = barre.range(of: "private var flashCluster", range: debut.upperBound..<barre.endIndex)
        else { return XCTFail("la rangée haute a changé de forme") }
        let rangee = String(barre[debut.upperBound..<fin.lowerBound])
        let croix = try XCTUnwrap(rangee.range(of: "symbol: \"xmark\""))
        let espace = try XCTUnwrap(rangee.range(of: "Spacer(minLength: 0)"))
        let flash = try XCTUnwrap(rangee.range(of: "flashCluster"))
        let bascule = try XCTUnwrap(rangee.range(of: "arrow.triangle.2.circlepath.camera"))
        XCTAssertLessThan(croix.lowerBound, espace.lowerBound, "la croix ouvre la rangée, à gauche")
        XCTAssertLessThan(bascule.lowerBound, flash.lowerBound, "le flash est le plus à droite")
        XCTAssertLessThan(espace.lowerBound, bascule.lowerBound)
    }

    /// **Sous le flash, UN curseur vertical : son intensité** (porteur 2026-10-07,
    /// #9566). Le curseur de luminosité permanent est retiré.
    func test_theFlashSlider_isVertical_underTheFlash_andOnlyWhileTheFlashIsOn() throws {
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        let rangee = try XCTUnwrap(barre.range(of: "topControls\n"))
        let curseur = try XCTUnwrap(barre.range(of: "ComposerFlashIntensitySlider(level: flashIntensity, onChange: onFlashIntensity)"))
        XCTAssertLessThan(rangee.lowerBound, curseur.lowerBound, "sous la rangée haute, donc sous le flash")
        XCTAssertTrue(barre.contains("ComposerFlashIntensity.showsSlider(flash: flashMode) && !editing"))
        XCTAssertFalse(barre.contains("Exposure"), "plus de curseur de luminosité permanent")
        let vue = try Self.code("Meeshy/Features/Main/Composer/ComposerFlashIntensitySlider.swift")
        XCTAssertTrue(vue.contains("ComposerFlashIntensity.level(atY:"), "le doigt le règle de haut en bas")
        XCTAssertTrue(vue.contains("accessibilityAdjustableAction"), "VoiceOver le règle")
        for fichier in ["ComposerCaptureViews.swift", "ComposerCaptureStage.swift", "ComposerCaptureSession.swift",
                        "ComposerCaptureSession+Switch.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            XCTAssertFalse(code.contains("xposure"), "\(fichier) ne règle plus de luminosité")
        }
    }

    // MARK: - Pendant la prise, seule la miniature choisie

    func test_whileRecording_onlyTheChosenThumbnailAndTheLockRemain() throws {
        let chrome = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("if session.stage != .recording {"), "la rangée haute se cache pendant la prise")
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("if ComposerCaptureGesture.offersRail(context) {"),
                      "le rail n'existe que si la table l'offre (#9576)")
        XCTAssertFalse(bas.contains(".disabled(!rail"), "un rail éteint n'est plus montré : ni à l'œil, ni à VoiceOver")
        XCTAssertFalse(bas.contains("0.4"), "plus de rail à demi effacé")
        XCTAssertTrue(bas.contains("if !recording { zoom }"), "le zoom passe au glissé vertical")
        XCTAssertTrue(bas.contains(".environment(\\.layoutDirection, .leftToRight)"),
                      "le cadenas reste à DROITE, là où le glissé verrouille")
    }

    func test_whileRecording_theVerticalDragZoomsOutDownToHalf() {
        let objectif = MockComposerCaptureCamera()
        let session = ComposerCaptureSession(stage: .recording, controls: objectif)
        XCTAssertEqual(ComposerCaptureGesture.action(zone: .scene, gesture: .drag,
                                                     context: session.gestureContext), .zoom)
        session.dragZoom(translationY: 0)
        session.dragZoom(translationY: 2_000)
        XCTAssertEqual(objectif.zoomRequests.last ?? 1, 0.5, accuracy: 0.0001,
                       "descendre dézoome jusqu'à ×0,5, l'ultra grand-angle")
    }

    // MARK: - Des segments en attente ne partent jamais en silence (2026-10-06)

    func test_closingWithPendingSegments_asksFirst() {
        let segment = ComposerCaptureSegment(url: URL(fileURLWithPath: "/tmp/segment.mov"), duration: 1)
        XCTAssertTrue(ComposerCaptureSegments.asksBeforeClosing([segment]))
        XCTAssertFalse(ComposerCaptureSegments.asksBeforeClosing([]), "sans segment, la fermeture est immédiate")
    }

    func test_theCrossAndTheDismissDrag_bothGoThroughTheConfirmation() throws {
        let chrome = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(chrome.contains("onDisarm: { requestDisarm() }"), "la croix demande d'abord")
        XCTAssertTrue(chrome.contains("HapticFeedback.light()\n                requestDisarm()"), "le glissé aussi")
        XCTAssertTrue(chrome.contains("ComposerCaptureSegments.asksBeforeClosing(session.segments)"))
        XCTAssertTrue(chrome.contains(".alert(ComposerSceneCameraCopy.discardTitle, isPresented: $confirmsDiscard)"))
        XCTAssertTrue(chrome.contains("Button(ComposerSceneCameraCopy.discardConfirm, role: .destructive) { onDisarm() }"))
        XCTAssertTrue(chrome.contains("Button(ComposerSceneCameraCopy.discardKeep, role: .cancel) {}"))
    }

    // MARK: - VoiceOver

    func test_voiceOver_filmLocks_andFocusAimsAtTheCentre() throws {
        let chrome = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        guard let debut = chrome.range(of: "private func performAccessible("),
              let fin = chrome.range(of: "private var holdGesture", range: debut.upperBound..<chrome.endIndex)
        else { return XCTFail("l'exécution VoiceOver a changé de forme") }
        let corps = String(chrome[debut.upperBound..<fin.lowerBound])
        XCTAssertTrue(corps.contains("session.lockPendingTake()"), "« Filmer » part verrouillé")
        XCTAssertTrue(corps.contains("CGPoint(x: cadre.midX, y: cadre.midY)"), "« Mettre au point » vise le centre")
    }

    static func racine() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    static func code(_ relative: String) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: racine().appendingPathComponent(relative), encoding: .utf8))
    }
}
