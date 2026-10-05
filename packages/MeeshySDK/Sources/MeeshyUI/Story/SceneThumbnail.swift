import UIKit
import MeeshySDK

/// **Qu'y a-t-il sur la scène ?** (#5037 : « noir si rien n'est sur la scène »).
///
/// Une scène sans fond choisi, sans fond legacy, sans objet posé (les cinq
/// familles de `sceneObjects`), sans glyphe legacy et sans dessin n'a RIEN à
/// montrer : sa vignette est noire — présente, de la même largeur, jamais
/// absente.
public nonisolated enum SceneThumbnailContent {

    public static func isBlank(_ slide: StorySlide, bgImage: UIImage?) -> Bool {
        let effets = slide.effects
        return effets.background == nil
            && bgImage == nil
            && effets.sceneObjects.isEmpty
            && (effets.stickers ?? []).isEmpty
            && (effets.drawingStrokes ?? []).isEmpty
            && (effets.drawingData ?? Data()).isEmpty
    }

    /// Les bitmaps que le composite d'une scène PEINT, par clé de
    /// `loadedImages` : médias (fond et premier plan) et stickers image.
    static func paintedImageKeys(of slide: StorySlide) -> [String] {
        (slide.effects.mediaObjects ?? []).map(\.id) + (slide.effects.stickerObjects ?? []).map(\.id)
    }
}

/// **L'empreinte d'une vignette : ce qui, s'il change, la fait recalculer.**
///
/// Les effets de la scène (leur forme v1 COMPLÈTE, `runtimeSnapshot` — celle
/// que le composer lit déjà pour savoir quand repeindre), l'IDENTITÉ des
/// bitmaps que cette scène peint — et d'elle seule : une photo posée sur une
/// autre scène ne la repeint pas — et la taille de la tuile en pixels.
public nonisolated struct SceneThumbnailFingerprint: Hashable, Sendable {
    let slideId: String
    let effects: Data
    let images: [String: ObjectIdentifier]
    let pixelWidth: Int
    let pixelHeight: Int

    public init(slide: StorySlide, bgImage: UIImage?, loadedImages: [String: UIImage],
                size: CGSize, scale: CGFloat) {
        let encodeur = JSONEncoder()
        encodeur.outputFormatting = [.sortedKeys]
        slideId = slide.id
        effects = (try? encodeur.encode(slide.effects.runtimeSnapshot)) ?? Data(UUID().uuidString.utf8)
        var identites: [String: ObjectIdentifier] = [:]
        if let bgImage { identites[SceneThumbnailFingerprint.legacyBackgroundKey] = ObjectIdentifier(bgImage) }
        for cle in SceneThumbnailContent.paintedImageKeys(of: slide) {
            if let image = loadedImages[cle] { identites[cle] = ObjectIdentifier(image) }
        }
        images = identites
        pixelWidth = Int((size.width * scale).rounded())
        pixelHeight = Int((size.height * scale).rounded())
    }

    static let legacyBackgroundKey = "\u{0}legacy-background"
}

/// **Les vignettes rendues, par empreinte, dans un cache BORNÉ.**
///
/// Même contrat que `SceneThumbnailCache` (#6922) : la mémoire peut le vider à
/// tout moment, rien n'y est irremplaçable, et il ne retient JAMAIS les
/// sources. Une entrée garde un lien FAIBLE vers chaque bitmap de son
/// empreinte : elle n'est servie que si tous sont encore vivants — jamais à un
/// bitmap neuf qui aurait hérité d'une adresse.
public nonisolated final class SceneThumbnailStore: @unchecked Sendable {

    public static let shared = SceneThumbnailStore()

    private nonisolated final class Key: NSObject {
        let fingerprint: SceneThumbnailFingerprint
        init(_ fingerprint: SceneThumbnailFingerprint) { self.fingerprint = fingerprint }
        override var hash: Int { fingerprint.hashValue }
        override func isEqual(_ object: Any?) -> Bool {
            (object as? Key)?.fingerprint == fingerprint
        }
    }

    private nonisolated final class Source {
        weak var image: UIImage?
        init(_ image: UIImage) { self.image = image }
    }

    private nonisolated final class Entry {
        let thumbnail: UIImage
        let sources: [Source]
        init(thumbnail: UIImage, sources: [UIImage]) {
            self.thumbnail = thumbnail
            self.sources = sources.map(Source.init)
        }
    }

    private let storage = NSCache<Key, Entry>()

    public var countLimit: Int { storage.countLimit }
    public var totalCostLimit: Int { storage.totalCostLimit }

    public init(countLimit: Int = 40, totalCostLimit: Int = 4 * 1024 * 1024) {
        storage.countLimit = countLimit
        storage.totalCostLimit = totalCostLimit
    }

    public func cached(_ fingerprint: SceneThumbnailFingerprint) -> UIImage? {
        guard let entree = storage.object(forKey: Key(fingerprint)),
              entree.sources.allSatisfy({ $0.image != nil }) else { return nil }
        return entree.thumbnail
    }

    func store(_ thumbnail: UIImage, for fingerprint: SceneThumbnailFingerprint, sources: [UIImage]) {
        let cout = Int(thumbnail.size.width * thumbnail.scale * thumbnail.size.height * thumbnail.scale) * 4
        storage.setObject(Entry(thumbnail: thumbnail, sources: sources), forKey: Key(fingerprint), cost: cout)
    }

    public func removeAll() {
        storage.removeAllObjects()
    }
}

/// **La vignette d'une scène, peinte par le composite PARTAGÉ** (#5037).
///
/// `StorySlideRenderer.renderComposite` est le rendu qui produit déjà la
/// couverture du plateau et le ThumbHash : la vignette n'ouvre pas un second
/// chemin de rendu à côté de lui — c'est le piège que l'issue nommait à propos
/// de `SlideMiniPreview`. Les bitmaps lui arrivent RÉDUITS à la tuile par
/// `SceneThumbnailCache` (#6922) : le filtre du fond s'applique à la vignette,
/// jamais aux 1600 px de la photo.
public enum SceneThumbnailRenderer {

    public static func thumbnail(slide: StorySlide, bgImage: UIImage?, loadedImages: [String: UIImage],
                                 size: CGSize, scale: CGFloat,
                                 store: SceneThumbnailStore = .shared,
                                 reductions: SceneThumbnailCache = .shared) -> UIImage {
        let empreinte = SceneThumbnailFingerprint(slide: slide, bgImage: bgImage, loadedImages: loadedImages,
                                                  size: size, scale: scale)
        if let deja = store.cached(empreinte) { return deja }
        let sources = ([bgImage] + SceneThumbnailContent.paintedImageKeys(of: slide).map { loadedImages[$0] })
            .compactMap { $0 }
        let vignette = render(slide: slide, bgImage: bgImage, loadedImages: loadedImages,
                              size: size, scale: scale, reductions: reductions)
        store.store(vignette, for: empreinte, sources: sources)
        return vignette
    }

    /// Les bitmaps de CETTE scène, chacun plafonné à ce que la tuile peut
    /// montrer — un fond zoomé garde la définition de son zoom.
    public static func reducedImages(slide: StorySlide, loadedImages: [String: UIImage],
                                     size: CGSize, scale: CGFloat,
                                     reductions: SceneThumbnailCache) -> [String: UIImage] {
        let zooms = Dictionary((slide.effects.mediaObjects ?? []).map { ($0.id, max(1, CGFloat($0.scale))) },
                               uniquingKeysWith: { premier, _ in premier })
        return SceneThumbnailContent.paintedImageKeys(of: slide).reduce(into: [:]) { reduites, cle in
            guard let image = loadedImages[cle] else { return }
            let zoom = zooms[cle] ?? 1
            reduites[cle] = reduced(image, tile: CGSize(width: size.width * zoom, height: size.height * zoom),
                                    scale: scale, reductions: reductions)
        }
    }

    private static func reduced(_ image: UIImage, tile: CGSize, scale: CGFloat,
                                reductions: SceneThumbnailCache) -> UIImage {
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        let plafond = SceneImageDownsampling.fillMaxPixelSize(source: pixels, tile: tile, scale: scale)
        guard plafond > 0 else { return image }
        return reductions.thumbnail(for: image, maxPixelSize: plafond)
    }

    private static func render(slide: StorySlide, bgImage: UIImage?, loadedImages: [String: UIImage],
                               size: CGSize, scale: CGFloat, reductions: SceneThumbnailCache) -> UIImage {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = scale
        format.opaque = true
        format.preferredRange = .standard
        guard !SceneThumbnailContent.isBlank(slide, bgImage: bgImage) else {
            return UIGraphicsImageRenderer(size: size, format: format).image { ctx in
                UIColor.black.setFill()
                ctx.fill(CGRect(origin: .zero, size: size))
            }
        }
        let fond = bgImage.map { reduced($0, tile: size, scale: scale, reductions: reductions) }
        let reduites = reducedImages(slide: slide, loadedImages: loadedImages, size: size, scale: scale,
                                     reductions: reductions)
        let composite = StorySlideRenderer.renderComposite(slide: slide, bgImage: fond, loadedImages: reduites,
                                                           size: size, scale: scale)
        let pastilles = (slide.effects.audioPlayerObjects ?? []).filter { $0.isBackground != true }
        guard !pastilles.isEmpty else {
            return composite ?? UIGraphicsImageRenderer(size: size, format: format).image { _ in }
        }
        return UIGraphicsImageRenderer(size: size, format: format).image { _ in
            composite?.draw(in: CGRect(origin: .zero, size: size))
            pastilles.forEach { drawAudioMarker(at: CGPoint(x: $0.x * size.width, y: $0.y * size.height),
                                                tileWidth: size.width) }
        }
    }

    /// **Le son POSÉ se voit dans la vignette** (#5037 : « tout ce qui est sur la
    /// scène », puces audio comprises). Le composite partagé ne le peint pas —
    /// la pastille réelle est une vue vivante (forme d'onde animée) qu'on ne
    /// peut pas réduire à quelques points sans la rendre illisible. Ce qu'il
    /// faut dire à cette taille, c'est « il y a du son ICI » : une pastille à
    /// note, comme la vignette précédente le disait déjà. Un son de FOND n'a
    /// aucun pixel sur la scène, il n'en a donc pas ici.
    private static func drawAudioMarker(at centre: CGPoint, tileWidth: CGFloat) {
        let cote = max(4, tileWidth * 0.16)
        let cadre = CGRect(x: centre.x - cote / 2, y: centre.y - cote / 2, width: cote, height: cote)
        UIColor.black.withAlphaComponent(0.55).setFill()
        UIBezierPath(ovalIn: cadre).fill()
        let glyphe = UIImage(systemName: "music.note",
                             withConfiguration: UIImage.SymbolConfiguration(pointSize: cote * 0.62, weight: .bold))?
            .withTintColor(.white, renderingMode: .alwaysOriginal)
        guard let glyphe else { return }
        glyphe.draw(in: CGRect(x: centre.x - glyphe.size.width / 2, y: centre.y - glyphe.size.height / 2,
                               width: glyphe.size.width, height: glyphe.size.height))
    }
}
