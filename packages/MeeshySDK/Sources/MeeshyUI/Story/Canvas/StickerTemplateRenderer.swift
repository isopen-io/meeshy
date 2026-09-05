import Foundation
import UIKit
import MeeshySDK

// MARK: - Sticker Template Palette

/// La palette des décorations — **tokens `MeeshyColors`, jamais une couleur
/// système en dur** (`packages/MeeshySDK/CLAUDE.md`, Visual Identity).
///
/// Les valeurs vivent ICI, avec le dessin qui les emploie. `StoryLocationLayer`
/// les REDIT sous ses anciens noms : ses témoins les nomment ainsi depuis
/// `StoryLocationBadgeRenderTests`, et un alias d'une ligne n'est pas une
/// jumelle — c'est une seule définition vue de deux endroits.
public enum StickerTemplatePalette {
    /// Réutilise le parseur hex de `StoryTextLayer` : les tokens `MeeshyColors`
    /// sont déclarés en `Color` (SwiftUI), pas en `UIColor`.
    public static let pin: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.errorHex) ?? .systemRed
    public static let label: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black
    public static let surface: UIColor =
        (StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo50Hex) ?? .white)
            .withAlphaComponent(0.94)

    /// L'encre des décorations posées sur un fond sombre (heure numérique).
    public static let ink: UIColor =
        (StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo900Hex) ?? .black)
            .withAlphaComponent(0.92)
    /// Le liseré discret des cadres — indigo clair, jamais un gris système.
    public static let hairline: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.indigo300Hex) ?? .lightGray
    /// L'accent de marque, pour les aiguilles et les rubans.
    public static let accent: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.brandPrimaryHex) ?? .systemIndigo
    /// Les deux bornes du dégradé des cœurs.
    public static let loveWarm: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.errorHex) ?? .systemPink
    public static let loveCool: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.purple500Hex) ?? .systemPurple
    /// Les ampoules d'une enseigne. `warningHex` est l'ambre de la marque —
    /// jamais un `.systemYellow`, qui changerait de ton d'une version d'iOS à
    /// l'autre et ferait dériver la décoration.
    public static let warmBulb: UIColor =
        StoryTextLayer.parseHexColorNonisolated(MeeshyColors.warningHex) ?? .systemOrange
}

// MARK: - Sticker Template Metrics

/// Les mesures d'un gabarit, **déjà projetées en espace de rendu**.
///
/// Le gabarit ne connaît ni la taille du canvas ni le facteur d'échelle : son
/// appelant a déjà fait passer les constantes de design par
/// `CanvasGeometry.render(_:)`. C'est ce qui garde un gabarit identique sur
/// iPhone, iPad et dans la vidéo exportée — la même discipline
/// « mesure → projection » que `StoryTextLayer.configure`.
public struct StickerTemplateMetrics: Equatable, Sendable {
    public let fontSize: CGFloat
    public let horizontalPadding: CGFloat
    public let verticalPadding: CGFloat
    public let gap: CGFloat

    public init(fontSize: CGFloat, horizontalPadding: CGFloat,
                verticalPadding: CGFloat, gap: CGFloat) {
        self.fontSize = fontSize
        self.horizontalPadding = horizontalPadding
        self.verticalPadding = verticalPadding
        self.gap = gap
    }

    // Les constantes de la pastille de lieu, telles qu'elles étaient codées en
    // dur dans `StoryLocationLayer` avant le #4717. Elles ne bougent pas : le
    // témoin de non-régression compare le badge rendu à celui d'avant.
    static let locationBaseFontSize: CGFloat = 42
    static let locationHorizontalPad: CGFloat = 22
    static let locationVerticalPad: CGFloat = 14
    static let locationGap: CGFloat = 10

    /// Les mesures d'un sticker gabarit — heure, amour.
    ///
    /// Le côté de référence vient de `CanvasGeometry.stickerFontSize`, **source
    /// unique des trois pipelines** (canvas, composite de miniature, export) :
    /// s'en écarter ferait sortir la décoration à une taille dans la story et à
    /// une autre dans la vignette du tray, le défaut que cette fonction existe
    /// justement pour avoir fermé.
    ///
    /// Les marges sont proportionnelles au corps, dans les MÊMES rapports que
    /// la pastille de lieu (22/42, 14/42, 10/42) : une seule famille de
    /// proportions pour toutes les décorations, sinon chaque gabarit inventerait
    /// son air de famille.
    public static func sticker(geometry: CanvasGeometry,
                               baseSize: Double,
                               scale: Double) -> StickerTemplateMetrics {
        let côté = CanvasGeometry.stickerFontSize(baseSize: baseSize, scale: scale,
                                                  canvasWidth: geometry.renderSize.width)
        return StickerTemplateMetrics(
            fontSize: côté,
            horizontalPadding: côté * (locationHorizontalPad / locationBaseFontSize),
            verticalPadding: côté * (locationVerticalPad / locationBaseFontSize),
            gap: côté * (locationGap / locationBaseFontSize)
        )
    }

    /// Les mesures d'une VIGNETTE de palette, pour un côté de cellule donné.
    ///
    /// La vignette n'est pas une illustration : elle passe par le MÊME moteur
    /// que la scène (exigence #4110). Seules les mesures changent — le corps
    /// vaut moins d'un tiers de la cellule pour qu'un cartouche à deux lignes y
    /// tienne, et les marges gardent les rapports de la pastille.
    public static func preview(side: CGFloat) -> StickerTemplateMetrics {
        let corps = side * 0.30
        return StickerTemplateMetrics(
            fontSize: corps,
            horizontalPadding: corps * (locationHorizontalPad / locationBaseFontSize),
            verticalPadding: corps * (locationVerticalPad / locationBaseFontSize),
            gap: corps * (locationGap / locationBaseFontSize)
        )
    }

    /// Les mesures d'une décoration de LIEU pour une géométrie et une échelle.
    public static func location(geometry: CanvasGeometry, scale: CGFloat) -> StickerTemplateMetrics {
        StickerTemplateMetrics(
            fontSize: geometry.render(locationBaseFontSize * scale),
            horizontalPadding: geometry.render(locationHorizontalPad * scale),
            verticalPadding: geometry.render(locationVerticalPad * scale),
            gap: geometry.render(locationGap * scale)
        )
    }
}

// MARK: - Sticker Template Renderer

/// **Le dessin des gabarits — un seul chemin, pas deux** (#4717), servi par un
/// REGISTRE de dessinateurs (#4820).
///
/// ## Pourquoi MESURER et DESSINER sont deux fonctions
///
/// Le reader pose ses cibles de tap avec `StoryLocationLayer.badgeFrame`, qui
/// doit tomber EXACTEMENT là où le rendu dessine. Les deux partagent donc la
/// mesure ; les laisser la calculer chacun de leur côté ferait dériver la zone
/// tapable du pixel affiché sans qu'aucun témoin ne rougisse.
///
/// ## Pourquoi un id inconnu rend `nil`
///
/// Un contenu publié par une version plus récente peut nommer un gabarit que ce
/// binaire ne connaît pas. Rendre `nil` laisse l'APPELANT choisir son repli —
/// la pastille pour un lieu, l'emoji du fil pour un sticker. Fabriquer un
/// gabarit ici imposerait le même repli aux deux, et l'un des deux serait faux.
public enum StickerTemplateRenderer {

    // MARK: Le registre

    /// **Tous les dessinateurs, indexés par id de gabarit** — agrégés depuis
    /// les familles, chacune déclarée dans son propre fichier
    /// (`StickerTemplates+<Famille>.swift`).
    ///
    /// L'ordre d'agrégation n'a pas de sens produit ; deux dessinateurs pour un
    /// même id seraient une erreur d'inventaire, que le témoin
    /// `everyDrawer_hasItsTemplate_andEveryTemplate_itsDrawer` attrape. Ici on
    /// garde le PREMIER plutôt que de planter : une palette qui s'ouvre avec un
    /// doublon vaut mieux qu'une app qui ne s'ouvre pas.
    static let registry: [String: StickerTemplateDrawer] = {
        let familles: [[StickerTemplateDrawer]] = [
            locationDrawers, locationMoreDrawers,
            timeDrawers, timeExtraDrawers,
            loveDrawers, loveExtraDrawers,
            weatherDrawers, textDrawers,
            joyDrawers, surpriseDrawers, moodDrawers, greetingDrawers,
            reactionDrawers, partyDrawers, availabilityDrawers,
            natureDrawers, cheerDrawers, answerDrawers,
            foodDrawers, sportDrawers,
            travelDrawers, workDrawers, musicDrawers,
        ]
        return Dictionary(familles.joined().map { ($0.id, $0) }, uniquingKeysWith: { premier, _ in premier })
    }()

    /// Le dessinateur d'un gabarit, ou `nil` s'il est inconnu de ce binaire.
    @MainActor
    public static func drawer(for templateID: String) -> StickerTemplateDrawer? {
        registry[templateID]
    }

    /// Les ids que ce binaire sait dessiner — pour les gardes d'inventaire.
    @MainActor
    public static var drawableTemplateIDs: Set<String> { Set(registry.keys) }

    // MARK: Les deux entrées

    /// La taille qu'occupera le gabarit, sans le rasteriser.
    @MainActor
    public static func measuredSize(templateID: String,
                                    slots: [String: String],
                                    metrics: StickerTemplateMetrics) -> CGSize? {
        guard let dessinateur = drawer(for: templateID) else { return nil }
        return dessinateur.measure(slots, metrics)
    }

    /// Le gabarit rasterisé, prêt pour `CALayer.contents`.
    ///
    /// Passer par une image assignée à `contents` — plutôt qu'un arbre de
    /// sous-couches vivantes — n'est pas qu'une affaire de coût : c'est ce qui
    /// fait survivre la décoration à `layer.render(in:)`, donc à la capture de
    /// canvas, au backdrop et à l'export AVFoundation, sans une ligne de plus.
    ///
    /// Le dessin est MÉMOÏSÉ (voir `memoizedImage`) : deux demandes identiques
    /// ne font tourner CoreGraphics qu'une fois.
    @MainActor
    public static func image(templateID: String,
                             slots: [String: String],
                             metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize)? {
        guard let dessinateur = drawer(for: templateID) else { return nil }
        return memoizedImage(drawer: dessinateur, slots: slots,
                             metrics: metrics, screenScale: screenScale)
    }

    // MARK: La mémoïsation du dessin

    /// **Le même gabarit ne se redessine pas** (#4947).
    ///
    /// Une bulle de conversation rejoue sa rasterisation à chaque réapparition
    /// de cellule (`MessageStickerArtwork` monte un `.task(id:)`) et la palette
    /// redessine sa vignette à chaque passage : scroller loin puis revenir
    /// refaisait tourner CoreGraphics pour un dessin IDENTIQUE, sur le fil
    /// principal, au moment précis où il faut des images.
    ///
    /// `NSCache` plutôt qu'un dictionnaire : elle rend ses entrées sous
    /// pression mémoire, ce qu'un cache de bitmaps doit savoir faire. Le
    /// plafond qui compte est celui des OCTETS, pas celui des entrées —
    /// soixante-quatre gabarits de 512 pt à 2× pèseraient un quart de
    /// gigaoctet ; `countLimit` ne borne que la longueur de la file.
    private static let renderCache: NSCache<NSString, StickerTemplateRender> = {
        let cache = NSCache<NSString, StickerTemplateRender>()
        cache.countLimit = 64
        cache.totalCostLimit = 24 * 1024 * 1024
        return cache
    }()

    /// Le dessin d'un dessinateur DONNÉ, mémoïsé.
    ///
    /// Prend le dessinateur plutôt que son id pour que les témoins mesurent le
    /// nombre de dessins RÉELS avec un dessinateur espion — le registre, lui,
    /// n'est pas injectable, et un compteur posé dans le renderer ne prouverait
    /// rien d'autre que lui-même.
    ///
    /// Un dessin ABSENT (taille dégénérée) ne pose aucune entrée : mémoïser une
    /// absence empêcherait le dessin de revenir quand les mesures redeviennent
    /// valides.
    @MainActor
    static func memoizedImage(drawer dessinateur: StickerTemplateDrawer,
                              slots: [String: String],
                              metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize)? {
        let clé = renderCacheKey(drawerID: dessinateur.id, slots: slots,
                                 metrics: metrics, screenScale: screenScale) as NSString
        if let mémoïsé = renderCache.object(forKey: clé) {
            return (mémoïsé.image, mémoïsé.size)
        }
        let rendu = dessinateur.draw(slots, metrics, screenScale)
        guard let image = rendu.0 else { return rendu }
        renderCache.setObject(StickerTemplateRender(image: image, size: rendu.1),
                              forKey: clé, cost: bitmapCost(of: image))
        return rendu
    }

    /// La clé d'un rendu : ce qui le fait DIFFÉRER, et rien d'autre.
    ///
    /// Les emplacements sont TRIÉS — un dictionnaire n'a pas d'ordre, et deux
    /// écritures du même contenu doivent tomber sur la même clé. Les MESURES en
    /// font partie : la vignette de palette et la scène demandent le même
    /// gabarit dix fois plus grand, les confondre poserait une décoration
    /// minuscule sur une story.
    nonisolated static func renderCacheKey(drawerID: String,
                                           slots: [String: String],
                                           metrics: StickerTemplateMetrics,
                                           screenScale: CGFloat) -> String {
        let emplacements = slots.keys.sorted()
            .map { "\($0)=\(slots[$0] ?? "")" }
            .joined(separator: "\u{1F}")
        return [drawerID, emplacements,
                "\(metrics.fontSize)", "\(metrics.horizontalPadding)",
                "\(metrics.verticalPadding)", "\(metrics.gap)",
                "\(screenScale)"].joined(separator: "|")
    }

    /// Le poids d'un rendu, en octets de bitmap — quatre par pixel. C'est ce
    /// que le cache borne, pas le nombre d'images.
    nonisolated static func bitmapCost(of image: UIImage) -> Int {
        let pixels = (image.size.width * image.scale) * (image.size.height * image.scale)
        guard pixels.isFinite, pixels > 0 else { return 0 }
        return Int(min(pixels, 1e9).rounded()) * 4
    }
}

// MARK: - Le rendu mémoïsé

/// Le dessin d'un gabarit et SA TAILLE, dans une boîte de référence.
///
/// `NSCache` ne range que des objets, et la taille fait partie du rendu : la
/// recalculer depuis `image.size` à la relecture supposerait que tout
/// dessinateur rasterise exactement à la taille qu'il annonce — ce que le
/// contrat `StickerTemplateDrawer.Draw` n'impose nulle part.
final class StickerTemplateRender {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}
    let image: UIImage
    let size: CGSize

    init(image: UIImage, size: CGSize) {
        self.image = image
        self.size = size
    }
}
