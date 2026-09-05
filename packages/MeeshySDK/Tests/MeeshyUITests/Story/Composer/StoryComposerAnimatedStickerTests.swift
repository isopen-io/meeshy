import XCTest
import ImageIO
import UniformTypeIdentifiers
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Coller un GIF le pose comme sticker ANIMÉ** (#3956).
///
/// Le lot précédent (#4925) avait donné à la scène de quoi JOUER une image
/// animée — mais seulement sur le chemin asynchrone, celui d'un asset déjà
/// publié. Dans le composer, un GIF collé n'atteignait jamais ce chemin : ses
/// octets étaient détruits bien avant, ré-encodés en PNG à l'écriture dans la
/// bibliothèque, et ce qui arrivait sur la scène était une image fixe.
///
/// > Rien n'était en panne. Le décodeur passait ses témoins, la couche les
/// > siens, et l'auteur voyait un sticker — le sien, sa première image. La
/// > perte ne se voit que si l'on demande **ce que la source portait**, pas si
/// > l'on demande ce que la vue affiche.
///
/// Ces témoins pinnent la moitié qui manquait : les octets voyagent de la pose
/// à la couche, et la couche sait les reconnaître.
@MainActor
final class StoryComposerAnimatedStickerTests: XCTestCase {

    // MARK: - Ce que la pose retient

    /// Le bitmap ET les octets sont retenus sous l'id de l'ÉLÉMENT — la même
    /// clé, parce que c'est le même sticker. Deux clés distinctes obligeraient
    /// chaque lecteur à connaître la correspondance.
    func test_poserUnStickerAnime_retientSesOctetsSousSonIdDElement() throws {
        let vm = StoryComposerViewModel()
        let octets = Self.gifBytes

        let sticker = vm.addSticker(image: Self.pixel(),
                                    provider: StoryStickerLibraryItem.provider,
                                    animatedData: octets)

        XCTAssertEqual(vm.loadedStickerAnimations[sticker.id], octets)
        XCTAssertNotNil(vm.loadedImages[sticker.id],
                        "l'image fixe reste : c'est elle que peignent la cover, l'export et le thumbHash")
    }

    /// **Un sticker FIXE ne paie rien.** L'écrasante majorité des stickers sont
    /// des PNG : leur faire traverser un dictionnaire d'octets serait de la
    /// mémoire pour rien, et brouillerait le prédicat « ce sticker anime-t-il ? ».
    func test_poserUnStickerFIXE_nEcritAucunOctet() throws {
        let vm = StoryComposerViewModel()

        let sticker = vm.addSticker(image: Self.pixel(),
                                    provider: StoryStickerLibraryItem.provider)

        XCTAssertTrue(vm.loadedStickerAnimations.isEmpty)
        XCTAssertNil(vm.loadedStickerAnimations[sticker.id])
    }

    /// **Sans ce bump, le canvas garde son lecteur périmé** et peint le sticker
    /// figé sur son image 1 — un défaut MUET, puisque quelque chose s'affiche.
    /// C'est exactement la raison d'être de `registerLoadedImage`, portée aux
    /// octets.
    func test_poserUnStickerAnime_bumpLaVersionDuLecteur() throws {
        let vm = StoryComposerViewModel()

        _ = vm.addSticker(image: Self.pixel(),
                          provider: StoryStickerLibraryItem.provider,
                          animatedData: Self.gifBytes)

        XCTAssertGreaterThan(vm.loadedImagesVersion, 0)
    }

    // MARK: - Ce que la suppression et l'undo font des octets

    /// Supprimer l'élément retire ses octets du composer : les laisser derrière
    /// ferait grossir la session d'un GIF par sticker supprimé (dimension 3).
    func test_supprimerLeSticker_retireSesOctets() throws {
        let vm = StoryComposerViewModel()
        let sticker = vm.addSticker(image: Self.pixel(),
                                    provider: StoryStickerLibraryItem.provider,
                                    animatedData: Self.gifBytes)

        vm.deleteElement(id: sticker.id)

        XCTAssertNil(vm.loadedStickerAnimations[sticker.id])
    }

    /// **Et l'undo les REND.** La purge est paresseuse, comme pour les bitmaps
    /// et les URLs : sans elle, annuler une suppression ressusciterait un
    /// sticker figé — ou, avant ce lot, un sticker sans image du tout, puisque
    /// la restauration ne parcourait que les objets média.
    func test_annulerLaSuppression_ramèneLeStickerAnime() throws {
        let vm = StoryComposerViewModel()
        vm.seedHistory()
        let octets = Self.gifBytes
        let sticker = vm.addSticker(image: Self.pixel(),
                                    provider: StoryStickerLibraryItem.provider,
                                    animatedData: octets)
        vm.pushHistorySnapshot()
        vm.deleteElement(id: sticker.id)
        vm.pushHistorySnapshot()
        XCTAssertNil(vm.loadedStickerAnimations[sticker.id],
                     "les octets partent en staging à la suppression")

        XCTAssertTrue(vm.undoGlobal())

        XCTAssertNotNil(vm.currentEffects.stickerObjects?.first { $0.id == sticker.id },
                        "prérequis du témoin : l'undo doit ramener l'élément")
        XCTAssertNotNil(vm.loadedImages[sticker.id],
                        "un sticker ressuscité sans son image retombe sur son emoji de repli")
        XCTAssertEqual(vm.loadedStickerAnimations[sticker.id], octets)
    }

    // MARK: - Ce que la couche sait en faire

    /// La couche cherche les octets sous les MÊMES clés que le bitmap —
    /// `postMediaId` d'abord (ce qu'un lecteur connaît), l'id d'élément ensuite
    /// (le repli du composer). Une clé unique raterait exactement le chemin de
    /// la cover, où le composer a rangé sous l'id et la publication stampé le
    /// `postMediaId`.
    func test_laCouche_trouveLesOctetsSousLIdDElement() throws {
        let sticker = StorySticker(id: "elem-1", emoji: "", postMediaId: "")

        let trouvé = StoryStickerLayer.animatedBytes(for: sticker, in: ["elem-1": Self.gifBytes])

        XCTAssertEqual(trouvé, Self.gifBytes)
    }

    func test_laCouche_trouveLesOctetsSousLePostMediaId() throws {
        let sticker = StorySticker(id: "elem-1", emoji: "", postMediaId: "srv-9")

        let trouvé = StoryStickerLayer.animatedBytes(for: sticker, in: ["srv-9": Self.gifBytes])

        XCTAssertEqual(trouvé, Self.gifBytes)
    }

    /// **`postMediaId` gagne** : c'est la clé qu'un lecteur (export, cache
    /// disque) connaît, et l'id d'élément n'est que le repli du composer. Le
    /// témoin s'écrit avec DEUX entrées, sinon l'ordre ne peut pas tomber.
    func test_laCouche_prefereLePostMediaId_quandLesDeuxSontLa() throws {
        let sticker = StorySticker(id: "elem-1", emoji: "", postMediaId: "srv-9")
        let publié = Data([0x01, 0x02, 0x03])

        let trouvé = StoryStickerLayer.animatedBytes(
            for: sticker, in: ["srv-9": publié, "elem-1": Self.gifBytes])

        XCTAssertEqual(trouvé, publié)
    }

    /// Un sticker EMOJI n'adresse aucun octet — et la carte vide ne coûte même
    /// pas une recherche.
    func test_laCouche_neTrouveRien_pourUnStickerSansOctets() throws {
        let sticker = StorySticker(id: "elem-1", emoji: "\u{1F525}")

        XCTAssertNil(StoryStickerLayer.animatedBytes(for: sticker, in: [:]))
        XCTAssertNil(StoryStickerLayer.animatedBytes(for: sticker, in: ["autre": Self.gifBytes]))
    }

    // MARK: - Helpers

    private static func pixel() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1)).image { context in
            UIColor.red.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
        }
    }

    /// Un vrai GIF animé — pas un tableau d'octets arbitraire : les témoins qui
    /// traversent le décodeur en ont besoin, et un faux GIF les rendrait verts
    /// pour la mauvaise raison.
    private static let gifBytes: Data = {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(
            data as CFMutableData, UTType.gif.identifier as CFString, 3, nil) else { return Data() }
        for index in 0..<3 {
            let image = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4)).image { context in
                UIColor(white: CGFloat(index) / 2, alpha: 1).setFill()
                context.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
            }
            guard let cg = image.cgImage else { continue }
            CGImageDestinationAddImage(destination, cg, [
                kCGImagePropertyGIFDictionary: [kCGImagePropertyGIFUnclampedDelayTime: 0.1]
            ] as CFDictionary)
        }
        _ = CGImageDestinationFinalize(destination)
        return data as Data
    }()
}
