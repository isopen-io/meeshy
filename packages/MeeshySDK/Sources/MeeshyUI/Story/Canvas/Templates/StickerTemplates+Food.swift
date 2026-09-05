import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de NOURRITURE (#4820)

/// La nourriture se reconnaît à sa SILHOUETTE, jamais à un emoji emprunté :
/// cinq motifs nus tracés à la main — une part, un gâteau, un cornet, un bol,
/// un burger — et cinq cartouches dont la FORME dit le moment : une pilule qui
/// fume, un ruban qui trinque, une carte de petit-déjeuner, un éclat qui crie
/// « Miam », une assiette ovale qui souhaite bon appétit.
///
/// La palette est celle de la marque, employée pour ce qu'elle DIT : `warmBulb`
/// est l'ambre de tout ce qui est cuit, `pin` le rouge de tout ce qui est
/// garni, `leaf` le vert de ce qui est frais, et `surface` sert de liseré
/// partout — c'est lui qui détache la décoration d'une photo sombre.
extension StickerTemplateRenderer {

    // MARK: - Le socle des motifs nus

    /// Les cinq motifs sans mot, et le rapport largeur/hauteur de chacun. Le
    /// rapport vit ICI, une fois : la mesure et le dessin le lisent tous les
    /// deux, donc ne peuvent pas diverger d'un demi-pixel.
    private enum FoodSilhouette {
        case pizza, cake, iceCream, ramen, burger

        var ratio: CGFloat {
            switch self {
            case .pizza: return 1.0
            case .cake: return 1.1
            case .iceCream: return 0.72
            case .ramen: return 1.15
            case .burger: return 1.05
            }
        }
    }

    /// Un cadre de `fontSize × 3` de haut — la mesure des glyphes nus des
    /// autres familles —, rentré d'un trait pour que le liseré tienne ENTIER
    /// dans le raster : une forme posée au ras du bord perdrait la moitié
    /// extérieure de son contour.
    private struct FoodFrame {
        let taille: CGSize
        let cadre: CGRect
        let bord: CGFloat
    }

    @MainActor
    private static func foodFrame(for silhouette: FoodSilhouette,
                                  metrics: StickerTemplateMetrics) -> FoodFrame {
        let côté = ceil(metrics.fontSize * 3.0)
        let bord = max(1.5, metrics.fontSize * 0.08)
        let taille = CGSize(width: ceil(côté * silhouette.ratio), height: côté)
        return FoodFrame(taille: taille,
                         cadre: CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord),
                         bord: bord)
    }

    /// Un cartouche à mot — la légende ET sa mise en page, calculées une fois
    /// pour la mesure comme pour le dessin.
    private struct FoodCaptionLayout {
        let légende: String
        let cartouche: StickerTemplateDrawing.CaptionLayout
        /// L'échancrure des rubans ; zéro pour une pilule.
        let queue: CGFloat
        let taille: CGSize
    }

    /// Un cartouche EMPILÉ — le motif au-dessus, le mot en dessous. La forme
    /// horizontale ne convient pas à tout : un croissant couché à côté de son
    /// mot serait illisible à la taille d'une vignette.
    private struct FoodStackLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        let taille: CGSize
    }

    private static let foodDeuxCôtés: [CGFloat] = [-1, 1]

    @MainActor
    private static func foodOutline(_ chemin: UIBezierPath, width: CGFloat, color: UIColor) {
        color.setStroke()
        chemin.lineWidth = width
        chemin.lineJoinStyle = .round
        chemin.stroke()
    }

    private static func foodRotate(_ chemin: UIBezierPath, by angle: CGFloat, around centre: CGPoint) {
        chemin.apply(CGAffineTransform(translationX: -centre.x, y: -centre.y))
        chemin.apply(CGAffineTransform(rotationAngle: angle))
        chemin.apply(CGAffineTransform(translationX: centre.x, y: centre.y))
    }

    /// Un éclat inscrit dans une ELLIPSE, pas dans un disque.
    ///
    /// `StickerTemplateDrawing.burstPath` prend `min(largeur, hauteur)` comme
    /// rayon : sur un cartouche large — un mot — il rendrait un petit rond au
    /// milieu, et le mot déborderait des deux côtés. Ici les deux rayons sont
    /// indépendants, donc l'éclat épouse le mot qu'il entoure.
    private static func foodBurstPath(in rect: CGRect, points: Int,
                                      innerRatio: CGFloat) -> UIBezierPath {
        let centre = CGPoint(x: rect.midX, y: rect.midY)
        let rx = rect.width / 2, ry = rect.height / 2
        let chemin = UIBezierPath()
        for index in 0..<(points * 2) {
            let angle = -CGFloat.pi / 2 + CGFloat(index) * .pi / CGFloat(points)
            let facteur: CGFloat = index % 2 == 0 ? 1 : innerRatio
            let point = CGPoint(x: centre.x + cos(angle) * rx * facteur,
                                y: centre.y + sin(angle) * ry * facteur)
            if index == 0 { chemin.move(to: point) } else { chemin.addLine(to: point) }
        }
        chemin.close()
        return chemin
    }

    /// Un ruban à queues d'aronde — la forme des toasts et des félicitations.
    private static func foodBannerPath(in rect: CGRect, notch échancrure: CGFloat) -> UIBezierPath {
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: rect.minX, y: rect.minY))
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        chemin.addLine(to: CGPoint(x: rect.maxX - échancrure, y: rect.midY))
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        chemin.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        chemin.addLine(to: CGPoint(x: rect.minX + échancrure, y: rect.midY))
        chemin.close()
        return chemin
    }

    // MARK: - food.coffee — la tasse fumante

    @MainActor
    private static var foodCoffeeCaption: String {
        String(localized: "sticker.template.food.coffee", defaultValue: "Café ?", bundle: .module)
    }

    @MainActor
    private static func foodCoffeeLayout(metrics: StickerTemplateMetrics) -> FoodCaptionLayout {
        let légende = foodCoffeeCaption
        let cartouche = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                             metrics: metrics)
        return FoodCaptionLayout(légende: légende, cartouche: cartouche, queue: 0,
                                 taille: cartouche.taille)
    }

    /// Une tasse : la vapeur monte DERRIÈRE, l'anse est tracée avant le corps
    /// pour que celui-ci en recouvre la moitié intérieure — sinon l'anse
    /// traverse la tasse.
    @MainActor
    private static func foodCup(in r: CGRect, bord: CGFloat) {
        let l = r.width, h = r.height
        let vapeur = UIBezierPath()
        for côté in Self.foodDeuxCôtés {
            let x = r.midX + côté * l * 0.17
            vapeur.move(to: CGPoint(x: x, y: r.minY + h * 0.32))
            vapeur.addCurve(to: CGPoint(x: x, y: r.minY + h * 0.02),
                            controlPoint1: CGPoint(x: x + l * 0.14, y: r.minY + h * 0.24),
                            controlPoint2: CGPoint(x: x - l * 0.14, y: r.minY + h * 0.11))
        }
        vapeur.lineWidth = max(1, bord * 0.75)
        vapeur.lineCapStyle = .round
        StickerTemplatePalette.surface.withAlphaComponent(0.85).setStroke()
        vapeur.stroke()

        let anse = UIBezierPath(arcCenter: CGPoint(x: r.minX + l * 0.80, y: r.minY + h * 0.58),
                                radius: l * 0.15,
                                startAngle: -CGFloat.pi / 2, endAngle: CGFloat.pi / 2, clockwise: true)
        anse.lineWidth = max(1, bord * 1.3)
        StickerTemplatePalette.surface.setStroke()
        anse.stroke()

        let tasse = UIBezierPath()
        tasse.move(to: CGPoint(x: r.minX + l * 0.18, y: r.minY + h * 0.40))
        tasse.addLine(to: CGPoint(x: r.minX + l * 0.82, y: r.minY + h * 0.40))
        tasse.addLine(to: CGPoint(x: r.minX + l * 0.72, y: r.minY + h * 0.78))
        tasse.addQuadCurve(to: CGPoint(x: r.minX + l * 0.28, y: r.minY + h * 0.78),
                           controlPoint: CGPoint(x: r.midX, y: r.minY + h * 0.90))
        tasse.close()
        StickerTemplateDrawing.fillWithOutline(tasse, fill: StickerTemplatePalette.surface,
                                               outline: StickerTemplatePalette.night,
                                               width: max(1, bord * 0.5))
        // Le café lui-même : sans cette ellipse sombre au ras du bord, la
        // tasse est vide et la décoration ne dit plus rien.
        StickerTemplatePalette.night.setFill()
        UIBezierPath(ovalIn: CGRect(x: r.minX + l * 0.21, y: r.minY + h * 0.36,
                                    width: l * 0.58, height: h * 0.09)).fill()
        let soucoupe = StickerTemplateDrawing.pillPath(
            in: CGRect(x: r.minX + l * 0.08, y: r.minY + h * 0.80, width: l * 0.84, height: h * 0.12))
        StickerTemplateDrawing.fillWithOutline(soucoupe, fill: StickerTemplatePalette.surface,
                                               outline: StickerTemplatePalette.night,
                                               width: max(1, bord * 0.4))
    }

    @MainActor
    private static func foodCoffeeImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = foodCoffeeLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            StickerTemplateDrawing.fillWithOutline(StickerTemplateDrawing.pillPath(in: cadre),
                                                   gradientFrom: StickerTemplatePalette.night,
                                                   to: StickerTemplatePalette.pin,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            let glyphe = CGRect(x: metrics.horizontalPadding,
                                y: cadre.midY - l.cartouche.glyphe / 2,
                                width: l.cartouche.glyphe, height: l.cartouche.glyphe)
            Self.foodCup(in: glyphe, bord: bord)
            StickerTemplateDrawing.draw(
                l.légende, font: l.cartouche.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: glyphe.maxX + metrics.gap,
                            y: cadre.midY - l.cartouche.tailleTexte.height / 2))
        }
    }

    // MARK: - food.pizza — la part

    /// La part est tracée en DEUX passes : la silhouette entière en rouge, puis
    /// le fromage rentré dedans. La bande qui reste au bord EST la croûte —
    /// une croûte tracée à part se décalerait du contour au premier réglage.
    @MainActor
    private static func foodPizzaImage(metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = foodFrame(for: .pizza, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let l = r.width, h = r.height
            let part = UIBezierPath()
            part.move(to: CGPoint(x: r.midX, y: r.maxY))
            part.addLine(to: CGPoint(x: r.minX + l * 0.04, y: r.minY + h * 0.26))
            part.addQuadCurve(to: CGPoint(x: r.maxX - l * 0.04, y: r.minY + h * 0.26),
                              controlPoint: CGPoint(x: r.midX, y: r.minY - h * 0.06))
            part.close()
            StickerTemplateDrawing.fillWithOutline(part, fill: StickerTemplatePalette.pin,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            let fromage = UIBezierPath()
            fromage.move(to: CGPoint(x: r.midX, y: r.maxY - h * 0.09))
            fromage.addLine(to: CGPoint(x: r.minX + l * 0.14, y: r.minY + h * 0.35))
            fromage.addQuadCurve(to: CGPoint(x: r.maxX - l * 0.14, y: r.minY + h * 0.35),
                                 controlPoint: CGPoint(x: r.midX, y: r.minY + h * 0.15))
            fromage.close()
            StickerTemplateDrawing.fill(fromage, gradientFrom: StickerTemplatePalette.warmBulb,
                                        to: StickerTemplatePalette.pin, in: r)
            // Trois rondelles et deux feuilles : sans garniture, la part n'est
            // qu'un triangle jaune.
            StickerTemplatePalette.pin.setFill()
            let rondelles = [CGPoint(x: 0.36, y: 0.44), CGPoint(x: 0.63, y: 0.42),
                             CGPoint(x: 0.50, y: 0.66)]
            for position in rondelles {
                let côté = l * 0.15
                UIBezierPath(ovalIn: CGRect(x: r.minX + l * position.x - côté / 2,
                                            y: r.minY + h * position.y - côté / 2,
                                            width: côté, height: côté)).fill()
            }
            StickerTemplatePalette.leaf.setFill()
            for position in [CGPoint(x: 0.44, y: 0.56), CGPoint(x: 0.58, y: 0.55)] {
                UIBezierPath(ovalIn: CGRect(x: r.minX + l * position.x, y: r.minY + h * position.y,
                                            width: l * 0.09, height: h * 0.06)).fill()
            }
        }
    }

    // MARK: - food.birthdayCake — le gâteau et sa bougie

    /// Deux étages, un glaçage qui coule, une bougie allumée. Le glaçage est un
    /// rectangle UNI à des disques : c'est l'union qui fait les gouttes, un
    /// festonnage tracé point par point dériverait à chaque échelle.
    @MainActor
    private static func foodCakeImage(metrics: StickerTemplateMetrics,
                                      screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = foodFrame(for: .cake, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let l = r.width, h = r.height
            let assiette = StickerTemplateDrawing.pillPath(
                in: CGRect(x: r.minX, y: r.maxY - h * 0.10, width: l, height: h * 0.09))
            StickerTemplateDrawing.fillWithOutline(assiette, fill: StickerTemplatePalette.surface,
                                                   outline: StickerTemplatePalette.hairline,
                                                   width: max(1, f.bord * 0.4))
            let haut = CGRect(x: r.minX + l * 0.18, y: r.minY + h * 0.38,
                              width: l * 0.64, height: h * 0.20)
            let gâteau = UIBezierPath(
                roundedRect: CGRect(x: r.minX + l * 0.08, y: r.minY + h * 0.56,
                                    width: l * 0.84, height: h * 0.34),
                cornerRadius: h * 0.06)
            gâteau.append(UIBezierPath(roundedRect: haut, cornerRadius: h * 0.05))
            StickerTemplateDrawing.fillWithOutline(gâteau,
                                                   gradientFrom: StickerTemplatePalette.lilac,
                                                   to: StickerTemplatePalette.accent,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            let glaçage = UIBezierPath(rect: CGRect(x: haut.minX, y: r.minY + h * 0.37,
                                                    width: haut.width, height: h * 0.07))
            let perle = haut.width / 4
            for index in 0..<4 {
                glaçage.append(UIBezierPath(ovalIn: CGRect(
                    x: haut.minX + perle * CGFloat(index) + perle * 0.12,
                    y: r.minY + h * 0.42,
                    width: perle * 0.76, height: perle * 0.76)))
            }
            StickerTemplatePalette.surface.setFill()
            glaçage.fill()
            let vermicelles = UIBezierPath()
            for index in 0..<5 {
                let x = r.minX + l * (0.18 + 0.16 * CGFloat(index))
                let y = r.minY + h * (index % 2 == 0 ? 0.68 : 0.78)
                let angle: CGFloat = index % 2 == 0 ? CGFloat.pi * 0.25 : -CGFloat.pi * 0.25
                let portée = l * 0.06
                vermicelles.move(to: CGPoint(x: x - cos(angle) * portée, y: y - sin(angle) * portée))
                vermicelles.addLine(to: CGPoint(x: x + cos(angle) * portée, y: y + sin(angle) * portée))
            }
            vermicelles.lineWidth = max(1, f.bord * 0.7)
            vermicelles.lineCapStyle = .round
            StickerTemplatePalette.warmBulb.setStroke()
            vermicelles.stroke()
            let bougie = StickerTemplateDrawing.pillPath(
                in: CGRect(x: r.midX - l * 0.03, y: r.minY + h * 0.17,
                           width: l * 0.06, height: h * 0.24))
            StickerTemplateDrawing.fillWithOutline(bougie, fill: StickerTemplatePalette.pin,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, f.bord * 0.4))
            // `dropPath` pointe vers le HAUT : c'est exactement une flamme.
            let flamme = StickerTemplateDrawing.dropPath(
                in: CGRect(x: r.midX - l * 0.05, y: r.minY + h * 0.02,
                           width: l * 0.10, height: h * 0.15))
            StickerTemplatePalette.warmBulb.setFill()
            flamme.fill()
            Self.foodOutline(flamme, width: max(1, f.bord * 0.5), color: StickerTemplatePalette.surface)
        }
    }

    // MARK: - food.cheers — le ruban des deux flûtes

    @MainActor
    private static var foodCheersCaption: String {
        String(localized: "sticker.template.food.cheers", defaultValue: "Tchin !", bundle: .module)
    }

    @MainActor
    private static func foodCheersLayout(metrics: StickerTemplateMetrics) -> FoodCaptionLayout {
        let légende = foodCheersCaption
        let cartouche = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                             metrics: metrics)
        let queue = ceil(metrics.fontSize * 0.42)
        return FoodCaptionLayout(
            légende: légende, cartouche: cartouche, queue: queue,
            taille: CGSize(width: ceil(cartouche.taille.width + queue * 2),
                           height: cartouche.taille.height))
    }

    /// Une flûte : la coupe, le pied, la base — un seul tracé, donc un seul
    /// liseré autour de la silhouette entière.
    private static func foodFlutePath(in r: CGRect) -> UIBezierPath {
        let l = r.width, h = r.height
        let coupe = UIBezierPath()
        coupe.move(to: CGPoint(x: r.minX, y: r.minY))
        coupe.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        coupe.addQuadCurve(to: CGPoint(x: r.midX, y: r.minY + h * 0.46),
                           controlPoint: CGPoint(x: r.maxX - l * 0.08, y: r.minY + h * 0.34))
        coupe.addQuadCurve(to: CGPoint(x: r.minX, y: r.minY),
                           controlPoint: CGPoint(x: r.minX + l * 0.08, y: r.minY + h * 0.34))
        coupe.close()
        coupe.append(UIBezierPath(rect: CGRect(x: r.midX - l * 0.06, y: r.minY + h * 0.42,
                                               width: l * 0.12, height: h * 0.44)))
        coupe.append(UIBezierPath(roundedRect: CGRect(x: r.midX - l * 0.32, y: r.maxY - h * 0.11,
                                                      width: l * 0.64, height: h * 0.11),
                                  cornerRadius: h * 0.055))
        return coupe
    }

    /// Deux flûtes penchées l'une VERS l'autre : c'est l'inclinaison inverse
    /// qui fait le choc — deux verres droits côte à côte ne trinquent pas.
    @MainActor
    private static func foodFlutes(in r: CGRect, bord: CGFloat) {
        for côté in Self.foodDeuxCôtés {
            let boîte = CGRect(x: r.midX + (côté > 0 ? r.width * 0.06 : -r.width * 0.52),
                               y: r.minY + r.height * 0.10,
                               width: r.width * 0.46, height: r.height * 0.84)
            let verre = Self.foodFlutePath(in: boîte)
            Self.foodRotate(verre, by: côté * 0.20,
                            around: CGPoint(x: boîte.midX, y: boîte.maxY))
            StickerTemplateDrawing.fillWithOutline(verre, fill: StickerTemplatePalette.surface,
                                                   outline: StickerTemplatePalette.night,
                                                   width: max(1, bord * 0.4))
            let bulle = UIBezierPath(ovalIn: CGRect(x: boîte.midX - r.width * 0.05,
                                                    y: boîte.minY + boîte.height * 0.10,
                                                    width: r.width * 0.10, height: r.height * 0.10))
            Self.foodRotate(bulle, by: côté * 0.20, around: CGPoint(x: boîte.midX, y: boîte.maxY))
            StickerTemplatePalette.warmBulb.setFill()
            bulle.fill()
        }
    }

    @MainActor
    private static func foodCheersImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = foodCheersLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let ruban = Self.foodBannerPath(in: cadre, notch: l.queue)
            StickerTemplateDrawing.fillWithOutline(ruban,
                                                   gradientFrom: StickerTemplatePalette.loveCool,
                                                   to: StickerTemplatePalette.accent,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            // Le contenu commence APRÈS l'échancrure : posé au bord, le glyphe
            // tomberait dans la pointe du ruban.
            let glyphe = CGRect(x: l.queue + metrics.horizontalPadding,
                                y: cadre.midY - l.cartouche.glyphe / 2,
                                width: l.cartouche.glyphe, height: l.cartouche.glyphe)
            Self.foodFlutes(in: glyphe, bord: bord)
            StickerTemplateDrawing.draw(
                l.légende, font: l.cartouche.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: glyphe.maxX + metrics.gap,
                            y: cadre.midY - l.cartouche.tailleTexte.height / 2))
        }
    }

    // MARK: - food.iceCream — le cornet à trois boules

    /// Le cornet est le motif le plus HAUT de la famille — d'où son rapport
    /// inférieur à 1 : trois boules empilées sur une gaufre ne tiennent pas
    /// dans un carré sans devenir minuscules.
    @MainActor
    private static func foodIceCreamImage(metrics: StickerTemplateMetrics,
                                          screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = foodFrame(for: .iceCream, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let l = r.width, h = r.height
            let cône = UIBezierPath()
            cône.move(to: CGPoint(x: r.minX + l * 0.16, y: r.minY + h * 0.46))
            cône.addLine(to: CGPoint(x: r.maxX - l * 0.16, y: r.minY + h * 0.46))
            cône.addLine(to: CGPoint(x: r.midX, y: r.maxY))
            cône.close()
            StickerTemplateDrawing.fillWithOutline(cône,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            if let contexte = UIGraphicsGetCurrentContext() {
                // Le gaufrage est DÉCOUPÉ par le cornet : des diagonales qui
                // dépassent feraient un cornet cassé.
                contexte.saveGState()
                cône.addClip()
                let quadrillage = UIBezierPath()
                for index in -4...4 {
                    let décalage = l * 0.22 * CGFloat(index)
                    quadrillage.move(to: CGPoint(x: r.minX + décalage, y: r.minY + h * 0.44))
                    quadrillage.addLine(to: CGPoint(x: r.minX + décalage + l * 0.7, y: r.maxY))
                    quadrillage.move(to: CGPoint(x: r.maxX - décalage, y: r.minY + h * 0.44))
                    quadrillage.addLine(to: CGPoint(x: r.maxX - décalage - l * 0.7, y: r.maxY))
                }
                quadrillage.lineWidth = max(1, f.bord * 0.5)
                StickerTemplatePalette.surface.withAlphaComponent(0.45).setStroke()
                quadrillage.stroke()
                contexte.restoreGState()
            }
            let boules: [(CGPoint, CGFloat, UIColor, UIColor)] = [
                (CGPoint(x: 0.35, y: 0.40), 0.21, StickerTemplatePalette.loveCool,
                 StickerTemplatePalette.surface),
                (CGPoint(x: 0.66, y: 0.37), 0.19, StickerTemplatePalette.sky,
                 StickerTemplatePalette.surface),
                (CGPoint(x: 0.50, y: 0.24), 0.18, StickerTemplatePalette.surface,
                 StickerTemplatePalette.hairline),
            ]
            for (position, rayon, remplissage, liseré) in boules {
                let côté = l * rayon * 2
                StickerTemplateDrawing.fillWithOutline(
                    UIBezierPath(ovalIn: CGRect(x: r.minX + l * position.x - côté / 2,
                                                y: r.minY + h * position.y - côté / 2,
                                                width: côté, height: côté)),
                    fill: remplissage, outline: liseré, width: max(1, f.bord * 0.4))
            }
            let cerise = CGRect(x: r.midX - l * 0.055, y: r.minY + h * 0.035,
                                width: l * 0.11, height: l * 0.11)
            let tige = UIBezierPath()
            tige.move(to: CGPoint(x: cerise.midX, y: cerise.minY + cerise.height * 0.3))
            tige.addQuadCurve(to: CGPoint(x: cerise.maxX + l * 0.09, y: r.minY + h * 0.01),
                              controlPoint: CGPoint(x: cerise.maxX, y: r.minY + h * 0.06))
            tige.lineWidth = max(1, f.bord * 0.6)
            tige.lineCapStyle = .round
            StickerTemplatePalette.leaf.setStroke()
            tige.stroke()
            StickerTemplateDrawing.fillWithOutline(UIBezierPath(ovalIn: cerise),
                                                   fill: StickerTemplatePalette.pin,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, f.bord * 0.4))
        }
    }

    // MARK: - food.croissant — la carte du petit-déjeuner

    @MainActor
    private static var foodCroissantCaption: String {
        String(localized: "sticker.template.food.croissant.caption",
               defaultValue: "Petit-déj", bundle: .module)
    }

    @MainActor
    private static func foodCroissantLayout(metrics: StickerTemplateMetrics) -> FoodStackLayout {
        let légende = foodCroissantCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.66, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let taille = CGSize(
            width: ceil(max(metrics.fontSize * 3.2,
                            tailleTexte.width + metrics.horizontalPadding * 2)),
            height: ceil(metrics.fontSize * 1.9 + tailleTexte.height + metrics.verticalPadding * 1.6))
        return FoodStackLayout(légende: légende, police: police, tailleTexte: tailleTexte,
                               taille: taille)
    }

    /// Un croissant : UN arc épais, tracé deux fois — une fois large pour le
    /// liseré, une fois au corps pour la pâte. Deux tracés concentriques
    /// dériveraient l'un de l'autre dès que l'épaisseur change.
    @MainActor
    private static func foodCroissant(in r: CGRect, bord: CGFloat) {
        let centre = CGPoint(x: r.midX, y: r.maxY - r.height * 0.06)
        let rayon = min(r.width * 0.38, r.height * 0.60)
        let épaisseur = rayon * 0.62
        let corps = UIBezierPath(arcCenter: centre, radius: rayon,
                                 startAngle: CGFloat.pi * 1.10, endAngle: CGFloat.pi * 1.90,
                                 clockwise: true)
        corps.lineCapStyle = .round
        corps.lineWidth = épaisseur + bord * 2
        StickerTemplatePalette.pin.setStroke()
        corps.stroke()
        corps.lineWidth = épaisseur
        StickerTemplatePalette.warmBulb.setStroke()
        corps.stroke()
        // Les feuilletages : trois traits radiaux qui font la viennoiserie.
        let plis = UIBezierPath()
        for index in 0..<3 {
            let angle = CGFloat.pi * 1.28 + CGFloat(index) * CGFloat.pi * 0.17
            plis.move(to: CGPoint(x: centre.x + cos(angle) * (rayon - épaisseur * 0.34),
                                  y: centre.y + sin(angle) * (rayon - épaisseur * 0.34)))
            plis.addLine(to: CGPoint(x: centre.x + cos(angle) * (rayon + épaisseur * 0.34),
                                     y: centre.y + sin(angle) * (rayon + épaisseur * 0.34)))
        }
        plis.lineWidth = max(1, bord * 0.6)
        plis.lineCapStyle = .round
        StickerTemplatePalette.pin.withAlphaComponent(0.7).setStroke()
        plis.stroke()
    }

    @MainActor
    private static func foodCroissantImage(metrics: StickerTemplateMetrics,
                                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = foodCroissantLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            // La seule carte CLAIRE de la famille : le matin est clair, et une
            // viennoiserie ambre disparaîtrait sur un fond ambre.
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.42)
            StickerTemplateDrawing.fillWithOutline(carte,
                                                   gradientFrom: StickerTemplatePalette.surface,
                                                   to: StickerTemplatePalette.indigoLight,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.lilac,
                                                   width: bord)
            Self.foodCroissant(in: CGRect(x: cadre.minX, y: cadre.minY + metrics.verticalPadding * 0.5,
                                          width: cadre.width, height: metrics.fontSize * 1.5),
                               bord: bord)
            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.label,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: cadre.maxY - metrics.verticalPadding * 0.8 - l.tailleTexte.height))
        }
    }

    // MARK: - food.ramen — le bol fumant

    /// Le bol est le seul motif où les baguettes DÉPASSENT du cadre du
    /// contenu : elles sont tracées avant le bol, donc celui-ci les coupe
    /// nettement au niveau du bord — un couvert qui traverse la faïence est ce
    /// qui trahit un dessin plat.
    @MainActor
    private static func foodRamenImage(metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = foodFrame(for: .ramen, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let l = r.width, h = r.height
            let vapeur = UIBezierPath()
            for côté in Self.foodDeuxCôtés {
                let x = r.midX + côté * l * 0.13
                vapeur.move(to: CGPoint(x: x, y: r.minY + h * 0.34))
                vapeur.addCurve(to: CGPoint(x: x, y: r.minY + h * 0.04),
                                controlPoint1: CGPoint(x: x + l * 0.11, y: r.minY + h * 0.26),
                                controlPoint2: CGPoint(x: x - l * 0.11, y: r.minY + h * 0.13))
            }
            vapeur.lineWidth = max(1, f.bord * 0.8)
            vapeur.lineCapStyle = .round
            StickerTemplatePalette.surface.withAlphaComponent(0.8).setStroke()
            vapeur.stroke()
            for côté in Self.foodDeuxCôtés {
                let baguette = StickerTemplateDrawing.pillPath(
                    in: CGRect(x: r.minX + l * 0.74 + côté * l * 0.045, y: r.minY + h * 0.08,
                               width: l * 0.045, height: h * 0.46))
                Self.foodRotate(baguette, by: 0.30,
                                around: CGPoint(x: r.minX + l * 0.74, y: r.minY + h * 0.40))
                StickerTemplateDrawing.fillWithOutline(baguette, fill: StickerTemplatePalette.pin,
                                                       outline: StickerTemplatePalette.surface,
                                                       width: max(1, f.bord * 0.35))
            }
            let bol = UIBezierPath()
            bol.move(to: CGPoint(x: r.minX + l * 0.06, y: r.minY + h * 0.40))
            bol.addLine(to: CGPoint(x: r.maxX - l * 0.06, y: r.minY + h * 0.40))
            bol.addCurve(to: CGPoint(x: r.minX + l * 0.06, y: r.minY + h * 0.40),
                         controlPoint1: CGPoint(x: r.maxX - l * 0.14, y: r.maxY),
                         controlPoint2: CGPoint(x: r.minX + l * 0.14, y: r.maxY))
            bol.close()
            StickerTemplateDrawing.fillWithOutline(bol,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.night,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(ovalIn: CGRect(x: r.minX + l * 0.09, y: r.minY + h * 0.35,
                                        width: l * 0.82, height: h * 0.11)).fill()
            let nouilles = UIBezierPath()
            for index in 0..<3 {
                let y = r.minY + h * (0.37 + 0.025 * CGFloat(index))
                nouilles.move(to: CGPoint(x: r.minX + l * 0.16, y: y))
                nouilles.addQuadCurve(to: CGPoint(x: r.maxX - l * 0.16, y: y),
                                      controlPoint: CGPoint(x: r.midX, y: y + h * 0.05))
            }
            nouilles.lineWidth = max(1, f.bord * 0.6)
            nouilles.lineCapStyle = .round
            StickerTemplatePalette.surface.withAlphaComponent(0.9).setStroke()
            nouilles.stroke()
            let œuf = CGRect(x: r.minX + l * 0.22, y: r.minY + h * 0.33,
                             width: l * 0.16, height: l * 0.16)
            StickerTemplateDrawing.fillWithOutline(UIBezierPath(ovalIn: œuf),
                                                   fill: StickerTemplatePalette.surface,
                                                   outline: StickerTemplatePalette.hairline,
                                                   width: max(1, f.bord * 0.3))
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(ovalIn: œuf.insetBy(dx: œuf.width * 0.3, dy: œuf.height * 0.3)).fill()
            let motif = UIBezierPath()
            motif.move(to: CGPoint(x: r.minX + l * 0.18, y: r.minY + h * 0.56))
            for index in 0..<4 {
                let x = r.minX + l * (0.18 + 0.16 * CGFloat(index + 1))
                motif.addQuadCurve(to: CGPoint(x: x, y: r.minY + h * 0.56),
                                   controlPoint: CGPoint(x: x - l * 0.08,
                                                         y: r.minY + h * (index % 2 == 0 ? 0.63 : 0.49)))
            }
            motif.lineWidth = max(1, f.bord * 0.6)
            StickerTemplatePalette.surface.withAlphaComponent(0.55).setStroke()
            motif.stroke()
            let socle = StickerTemplateDrawing.pillPath(
                in: CGRect(x: r.midX - l * 0.18, y: r.minY + h * 0.83,
                           width: l * 0.36, height: h * 0.09))
            StickerTemplateDrawing.fillWithOutline(socle, fill: StickerTemplatePalette.night,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, f.bord * 0.4))
        }
    }

    // MARK: - food.burger — les cinq étages

    /// Cinq étages tracés de haut en bas, chacun mordant sur le précédent : le
    /// recouvrement dans cet ordre donne la profondeur qu'un empilement de
    /// bandes jointives n'a pas.
    @MainActor
    private static func foodBurgerImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = foodFrame(for: .burger, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let l = r.width, h = r.height
            let dôme = UIBezierPath()
            dôme.move(to: CGPoint(x: r.minX + l * 0.04, y: r.minY + h * 0.42))
            dôme.addCurve(to: CGPoint(x: r.maxX - l * 0.04, y: r.minY + h * 0.42),
                          controlPoint1: CGPoint(x: r.minX + l * 0.06, y: r.minY - h * 0.04),
                          controlPoint2: CGPoint(x: r.maxX - l * 0.06, y: r.minY - h * 0.04))
            dôme.close()
            StickerTemplateDrawing.fillWithOutline(dôme,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            StickerTemplatePalette.surface.withAlphaComponent(0.9).setFill()
            for position in [CGPoint(x: 0.30, y: 0.20), CGPoint(x: 0.52, y: 0.13),
                             CGPoint(x: 0.72, y: 0.22), CGPoint(x: 0.42, y: 0.30)] {
                UIBezierPath(ovalIn: CGRect(x: r.minX + l * position.x, y: r.minY + h * position.y,
                                            width: l * 0.09, height: h * 0.05)).fill()
            }
            let salade = UIBezierPath(rect: CGRect(x: r.minX + l * 0.02, y: r.minY + h * 0.41,
                                                   width: l * 0.96, height: h * 0.06))
            let feuille = l * 0.20
            for index in 0..<5 {
                salade.append(UIBezierPath(ovalIn: CGRect(
                    x: r.minX + l * 0.02 + (l * 0.96 - feuille) * CGFloat(index) / 4,
                    y: r.minY + h * 0.43, width: feuille, height: h * 0.10)))
            }
            StickerTemplateDrawing.fillWithOutline(salade, fill: StickerTemplatePalette.leaf,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, f.bord * 0.4))
            let fromage = UIBezierPath()
            fromage.move(to: CGPoint(x: r.minX + l * 0.06, y: r.minY + h * 0.51))
            fromage.addLine(to: CGPoint(x: r.maxX - l * 0.06, y: r.minY + h * 0.51))
            fromage.addLine(to: CGPoint(x: r.maxX - l * 0.10, y: r.minY + h * 0.62))
            fromage.addLine(to: CGPoint(x: r.maxX - l * 0.24, y: r.minY + h * 0.55))
            fromage.addLine(to: CGPoint(x: r.midX, y: r.minY + h * 0.64))
            fromage.addLine(to: CGPoint(x: r.minX + l * 0.24, y: r.minY + h * 0.55))
            fromage.addLine(to: CGPoint(x: r.minX + l * 0.10, y: r.minY + h * 0.62))
            fromage.close()
            StickerTemplateDrawing.fillWithOutline(fromage, fill: StickerTemplatePalette.warmBulb,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, f.bord * 0.4))
            let steak = UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.06, y: r.minY + h * 0.60,
                                                         width: l * 0.88, height: h * 0.14),
                                     cornerRadius: h * 0.06)
            StickerTemplateDrawing.fillWithOutline(steak, fill: StickerTemplatePalette.night,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, f.bord * 0.5))
            let bas = UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.05, y: r.minY + h * 0.72,
                                                       width: l * 0.90, height: h * 0.20),
                                   cornerRadius: h * 0.09)
            StickerTemplateDrawing.fillWithOutline(bas,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, f.bord * 0.6))
        }
    }

    // MARK: - food.yum — le mot dans l'éclat

    @MainActor
    private static var foodYumCaption: String {
        String(localized: "sticker.template.food.yum", defaultValue: "Miam", bundle: .module)
    }

    @MainActor
    private static func foodYumLayout(metrics: StickerTemplateMetrics) -> FoodStackLayout {
        let légende = foodYumCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.86, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // Les pointes de l'éclat mangent la marge : sans ce supplément, le mot
        // sortirait par les creux.
        let taille = CGSize(
            width: ceil(tailleTexte.width + metrics.horizontalPadding * 3.0),
            height: ceil(max(tailleTexte.height + metrics.verticalPadding * 3.4,
                             metrics.fontSize * 2.2)))
        return FoodStackLayout(légende: légende, police: police, tailleTexte: tailleTexte,
                               taille: taille)
    }

    @MainActor
    private static func foodYumImage(metrics: StickerTemplateMetrics,
                                     screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = foodYumLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let éclat = Self.foodBurstPath(in: cadre, points: 14, innerRatio: 0.80)
            StickerTemplateDrawing.fillWithOutline(éclat,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            // Un second éclat rentré, en trait fin : c'est lui qui donne au
            // « Miam » son air de bulle de bande dessinée.
            let intérieur = Self.foodBurstPath(in: cadre.insetBy(dx: cadre.width * 0.09,
                                                                 dy: cadre.height * 0.11),
                                               points: 14, innerRatio: 0.82)
            Self.foodOutline(intérieur, width: max(1, bord * 0.5),
                             color: StickerTemplatePalette.surface.withAlphaComponent(0.75))
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.label, in: cadre)
        }
    }

    // MARK: - food.bonAppetit — l'assiette ovale

    @MainActor
    private static var foodBonAppetitCaption: String {
        String(localized: "sticker.template.food.bonAppetit",
               defaultValue: "Bon appétit", bundle: .module)
    }

    @MainActor
    private static func foodBonAppetitLayout(metrics: StickerTemplateMetrics) -> FoodStackLayout {
        let légende = foodBonAppetitCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.62, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // Un ovale rétrécit vers ses bords : le mot n'y tient que si la marge
        // horizontale vaut une fois et demie celle d'un cartouche droit.
        let taille = CGSize(
            width: ceil(max(metrics.fontSize * 3.6,
                            tailleTexte.width + metrics.horizontalPadding * 3.4)),
            height: ceil(metrics.fontSize * 1.5 + tailleTexte.height + metrics.verticalPadding * 3.2))
        return FoodStackLayout(légende: légende, police: police, tailleTexte: tailleTexte,
                               taille: taille)
    }

    /// Une fourchette et un couteau tracés à la main : trois dents et un
    /// manche d'un côté, une lame effilée de l'autre.
    @MainActor
    private static func foodCutlery(in r: CGRect, color couleur: UIColor) {
        let l = r.width, h = r.height
        let xFourchette = r.minX + l * 0.28
        let fourchette = StickerTemplateDrawing.pillPath(
            in: CGRect(x: xFourchette - l * 0.045, y: r.minY + h * 0.30,
                       width: l * 0.09, height: h * 0.70))
        for rang in -1...1 {
            fourchette.append(StickerTemplateDrawing.pillPath(
                in: CGRect(x: xFourchette + CGFloat(rang) * l * 0.075 - l * 0.024,
                           y: r.minY, width: l * 0.048, height: h * 0.42)))
        }
        let xCouteau = r.minX + l * 0.72
        let lame = UIBezierPath()
        lame.move(to: CGPoint(x: xCouteau - l * 0.02, y: r.minY))
        lame.addQuadCurve(to: CGPoint(x: xCouteau + l * 0.05, y: r.minY + h * 0.42),
                          controlPoint: CGPoint(x: xCouteau + l * 0.08, y: r.minY + h * 0.10))
        lame.addLine(to: CGPoint(x: xCouteau - l * 0.05, y: r.minY + h * 0.42))
        lame.close()
        lame.append(StickerTemplateDrawing.pillPath(
            in: CGRect(x: xCouteau - l * 0.045, y: r.minY + h * 0.36,
                       width: l * 0.09, height: h * 0.64)))
        couleur.setFill()
        fourchette.fill()
        lame.fill()
    }

    @MainActor
    private static func foodBonAppetitImage(metrics: StickerTemplateMetrics,
                                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = foodBonAppetitLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            // La FORME est l'assiette : aucune autre décoration de la famille
            // n'est un ovale, et le mot s'y lit comme gravé dans la faïence.
            let assiette = UIBezierPath(ovalIn: cadre)
            StickerTemplateDrawing.fillWithOutline(assiette,
                                                   gradientFrom: StickerTemplatePalette.surface,
                                                   to: StickerTemplatePalette.indigoLight,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.lilac,
                                                   width: bord)
            let creux = UIBezierPath(ovalIn: cadre.insetBy(dx: cadre.width * 0.07,
                                                           dy: cadre.height * 0.09))
            Self.foodOutline(creux, width: max(1, bord * 0.5), color: StickerTemplatePalette.hairline)
            Self.foodCutlery(in: CGRect(x: cadre.midX - metrics.fontSize * 0.55,
                                        y: cadre.minY + metrics.verticalPadding * 1.1,
                                        width: metrics.fontSize * 1.1, height: metrics.fontSize * 0.95),
                             color: StickerTemplatePalette.accent)
            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.label,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: cadre.maxY - metrics.verticalPadding * 2.0 - l.tailleTexte.height))
        }
    }

    // MARK: - Le registre de la famille NOURRITURE

    static let foodDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodCoffee,
            name: { Self.foodCoffeeCaption },
            measure: { _, m in Self.foodCoffeeLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.foodCoffeeImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodPizza,
            name: { String(localized: "sticker.template.food.pizza",
                           defaultValue: "Part de pizza", bundle: .module) },
            measure: { _, m in Self.foodFrame(for: .pizza, metrics: m).taille },
            draw: { _, m, échelle in Self.foodPizzaImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodBirthdayCake,
            name: { String(localized: "sticker.template.food.birthdayCake",
                           defaultValue: "Gâteau d'anniversaire", bundle: .module) },
            measure: { _, m in Self.foodFrame(for: .cake, metrics: m).taille },
            draw: { _, m, échelle in Self.foodCakeImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodCheers,
            name: { Self.foodCheersCaption },
            measure: { _, m in Self.foodCheersLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.foodCheersImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodIceCream,
            name: { String(localized: "sticker.template.food.iceCream",
                           defaultValue: "Glace", bundle: .module) },
            measure: { _, m in Self.foodFrame(for: .iceCream, metrics: m).taille },
            draw: { _, m, échelle in Self.foodIceCreamImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodCroissant,
            name: { String(localized: "sticker.template.food.croissant",
                           defaultValue: "Croissant", bundle: .module) },
            measure: { _, m in Self.foodCroissantLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.foodCroissantImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodRamen,
            name: { String(localized: "sticker.template.food.ramen",
                           defaultValue: "Bol de ramen", bundle: .module) },
            measure: { _, m in Self.foodFrame(for: .ramen, metrics: m).taille },
            draw: { _, m, échelle in Self.foodRamenImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodBurger,
            name: { String(localized: "sticker.template.food.burger",
                           defaultValue: "Burger", bundle: .module) },
            measure: { _, m in Self.foodFrame(for: .burger, metrics: m).taille },
            draw: { _, m, échelle in Self.foodBurgerImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodYum,
            name: { Self.foodYumCaption },
            measure: { _, m in Self.foodYumLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.foodYumImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.foodBonAppetit,
            name: { Self.foodBonAppetitCaption },
            measure: { _, m in Self.foodBonAppetitLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.foodBonAppetitImage(metrics: m, screenScale: échelle) }),
    ]
}
