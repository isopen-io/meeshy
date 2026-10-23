import XCTest
import AVFoundation
import CoreImage
import MeeshySDK
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
            date: Date(timeIntervalSince1970: 1_790_000_000), uses: [.gallery, .delivery])
        XCTAssertEqual(rendue, ComposerVideoRendition(gallery: url, delivery: url), "la galerie et l'envoi gardent le brut")
    }

    // MARK: - Couper sans retoucher ne ré-encode pas (#9889)

    private static let coupe = CMTimeRange(start: CMTime(seconds: 1, preferredTimescale: 1000),
                                           end: CMTime(seconds: 4, preferredTimescale: 1000))

    func test_plan_rienNeChange_laPriseRepartTelleQuelle() {
        XCTAssertEqual(ComposerLookVideoExporter.plan(look: ComposerPhotoLook(), framing: .identity,
                                                      timeRange: nil, audioGain: 1), .untouched)
    }

    func test_plan_seuleLaLongueurChange_copieSansReencodage() {
        XCTAssertEqual(ComposerLookVideoExporter.plan(look: ComposerPhotoLook(), framing: .identity,
                                                      timeRange: Self.coupe, audioGain: 1), .trimOnly(Self.coupe))
    }

    func test_plan_unLookAvecLaCoupe_seRendEnUnePasse() {
        let look = ComposerPhotoLook(filter: .warm, frame: .none, effect: .none)
        XCTAssertEqual(ComposerLookVideoExporter.plan(look: look, framing: .identity,
                                                      timeRange: Self.coupe, audioGain: 1), .render)
    }

    func test_plan_unCadrageOuUnSonRegle_seRend() {
        let cadrage = ComposerFraming(center: CGPoint(x: 0.4, y: 0.5), scale: 2)
        XCTAssertEqual(ComposerLookVideoExporter.plan(look: ComposerPhotoLook(), framing: cadrage,
                                                      timeRange: Self.coupe, audioGain: 1), .render)
        XCTAssertEqual(ComposerLookVideoExporter.plan(look: ComposerPhotoLook(), framing: .identity,
                                                      timeRange: Self.coupe, audioGain: 0.5), .render)
    }

    func test_coupeSansReencodage_laPisteLeDit_etLExportCopie() throws {
        let piste = try Self.code("Meeshy/Features/Main/Composer/ComposerTrimTrack.swift")
        XCTAssertTrue(piste.contains("if cutsOnKeyframe { keyframeNote }"), "l'interface dit la précision de la coupe")
        let export = try Self.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("presetName: AVAssetExportPresetPassthrough"), "la découpe seule copie les échantillons")
    }

    // MARK: - Une retouche ne passe qu'une fois par un encodeur (#11849)

    func test_rendu_uneRetouche_sEncodeUneFois_auBudgetDesPublications() throws {
        let export = try Self.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("VideoEncodePass.render("), "le rendu écrit lui-même, au débit cible")
        XCTAssertFalse(export.contains("AVAssetExportPresetHighestQuality"),
                       "plus de rendu intermédiaire que compressVideo ré-encoderait")
        XCTAssertEqual(ComposerLookVideoExporter.renderBudget.maxVideoResolution, MediaContext.story.maxVideoResolution)
        XCTAssertEqual(ComposerLookVideoExporter.renderBudget.videoBitRate, MediaContext.feedPost.videoBitRate,
                       "une story comme un post remuxent le rendu sans le ré-encoder")
    }

    /// Correction porteur (tour 4) : la copie en galerie appartient à l'utilisateur.
    func test_galerie_uneRetouche4K_resteEn4K_viseeSurUneQualite() {
        let toile = CGSize(width: 2160, height: 3840)
        XCTAssertEqual(VideoEncodePass.outputSize(of: toile, for: .sourceDefinition), toile, "4K reste 4K en galerie")
        XCTAssertEqual(VideoEncodePass.outputSize(of: toile, for: .sending(.story)), CGSize(width: 1080, height: 1920),
                       "seul l'envoi suit le budget d'envoi")
        let plafond = VideoEncodePass.bitRateCeiling(for: .sourceDefinition, size: toile, frameRate: 30)
        XCTAssertEqual(plafond, VideoTranscodeRecipe.archivalCeiling(width: 2160, height: 3840, frameRate: 30))
        XCTAssertGreaterThan(plafond, MediaContext.story.videoBitRate * 4, "la qualité gouverne, le plafond n'est qu'un garde-fou")
        XCTAssertEqual(VideoEncodePass.bitRateCeiling(for: .sending(.story), size: toile, frameRate: 30),
                       MediaContext.story.videoBitRate)
    }

    func test_galerie_uneSourceHDR_garde_sonHDR_dansLaComposition() {
        let hlg = [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_2020,
                   AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_2100_HLG,
                   AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020]
        XCTAssertEqual(ComposerLookVideoExporter.compositionColors(source: hlg), hlg, "le HDR de la prise survit à la retouche")
        XCTAssertEqual(ComposerLookVideoExporter.compositionColors(source: nil)[AVVideoColorPrimariesKey],
                       AVVideoColorPrimaries_P3_D65, "une prise SDR se rend en P3 comme avant")
    }

    func test_finir_demandeLaGalerieEtLEnvoi_laFlecheSeulementLaGalerie() throws {
        let edition = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertTrue(edition.contains("videoRender(url, uses: enregistre ? [.gallery, .delivery] : .delivery)"),
                      "« Terminé » envoie le rendu d'envoi et garde en galerie celui de pleine définition")
        XCTAssertTrue(edition.contains("videoRender(url, uses: .gallery)"), "⬇︎ n'écrit que la copie de l'utilisateur")
        XCTAssertTrue(edition.contains("rendition?.gallery"), "la galerie reçoit la copie pleine définition, jamais l'envoi")
    }

    func test_rendu_laToileEstRameneeAuBudget_sansChangerSesProportions() {
        XCTAssertEqual(VideoEncodePass.fitSize(CGSize(width: 2160, height: 3840), within: CGSize(width: 1080, height: 1920)),
                       CGSize(width: 1080, height: 1920), "une prise 4K tient dans le budget, compressVideo la remuxe")
        XCTAssertEqual(VideoEncodePass.fitSize(CGSize(width: 720, height: 1280), within: CGSize(width: 1080, height: 1920)),
                       CGSize(width: 720, height: 1280), "une toile déjà dans le budget n'est pas agrandie")
        XCTAssertEqual(VideoEncodePass.fitSize(CGSize(width: 1441, height: 1081), within: CGSize(width: 1080, height: 1920)),
                       CGSize(width: 1440, height: 1080), "dimensions paires et arrondies, proportions gardées, boîte tournée au paysage (#11915)")
    }

    func test_rendu_leMixageEtLaPlageVontAuLecteur() throws {
        let passe = try Self.code("Meeshy/Features/Main/Services/MediaCompressor.swift")
        XCTAssertTrue(passe.contains("output.audioMix = audioMix"), "le gain réglé part dans le fichier")
        XCTAssertTrue(passe.contains("reader.timeRange = timeRange"), "la découpe borne la lecture")
        XCTAssertTrue(passe.contains("start: timeRange?.start ?? .zero"), "la session s'ouvre au début de la coupe")
        XCTAssertTrue(passe.contains("guard reader.status != .failed"), "un rendu interrompu ne passe pas pour complet")
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
                      "un assemblage lancé avant la fermeture n'ouvre rien dans un viseur fermé")
        let prises = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertTrue(prises.contains("declaredSpaceName: espace"), "la vidéo se lit dans l'espace de l'aperçu")
        let retouche = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertTrue(retouche.contains("declaredSpace: camera.liveFeed.declaredSpace"),
                      "la boucle de la retouche lit la vidéo dans l'espace de l'aperçu, comme l'export (#9352)")
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
        XCTAssertTrue(session.contains("await beginEditing(video: url)"),
                      "le ✓ des deux montages assemble et ouvre la retouche : la vidéo n'y part plus sans elle (#9352)")
        XCTAssertFalse(session.contains("ComposerLookVideoExporter.export("), "le ✓ ne rend plus rien lui-même")
        let prises = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertTrue(prises.contains("ComposerLookVideoExporter.export("), "la vidéo de la galerie part avec son look")
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
