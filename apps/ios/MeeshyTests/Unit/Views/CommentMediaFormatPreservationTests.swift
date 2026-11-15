import XCTest
@testable import Meeshy

/// **Un GIF choisi dans la photothèque doit ARRIVER en GIF** (#4925).
///
/// Mesure du 2026-09-03, au simulateur : un GIF animé de 240×240 (6 448 o)
/// envoyé en commentaire est arrivé au lecteur en **JPEG 240×240** (4 404 o).
/// Le rendu animé — livré, testé, monté — n'avait donc rien à animer.
///
/// La cause tenait en une ligne de `CommentComposerStaging.photoAttachments` :
///
///     let ext = isVideo ? "mov" : "jpg"
///
/// `loadTransferable(type: Data.self)` rend les octets ORIGINAUX ; le code les
/// écrivait dans un fichier nommé `.jpg`. Le `mimeType` étant ensuite dérivé de
/// l'EXTENSION (`UTType(filenameExtension:)`), tout l'aval — jusqu'au serveur —
/// traitait un GIF intact comme un JPEG, et le ré-encodait.
///
/// > **Une chaîne se mesure à son maillon le plus en amont.** Le format n'était
/// > pas perdu par une compression : il était perdu par un NOM. Et une extension
/// > écrite en dur ne ressemble pas à une perte de données — elle ressemble à
/// > une valeur par défaut.
///
/// `MediaCompressor` savait pourtant déjà lire les signatures et laisser passer
/// un GIF (`compressImageData`). Le savoir était là ; le chemin du commentaire
/// ne le consultait pas.
final class CommentMediaFormatPreservationTests: XCTestCase {

    private func header(_ bytes: [UInt8]) -> Data {
        Data(bytes + [UInt8](repeating: 0, count: max(0, 16 - bytes.count)))
    }

    func test_unGIF_gardeSonExtension() async {
        let ext = await CommentComposerStaging.imageFileExtension(
            for: header([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))

        XCTAssertEqual(ext, "gif", "un GIF nommé .jpg perd son animation avant même d'être envoyé")
    }

    func test_unePNG_gardeSonExtension() async {
        let ext = await CommentComposerStaging.imageFileExtension(
            for: header([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))

        XCTAssertEqual(ext, "png", "une PNG renommée .jpg perd sa transparence au ré-encodage")
    }

    func test_unWebP_gardeSonExtension() async {
        var bytes: [UInt8] = Array("RIFF".utf8) + [0, 0, 0, 0] + Array("WEBP".utf8)
        bytes += Array("ANIM".utf8)
        let ext = await CommentComposerStaging.imageFileExtension(for: Data(bytes))

        XCTAssertEqual(ext, "webp")
    }

    func test_unJPEG_resteEnJPEG() async {
        let ext = await CommentComposerStaging.imageFileExtension(
            for: header([0xFF, 0xD8, 0xFF, 0xE0]))

        XCTAssertEqual(ext, "jpg")
    }

    /// **La direction de l'erreur est choisie.** Des octets qu'on ne sait pas
    /// nommer partent en `jpg` — le comportement d'hier, donc aucune régression
    /// pour les formats que la table ne connaît pas.
    func test_desOctetsInconnus_retombentSurJPEG() async {
        let ext = await CommentComposerStaging.imageFileExtension(for: header([0x00, 0x01, 0x02, 0x03]))

        XCTAssertEqual(ext, "jpg")
    }

    /// **Un HEIC reste `jpg`, et c'est VOULU.** `MediaCompressor` le transcode
    /// délibérément — « most web clients cannot decode HEIC inline ». Élargir la
    /// préservation à tous les formats aurait servi au web un format qu'il ne
    /// rend pas : ce lot ouvre un chemin, il ne renverse pas une décision prise.
    func test_unHEIC_resteEnJPEG_parDecision() async {
        var bytes: [UInt8] = [0, 0, 0, 0x18]
        bytes += Array("ftypheic".utf8)
        bytes += [UInt8](repeating: 0, count: 8)
        let ext = await CommentComposerStaging.imageFileExtension(for: Data(bytes))

        XCTAssertEqual(ext, "jpg")
    }
}
