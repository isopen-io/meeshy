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

    func test_carrousel_aucunCadreEnTete_puisDesCadresQuiSeComposentEnDirect() throws {
        let puce = try XCTUnwrap(ComposerLiveLookRule.chips().last)
        let cadres = ComposerLiveLookRule.frames(for: puce)
        XCTAssertEqual(cadres.first, ComposerPhotoFrame.none)
        XCTAssertGreaterThan(cadres.count, 1)
        XCTAssertTrue(cadres.dropFirst().allSatisfy { ComposerLiveLookRule.design(for: $0) != nil },
                      "chaque cadre offert a un dessin que le compositeur de l'appel sait poser")
    }

    func test_chips_includeTheClassics_firstThenTheCatalogMoods() {
        let puces = ComposerLiveLookRule.chips()
        XCTAssertEqual(puces.first, .classics, "les classiques se choisissent en direct (#9348)")
        XCTAssertTrue(Set(puces).isSubset(of: Set(ComposerPhotoLookRule.chips())))
    }

    func test_frames_classics_areOfferedLive() {
        let cadres = ComposerLiveLookRule.frames(for: .classics)
        XCTAssertEqual(cadres.first, ComposerPhotoFrame.none)
        XCTAssertTrue(cadres.contains(.montage(.classic(.polaroid))))
        XCTAssertTrue(ComposerLiveLookRule.rendersLive(ComposerPhotoLook(frame: .montage(.classic(.noir)))))
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

    func test_uneTrame_estRameneeALOrigine_etNaturelLaRendTelleQuelle() {
        let trame = CIImage(color: CIColor(red: 0.6, green: 0.3, blue: 0.2))
            .cropped(to: CGRect(x: 40, y: 20, width: 100, height: 60))
        let rendue = ComposerLiveLookRule.graded(trame, filter: .natural)
        XCTAssertEqual(rendue.extent, CGRect(x: 0, y: 0, width: 100, height: 60))
        XCTAssertEqual(ComposerLiveLookRule.graded(trame, filter: .warm).extent.size, CGSize(width: 100, height: 60))
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

    func test_sansLook_laVideoPartTelleQuelle_sansRendu() async {
        let url = URL(fileURLWithPath: "/tmp/inexistante.mov")
        let rendue = await ComposerLookVideoExporter.export(
            url, look: ComposerPhotoLook(), person: CallFramePerson(id: "u1", name: "Jean", handle: nil, isSelf: true),
            date: Date(timeIntervalSince1970: 1_790_000_000))
        XCTAssertEqual(rendue, url)
    }

    // MARK: - Ce que la relecture a resserré

    func test_seulsLesCadresQueLAppelComposeEnDirect_sOffrent() {
        for puce in ComposerLiveLookRule.chips() {
            for cadre in ComposerLiveLookRule.frames(for: puce).dropFirst() {
                guard case .montage(.frame) = cadre else { continue }
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
        let bas = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureBottomRow.swift")
        XCTAssertTrue(bas.contains("ComposerLookRail("), "le rail des DEUX montages ouvre les filtres et les cadres")
    }

    func test_laSurface_composeAvecLesPiecesDeLAppel() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("ComposerLookPainter.paint("), "l'aperçu passe par le peintre unique")
        let peintre = try Self.code("Meeshy/Features/Main/Composer/ComposerLookPainter.swift")
        XCTAssertTrue(peintre.contains("CallLiveFrameCompositor()"), "le cadre se pose par le compositeur de l'appel")
        XCTAssertTrue(peintre.contains("compositor.compose("))
        XCTAssertTrue(peintre.contains("ComposerLiveLookRule.graded("))
        let loi = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLook.swift")
        XCTAssertTrue(loi.contains("VideoFilterColorimetry.graded("), "la teinte est celle du flux d'appel")
        for jumelle in ["CITemperatureAndTint", "CIColorControls", "CIColorCube"] {
            XCTAssertFalse(surface.contains(jumelle) || loi.contains(jumelle) || peintre.contains(jumelle),
                           "aucune jumelle de la colorimétrie : \(jumelle)")
        }
    }

    func test_laCamera_guetteSesTrames() throws {
        let camera = try Self.code("Meeshy/Features/Main/Components/CameraModel.swift")
        XCTAssertTrue(camera.contains("setSampleBufferDelegate(self.liveFeed, queue: self.liveFeed.queue)"),
                      "le guet se branche sur la file de la session (#9464)")
        XCTAssertTrue(camera.contains("liveFeed.setPosition(installe.position)"),
                      "l'objectif qui change redresse autrement — publié APRÈS le commit (#9464)")
        let feed = try Self.code("Meeshy/Features/Main/Composer/ComposerCameraFeed.swift")
        XCTAssertTrue(feed.contains("connection.inputPorts.first?.input as? AVCaptureDeviceInput"),
                      "chaque trame se redresse selon l'objectif qui l'a prise")
    }

    func test_laPrise_partAvecLeLook_photoCommeVideo_dansLesDeuxMontages() throws {
        let session = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(session.contains("ComposerLookVideoExporter.export("), "le ✓ des deux montages exporte le look")
        let prises = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertTrue(prises.contains("beginEditing(photo: image, data: camera.capturedPhotoData)"),
                      "toute photo de la scène s'ouvre en édition avec son look, conversation comprise (#9352)")
        XCTAssertFalse(prises.contains("deliversRawPhoto"), "plus de porte qui revoit : le look ne s'applique qu'une fois")
    }

    // MARK: - Outils

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
