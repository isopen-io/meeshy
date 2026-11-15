import XCTest
@testable import MeeshyUI
import MeeshySDK

/// **#4038 — le mime DÉCLARÉ voyage avec le média porté dans la scène.**
///
/// Poser un média sur une scène le COPIE sous `{objectId}.{ext}`, et c'est ce
/// nom que tout l'aval relit pour étiqueter le téléversement
/// (`MimeTypeResolver.mimeType(forURL:)`). Le choix de l'extension EST donc le
/// transport du mime — et il était GUESSÉ : `pathExtension.isEmpty ? "jpg"`
/// pour une image, `? "mov"` pour une vidéo.
///
/// Un PNG ou un HEIC dont l'URL source n'a pas d'extension partait alors
/// étiqueté `image/jpeg`. Rien ne rougissait : le fichier existe, l'objet se
/// pose, le canvas l'affiche. Seul le serveur reçoit un type faux.
final class ComposerContentMediaFileTests: XCTestCase {

    // MARK: - La règle

    /// L'extension de la SOURCE gagne toujours : c'est le fichier lui-même qui
    /// la porte, donc la plus fidèle des trois.
    func test_lExtensionDeLaSource_gagneSurLeMimeDeclare() {
        XCTAssertEqual(
            ComposerContentMediaFile.fileExtension(
                sourceURL: URL(fileURLWithPath: "/tmp/photo.heic"),
                declaredMimeType: "image/png",
                fallback: "jpg"
            ),
            "heic"
        )
    }

    /// **Le défaut que ce lot ferme.** Sans extension, le mime DÉCLARÉ commande
    /// — le repli codé en dur baptisait « jpg » ce PNG.
    func test_sansExtension_leMimeDeclareCommande() {
        XCTAssertEqual(
            ComposerContentMediaFile.fileExtension(
                sourceURL: URL(fileURLWithPath: "/tmp/A1B2C3"),
                declaredMimeType: "image/png",
                fallback: "jpg"
            ),
            "png"
        )
    }

    func test_sansExtension_leMimeDeclareCommande_aussiPourLaVideo() {
        XCTAssertEqual(
            ComposerContentMediaFile.fileExtension(
                sourceURL: URL(fileURLWithPath: "/tmp/A1B2C3"),
                declaredMimeType: "video/mp4",
                fallback: "mov"
            ),
            "mp4"
        )
    }

    /// Le repli n'a pas disparu : il a cessé d'être le PREMIER choix. Une image
    /// sans extension NI mime déclaré n'a plus aucune source de vérité, et un
    /// nom sans extension ferait rendre `application/octet-stream` à l'aval —
    /// pire que le repli.
    func test_sansExtensionNiMime_lePliHistoriqueTient() {
        XCTAssertEqual(
            ComposerContentMediaFile.fileExtension(
                sourceURL: URL(fileURLWithPath: "/tmp/A1B2C3"),
                declaredMimeType: nil,
                fallback: "jpg"
            ),
            "jpg"
        )
    }

    /// Un mime que la table ne couvre pas ne doit pas produire une extension
    /// inventée : on retombe sur le repli, jamais sur un fragment du mime.
    func test_unMimeInconnu_retombeSurLePli_jamaisSurUnFragment() {
        let ext = ComposerContentMediaFile.fileExtension(
            sourceURL: URL(fileURLWithPath: "/tmp/A1B2C3"),
            declaredMimeType: "image/x-fictif",
            fallback: "jpg"
        )
        XCTAssertEqual(ext, "jpg")
        XCTAssertFalse(ext.contains("fictif"))
    }

    // MARK: - Le bout en bout : ce que le fichier posé s'appelle

    /// **La preuve qui compte** : ce n'est pas la règle qui étiquette le
    /// téléversement, c'est le NOM du fichier copié. On le suit jusque-là.
    @MainActor
    func test_unPNGSansExtension_estMaterialiseEnPNG_pasEnJPEG() throws {
        let source = FileManager.default.temporaryDirectory
            .appendingPathComponent("mime-\(UUID().uuidString)")   // AUCUNE extension
        try pngDUnPixel().write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        let composer = StoryComposerViewModel()
        composer.applyContentMedia([
            ComposerContentMedia(sourceURL: source, kind: .image, mimeType: "image/png")
        ])

        let objets = composer.currentSlide.effects.mediaObjects ?? []
        let pose = try XCTUnwrap(objets.first, "Le média n'a pas été posé — la garde ne mesurerait rien.")
        let fichier = FileManager.default.temporaryDirectory
            .appendingPathComponent(pose.id)
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: fichier.appendingPathExtension("png").path),
            "Le fichier matérialisé doit porter `.png` — c'est ce nom que l'aval relit pour étiqueter le "
                + "téléversement (`MimeTypeResolver.mimeType(forURL:)`)."
        )
        XCTAssertFalse(
            FileManager.default.fileExists(atPath: fichier.appendingPathExtension("jpg").path),
            "Le repli codé en dur a repris la main : le PNG partirait étiqueté `image/jpeg`."
        )
        XCTAssertEqual(
            MimeTypeResolver.mimeType(forURL: fichier.appendingPathExtension("png")),
            "image/png"
        )
    }

    /// Un PNG 1×1 minimal, écrit à la main : `UIImage` doit pouvoir le décoder
    /// (`applyContentMedia` refuse une source illisible), et l'octet magique
    /// doit être celui d'un PNG — sans quoi le témoin ci-dessus mesurerait une
    /// pose qui n'a pas eu lieu.
    private func pngDUnPixel() throws -> Data {
        let base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        return try XCTUnwrap(Data(base64Encoded: base64))
    }
}
