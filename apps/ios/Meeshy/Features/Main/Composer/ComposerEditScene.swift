import CoreGraphics
import Foundation
import MeeshySDK

/// Ce qui s'ouvre sous la scène de retouche, au-dessus des outils.
nonisolated enum ComposerEditPanel: Equatable, Sendable {
    case none
    /// La piste de découpe d'une vidéo.
    case trim
    /// La bande des filtres ou des cadres.
    case band
    /// Les proportions par presets.
    case presets
}

/// L'angle qu'un crochet de recadrage tient.
nonisolated enum ComposerCropCorner: CaseIterable, Hashable, Sendable {
    case topLeading
    case topTrailing
    case bottomLeading
    case bottomTrailing

    var isLeading: Bool { self == .topLeading || self == .bottomLeading }
    var isTop: Bool { self == .topLeading || self == .topTrailing }
}

/// **La scène de retouche, posée sur le sol** (#9567, porteur 2026-10-07).
///
/// > « Il faut mettre le contenu dans la scène avec coins arrondis, avec les
/// > crochets arrondis aux angles permettant de crop la taille de l'image […]
/// > Le bouton (X) et (Terminé) sont donc au-dessus du sol et non sur la scène
/// > finale affichée ! »
///
/// La prise retouchée ne remplit plus l'écran : elle tient dans une scène aux
/// proportions de ce qui partira, centrée entre la rangée haute — (X) et
/// « Terminé » — et les outils du bas. Les deux couches du montage lisent cette
/// même géométrie : l'image, qui ignore les marges système, les lui rend.
nonisolated enum ComposerEditScene {

    /// La rangée haute, au-dessus du sol : (X) et « Terminé ».
    static let topBand: CGFloat = 64
    /// La rangée des outils : Filtres, Cadres, Recadrer.
    static let toolsRow: CGFloat = 64
    static let margin: CGFloat = 16
    static let gap: CGFloat = 8
    /// En deçà, les crochets se toucheraient.
    static let minimumSide: CGFloat = 120
    /// Les proportions qu'un recadrage peut atteindre, largeur sur hauteur.
    static let aspectRange: ClosedRange<CGFloat> = 0.4...2.5

    static let trimHeight: CGFloat = 76
    static let bandHeight: CGFloat = ComposerLookStripRule.cellSize.height + 30
    static let presetsHeight: CGFloat = 44

    /// Un seul panneau à la fois : la bande ouverte, sinon les proportions,
    /// sinon — pour une vidéo — sa piste de découpe.
    static func panel(isVideo: Bool, familyOpen: Bool, presetsOpen: Bool) -> ComposerEditPanel {
        if familyOpen { return .band }
        if presetsOpen { return .presets }
        return isVideo ? .trim : .none
    }

    static func panelHeight(_ panel: ComposerEditPanel) -> CGFloat {
        switch panel {
        case .none: return 0
        case .trim: return trimHeight
        case .band: return bandHeight
        case .presets: return presetsHeight
        }
    }

    /// Ce que le bas retient sous la scène : les outils, et le panneau ouvert.
    static func bottomReserve(_ panel: ComposerEditPanel) -> CGFloat {
        let panneau = panelHeight(panel)
        return toolsRow + (panneau > 0 ? panneau + gap : 0) + gap * 2
    }

    /// La zone où la scène tient, dans un conteneur dont `top` et `bottom`
    /// sont les marges système (nulles pour une couche qui les respecte déjà).
    static func area(container: CGSize, top: CGFloat, bottom: CGFloat, panel: ComposerEditPanel) -> CGRect {
        let haut = top + topBand
        let bas = container.height - bottom - bottomReserve(panel)
        return CGRect(x: margin, y: haut, width: max(0, container.width - margin * 2), height: max(0, bas - haut))
    }

    /// La scène : ses proportions, ajustées et centrées dans la zone.
    static func rect(aspect: CGFloat, in area: CGRect) -> CGRect {
        guard aspect > 0, aspect.isFinite, area.width > 0, area.height > 0 else { return area }
        let taille = area.width / area.height > aspect
            ? CGSize(width: area.height * aspect, height: area.height)
            : CGSize(width: area.width, height: area.width / aspect)
        return CGRect(x: area.midX - taille.width / 2, y: area.midY - taille.height / 2,
                      width: taille.width, height: taille.height)
    }

    static func clampedAspect(_ aspect: CGFloat) -> CGFloat {
        guard aspect.isFinite else { return 1 }
        return min(aspectRange.upperBound, max(aspectRange.lowerBound, aspect))
    }

    /// **Un crochet tiré déplace SON angle** : l'angle opposé tient, la scène
    /// ne sort pas de sa zone et ne passe pas sous sa taille minimale.
    static func cropped(_ scene: CGRect, corner: ComposerCropCorner, translation: CGSize, within area: CGRect) -> CGRect {
        let minX = corner.isLeading
            ? min(scene.maxX - minimumSide, max(area.minX, scene.minX + translation.width)) : scene.minX
        let maxX = corner.isLeading
            ? scene.maxX : max(scene.minX + minimumSide, min(area.maxX, scene.maxX + translation.width))
        let minY = corner.isTop
            ? min(scene.maxY - minimumSide, max(area.minY, scene.minY + translation.height)) : scene.minY
        let maxY = corner.isTop
            ? scene.maxY : max(scene.minY + minimumSide, min(area.maxY, scene.maxY + translation.height))
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }
}

/// **Les proportions par presets** (#9567 : « une fonction permettant de fixer
/// la taille d'image avec des presets »). « Original » lit le média ; les
/// autres sont des rapports fixes, écrits en chiffres dans toutes les langues.
nonisolated enum ComposerCropPreset: CaseIterable, Hashable, Sendable {
    case original
    case story
    case portrait
    case square
    case landscape

    func aspect(source: CGSize) -> CGFloat {
        switch self {
        case .original:
            guard source.width > 0, source.height > 0 else { return ComposerLookPainter.designAspect }
            return ComposerEditScene.clampedAspect(source.width / source.height)
        case .story: return SceneShape.aspect
        case .portrait: return 4.0 / 5.0
        case .square: return 1
        case .landscape: return 16.0 / 9.0
        }
    }

    var label: String {
        switch self {
        case .original:
            return String(localized: "composer.object.editor.crop.original", defaultValue: "Original", bundle: .main)
        case .story: return "9:16"
        case .portrait: return "4:5"
        case .square: return "1:1"
        case .landscape: return "16:9"
        }
    }

    /// Le preset que ces proportions réalisent ; `nil` pour un recadrage libre.
    static func matching(_ aspect: CGFloat, source: CGSize) -> ComposerCropPreset? {
        allCases.first { abs($0.aspect(source: source) - aspect) < 0.005 }
    }
}
