import XCTest
import CoreImage
@testable import Meeshy

/// #9125 — **il n'existe plus qu'UNE vue de capture : le viseur du composeur.**
///
/// > Demande porteur 2026-10-02 : la page blanche, le statut et la citation
/// > passent par le viseur du composeur ; l'ancienne `CameraView` quitte le
/// > dépôt.
///
/// Trois écrans de capture coexistaient : la feuille `CameraView`, le viseur en
/// scène, et la copie du premier que chaque porte montait à sa façon. Deux
/// chromes, deux gestuelles — l'auteur apprenait la caméra deux fois. Ces
/// témoins tiennent la convergence : l'ancienne vue n'a plus d'appelant, et les
/// portes qui la montaient ouvrent le viseur, servi seul en plein écran.
final class ComposerSingleViewfinderTests: XCTestCase {

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private func swiftSources(under relative: String) -> [URL] {
        let dossier = Self.appRoot.appendingPathComponent(relative)
        guard let walker = FileManager.default.enumerator(at: dossier, includingPropertiesForKeys: nil) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    private func code(_ relative: String) throws -> String {
        AppSourceGuard.stripComments(try String(
            contentsOf: Self.appRoot.appendingPathComponent(relative), encoding: .utf8))
    }

    /// **LE témoin du lot.** Aucune source de l'app ni du SDK ne nomme plus
    /// l'ancienne vue — ni pour la monter, ni pour la déclarer.
    func test_aucuneSource_neNommeLAncienneCameraView() throws {
        let sources = swiftSources(under: "Meeshy")
            + swiftSources(under: "../../packages/MeeshySDK/Sources")
        XCTAssertGreaterThan(sources.count, 500, "le balayage ne voit pas les sources — la garde ne garde rien")
        let fautifs = sources.compactMap { url -> String? in
            guard let brut = try? String(contentsOf: url, encoding: .utf8),
                  AppSourceGuard.occurrences(ofIdentifier: "CameraView",
                                             in: AppSourceGuard.stripComments(brut)) > 0 else { return nil }
            return url.lastPathComponent
        }
        XCTAssertEqual(fautifs, [], "l'ancienne vue de capture est encore nommée")
        XCTAssertFalse(FileManager.default.fileExists(
            atPath: Self.appRoot.appendingPathComponent("Meeshy/Features/Main/Components/CameraView.swift").path))
    }

    /// Les portes qui montaient l'ancienne vue ouvrent le viseur : le statut
    /// (surface sans scène), la page blanche du SDK (par l'environnement), la
    /// citation du fil — et, depuis #9295, la caméra de la barre de
    /// conversation, qui ne passe plus par la scène.
    func test_lesPortesDeCapture_ouvrentLeViseurDuComposeur() throws {
        for porte in [
            "Meeshy/Features/Main/Composer/MeeshyComposerHost+DocumentSurface.swift",
            "Meeshy/Features/Main/Composer/ComposerViewfinder+Provider.swift",
            "Meeshy/Features/Main/Views/FeedComposerSheet.swift",
            "Meeshy/Features/Main/Views/ConversationView+Composer.swift",
        ] {
            XCTAssertGreaterThan(AppSourceGuard.occurrences(ofIdentifier: "ComposerViewfinder", in: try code(porte)), 0,
                                 "\(porte) n'ouvre pas le viseur du composeur")
        }
    }

    /// **Un statut n'a pas de scène : le viseur s'ouvre SEUL, en plein écran**
    /// — jamais dans une feuille qui laisserait voir le composer derrière.
    func test_laCamera_sePresenteSeuleEnPleinEcran() {
        XCTAssertEqual(ComposerPortal.camera.presentation, .fullScreen)
        for portail in ComposerPortal.allCases where portail != .camera {
            XCTAssertEqual(portail.presentation, .sheet, "\(portail) changerait de présentation")
        }
    }

    /// Le viseur plein écran naît dans le mode que la porte a promis — la
    /// promesse de #4998 survit au changement de vue.
    func test_leViseur_naitDansLeModePromis() {
        XCTAssertEqual(ComposerViewfinderRules.sceneMode(for: .photo), .photo)
        XCTAssertEqual(ComposerViewfinderRules.sceneMode(for: .video), .video)
    }

    /// Le viseur plein écran ne se RÉDUIT pas : il n'a pas de carte où rentrer.
    /// La croix, elle, reste — quitter à tout moment (#8653).
    func test_leViseurPleinEcran_neProposePasDeReduction() throws {
        let viseur = try code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("size: .fullScreen"))
        XCTAssertTrue(viseur.contains("offersSizeToggle: false"))
        XCTAssertTrue(viseur.contains("ComposerCapturePreview(session: capture"),
                      "l'aperçu partagé rend le panneau de refus, pas un aperçu noir (#9134)")
        let vues = try code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(vues.contains("CameraPermissionPanel()"), "un refus rend le panneau, pas un aperçu noir")
    }
}

/// **#9295 — la photo prise reçoit les FILTRES et les CADRES de l'appel vidéo**
/// (directive porteur 2026-10-04 : « réutiliser les frames de l'appel vidéo et
/// les filtres sur l'image — les frames d'une personne, ou une partie des
/// frames de deux »).
///
/// Ces témoins tiennent la RÉUTILISATION : la photo passe par la colorimétrie
/// même du flux d'appel, par les éléments du Montage et par son peintre, montés
/// dans les vues mêmes de l'appel — aucune jumelle.
final class ComposerPhotoLookTests: XCTestCase {

    // MARK: - Le choix

    func test_look_parDefaut_laissePartirLaPriseTelleQuelle() {
        XCTAssertTrue(ComposerPhotoLook().isUntouched)
        XCTAssertFalse(ComposerPhotoLook(filter: .warm, frame: .none).isUntouched)
        XCTAssertFalse(ComposerPhotoLook(filter: .natural, frame: .montage(.classic(.polaroid))).isUntouched)
    }

    func test_originalBytes_neSuiventQueLaPhotoDOrigine() {
        let octets = Data([0xFF, 0xD8])
        XCTAssertEqual(ComposerViewfinderRules.originalBytes(octets, look: ComposerPhotoLook()), octets)
        XCTAssertNil(ComposerViewfinderRules.originalBytes(octets, look: ComposerPhotoLook(filter: .vivid)),
                     "un EXIF qui décrirait une autre image mentirait sur ce qui part")
    }

    func test_filtres_sontLesPreReglagesDeLAppel_naturelEnTete() {
        XCTAssertEqual(ComposerPhotoLookRule.filters, VideoFilterPreset.allCases)
        XCTAssertEqual(ComposerPhotoLookRule.filters.first, .natural)
        XCTAssertFalse(ComposerPhotoLookRule.grades(.natural), "naturel rend l'original sans passe")
        XCTAssertTrue(ComposerPhotoLookRule.grades(.warm))
    }

    // MARK: - Les cadres : ceux du Montage

    func test_puces_sontCellesDuMontage_pourLeDuo() {
        XCTAssertEqual(ComposerPhotoLookRule.chips(), CallMontageFrameRule.chips(forPeople: 2))
        XCTAssertEqual(ComposerPhotoLookRule.chips().first, .classics)
        XCTAssertGreaterThan(ComposerPhotoLookRule.chips().count, 1,
                             "les ambiances du catalogue servent la photo : « une partie des frames de deux »")
    }

    func test_carrousel_aucunCadreEnTete_puisLesElementsDuMontage() {
        let classiques = ComposerPhotoLookRule.frames(for: .classics)
        XCTAssertEqual(classiques.first, ComposerPhotoFrame.none)
        XCTAssertEqual(Array(classiques.dropFirst()),
                       CallMontageFrameRule.items(for: .classics, people: 2).map { ComposerPhotoFrame.montage($0) })
        guard case .mood(let ambiance)? = ComposerPhotoLookRule.chips().dropFirst().first else {
            return XCTFail("aucune ambiance pour le duo")
        }
        let cadres = ComposerPhotoLookRule.frames(for: .mood(ambiance))
        XCTAssertEqual(cadres.first, ComposerPhotoFrame.none)
        XCTAssertGreaterThan(cadres.count, 1)
    }

    func test_entering_montreLePremierCadreDeLAmbiance() {
        let premier = CallMontageFrameRule.items(for: .classics, people: 2).first
        XCTAssertEqual(ComposerPhotoLookRule.entering(.classics), premier.map { ComposerPhotoFrame.montage($0) })
    }

    func test_chip_aucunCadreVitChezLesClassiques() {
        XCTAssertEqual(ComposerPhotoLookRule.chip(of: .none), .classics)
        XCTAssertEqual(ComposerPhotoLookRule.chip(of: .montage(.classic(.neon))), .classics)
    }

    func test_captureLook_traduitLeChoixPourLePeintreDeLAppel() throws {
        XCTAssertNil(ComposerPhotoLookRule.captureLook(for: .none))
        XCTAssertEqual(ComposerPhotoLookRule.captureLook(for: .montage(.classic(.polaroid))), .classic(.polaroid))
        XCTAssertNil(ComposerPhotoLookRule.captureLook(for: .montage(.frame("inconnu.inconnu.duo"))),
                     "un cadre inconnu ne peint rien plutôt qu'un autre cadre")
        let duo = try XCTUnwrap(CallFrameCatalogue.frames(forPeople: 2).first)
        XCTAssertEqual(ComposerPhotoLookRule.captureLook(for: .montage(.frame(duo.id))), .frame(duo))
    }

    func test_downscale_borneSansJamaisAgrandir() {
        XCTAssertEqual(ComposerPhotoLookRule.downscale(for: CGSize(width: 4000, height: 3000), maxPixel: 1000), 0.25,
                       accuracy: 0.0001)
        XCTAssertEqual(ComposerPhotoLookRule.downscale(for: CGSize(width: 300, height: 200), maxPixel: 1000), 1)
    }

    func test_auteur_nomDAffichageSinonPseudo() {
        let nomme = ComposerPhotoLookPerson.author(id: "u1", displayName: "Jean", username: "jcnm")
        XCTAssertEqual(nomme, CallFramePerson(id: "u1", name: "Jean", handle: "jcnm", isSelf: true))
        let anonyme = ComposerPhotoLookPerson.author(id: nil, displayName: "  ", username: "jcnm")
        XCTAssertEqual(anonyme.name, "jcnm")
        XCTAssertEqual(anonyme.id, ComposerPhotoLookPerson.selfId)
    }

    // MARK: - Le peintre

    func test_colorimetrie_naturelle_estLIdentite() {
        let image = CIImage(cgImage: Self.photo())
        XCTAssertTrue(VideoFilterColorimetry.graded(image, config: VideoFilterPreset.natural.config) === image)
    }

    func test_graded_sansBorneNiFiltre_rendLaPhotoElleMeme() {
        let photo = Self.photo()
        XCTAssertTrue(ComposerPhotoLookRenderer.graded(photo, filter: .natural, maxPixel: nil) === photo,
                      "aucun ré-encodage d'une prise intacte")
    }

    func test_graded_filtreDeLAppel_changeLesPixelsEtGardeLaTaille() throws {
        let photo = Self.photo()
        let filtree = try XCTUnwrap(ComposerPhotoLookRenderer.graded(photo, filter: .vivid, maxPixel: nil))
        XCTAssertEqual(filtree.width, photo.width)
        XCTAssertEqual(filtree.height, photo.height)
        XCTAssertNotEqual(Self.moyenne(filtree), Self.moyenne(photo))
    }

    func test_graded_borne_reduitLaPlusGrandeDimension() throws {
        let reduite = try XCTUnwrap(ComposerPhotoLookRenderer.graded(Self.photo(), filter: .natural, maxPixel: 100))
        XCTAssertEqual(max(reduite.width, reduite.height), 100)
    }

    func test_render_sansCadre_rendLaPhotoFiltree() throws {
        let source = Self.source()
        let rendu = try XCTUnwrap(ComposerPhotoLookRenderer.render(
            ComposerPhotoLook(filter: .warm), source: source, maxPixel: nil, frameCanvas: CGSize(width: 108, height: 192)))
        XCTAssertEqual(rendu.width, source.photo.width, "sans cadre, la photo garde son format")
    }

    func test_render_cadreClassique_peintSurLaToileDuMontage() throws {
        let toile = CGSize(width: 108, height: 192)
        let rendu = try XCTUnwrap(ComposerPhotoLookRenderer.render(
            ComposerPhotoLook(frame: .montage(.classic(.polaroid))), source: Self.source(), maxPixel: nil, frameCanvas: toile))
        XCTAssertEqual(rendu.width, 108)
        XCTAssertEqual(rendu.height, 192)
    }

    func test_render_cadreDuDuo_peintUneSeulePersonne() throws {
        let duo = try XCTUnwrap(CallFrameCatalogue.frames(forPeople: 2).first)
        let rendu = try XCTUnwrap(ComposerPhotoLookRenderer.render(
            ComposerPhotoLook(frame: .montage(.frame(duo.id))), source: Self.source(), maxPixel: nil,
            frameCanvas: CGSize(width: 108, height: 192)))
        XCTAssertEqual(rendu.width, 108)
    }

    func test_vignettes_unePourChaqueFiltreEtChaqueCadre() {
        let filtres = ComposerPhotoLookThumbnails.paintingFilters(source: Self.source())
        XCTAssertEqual(Set(filtres.filters.keys), Set(VideoFilterPreset.allCases))
        let cadres = Array(ComposerPhotoLookRule.frames(for: .classics).prefix(3))
        let vignettes = ComposerPhotoLookThumbnails.paintingFrames(source: Self.source(), filter: .natural, frames: cadres)
        XCTAssertEqual(Set(vignettes.frames.keys), Set(cadres))
    }

    func test_leViseur_neRemetQuUneFois_etMasqueSaCameraSousLaPrise() throws {
        let viseur = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("guard !delivered else { return }"), "deux touchers sur « Valider » posaient deux pièces")
        XCTAssertTrue(viseur.contains(".accessibilityHidden(pendingPhoto != nil)"),
                      "VoiceOver n'atteint pas l'obturateur caché sous la prise")
        XCTAssertTrue(viseur.contains(".accessibilityAddTraits(.isModal)"))
    }

    // MARK: - Les couleurs de la prise (#9327)

    func test_espace_unePhotoP3_gardeSonEspace() {
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(of: Self.photoP3()).name, CGColorSpace.displayP3)
    }

    func test_espace_unePhotoSansEspaceRVB_retombeEnSRGB() {
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(of: Self.photoGrise()).name, CGColorSpace.sRGB)
    }

    func test_graded_filtre_rendLaPhotoDansSonEspace() throws {
        let filtree = try XCTUnwrap(ComposerPhotoLookRenderer.graded(Self.photoP3(), filter: .warm, maxPixel: nil))
        XCTAssertEqual(filtree.colorSpace?.name, CGColorSpace.displayP3,
                       "un filtre change la teinte qu'il annonce, jamais l'espace de la photo")
    }

    func test_graded_unRougeHorsGamutSRGB_survitALaReduction() throws {
        let reduite = try XCTUnwrap(ComposerPhotoLookRenderer.graded(Self.photoP3(), filter: .natural, maxPixel: 100))
        let centre = Self.pixelP3(reduite)
        XCTAssertGreaterThan(centre[0], 245)
        XCTAssertLessThan(centre[1], 10, "écrêté en sRGB, le rouge P3 ressortirait délavé : \(centre)")
    }

    func test_render_naturelEtCadre_gardeLeRougeDeLaPhoto() throws {
        let toile = CGSize(width: 108, height: 192)
        let rendu = try XCTUnwrap(ComposerPhotoLookRenderer.render(
            ComposerPhotoLook(frame: .montage(.classic(.screen))), source: Self.source(photo: Self.photoP3()),
            maxPixel: nil, frameCanvas: toile))
        XCTAssertEqual(rendu.colorSpace?.name, CGColorSpace.displayP3, "le cadre se peint dans l'espace de la photo")
        let centre = Self.pixelP3(rendu)
        XCTAssertGreaterThan(centre[0], 245)
        XCTAssertLessThan(centre[1], 10, "choisir un cadre ne délave pas la photo : \(centre)")
    }

    func test_cubeDeLAppel_resteEnSRGBParDefaut() throws {
        let peintre = try Self.code("Meeshy/Features/Main/Services/CallColorLook.swift")
        XCTAssertTrue(peintre.contains("colorSpace: CGColorSpace = CallColorLook.callColorSpace"),
                      "le flux d'appel (sRGB) garde son cube ; seule la photo passe son espace")
    }

    // MARK: - Le câblage : les pièces de l'appel, aucune jumelle

    func test_leViseur_monteLaPrise_etLaScenePasse() throws {
        let viseur = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("ComposerPhotoLookReview("), "une photo passe par la prise")
        let pont = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder+Provider.swift")
        XCTAssertTrue(pont.contains("ComposerViewfinder(reviewsPhoto: false)"),
                      "la page blanche verse dans une scène, où la photo s'édite déjà")
    }

    func test_laPrise_monteLesVuesDeLAppel() throws {
        let prise = try Self.code("Meeshy/Features/Main/Composer/ComposerPhotoLookReview.swift")
        for vue in ["CallModeCarousel(", "CallModeThumbnail(", "CallFrameMoodChips(",
                    "CallEffectsCopy.presetName", "CallFrameCopy.choiceName"] {
            XCTAssertTrue(prise.contains(vue), "la prise ne réutilise plus \(vue)")
        }
    }

    func test_lePeintre_estCeluiDeLAppel() throws {
        let peintre = try Self.code("Meeshy/Features/Main/Composer/ComposerPhotoLook.swift")
        XCTAssertTrue(peintre.contains("CallCaptureController.render("), "les cadres se peignent comme à l'appel")
        XCTAssertTrue(peintre.contains("VideoFilterColorimetry.graded("), "les filtres passent par la colorimétrie du flux")
        XCTAssertFalse(peintre.contains("CITemperatureAndTint"), "aucune jumelle de la colorimétrie")
        XCTAssertFalse(peintre.contains("CIColorControls"), "aucune jumelle de la colorimétrie")
        let flux = try Self.code("Meeshy/Features/Main/Services/VideoFilterPipeline.swift")
        XCTAssertTrue(flux.contains("image = VideoFilterColorimetry.graded(image, config: cfg)"),
                      "le flux d'appel et la photo partagent UNE colorimétrie")
    }

    // MARK: - Outils

    private static func photo(width: Int = 400, height: Int = 300) -> CGImage {
        let contexte = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(red: 0.55, green: 0.45, blue: 0.35, alpha: 1))
        contexte.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return contexte.makeImage()!
    }

    private static func source(photo: CGImage = photo()) -> ComposerPhotoLookSource {
        ComposerPhotoLookSource.taken(photo, by: CallFramePerson(id: "u1", name: "Jean", handle: "jcnm", isSelf: true),
                                      at: Date(timeIntervalSince1970: 1_790_000_000))
    }

    /// Un rouge Display P3 PUR — hors du gamut sRGB : écrêté, il pâlit.
    private static func photoP3(width: Int = 400, height: Int = 300) -> CGImage {
        let p3 = CGColorSpace(name: CGColorSpace.displayP3)!
        let contexte = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: p3, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.setFillColor(CGColor(colorSpace: p3, components: [1, 0, 0, 1])!)
        contexte.fill(CGRect(x: 0, y: 0, width: width, height: height))
        return contexte.makeImage()!
    }

    private static func photoGrise() -> CGImage {
        let contexte = CGContext(data: nil, width: 8, height: 8, bitsPerComponent: 8, bytesPerRow: 0,
                                 space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
        contexte.setFillColor(gray: 0.5, alpha: 1)
        contexte.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        return contexte.makeImage()!
    }

    /// Le pixel CENTRAL, lu en Display P3.
    private static func pixelP3(_ image: CGImage) -> [UInt8] {
        let centre = image.cropping(to: CGRect(x: image.width / 2, y: image.height / 2, width: 1, height: 1))!
        let contexte = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                 space: CGColorSpace(name: CGColorSpace.displayP3)!,
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.draw(centre, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        let octets = contexte.data!.bindMemory(to: UInt8.self, capacity: 4)
        return (0..<4).map { octets[$0] }
    }

    /// La couleur moyenne, lue sur un pixel unique.
    private static func moyenne(_ image: CGImage) -> [UInt8] {
        let contexte = CGContext(data: nil, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                 space: CGColorSpaceCreateDeviceRGB(),
                                 bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        contexte.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        let octets = contexte.data!.bindMemory(to: UInt8.self, capacity: 4)
        return (0..<4).map { octets[$0] }
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
