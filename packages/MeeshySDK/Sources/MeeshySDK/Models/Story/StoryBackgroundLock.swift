import Foundation

/// **Le FOND d'une slide, figé tel qu'il a été semé** (#9994).
///
/// Règle du porteur (2026-10-10) : recomposer la story d'une AUTRE personne
/// laisse libres le premier plan et les textes, jamais le fond.
///
/// ## Pourquoi un verrou sur la slide, et pas un garde par commande
///
/// Les écritures du fond ne passent pas toutes par une fonction nommée du
/// ViewModel : les gestes du canvas, le panneau Cadre, l'annulation et le menu
/// du fond remplacent la slide d'un bloc. Un garde par commande en laisserait
/// passer une ; le verrou, appliqué là où toute écriture aboutit, les rattrape
/// toutes et rend la slide CORRIGÉE.
///
/// Ce qu'il fige — tout ce qui se PEINT comme fond :
/// - la couleur ou le dégradé (`background`) ;
/// - le filtre de la slide et son intensité, qui teintent le fond ;
/// - le cadrage (`backgroundTransform`) et le format du canvas ;
/// - le média de fond, s'il y en a un, à l'identique — et lui seul est fond.
///
/// L'image de fond HÉRITÉE (`slideImages`) vit hors de la slide : son gardien
/// est le ViewModel, qui tient le bitmap.
public struct StoryBackgroundLock: Sendable {

    /// La slide dont le fond est figé.
    public let slideId: String
    private let backdrop: Backdrop

    /// L'objet média qui EST le fond — `nil` quand le fond est une couleur ou
    /// une image héritée.
    public var backgroundObjectId: String? { backdrop.media?.id }

    public init(locking slide: StorySlide) {
        slideId = slide.id
        backdrop = Backdrop(slide.effects)
    }

    /// La slide corrigée quand une écriture a touché son fond ; `nil` quand elle
    /// est conforme ou qu'il s'agit d'une autre slide.
    public func enforced(_ slide: StorySlide) -> StorySlide? {
        guard slide.id == slideId, Backdrop(slide.effects) != backdrop else { return nil }
        var fixed = slide
        fixed.effects = backdrop.applied(to: slide.effects)
        return fixed
    }
}

// MARK: - Ce qui se peint comme fond

private struct Backdrop: Codable, Sendable, Equatable {
    let background: String?
    let filter: String?
    let filterIntensity: Double?
    let backgroundTransform: StoryBackgroundTransform?
    let canvasAspectRatio: Double?
    let media: StoryMediaObject?
    /// Les objets qui se DISENT fond : celui du verrou, ou aucun.
    let claimants: [String]

    init(_ effects: StoryEffects) {
        background = effects.background
        filter = effects.filter
        filterIntensity = effects.filterIntensity
        backgroundTransform = effects.backgroundTransform
        canvasAspectRatio = effects.canvasAspectRatio
        media = effects.resolvedBackgroundMedia
        claimants = (effects.mediaObjects ?? []).filter(\.isBackground).map(\.id)
    }

    func applied(to effects: StoryEffects) -> StoryEffects {
        var fixed = effects
        fixed.background = background
        fixed.filter = filter
        fixed.filterIntensity = filterIntensity
        fixed.backgroundTransform = backgroundTransform
        fixed.canvasAspectRatio = canvasAspectRatio

        var objects = (effects.mediaObjects ?? []).map { object -> StoryMediaObject in
            guard object.isBackground, object.id != media?.id else { return object }
            var demoted = object
            demoted.isBackground = false
            return demoted
        }
        if let media {
            if let index = objects.firstIndex(where: { $0.id == media.id }) {
                objects[index] = media
            } else {
                objects.insert(media, at: 0)
            }
        }
        fixed.mediaObjects = effects.mediaObjects == nil && objects.isEmpty ? nil : objects
        return fixed
    }

    /// Les modèles du fond ne sont pas `Equatable` (clés optionnelles, champs
    /// ajoutés au fil des lots) : ils se comparent par leur encodage, le seul
    /// qui suit d'office un champ neuf. La charge est petite — un objet et
    /// quelques scalaires — et ne se calcule que sur la slide verrouillée.
    static func == (lhs: Backdrop, rhs: Backdrop) -> Bool {
        lhs.encoded == rhs.encoded
    }

    private var encoded: Data? {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return try? encoder.encode(self)
    }
}
