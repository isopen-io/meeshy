import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// S2 — taper une vignette de « Mes stickers » POSE un sticker image.
///
/// Avant ce lot, la section existait et peignait ses vignettes, mais un tap
/// n'aboutissait nulle part : le modèle ne savait pas porter une image (levé
/// par S1). Cette suite pin les deux moitiés du geste — ce que la pose écrit
/// dans `currentEffects`, et le fait que le tap y mène.
@MainActor
final class StoryComposerStickerImagePoseTests: XCTestCase {

    // MARK: - Ce que la pose écrit

    /// Un sticker image se pose au MÊME endroit et avec les MÊMES réglages
    /// qu'un emoji : un second poseur divergerait dès la première évolution du
    /// placement (cascade, taille de base, ancre).
    func test_addStickerImage_placesItLikeAnEmojiSticker() throws {
        let emojiPose = StoryComposerViewModel()
        let imagePose = StoryComposerViewModel()

        let emojiSticker = emojiPose.addSticker(emoji: "\u{1F30D}")
        let imageSticker = imagePose.addSticker(image: Self.pixel(), provider: StoryStickerLibraryItem.provider)

        XCTAssertEqual(imageSticker.x, emojiSticker.x)
        XCTAssertEqual(imageSticker.y, emojiSticker.y)
        XCTAssertEqual(imageSticker.baseSize, emojiSticker.baseSize)
        XCTAssertEqual(imageSticker.scale, emojiSticker.scale)
        XCTAssertEqual(imageSticker.rotation, emojiSticker.rotation)
        XCTAssertEqual(imageSticker.anchor, emojiSticker.anchor)
        XCTAssertEqual(imagePose.zIndex(for: imageSticker.id),
                       emojiPose.zIndex(for: emojiSticker.id))
    }

    /// La pose porte l'IMAGE, pas seulement une intention : le bitmap est
    /// retenu sous l'id de l'élément, exactement là où le composer tient les
    /// médias importés qu'aucun upload n'a encore adressés.
    func test_addStickerImage_carriesTheBitmapUnderItsElementId() throws {
        let vm = StoryComposerViewModel()
        let image = Self.pixel()

        let sticker = vm.addSticker(image: image, provider: StoryStickerLibraryItem.provider)

        XCTAssertTrue(vm.loadedImages[sticker.id] === image)
        // Sans ce bump le canvas garde son reader périmé : le sticker posé
        // n'apparaîtrait jamais (cf. `registerLoadedImage`).
        XCTAssertGreaterThan(vm.loadedImagesVersion, 0)
    }

    /// Le repli est écrit DÈS LA POSE, dans `currentEffects` : un brouillon
    /// relu par une version antérieure montre un glyphe, jamais du vide.
    func test_addStickerImage_fillsAFallbackEmojiAtPoseTime() throws {
        let vm = StoryComposerViewModel()

        let sticker = vm.addSticker(image: Self.pixel(), provider: StoryStickerLibraryItem.provider)

        let stored = try XCTUnwrap(vm.currentEffects.stickerObjects?.first { $0.id == sticker.id })
        XCTAssertFalse(stored.emoji.isEmpty)
        XCTAssertEqual(stored.emoji, StorySticker.imageFallbackEmoji)
    }

    /// `postMediaId` reste VIDE pendant la composition : c'est le prédicat que
    /// la publication lit pour savoir ce qui reste à téléverser. Y écrire un id
    /// local ferait sauter l'upload et publierait une référence morte.
    func test_addStickerImage_leavesPostMediaIdEmptyAndRecordsItsOrigin() throws {
        let vm = StoryComposerViewModel()

        let sticker = vm.addSticker(image: Self.pixel(), provider: StoryStickerLibraryItem.provider)

        XCTAssertTrue(sticker.postMediaId.isEmpty)
        XCTAssertEqual(sticker.provider, "library")
    }

    /// Deux poses de la même vignette restent deux éléments distincts —
    /// sélection, z-order et gestes s'adressent par id.
    func test_addStickerImage_twice_yieldsTwoDistinctElements() throws {
        let vm = StoryComposerViewModel()
        let image = Self.pixel()

        let first = vm.addSticker(image: image, provider: StoryStickerLibraryItem.provider)
        let second = vm.addSticker(image: image, provider: StoryStickerLibraryItem.provider)

        XCTAssertNotEqual(first.id, second.id)
        XCTAssertEqual(vm.currentEffects.stickerObjects?.count, 2)
        XCTAssertTrue(vm.loadedImages[first.id] === image)
        XCTAssertTrue(vm.loadedImages[second.id] === image)
    }

    // MARK: - Le chemin emoji est inchangé

    func test_addStickerEmoji_carriesNoImageAndNoProvider() throws {
        let vm = StoryComposerViewModel()

        let sticker = vm.addSticker(emoji: "\u{1F525}")

        XCTAssertEqual(sticker.emoji, "\u{1F525}")
        XCTAssertTrue(sticker.postMediaId.isEmpty)
        XCTAssertNil(sticker.provider)
        XCTAssertTrue(vm.loadedImages.isEmpty)
        XCTAssertEqual(vm.loadedImagesVersion, 0)
    }

    // MARK: - Le tap y mène (gardes de source POSITIVES)

    /// Une vignette qui ne déclenche rien est une affordance inerte (loi 4).
    /// La garde vise le BLOC qui peint « Mes stickers », et lit du code
    /// décommenté (`ComposerSourceGuard`), sans quoi le commentaire d'intention
    /// au-dessus suffirait à la faire passer.
    ///
    /// **Elle ne nomme plus son fichier.** Au #4579 la section est devenue
    /// l'onglet `libraryTab` d'une palette à cinq onglets et a changé de
    /// fichier : la garde, qui nommait `StickerPickerView.swift`, a rougi pour
    /// un DÉPLACEMENT — pas pour une perte de comportement. Balayer les sources
    /// du composer la rend indifférente au prochain découpage.
    func test_theLibraryThumbnails_areTappable() throws {
        let sections = try ComposerSourceGuard.allStorySources()
            .compactMap { ComposerSourceGuard.functionBody(named: "var libraryTab", in: $0.code) }
        let section = try XCTUnwrap(
            sections.first,
            "Le bloc « Mes stickers » (`var libraryTab`) est introuvable dans les sources du composer.")

        XCTAssertTrue(section.contains("onLibraryStickerSelected(item)"),
                      "Taper une vignette de « Mes stickers » ne pose rien : la section est inerte.")
    }

    /// **Les DEUX autres constructions de la palette mènent quelque part** —
    /// même loi, sur les grilles ajoutées au #4579. Une vignette de décoration
    /// qui vibre sans rien poser coûte plus qu'une vignette absente.
    func test_theTemplateThumbnails_areTappable() throws {
        // `templateTab` est devenue `templateGrid` au #5012 : elle a perdu son
        // `ScrollView` pour devenir une section d'une liste verticale. Le
        // témoin suit le nom ; la règle qu'il garde est la même.
        let grilles = try ComposerSourceGuard.allStorySources()
            .compactMap { ComposerSourceGuard.functionBody(named: "func templateGrid(", in: $0.code) }
        let grille = try XCTUnwrap(grilles.first, "La grille de gabarits est introuvable.")
        XCTAssertTrue(grille.contains("pose(gabarit,"),
                      "Taper une décoration ne pose rien : la grille est inerte.")

        // Et la pose AIGUILLE selon la famille : un lieu doit devenir un
        // `StoryLocationObject`, jamais un sticker qui perdrait ses coordonnées.
        let poseurs = try ComposerSourceGuard.allStorySources()
            .compactMap { ComposerSourceGuard.functionBody(named: "private func pose(", in: $0.code) }
        let poseur = try XCTUnwrap(poseurs.first, "Le poseur de décoration est introuvable.")
        XCTAssertTrue(poseur.contains("onLocationTemplateSelected("),
                      "Une décoration de LIEU se poserait en sticker et perdrait sa donnée géographique.")
        XCTAssertTrue(poseur.contains("onTemplateSelected("))
    }

    /// Le composer branche ce tap sur le poseur du VM — sans quoi la vignette
    /// serait tapable et n'atteindrait toujours pas le canevas.
    func test_theComposerSheet_posesWhatTheLibraryReturns() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Media.swift")
        let sheet = try XCTUnwrap(code.range(of: "StickerPickerView("))
        let block = String(code[sheet.lowerBound...].prefix(600))

        XCTAssertTrue(block.contains("onLibraryStickerSelected:"))
        XCTAssertTrue(block.contains("addSticker(image:"))
    }

    // MARK: - Helpers

    private static func pixel() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }
    }

}
