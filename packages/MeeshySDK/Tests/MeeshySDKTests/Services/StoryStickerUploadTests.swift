import Testing
import Foundation
@testable import MeeshySDK

/// S3 — à la publication, l'image d'un sticker importé devient un `PostMedia`
/// du post, comme tout autre média : elle part par le chemin commun (TUS) et le
/// sticker reçoit son `postMediaId`. Aucune URL tierce n'entre dans le
/// document persistant.
///
/// Même problème et même forme que `StoryMediaAltMapping.serverKeyed` : l'id
/// serveur n'existe qu'après l'upload, donc la traduction ne peut se faire
/// qu'à cet instant précis.
struct StoryStickerUploadTests {

    private func sticker(id: String,
                         emoji: String = "\u{1F389}",
                         postMediaId: String = "") -> StorySticker {
        StorySticker(id: id, emoji: emoji, postMediaId: postMediaId)
    }

    // MARK: - Ce qui reste à téléverser

    /// Rougit si la publication téléverse autre chose que les images en
    /// attente : un sticker emoji n'a aucun bitmap à envoyer, et un sticker
    /// déjà téléversé (édition d'une story publiée) en enverrait un second,
    /// laissant le premier orphelin côté serveur.
    @Test func pendingUploadIds_onlyStickersWhoseImageAwaitsUpload() {
        let stickers = [
            sticker(id: "emoji-only"),
            sticker(id: "image-pending"),
            sticker(id: "image-already-up", postMediaId: "post-media-1")
        ]

        let pending = StoryStickerUpload.pendingUploadIds(
            stickers: stickers,
            availableBitmapIds: ["image-pending", "image-already-up"]
        )

        #expect(pending == ["image-pending"])
    }

    /// Rougit si l'ordre d'envoi cesse de suivre celui des stickers de la
    /// slide : deux publications des mêmes entrées doivent produire la même
    /// séquence, sans quoi un échec n'est plus reproductible.
    @Test func pendingUploadIds_followsStickerOrder() {
        let stickers = [sticker(id: "c"), sticker(id: "a"), sticker(id: "b")]

        let pending = StoryStickerUpload.pendingUploadIds(
            stickers: stickers, availableBitmapIds: ["a", "b", "c"]
        )

        #expect(pending == ["c", "a", "b"])
    }

    // MARK: - Report des ids serveur

    @Test func applying_assignsThePostMediaIdTheUploadJustAttributed() {
        let stickers = [sticker(id: "s1")]

        let assigned = StoryStickerUpload.applying(uploads: ["s1": "post-media-7"], to: stickers)

        #expect(assigned.map(\.postMediaId) == ["post-media-7"])
        #expect(assigned.map(\.kind) == [.image])
    }

    /// Le cœur de la règle : un upload qui ÉCHOUE ne fait pas disparaître le
    /// sticker. L'auteur perdrait sinon une composition entière là où l'échec
    /// ne lui coûte qu'un glyphe à la place de l'image.
    @Test func applying_keepsAStickerWhoseUploadFailed() {
        let stickers = [sticker(id: "ok"), sticker(id: "failed", emoji: "")]

        let assigned = StoryStickerUpload.applying(uploads: ["ok": "post-media-7"], to: stickers)

        #expect(assigned.map(\.id) == ["ok", "failed"])
        #expect(assigned.last?.postMediaId.isEmpty == true)
        #expect(assigned.last?.wireEmoji.isEmpty == false)
    }

    /// Rougit si un identifiant vide est reporté tel quel : le sticker
    /// passerait pour téléversé (`kind == .image`) tout en pointant sur rien,
    /// et l'édition suivante n'aurait plus rien à conserver.
    @Test func applying_ignoresAnEmptyPostMediaId() {
        let assigned = StoryStickerUpload.applying(uploads: ["s1": ""], to: [sticker(id: "s1")])

        #expect(assigned.map(\.kind) == [.emoji])
    }

    // MARK: - Édition : ce que le PUT doit CONSERVER

    /// Le PUT d'édition supprime tout original absent de l'ensemble conservé.
    /// Rougit si les images des stickers gardés en cessent de faire partie :
    /// éditer une story effacerait alors côté serveur l'image de chaque
    /// sticker qu'elle garde pourtant à l'écran.
    @Test func attachedPostMediaIds_listsWhatTheEditedCompositionStillReferences() {
        let stickers = [
            sticker(id: "kept", postMediaId: "post-media-1"),
            sticker(id: "emoji-only"),
            sticker(id: "kept-2", postMediaId: "post-media-2")
        ]

        #expect(StoryStickerUpload.attachedPostMediaIds(stickers: stickers)
            == ["post-media-1", "post-media-2"])
    }
}
