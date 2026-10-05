import UIKit
import ImageIO

/// **Une scène ne décode jamais une photo au-delà de ce qui sera publié** (#6922).
///
/// Le composer décodait chaque photo posée par `UIImage(contentsOfFile:)` : un
/// bitmap PLEINE taille au premier dessin, gardé dans `loadedImages` pour toutes
/// les scènes à la fois. Une photo d'appareil de 12 Mpx pèse 48 Mo décodée, une
/// de 48 Mpx près de 200 Mo — trois scènes suffisent à faire tuer l'app sur un
/// iPhone. Et ces pixels ne servaient à rien : la publication réduit toute image
/// à 2 048 px de grand côté avant de l'envoyer (`MediaCompressor.compressImage`).
///
/// **La taille de travail EST la taille publiée** (`workingMaxPixelSize`) : ce
/// que l'auteur voit en composant est ce que ses lecteurs recevront, et rien de
/// ce qui part n'est dégradé. Le FICHIER de l'auteur, lui, n'est jamais touché —
/// on le lit, on ne le réécrit pas ; la pré-montée et le brouillon le copient tel
/// quel.
///
/// Atome du SDK : des tailles et des URL opaques, aucun magasin nommé, aucune
/// décision de produit sur QUAND réduire — c'est l'appelant qui la prend.
public nonisolated enum SceneImageDownsampling {

    /// Le grand côté, en pixels, d'une photo tenue par le composer : celui que la
    /// publication envoie. Un témoin de l'app garde l'égalité avec le plafond de
    /// `MediaCompressor` — si l'un bouge sans l'autre, il rougit.
    public static let workingMaxPixelSize: CGFloat = 2048

    /// La taille en pixels d'une image réduite à `maxPixelSize` de grand côté,
    /// ratio conservé. Jamais d'agrandissement ; `.zero` pour une entrée dégénérée.
    public static func targetPixelSize(source: CGSize, maxPixelSize: CGFloat) -> CGSize {
        guard source.width.isFinite, source.height.isFinite, maxPixelSize.isFinite,
              source.width > 0, source.height > 0, maxPixelSize > 0 else { return .zero }
        let grandCote = max(source.width, source.height)
        guard grandCote > maxPixelSize else { return source }
        let facteur = maxPixelSize / grandCote
        return CGSize(width: max(1, (source.width * facteur).rounded()),
                      height: max(1, (source.height * facteur).rounded()))
    }

    /// Le grand côté, en pixels, qu'il faut à une image pour REMPLIR une tuile de
    /// `tile` points (`scaledToFill`) sur un écran de densité `scale`. Un
    /// panorama dans une tuile 9:16 déborde en largeur : c'est ce débord qui
    /// compte, pas le côté de la tuile.
    public static func fillMaxPixelSize(source: CGSize, tile: CGSize, scale: CGFloat) -> CGFloat {
        guard source.width.isFinite, source.height.isFinite, tile.width.isFinite, tile.height.isFinite,
              scale.isFinite, source.width > 0, source.height > 0,
              tile.width > 0, tile.height > 0, scale > 0 else { return 0 }
        let facteur = max(tile.width / source.width, tile.height / source.height)
        return (max(source.width, source.height) * facteur * scale).rounded(.up)
    }

    /// Le grand côté auquel décoder une source pour qu'un RECADRAGE de fraction
    /// `crop` (largeur, hauteur de la source) sorte à `cap` pixels de grand côté.
    /// Recadrer une source déjà réduite à `cap` perdrait les pixels que la
    /// publication aurait gardés : un demi-cadre d'une photo de 4 032 px n'en
    /// aurait plus que 1 024 au lieu de 2 016.
    public static func decodeMaxPixelSize(forCrop crop: CGSize, sourcePixelSize: CGSize,
                                          cap: CGFloat) -> CGFloat {
        guard crop.width.isFinite, crop.height.isFinite, crop.width > 0, crop.height > 0,
              sourcePixelSize.width.isFinite, sourcePixelSize.height.isFinite,
              sourcePixelSize.width > 0, sourcePixelSize.height > 0 else { return cap }
        let cadre = max(sourcePixelSize.width * min(crop.width, 1),
                        sourcePixelSize.height * min(crop.height, 1))
        return (max(sourcePixelSize.width, sourcePixelSize.height) * cap / cadre).rounded(.up)
    }

    /// La taille en pixels d'un fichier image TELLE QU'ELLE S'AFFICHE (orientation
    /// EXIF appliquée), lue dans ses métadonnées — sans rien décoder.
    public static func pixelSize(fileAt url: URL) -> CGSize? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let proprietes = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let largeur = (proprietes[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue,
              let hauteur = (proprietes[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue
        else { return nil }
        let orientation = (proprietes[kCGImagePropertyOrientation] as? NSNumber)?.uint32Value ?? 1
        let pivotee = (5...8).contains(orientation)
        return pivotee ? CGSize(width: hauteur, height: largeur) : CGSize(width: largeur, height: hauteur)
    }

    /// Décode un fichier local DIRECTEMENT à la taille voulue (ImageIO), sans
    /// jamais allouer le bitmap pleine taille. L'orientation EXIF est cuite : le
    /// résultat est `.up`, et le canvas n'a plus de copie redressée à fabriquer.
    public static func image(fileAt url: URL, maxPixelSize: CGFloat) -> UIImage? {
        guard maxPixelSize.isFinite, maxPixelSize > 0 else { return nil }
        let sourceOptions: [CFString: Any] = [kCGImageSourceShouldCache: false]
        guard let source = CGImageSourceCreateWithURL(url as CFURL, sourceOptions as CFDictionary) else {
            return nil
        }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixelSize
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cgImage)
    }

    /// Réduit une image DÉJÀ en mémoire. Rend la MÊME instance quand elle tient
    /// déjà sous le plafond ; sinon une copie neuve — la source n'est jamais
    /// modifiée.
    public static func downsampled(_ image: UIImage, maxPixelSize: CGFloat) -> UIImage {
        let pixels = CGSize(width: image.size.width * image.scale,
                            height: image.size.height * image.scale)
        let cible = targetPixelSize(source: pixels, maxPixelSize: maxPixelSize)
        guard cible != .zero, cible != pixels else { return image }
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = false
        return UIGraphicsImageRenderer(size: cible, format: format).image { _ in
            image.draw(in: CGRect(origin: .zero, size: cible))
        }
    }
}

/// **Les vignettes des scènes, dans un cache BORNÉ** (#6922).
///
/// Les tuiles de la rangée des scènes peignaient le bitmap ENTIER de chaque
/// scène dans 44 points. Ce cache rend une vignette à la taille de la tuile et
/// n'en garde que ce que ses plafonds permettent ; la mémoire peut le vider à
/// tout moment, rien n'y est irremplaçable.
///
/// **Il ne retient jamais la SOURCE.** La clé est l'identité de l'instance, et
/// l'entrée garde un lien FAIBLE vers elle : une vignette n'est servie que si la
/// même instance est encore vivante — jamais à une image neuve qui aurait hérité
/// de son adresse.
public nonisolated final class SceneThumbnailCache: @unchecked Sendable {

    /// Le cache partagé des tuiles de scène — atome sans politique : il ne sait
    /// ni quand on le consulte ni pourquoi.
    public static let shared = SceneThumbnailCache()

    private nonisolated final class Entry {
        weak var source: UIImage?
        let thumbnail: UIImage
        init(source: UIImage, thumbnail: UIImage) {
            self.source = source
            self.thumbnail = thumbnail
        }
    }

    private let storage = NSCache<NSString, Entry>()

    public var countLimit: Int { storage.countLimit }
    public var totalCostLimit: Int { storage.totalCostLimit }

    public init(countLimit: Int = 48, totalCostLimit: Int = 16 * 1024 * 1024) {
        storage.countLimit = countLimit
        storage.totalCostLimit = totalCostLimit
    }

    /// La vignette de `image` à `maxPixelSize` de grand côté — calculée une fois
    /// par instance et par taille, puis servie du cache.
    public func thumbnail(for image: UIImage, maxPixelSize: CGFloat) -> UIImage {
        guard maxPixelSize.isFinite, maxPixelSize > 0 else { return image }
        let cle = "\(ObjectIdentifier(image).hashValue)-\(Int(maxPixelSize.rounded(.up)))" as NSString
        if let entree = storage.object(forKey: cle), entree.source === image {
            return entree.thumbnail
        }
        let vignette = SceneImageDownsampling.downsampled(image, maxPixelSize: maxPixelSize)
        guard vignette !== image else { return image }
        let cout = Int(vignette.size.width * vignette.scale * vignette.size.height * vignette.scale) * 4
        storage.setObject(Entry(source: image, thumbnail: vignette), forKey: cle, cost: cout)
        return vignette
    }

    public func removeAll() {
        storage.removeAllObjects()
    }
}
