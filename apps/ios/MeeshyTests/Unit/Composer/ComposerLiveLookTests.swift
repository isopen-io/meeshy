import XCTest
import AVFoundation
import CoreImage
@testable import Meeshy

/// **Les filtres et les cadres se choisissent EN DIRECT dans le viseur** (#9329).
///
/// Ces témoins tiennent trois promesses : le choix est celui de l'appel (ses
/// teintes, ses cadres en direct), l'aperçu le montre avec les pièces mêmes de
/// l'appel, et la prise — photo comme vidéo — part avec ce qu'on voyait.
@MainActor
final class ComposerLiveLookTests: XCTestCase {

    // MARK: - Le choix : les teintes et les cadres en direct de l'appel

    func test_puces_sontLesAmbiancesDuCatalogue_sansLesClassiques() {
        let puces = ComposerLiveLookRule.chips()
        XCTAssertFalse(puces.isEmpty, "le viseur offre au moins une ambiance de cadres")
        XCTAssertFalse(puces.contains(.classics),
                       "un classique du Montage peint une image figée : il reste à la prise d'une photo")
        XCTAssertTrue(Set(puces).isSubset(of: Set(ComposerPhotoLookRule.chips())),
                      "les ambiances du viseur sont celles du Montage, rien de plus")
    }

    func test_carrousel_aucunCadreEnTete_puisDesCadresQuiSeComposentEnDirect() throws {
        let puce = try XCTUnwrap(ComposerLiveLookRule.chips().first)
        let cadres = ComposerLiveLookRule.frames(for: puce)
        XCTAssertEqual(cadres.first, ComposerPhotoFrame.none)
        XCTAssertGreaterThan(cadres.count, 1)
        XCTAssertTrue(cadres.allSatisfy(ComposerLiveLookRule.isLive))
        XCTAssertTrue(cadres.dropFirst().allSatisfy { ComposerLiveLookRule.design(for: $0) != nil },
                      "chaque cadre offert a un dessin que le compositeur de l'appel sait poser")
    }

    func test_unClassique_neSeComposePasEnDirect() {
        XCTAssertFalse(ComposerLiveLookRule.isLive(.montage(.classic(.polaroid))))
        XCTAssertTrue(ComposerLiveLookRule.isLive(.none))
        XCTAssertNil(ComposerLiveLookRule.design(for: .montage(.classic(.polaroid))))
    }

    func test_toucherUneAmbiance_montreSonPremierCadre() throws {
        let puce = try XCTUnwrap(ComposerLiveLookRule.chips().first)
        let premier = ComposerLiveLookRule.frames(for: puce).first { $0 != ComposerPhotoFrame.none }
        XCTAssertEqual(ComposerLiveLookRule.entering(puce), premier)
        XCTAssertNotEqual(ComposerLiveLookRule.entering(puce), ComposerPhotoFrame.none)
    }

    func test_laPuceOuverte_estCelleDuCadre_sinonLaPremiere() throws {
        let puce = try XCTUnwrap(ComposerLiveLookRule.chips().last)
        let cadre = ComposerLiveLookRule.entering(puce)
        XCTAssertEqual(ComposerLiveLookRule.chip(for: ComposerPhotoLook(frame: cadre)), puce)
        XCTAssertEqual(ComposerLiveLookRule.chip(for: ComposerPhotoLook()), ComposerLiveLookRule.chips().first)
    }

    // MARK: - Quand l'aperçu se peint

    func test_sansLook_lAperçuResteLaCoucheSysteme() {
        XCTAssertFalse(ComposerLiveLookRule.rendersLive(ComposerPhotoLook()))
        XCTAssertTrue(ComposerLiveLookRule.rendersLive(ComposerPhotoLook(filter: .vivid)))
        let puce = ComposerLiveLookRule.chips().first ?? .classics
        XCTAssertTrue(ComposerLiveLookRule.rendersLive(ComposerPhotoLook(frame: ComposerLiveLookRule.entering(puce))))
    }

    func test_leLook_seFigeDesQueLaPriseCommence() {
        XCTAssertFalse(ComposerLiveLookRule.isLocked(stage: .armed, pendingSegments: 0))
        XCTAssertTrue(ComposerLiveLookRule.isLocked(stage: .recording, pendingSegments: 0))
        XCTAssertTrue(ComposerLiveLookRule.isLocked(stage: .armed, pendingSegments: 1),
                      "un second segment sous un autre look rendrait au premier ce qu'il n'avait pas à l'écran")
    }

    func test_laTrame_seRedresseCommeLAperçuSysteme() {
        XCTAssertEqual(ComposerLiveLookRule.orientation(for: .back), .right)
        XCTAssertEqual(ComposerLiveLookRule.orientation(for: .front), .leftMirrored,
                       "l'objectif avant se voit en miroir, comme dans l'appareil photo")
    }

    func test_unCadre_seMontreEntier_dansLEcran() {
        let pose = ComposerLiveLookRule.fit(scene: CGSize(width: 1080, height: 1920),
                                            into: CGSize(width: 1170, height: 2532))
        let rect = CGRect(x: 0, y: 0, width: 1080, height: 1920).applying(pose)
        XCTAssertEqual(rect.width, 1170, accuracy: 0.5, "le cadre prend toute la largeur")
        XCTAssertEqual(rect.minY, (2532 - rect.height) / 2, accuracy: 0.5, "centré, rien de coupé")
        XCTAssertLessThanOrEqual(rect.height, 2532)
    }

    func test_laScene_aLesProportionsDeLaToileDuMontage() {
        let taille = ComposerLiveLookRule.sceneSize(in: CGSize(width: 390, height: 844))
        let toile = ComposerPhotoLookRule.frameCanvas
        XCTAssertEqual(taille.width / taille.height, toile.width / toile.height, accuracy: 0.001)
        XCTAssertEqual(taille.width, 390, accuracy: 0.5)
    }

    func test_laVideoExportee_aLaToileDuMontageSousUnCadre_saTailleSinon() throws {
        let debout = CGSize(width: 1080, height: 1920)
        XCTAssertEqual(ComposerLiveLookRule.exportSize(for: ComposerPhotoLook(filter: .warm), upright: debout), debout)
        let puce = try XCTUnwrap(ComposerLiveLookRule.chips().first)
        let cadre = ComposerPhotoLook(frame: ComposerLiveLookRule.entering(puce))
        XCTAssertEqual(ComposerLiveLookRule.exportSize(for: cadre, upright: CGSize(width: 720, height: 1280)),
                       ComposerPhotoLookRule.frameCanvas)
    }

    func test_uneTrame_estRameneeALOrigine_etNaturelLaRendTelleQuelle() {
        let trame = CIImage(color: CIColor(red: 0.6, green: 0.3, blue: 0.2))
            .cropped(to: CGRect(x: 40, y: 20, width: 100, height: 60))
        let rendue = ComposerLiveLookRule.graded(trame, filter: .natural)
        XCTAssertEqual(rendue.extent, CGRect(x: 0, y: 0, width: 100, height: 60))
        XCTAssertEqual(ComposerLiveLookRule.graded(trame, filter: .warm).extent.size, CGSize(width: 100, height: 60))
    }

    func test_leSelecteur_seTientAuDessusDeLObturateur() {
        XCTAssertGreaterThan(ComposerLiveLookPanelLayout.bottomInset(for: .fullScreen), 0)
        XCTAssertGreaterThanOrEqual(ComposerLiveLookPanelLayout.bottomInset(for: .fullScreen),
                                    ComposerLiveLookPanelLayout.bottomInset(for: .card))
    }

    // MARK: - La machine : le guet des trames suit le look

    func test_choisirUnLook_armeLeGuetDesTrames_etLeRetirerLeCoupe() {
        let session = ComposerCaptureSession()
        XCTAssertFalse(session.camera.liveFeed.isActive, "sans look, aucune trame retenue")
        session.look = ComposerPhotoLook(filter: .cool)
        XCTAssertTrue(session.camera.liveFeed.isActive)
        session.look = ComposerPhotoLook()
        XCTAssertFalse(session.camera.liveFeed.isActive)
        XCTAssertNil(session.camera.liveFeed.latestImage(), "couper le guet rend la trame au pool")
    }

    func test_laSession_figeLeLookPendantLaPrise() {
        let session = ComposerCaptureSession()
        session.stage = .armed
        XCTAssertFalse(session.lookIsLocked)
        session.stage = .recording
        XCTAssertTrue(session.lookIsLocked)
    }

    func test_sansLook_laPhotoPartTelleQuelle_avecSesOctets() {
        let session = ComposerCaptureSession()
        let image = UIImage(cgImage: Self.photo())
        let octets = Data([0xFF, 0xD8])
        var rendu: CameraResult?
        session.lookedPhoto(image, data: octets) { rendu = $0 }
        guard case .photo(let partie, let data)? = rendu else { return XCTFail("la prise doit partir aussitôt") }
        XCTAssertTrue(partie === image)
        XCTAssertEqual(data, octets)
    }

    func test_avecUnFiltre_laPhotoPartPeinte_sansOctetsDOrigine() async {
        let session = ComposerCaptureSession()
        session.look = ComposerPhotoLook(filter: .vivid)
        let image = UIImage(cgImage: Self.photo())
        let attendue = expectation(description: "la photo regardée part")
        var rendu: CameraResult?
        session.lookedPhoto(image, data: Data([0xFF, 0xD8])) {
            rendu = $0
            attendue.fulfill()
        }
        await fulfillment(of: [attendue], timeout: 5)
        guard case .photo(let partie, let data)? = rendu else { return XCTFail("aucune photo") }
        XCTAssertFalse(partie === image, "la photo part avec le filtre qu'on voyait")
        XCTAssertNil(data, "un EXIF qui décrirait une autre image mentirait sur ce qui part")
    }

    func test_sansLook_laVideoPartTelleQuelle_sansRendu() async {
        let url = URL(fileURLWithPath: "/tmp/inexistante.mov")
        let rendue = await ComposerLookVideoExporter.export(
            url, look: ComposerPhotoLook(), person: CallFramePerson(id: "u1", name: "Jean", handle: nil, isSelf: true),
            texts: ComposerPhotoLookSource.texts(at: Date()))
        XCTAssertEqual(rendue, url)
    }

    // MARK: - Ce que la relecture a resserré

    func test_seulsLesCadresQueLAppelComposeEnDirect_sOffrent() {
        for puce in ComposerLiveLookRule.chips() {
            for cadre in ComposerLiveLookRule.frames(for: puce).dropFirst() {
                let dessin = ComposerLiveLookRule.design(for: cadre)
                XCTAssertTrue(dessin.map(CallLiveFrameRule.isEligible) ?? false,
                              "un cadre lourd tiendrait l'aperçu sous ses 30 images par seconde")
            }
            XCTAssertTrue(ComposerLiveLookRule.frames(for: puce).contains { $0 != ComposerPhotoFrame.none },
                          "une ambiance sans cadre en direct ne s'offre pas")
        }
    }

    func test_leCube_litLaTrameDansLEspaceQuElleDeclare() {
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(declared: CGColorSpace(name: CGColorSpace.displayP3)).name,
                       CGColorSpace.displayP3)
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(declared: CGColorSpace(name: CGColorSpace.sRGB)).name,
                       CGColorSpace.sRGB, "une caméra qui sert du sRGB n'est pas lue comme du P3")
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(declared: nil).name, CGColorSpace.sRGB)
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(declared: CGColorSpace(name: CGColorSpace.extendedSRGB)).name,
                       CGColorSpace.displayP3, "un espace étendu ne tient pas dans 8 bits")
    }

    func test_laSessionArretee_neGardeNiTrameNiEspace() {
        let flux = ComposerCameraFeed()
        flux.isActive = true
        flux.flush()
        XCTAssertNil(flux.latestImage(), "la dernière trame ne se montre pas figée au prochain armement")
        XCTAssertNil(flux.declaredSpace)
    }

    func test_fermerLeViseur_arreteLAttenteDuRendu() {
        let session = ComposerCaptureSession()
        XCTAssertFalse(session.isRenderingLook)
        session.disarm()
        XCTAssertFalse(session.isRenderingLook, "un viseur fermé n'attend plus aucun rendu")
    }

    func test_leRendu_seDit_etSAnnuleALaFermeture() throws {
        let session = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(session.contains("guard generation == renderGeneration else"),
                      "un rendu lancé avant la fermeture ne remet rien à un viseur fermé")
        XCTAssertTrue(session.contains("declaredSpaceName: espace"), "la vidéo se lit dans l'espace de l'aperçu")
        let vues = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(vues.contains("if session.isRenderingLook"), "le ✓ attend, et le dit")
        let export = try Self.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("@concurrent"), "l'export ne se monte jamais sur le fil principal")
    }

    // MARK: - Le câblage : les pièces de l'appel, un seul viseur

    func test_lAperçuPartage_poseLeLookEnDirect() throws {
        let vues = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(vues.contains("ComposerLiveLookSurface("), "l'aperçu des DEUX montages montre le look")
        XCTAssertTrue(vues.contains("ComposerLiveLookPanel("), "le chrome des DEUX montages porte le sélecteur")
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains("ComposerLiveLookCopy.toggle"))
    }

    func test_laSurface_composeAvecLesPiecesDeLAppel() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("CallLiveFrameCompositor()"), "le cadre se pose par le compositeur de l'appel")
        XCTAssertTrue(surface.contains("compositor.compose("))
        XCTAssertTrue(surface.contains("ComposerLiveLookRule.graded("))
        let loi = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLook.swift")
        XCTAssertTrue(loi.contains("VideoFilterColorimetry.graded("), "la teinte est celle du flux d'appel")
        for jumelle in ["CITemperatureAndTint", "CIColorControls", "CIColorCube"] {
            XCTAssertFalse(surface.contains(jumelle) || loi.contains(jumelle), "aucune jumelle de la colorimétrie : \(jumelle)")
        }
    }

    func test_laCamera_guetteSesTrames() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("setSampleBufferDelegate(liveFeed, queue: liveFeed.queue)"))
        XCTAssertTrue(camera.contains("liveFeed.setPosition(position)"), "l'objectif qui change redresse autrement")
    }

    func test_laPrise_partAvecLeLook_photoCommeVideo_dansLesDeuxMontages() throws {
        let session = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(session.contains("ComposerLookVideoExporter.export("), "le ✓ des deux montages exporte le look")
        let scene = try Self.code("Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
        XCTAssertTrue(scene.contains("sceneCapture.lookedPhoto("), "story, post et réel : la photo part regardée")
        let viseur = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("initialLook: pendingPhoto.look"), "la prise s'ouvre sur le look du viseur")
        XCTAssertTrue(viseur.contains("capture.lookedPhoto("), "une porte sans prise verse la photo regardée")
    }

    // MARK: - Outils

    private static func photo() -> CGImage {
        let contexte = CGContext(data: nil, width: 64, height: 48, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpace(name: CGColorSpace.displayP3)!,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.55, green: 0.45, blue: 0.35, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
        return contexte.makeImage()!
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
