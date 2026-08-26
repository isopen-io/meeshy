import Testing
import Foundation
@testable import MeeshySDK

/// S5 — ce qu'un contenu REÇU offre à « Mes stickers ».
///
/// La bibliothèque n'était alimentée que par le collage. Recevoir un sticker
/// et pouvoir le garder est la boucle qui lui donne son sens. La décision de
/// CE QUI est enregistrable est pure et vit ici : l'app n'a plus qu'à
/// télécharger et écrire.
///
/// Un sticker image porte une image INTÉGRÉE au post (`postMediaId`), jamais
/// une référence tierce — la source des octets est donc le `PostMedia` du
/// post lui-même, résolu par le même appariement que le plan de cover.
struct StoryStickerLibraryTests {

    private func imageMedia(id: String, url: String? = "https://cdn/sticker.png") -> FeedMedia {
        FeedMedia(id: id, type: .image, url: url)
    }

    private func story(stickers: [StorySticker]?, media: [FeedMedia]) -> StoryItem {
        var effects: StoryEffects?
        if let stickers {
            var fx = StoryEffects()
            fx.stickerObjects = stickers
            effects = fx
        }
        return StoryItem(id: "story-1", media: media, storyEffects: effects)
    }

    // MARK: - Loi 4 — rien à offrir, donc rien à offrir

    /// Rougit si un sticker EMOJI devenait enregistrable : il n'a aucune image
    /// à copier, et le geste devrait être ABSENT du menu — jamais grisé.
    @Test func savable_isEmpty_whenTheSlideCarriesOnlyEmojiStickers() {
        let item = story(
            stickers: [StorySticker(id: "s1", emoji: "\u{1F389}")],
            media: [imageMedia(id: "m1")]
        )

        #expect(StoryStickerLibrary.savable(in: item).isEmpty)
    }

    @Test func savable_isEmpty_whenTheStoryCarriesNoEffectsAtAll() {
        #expect(StoryStickerLibrary.savable(in: story(stickers: nil, media: [])).isEmpty)
    }

    // MARK: - Le cas nominal

    @Test func savable_yieldsTheImageSticker_withTheURLOfItsOwnPostMedia() {
        let item = story(
            stickers: [
                StorySticker(id: "s-emoji", emoji: "\u{1F389}"),
                StorySticker(id: "s-image", emoji: "", postMediaId: "media-42", provider: "genmoji")
            ],
            media: [imageMedia(id: "media-42", url: "https://cdn/genmoji.png"), imageMedia(id: "other")]
        )

        let savable = StoryStickerLibrary.savable(in: item)

        #expect(savable.count == 1)
        #expect(savable.first?.mediaURLString == "https://cdn/genmoji.png")
        #expect(savable.first?.id == StoryStickerLibrary.libraryID(forPostMediaID: "media-42"))
    }

    /// Un sticker dont le `PostMedia` n'est pas (ou plus) joint au post n'a
    /// aucune source d'octets : l'offrir mènerait à un échec systématique.
    @Test func savable_skipsAStickerWhosePostMediaIsAbsentOrHasNoURL() {
        let missing = story(
            stickers: [StorySticker(id: "s", emoji: "", postMediaId: "media-absent")],
            media: [imageMedia(id: "media-autre")]
        )
        let urlless = story(
            stickers: [StorySticker(id: "s", emoji: "", postMediaId: "media-1")],
            media: [imageMedia(id: "media-1", url: nil)]
        )

        #expect(StoryStickerLibrary.savable(in: missing).isEmpty)
        #expect(StoryStickerLibrary.savable(in: urlless).isEmpty)
    }

    // MARK: - Aucun doublon

    /// Deux stickers posés à partir de la MÊME image partagent leur
    /// `postMediaId` : les enregistrer tous les deux écrirait deux fois la
    /// même entrée de bibliothèque.
    @Test func savable_dedupesTwoStickersSharingTheSamePostMedia() {
        let item = story(
            stickers: [
                StorySticker(id: "s1", emoji: "", postMediaId: "media-1"),
                StorySticker(id: "s2", emoji: "", postMediaId: "media-1")
            ],
            media: [imageMedia(id: "media-1")]
        )

        #expect(StoryStickerLibrary.savable(in: item).count == 1)
    }

    /// L'identifiant de bibliothèque est dérivé du `postMediaId`, donc STABLE :
    /// c'est ce qui permet de reconnaître un sticker déjà enregistré. Le
    /// collage, lui, pose un `UUID` par geste (`StickerLibraryPaste`) — les
    /// deux espaces d'ids ne doivent jamais se rencontrer.
    @Test func libraryID_isStable_andNeverCollidesWithThePasteUUIDSpace() {
        let first = StoryStickerLibrary.libraryID(forPostMediaID: "68a1b2c3d4e5f60718293a4b")
        let second = StoryStickerLibrary.libraryID(forPostMediaID: "68a1b2c3d4e5f60718293a4b")

        #expect(first == second)
        #expect(first?.hasPrefix(StoryStickerLibrary.receivedIDPrefix) == true)
        #expect(UUID(uuidString: first ?? "") == nil)
    }

    /// L'identifiant devient un NOM DE FICHIER dans le dossier de la
    /// bibliothèque (`StickerLibraryStore.fileURL(for:)`), et il vient du
    /// serveur : un séparateur de chemin y écrirait hors du dossier.
    @Test func libraryID_rejectsAnIdentifierThatWouldEscapeTheLibraryDirectory() {
        #expect(StoryStickerLibrary.libraryID(forPostMediaID: "../../secrets") == nil)
        #expect(StoryStickerLibrary.libraryID(forPostMediaID: "a/b") == nil)
        #expect(StoryStickerLibrary.libraryID(forPostMediaID: "") == nil)
        #expect(StoryStickerLibrary.libraryID(forPostMediaID: "68a1b2c3d4e5f60718293a4b") != nil)
    }

    /// Un `postMediaId` illisible ne doit pas non plus produire une entrée
    /// enregistrable — la garde vaut au niveau de la liste, pas seulement de
    /// la dérivation.
    @Test func savable_skipsAStickerWhoseIdentifierIsNotAFileSafeToken() {
        let item = story(
            stickers: [StorySticker(id: "s", emoji: "", postMediaId: "../escape")],
            media: [FeedMedia(id: "../escape", type: .image, url: "https://cdn/x.png")]
        )

        #expect(StoryStickerLibrary.savable(in: item).isEmpty)
    }
}
