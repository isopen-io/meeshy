import XCTest
@testable import Meeshy

/// V3-5 — ce que le panneau « Mes stickers » ANNONCE quand un collage contient
/// autre chose qu'une image. Miroir de `PasteIntoComposerTests` pour la
/// destination `.stickers`, que rien n'atteignait avant ce lot.
///
/// `batch.scene` est traité ici comme une EXCLUSION, jamais comme du contenu
/// hébergé — à la différence de `PasteIntoComposer.exclusions(in:)`, écrit
/// pour la scène d'une story où `.scene` EST ce qui se pose. Réutiliser cette
/// dernière telle quelle aurait avalé en silence toute vidéo ou tout son collé
/// pendant que le panneau stickers est ouvert : c'est le bug que ce fichier
/// garde fermé.
final class StickerLibraryPasteTests: XCTestCase {

    private func file(_ name: String, _ mime: String) -> ComposerIngest {
        .file(url: URL(fileURLWithPath: "/tmp/\(name)"), name: name, mime: mime)
    }

    // MARK: - Loi de conservation, propre à cette destination

    /// Tout ce qui est collé pendant que le panneau stickers est ouvert
    /// ressort — posé dans `batch.stickers`, ou nommé dans une exclusion. Rien
    /// ne s'évapore.
    func test_everythingPasted_isEitherKeptOrAnnounced_neverSwallowed() {
        let ingests: [ComposerIngest] = [
            file("a.png", "image/png"),
            file("c.mov", "video/quicktime"),
            file("d.m4a", "audio/mp4"),
            file("e.pdf", "application/pdf"),
            .text("bonjour")
        ]
        let batch = PasteIntoComposer.batch(ingests: ingests, unreadable: ["Dossier"], surface: .stickers)

        let announcedNames = StickerLibraryPaste.exclusions(in: batch).flatMap { exclusion -> [String] in
            switch exclusion {
            case .unreadable(let names), .onlyImagesBecomeStickers(let names): return names
            case .textCannotBecomeASticker: return []
            }
        }

        XCTAssertEqual(
            Set(batch.stickers.map(\.name)).union(announcedNames),
            Set(["a.png", "c.mov", "d.m4a", "e.pdf", "Dossier"]),
            "Un élément collé pendant que le panneau stickers est ouvert n'est ni retenu ni annoncé."
        )
    }

    /// La vidéo et le son ont un rendu — sur la SCÈNE. Le panneau stickers n'en
    /// a aucun : les traiter comme hébergés via `batch.scene`, comme le ferait
    /// `PasteIntoComposer.exclusions(in:)`, les garderait silencieusement.
    func test_videoAndAudio_areAnnounced_notSilentlyKept() {
        let batch = PasteIntoComposer.batch(
            ingests: [file("c.mov", "video/quicktime"), file("d.m4a", "audio/mp4")],
            surface: .stickers
        )

        XCTAssertTrue(batch.stickers.isEmpty, "Ni la vidéo ni le son ne sont des stickers.")
        XCTAssertEqual(
            StickerLibraryPaste.exclusions(in: batch),
            [.onlyImagesBecomeStickers(["c.mov", "d.m4a"])]
        )
    }

    func test_document_isAnnounced_asNotBecomingASticker() {
        let batch = PasteIntoComposer.batch(ingests: [file("e.pdf", "application/pdf")], surface: .stickers)

        XCTAssertEqual(
            StickerLibraryPaste.exclusions(in: batch),
            [.onlyImagesBecomeStickers(["e.pdf"])]
        )
    }

    func test_text_isAnnounced_asNotBecomingASticker() {
        let batch = PasteIntoComposer.batch(ingests: [.text("bonjour")], surface: .stickers)

        XCTAssertTrue(StickerLibraryPaste.exclusions(in: batch).contains(.textCannotBecomeASticker))
    }

    /// Le cas nominal : une image collée est gardée, et rien n'est annoncé —
    /// une annonce systématique deviendrait un bruit que l'auteur apprendrait
    /// à ignorer.
    func test_anImage_isKept_andNothingIsAnnounced() {
        let batch = PasteIntoComposer.batch(ingests: [file("a.png", "image/png")], surface: .stickers)

        XCTAssertEqual(batch.stickers.map(\.name), ["a.png"])
        XCTAssertTrue(StickerLibraryPaste.exclusions(in: batch).isEmpty)
    }
}
