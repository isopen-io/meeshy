import XCTest
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

    /// Les trois portes qui montaient l'ancienne vue ouvrent le viseur : le
    /// statut (surface sans scène), la page blanche du SDK (par
    /// l'environnement) et la citation du fil.
    func test_lesTroisPortes_ouvrentLeViseurDuComposeur() throws {
        for porte in [
            "Meeshy/Features/Main/Composer/MeeshyComposerHost+DocumentSurface.swift",
            "Meeshy/Features/Main/Composer/ComposerViewfinder+Provider.swift",
            "Meeshy/Features/Main/Views/FeedComposerSheet.swift",
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
