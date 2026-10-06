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
        XCTAssertTrue(viseur.contains("size: .constant(.fullScreen)"))
        XCTAssertTrue(viseur.contains("offersSizeToggle: false"))
        XCTAssertTrue(viseur.contains("ComposerCaptureMount(session: capture"),
                      "le montage unique rend le panneau de refus, pas un aperçu noir (#9134, #9351)")
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

    func test_leViseur_neRemetQuUneFois() throws {
        let viseur = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("guard !delivered else { return }"), "deux validations rapprochées posaient deux pièces")
    }

    // MARK: - Les couleurs de la prise (#9327)

    func test_espace_unePhotoP3_gardeSonEspace() {
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(of: Self.photoP3()).name, CGColorSpace.displayP3)
    }

    func test_espace_unePhotoSansEspaceRVB_retombeEnSRGB() {
        XCTAssertEqual(ComposerPhotoLookRule.colorSpace(of: Self.photoGrise()).name, CGColorSpace.sRGB)
    }

    func test_cubeDeLAppel_resteEnSRGBParDefaut() throws {
        let peintre = try Self.code("Meeshy/Features/Main/Services/CallColorLook.swift")
        XCTAssertTrue(peintre.contains("colorSpace: CGColorSpace = CallColorLook.callColorSpace"),
                      "le flux d'appel (sRGB) garde son cube ; seule la photo passe son espace")
    }

    // MARK: - Le relief Liquid Glass (#9330)

    func test_lesBoutonsDuViseur_ontLeReliefLiquidGlass() throws {
        for fichier in ["ComposerSceneCameraBar.swift", "ComposerCaptureRefusedChrome.swift", "ComposerExposureSlider.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            XCTAssertFalse(code.contains(".adaptiveGlass(in:"),
                           "\(fichier) : un verre plat sous iOS 26 — le relief passe par adaptiveLiquidGlass")
            XCTAssertTrue(code.contains("adaptiveLiquidGlass(in:"), fichier)
        }
        let barre = try Self.code("Meeshy/Features/Main/Composer/ComposerSceneCameraBar.swift")
        XCTAssertTrue(barre.contains(".adaptiveLiquidGlass(in: Circle(), interactive: true)"),
                      "un bouton du viseur réagit au toucher")
    }

    // MARK: - Le câblage : les pièces de l'appel, aucune jumelle

    /// **#9295 → #9351 : la revue photo est partie, la bande la remplace.** Le
    /// viseur monte le montage unique ; la page blanche verse dans une scène.
    func test_leViseur_monteLeMontageUnique_etLaScenePasse() throws {
        let viseur = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder.swift")
        XCTAssertTrue(viseur.contains("ComposerCaptureMount("), "le viseur monte l'objet unique")
        let pont = try Self.code("Meeshy/Features/Main/Composer/ComposerViewfinder+Provider.swift")
        XCTAssertTrue(pont.contains("ComposerViewfinder {"), "la porte de l'atelier monte le même viseur")
    }

    func test_laBande_nommeAvecLesMotsDeLAppel() throws {
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        for vue in ["CallEffectsCopy.presetName", "CallFrameCopy.choiceName", "CallEffectsCopy.presetSymbol"] {
            XCTAssertTrue(bande.contains(vue), "la bande ne réutilise plus \(vue)")
        }
    }

    func test_lePeintre_estCeluiDeLAppel() throws {
        let loi = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLook.swift")
        XCTAssertTrue(loi.contains("VideoFilterColorimetry.graded("), "les filtres passent par la colorimétrie du flux")
        let peintre = try Self.code("Meeshy/Features/Main/Composer/ComposerLookPainter.swift")
        for jumelle in ["CITemperatureAndTint", "CIColorControls"] {
            XCTAssertFalse(peintre.contains(jumelle) || loi.contains(jumelle), "aucune jumelle de la colorimétrie")
        }
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

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
