import Foundation
import UIKit
import MeeshySDK
import MeeshyUI

/// **Ce qu'une image devient quand elle entre dans « Mes stickers »** (#3956).
///
/// ## Le défaut que ce type ferme
///
/// Le collage décodait une `UIImage` au budget de la surface puis la ré-encodait
/// en `pngData()`. Pour un GIF, cela signifiait : lire trente images, en garder
/// **une**, et écrire sur le disque un PNG dont plus rien ne pouvait retrouver
/// les vingt-neuf autres. L'animation n'était pas « non jouée » — elle était
/// **détruite à l'écriture**, avant même d'atteindre la bibliothèque.
///
/// > La planche disait « collage = image fixe » comme un CONSTAT ; c'était en
/// > réalité une conséquence de cette ligne-là.
///
/// ## Pourquoi les octets d'ORIGINE, et pas un ré-encodage
///
/// Ré-encoder un GIF à 512 px reviendrait à reconstruire un conteneur animé
/// image par image (`CGImageDestination` + délais + boucle) : beaucoup de code,
/// une perte de qualité, et une seconde implémentation du format à tenir juste.
/// Les octets d'origine sont la source ; **le budget se paie au DÉCODAGE**, où
/// chaque site connaît la taille à laquelle il peint (52 pt dans une grille,
/// le côté de la couche sur une scène).
///
/// ## Le plafond d'octets, et pourquoi il existe
///
/// La bibliothèque est bornée à 64 Mo avec éviction LRU. Un seul GIF de vingt
/// mégaoctets y évincerait donc tout le reste — l'utilisateur perdrait sa
/// collection en collant une image. Au-delà du plafond, on garde ce qu'on
/// sait garder : l'image FIXE réduite. C'est une dégradation ANNONCÉE par le
/// modèle (`animates == false`), jamais un refus muet.
nonisolated enum StickerLibraryArtwork {

    /// 8 Mo — un huitième du budget de la bibliothèque. Assez pour tout GIF de
    /// sticker réel (quelques centaines de kilo-octets), et assez bas pour
    /// qu'aucune entrée ne puisse à elle seule vider les autres.
    static let animatedByteCeiling = StickerLibraryStore.defaultBudgetBytes / 8

    /// Ce qui part sur le disque de la bibliothèque.
    struct Kept: Equatable {
        /// Les octets ÉCRITS. Ceux d'origine quand ils animent, un PNG réduit
        /// sinon.
        let bytes: Data
        /// Ces octets animent-ils ? C'est ce drapeau — jamais une seconde
        /// inspection au site d'affichage — qui décide de peindre un cycle ou
        /// une image.
        let animates: Bool
    }

    /// - Parameters:
    ///   - original: les octets tels que le presse-papier (ou le réseau) les a
    ///     rendus.
    ///   - stillPNG: l'image fixe déjà réduite au budget de la surface, encodée
    ///     PNG — `nil` quand elle n'a pas pu être produite.
    /// - Returns: `nil` seulement quand RIEN n'est gardable : ni animation
    ///   admissible, ni image fixe. L'appelant annonce alors l'échec plutôt que
    ///   d'avaler le collage.
    static func keep(original: Data, stillPNG: Data?) -> Kept? {
        if let animated = animatedBytesToKeep(original: original) {
            return Kept(bytes: animated, animates: true)
        }
        guard let stillPNG else { return nil }
        return Kept(bytes: stillPNG, animates: false)
    }

    /// **La moitié ANIMÉE de la règle, interrogeable seule** — `nil` ⇒ ces
    /// octets ne se gardent pas tels quels, et l'appelant doit produire son
    /// image fixe.
    ///
    /// Elle existe pour que les deux alimentations ne PAIENT pas ce dont elles
    /// n'ont pas besoin : le collage décode et ré-encode une image fixe qu'un
    /// GIF n'utiliserait jamais, et le sticker reçu n'a pas d'image fixe à
    /// donner avant de savoir s'il en faut une. Une seule règle, deux
    /// granularités — jamais deux conditions à tenir d'accord.
    ///
    /// L'arbitre est le DÉCODEUR, pas la porte : `mayBeAnimated` répond
    /// « peut-être » à toute photo HEIC d'iPhone, et garder celles-ci entières
    /// remplirait la bibliothèque de douze mégapixels par collage.
    static func animatedBytesToKeep(original: Data) -> Data? {
        guard original.count <= animatedByteCeiling,
              AnimatedImageDecoder.animates(original) else { return nil }
        return original
    }

    /// Ce qu'une entrée RELUE du disque porte : son image fixe (première image
    /// d'un cycle) et, si elle anime, ses octets.
    ///
    /// La bibliothèque ne range aucune métadonnée à côté de ses fichiers — son
    /// index ne connaît que des ids et des tailles. C'est volontaire : **les
    /// octets se décrivent eux-mêmes**, et un drapeau persisté à côté d'eux
    /// serait une seconde source de vérité qu'un fichier remplacé ferait
    /// mentir.
    @MainActor
    static func item(id: String, bytes: Data) -> StoryStickerLibraryItem? {
        // Le plafond est celui de la VIGNETTE, lu sur le type que la grille lit
        // aussi : décoder trente images à 512 px pour une case de 52 pt
        // coûterait trente bitmaps dont on n'utiliserait qu'un dixième des
        // pixels — et deux plafonds écrits séparément donneraient deux
        // résolutions dans la même grille.
        if let decoded = AnimatedImageDecoder.decode(
               bytes, maxPixelSize: StoryStickerLibraryItem.thumbnailPixelBudget),
           let still = decoded.stillImage {
            return StoryStickerLibraryItem(id: id, thumbnail: still, animatedData: bytes)
        }
        guard let image = UIImage(data: bytes) else { return nil }
        return StoryStickerLibraryItem(id: id, thumbnail: image)
    }
}
