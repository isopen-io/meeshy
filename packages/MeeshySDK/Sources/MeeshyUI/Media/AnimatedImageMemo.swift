import Foundation
import UIKit

/// **Décoder une image animée UNE fois, pas à chaque tick** (#3956).
///
/// ## Ce que ce type empêche
///
/// `StoryStickerLayer.configure` est rappelée chaque fois que la signature de
/// contenu d'un élément change — c'est-à-dire à chaque mutation, donc
/// potentiellement à chaque image pendant qu'on déplace un sticker. Décoder là
/// un GIF de trente images reviendrait à trente `CGImageSourceCreateThumbnail`
/// par geste et par tick : la dimension 4 de la roadmap (« y a-t-il UNE image
/// perdue pendant le geste ? ») répondrait non, et la 3 (« que reste-t-il en
/// mémoire ? ») pas mieux.
///
/// Le décodeur reste PUR et sans état ; la mémoire vit ici, exactement comme
/// `StoryStickerRasterizer.shared` mémorise les glyphes que la même fonction
/// re-rasteriserait sinon à chaque configure.
///
/// ## La clé n'est pas les octets
///
/// `Data` est `Hashable`, mais son hachage parcourt TOUT le tampon : sur un GIF
/// de deux mégaoctets, la clé coûterait plus cher que ce qu'elle épargne.
/// La clé est donc l'IDENTITÉ de l'image (l'id de l'élément ou son
/// `postMediaId`, ce que l'appelant connaît déjà) + la TAILLE des octets + le
/// plafond de décodage :
///
/// - la taille distingue deux collages successifs sous le même id d'élément —
///   c'est le seul cas où la clé pourrait mentir, et il coûte O(1) à écarter ;
/// - le plafond est dans la clé parce que la même image décodée pour une
///   vignette de 52 pt et pour une scène de 1080 px n'est pas le même objet.
///
/// ## Borné, et vidé sous pression
///
/// `NSCache` évince seul et se vide sur alerte mémoire — ce qui est exactement
/// la politique voulue : un cycle de GIF est reconstructible, jamais une
/// donnée qu'on perdrait.
@MainActor
public enum AnimatedImageMemo {

    /// Une entrée — `NSCache` veut une classe, `Decoded` est une structure.
    ///
    /// **La `deinit` est `nonisolated`, et ici ce n'est pas une formalité.**
    /// `MeeshyUI` déclare `.defaultIsolation(MainActor.self)` (SE-0466), donc
    /// une classe non marquée reçoit une deinit synthétisée ISOLÉE qui double-
    /// libère sur iOS 26.1. Cette boîte-ci a de plus la raison la plus directe
    /// d'être libérée AILLEURS que sur le rendu : `NSCache` évince seul, sous
    /// alerte mémoire, sur le fil que le système choisit. Corps vide — il n'y a
    /// rien d'isolé à toucher, `Decoded` étant `nonisolated`.
    private final class Entry {
        let decoded: AnimatedImageDecoder.Decoded
        init(_ decoded: AnimatedImageDecoder.Decoded) { self.decoded = decoded }
        nonisolated deinit {}
    }

    /// Assez pour toute la bibliothèque visible d'un panneau plus les stickers
    /// d'une scène ; au-delà, `NSCache` évince le plus ancien. Le nombre borne
    /// des CYCLES d'images, pas des octets — c'est `maxPixelSize`, dans la clé,
    /// qui borne le poids de chacun.
    private static let countLimit = 24

    private static let cache: NSCache<NSString, Entry> = {
        let cache = NSCache<NSString, Entry>()
        cache.countLimit = countLimit
        return cache
    }()

    /// `nil` ⇒ ces octets n'animent pas ; l'appelant garde son chemin fixe.
    ///
    /// Un `nil` n'est PAS mémorisé, et c'est délibéré : la porte
    /// `AnimatedImageEligibility` répond déjà en lisant au plus 1 Ko sans
    /// allouer, donc le cas fixe est bon marché — mémoriser son absence
    /// occuperait une entrée que le cas animé, lui, paie cher.
    public static func decoded(key: String,
                               bytes: Data,
                               maxPixelSize: Int) -> AnimatedImageDecoder.Decoded? {
        let identity = cacheKey(key: key, byteCount: bytes.count, maxPixelSize: maxPixelSize)
        if let hit = cache.object(forKey: identity) { return hit.decoded }
        guard let decoded = AnimatedImageDecoder.decode(bytes, maxPixelSize: maxPixelSize) else {
            return nil
        }
        cache.setObject(Entry(decoded), forKey: identity)
        return decoded
    }

    /// Publique et pure : c'est la seule moitié de ce type qu'un témoin peut
    /// prouver sans mesurer un temps de décodage.
    public static func cacheKey(key: String, byteCount: Int, maxPixelSize: Int) -> NSString {
        "\(key)|\(byteCount)|\(maxPixelSize)" as NSString
    }

    /// Vide la mémoire — pour les témoins, et pour un site qui saurait que la
    /// bibliothèque vient de changer sous lui.
    public static func removeAll() {
        cache.removeAllObjects()
    }
}
