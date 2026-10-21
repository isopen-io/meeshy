import CoreImage
import UIKit
import MeeshySDK

// MARK: - Cuire un look en UN passage (#9873)

/// **Le filtre puis les réglages d'une image, cuits en un seul rendu.**
///
/// Le curseur d'un fond cuisait deux bitmaps à chaque cran — le filtre, relu
/// vers le CPU, puis les réglages, relus à leur tour — chacun par son propre
/// `CIContext`, et laissait l'orientation EXIF dans l'enveloppe pour qu'un
/// redessin UIKit la cuise une troisième fois. La chaîne est désormais UN graphe
/// Core Image (`StoryBackgroundLook.ciImage`), redressé par `CIImage.oriented`,
/// rendu une fois par `StoryRenderingContext.shared` dans l'espace qui garde la
/// gamme de la source : le fond de la scène, le média posé, la vignette
/// composite et l'export passent par ici.
///
/// Le cache suit l'INSTANCE d'image, son identifiant et les VALEURS : un
/// glissement qui revient sur une valeur déjà vue ne refait aucun rendu, et un
/// bitmap remplacé ne resservira jamais le look de l'ancien. L'adresse d'une
/// instance libérée peut être rendue à la suivante : chaque entrée garde donc un
/// lien FAIBLE vers sa source, et n'est servie qu'à cette même instance vivante
/// (`SceneThumbnailCache`, même règle).
public nonisolated enum StoryLookBake {

    private nonisolated final class Entry {
        weak var source: UIImage?
        let baked: UIImage
        init(source: UIImage, baked: UIImage) {
            self.source = source
            self.baked = baked
        }
    }

    // unchecked: NSCache est documenté thread-safe ; une entrée ne porte qu'un lien faible et un
    // bitmap immuable — le repeint sur place (MainActor) et la boucle du curseur la partagent.
    private nonisolated final class Entries: @unchecked Sendable {
        let storage: NSCache<NSString, Entry> = {
            let cache = NSCache<NSString, Entry>()
            cache.countLimit = 40
            cache.totalCostLimit = 40 * 1024 * 1024
            return cache
        }()
    }

    private static let entries = Entries()

    /// Le bitmap cuit sous `key` — seulement s'il vient de CETTE instance.
    static func cached(_ key: NSString, source: UIImage) -> UIImage? {
        guard let entry = entries.storage.object(forKey: key), entry.source === source else { return nil }
        return entry.baked
    }

    static func store(_ baked: UIImage, for key: NSString, source: UIImage, cost: Int) {
        entries.storage.setObject(Entry(source: source, baked: baked), forKey: key, cost: cost)
    }

    /// L'image elle-même, à l'identique, quand il n'y a ni filtre ni réglage
    /// actif ; sinon le bitmap cuit, `.up`, à la même échelle et à la même
    /// taille affichée.
    public static func image(_ image: UIImage, filter: StoryFilter?, intensity: Float,
                             adjustments: ImageAdjustments?, imageId: String?) -> UIImage {
        let reglages = adjustments.flatMap { $0.activeCount > 0 ? $0 : nil }
        guard filter != nil || reglages != nil,
              let source = StoryRenderingContext.orientedSource(of: image),
              source.extent.width >= 1, source.extent.height >= 1 else { return image }
        let cle = key(image, filter: filter, intensity: intensity, adjustments: reglages, imageId: imageId)
        if let deja = cached(cle, source: image) { return deja }

        let chaine = StoryBackgroundLook.ciImage(source, filter: filter, intensity: intensity, adjustments: reglages)
        guard let cuit = StoryRenderingContext.shared.bitmap(chaine, from: source.extent,
                                                             preserving: image.cgImage?.colorSpace) else { return image }
        let rendu = UIImage(cgImage: cuit, scale: image.scale, orientation: .up)
        store(rendu, for: cle, source: image, cost: cuit.bytesPerRow * cuit.height)
        return rendu
    }

    /// **La cuisson d'une demande** — la forme que la boucle d'un curseur
    /// rejoue hors du fil principal (`StoryLiveLook`).
    public static func bake(_ request: StoryLookBakeRequest) -> UIImage {
        image(request.image, filter: request.filter, intensity: request.intensity,
              adjustments: request.adjustments, imageId: request.imageId)
    }

    /// **Ce qui se pose SANS cuire** : l'image elle-même quand il n'y a rien à
    /// peindre, le bitmap déjà cuit pour ces valeurs ; `nil` quand il faut un
    /// rendu. Un curseur qui revient sur une valeur vue se repeint sur place.
    public static func ready(_ request: StoryLookBakeRequest) -> UIImage? {
        let reglages = request.adjustments.flatMap { $0.activeCount > 0 ? $0 : nil }
        guard request.filter != nil || reglages != nil else { return request.image }
        return cached(key(request.image, filter: request.filter, intensity: request.intensity,
                          adjustments: reglages, imageId: request.imageId), source: request.image)
    }

    /// Une clé DÉTERMINISTE : l'instance, l'identifiant de l'appelant, le
    /// filtre au centième et la signature des réglages — jamais `hashValue`
    /// d'un état, qui peut collisionner.
    static func key(_ image: UIImage, filter: StoryFilter?, intensity: Float,
                    adjustments: ImageAdjustments?, imageId: String?) -> NSString {
        let instance = "\(imageId ?? "")#\(ObjectIdentifier(image).hashValue)"
        let centieme = Int((max(0, min(1, intensity)) * 100).rounded())
        let look = filter.map { "\($0.rawValue)@\(centieme)" } ?? "-"
        let reglages = adjustments.map(StoryMediaAdjustmentsProcessor.signature) ?? "-"
        return "\(instance)|\(look)|\(reglages)" as NSString
    }
}

/// **Ce qu'une cuisson demande** : l'image et son look, de quoi la rejouer
/// hors du fil principal.
public nonisolated struct StoryLookBakeRequest: Sendable {
    public let image: UIImage
    public let filter: StoryFilter?
    public let intensity: Float
    public let adjustments: ImageAdjustments?
    public let imageId: String?

    public init(image: UIImage, filter: StoryFilter?, intensity: Float,
                adjustments: ImageAdjustments?, imageId: String?) {
        self.image = image
        self.filter = filter
        self.intensity = intensity
        self.adjustments = adjustments
        self.imageId = imageId
    }
}
