import XCTest
import UIKit
@testable import Meeshy

/// **#8524 — retoucher une image de conversation ne la dégrade pas.**
@MainActor
final class ConversationImageRetoucheTests: XCTestCase {

    private func image(width: CGFloat, height: CGFloat) -> UIImage {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    func test_offersRetouche_gif_nonOfferte() {
        XCTAssertFalse(ConversationImageRetouche.offersRetouche(mimeType: "image/gif"))
        XCTAssertFalse(ConversationImageRetouche.offersRetouche(mimeType: "IMAGE/GIF"))
    }

    func test_offersRetouche_photo_offerte() {
        XCTAssertTrue(ConversationImageRetouche.offersRetouche(mimeType: "image/jpeg"))
    }

    /// La source vient du FICHIER, bornée à 2 048 px — plus de la vignette de
    /// 1 024 px du plateau.
    func test_loadSource_fichierGrand_borneA2048() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("retouche-src-\(UUID()).jpg")
        defer { try? FileManager.default.removeItem(at: url) }
        try XCTUnwrap(image(width: 4000, height: 3000).jpegData(compressionQuality: 0.8)).write(to: url)

        let charge = await ConversationImageRetouche.loadSource(fileURL: url)
        let source = try XCTUnwrap(charge)

        let longCote = max(source.size.width * source.scale, source.size.height * source.scale)
        XCTAssertEqual(longCote, 2048, accuracy: 1)
    }

    func test_writeEdited_ecritUnFichierNonVide() async throws {
        let resultat = await ConversationImageRetouche.writeEdited(image(width: 64, height: 64))
        let ecrit = try XCTUnwrap(resultat)
        defer { try? FileManager.default.removeItem(at: ecrit.url) }

        XCTAssertTrue(FileManager.default.fileExists(atPath: ecrit.url.path))
        XCTAssertGreaterThan(ecrit.byteCount, 0)
    }

    /// Répertoire inexistant ⇒ `nil` : l'appelant garde l'image d'origine au
    /// lieu d'avoir déjà supprimé l'ancien fichier.
    func test_writeEdited_ecritureImpossible_rendNil() async {
        let absent = URL(fileURLWithPath: "/nonexistent-\(UUID())", isDirectory: true)
        let ecrit = await ConversationImageRetouche.writeEdited(image(width: 8, height: 8), directory: absent)
        XCTAssertNil(ecrit)
    }

    /// Le temporaire de la graine est purgé quand la retouche se ferme.
    func test_graine_liberee_purgeSonTemporaire() {
        var graine: ConversationImageSeed? = ConversationImageSeed(image: image(width: 16, height: 16))
        let url = graine!.fileURL
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))

        graine = nil

        XCTAssertFalse(FileManager.default.fileExists(atPath: url.path))
    }

    /// « Terminé » sur une scène intacte ne rend aucun rendu, et l'écriture
    /// sûre précède la suppression de l'ancien fichier.
    func test_sources_rienNaChange_etEcritureSure() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main")
        let retour = try String(contentsOf: racine.appendingPathComponent("Composer/MeeshyComposerHost+ReturnImage.swift"),
                                encoding: .utf8)
        XCTAssertTrue(retour.contains("guard viewModel.canUndoGlobal else {"),
                      "Une scène que l'auteur n'a pas touchée ne doit pas remplacer l'image d'origine.")

        let couverture = try String(contentsOf: racine.appendingPathComponent("Views/ConversationView+Composer.swift"),
                                    encoding: .utf8)
        guard let ecriture = couverture.range(of: "ConversationImageRetouche.writeEdited("),
              let suppression = couverture.range(of: "try? FileManager.default.removeItem(at: ancien)") else {
            return XCTFail("La retouche n'écrit plus par `writeEdited` ou ne purge plus l'ancien fichier.")
        }
        XCTAssertLessThan(ecriture.lowerBound, suppression.lowerBound,
                          "L'ancien fichier ne part qu'après l'écriture vérifiée du nouveau.")
    }
}
