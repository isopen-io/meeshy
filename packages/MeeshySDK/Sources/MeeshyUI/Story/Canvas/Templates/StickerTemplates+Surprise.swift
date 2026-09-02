import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de STUPEUR (#4820)

/// La surprise se dit FORT et se dessine GRAND : un éclat pour le « WOW », une
/// bulle pour le « Quoi ?! », une bouche en O sans un mot. Six des dix sont
/// tracées à la main — l'éclat, le point d'exclamation, le visage, les yeux,
/// l'éclair, la tête qui rayonne — pour que la famille ait une silhouette et
/// non dix cartouches. Chaque légende vient de `String(localized:)`, donc de la
/// langue du LECTEUR : le nom du gabarit EST le mot dessiné.
extension StickerTemplateRenderer {

    // MARK: Les légendes — une clé LITTÉRALE par gabarit

    @MainActor private static var wowCaption: String {
        String(localized: "sticker.template.surprise.wow", defaultValue: "WOW", bundle: .module)
    }
    @MainActor private static var omgCaption: String {
        String(localized: "sticker.template.surprise.omg", defaultValue: "OMG", bundle: .module)
    }
    @MainActor private static var whatBubbleCaption: String {
        String(localized: "sticker.template.surprise.whatBubble", defaultValue: "Quoi ?!", bundle: .module)
    }
    @MainActor private static var shockBoltCaption: String {
        String(localized: "sticker.template.surprise.shockBolt", defaultValue: "Choc", bundle: .module)
    }
    @MainActor private static var noWayCaption: String {
        String(localized: "sticker.template.surprise.noWay", defaultValue: "Sans blague", bundle: .module)
    }
    @MainActor private static var unbelievableCaption: String {
        String(localized: "sticker.template.surprise.unbelievable", defaultValue: "Incroyable", bundle: .module)
    }
    @MainActor private static var mindBlownCaption: String {
        String(localized: "sticker.template.surprise.mindBlown", defaultValue: "Esprit soufflé", bundle: .module)
    }

    // MARK: - surprise.wow / surprise.omg — le mot dans un ÉCLAT

    private struct BurstLayout {
        let police: UIFont
        let taille: CGSize
    }

    @MainActor
    private static func burstLayout(caption: String, metrics: StickerTemplateMetrics) -> BurstLayout {
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.95, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(caption, font: police)
        // L'éclat est CARRÉ et enveloppe le mot : ses branches dépassent le
        // texte de chaque côté, sinon le mot sort de l'étoile.
        let côté = ceil(max(tailleTexte.width, tailleTexte.height) * 1.5 + metrics.horizontalPadding * 2)
        return BurstLayout(police: police, taille: CGSize(width: côté, height: côté))
    }

    @MainActor
    private static func burstSize(caption: String, metrics: StickerTemplateMetrics) -> CGSize {
        burstLayout(caption: caption, metrics: metrics).taille
    }

    @MainActor
    private static func burstImage(caption: String, points: Int, innerRatio: CGFloat,
                                   haut: UIColor, bas: UIColor, texte: UIColor,
                                   metrics: StickerTemplateMetrics,
                                   screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = burstLayout(caption: caption, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let éclat = StickerTemplateDrawing.burstPath(in: cadre, points: points, innerRatio: innerRatio)
            StickerTemplateDrawing.fillWithOutline(éclat, gradientFrom: haut, to: bas, in: cadre,
                                                   outline: StickerTemplatePalette.surface, width: bord)
            StickerTemplateDrawing.drawCentered(caption, font: l.police, color: texte, in: cadre)
        }
    }

    // MARK: - surprise.exclamation — le point d'exclamation tracé

    @MainActor
    static func exclamationSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 1.3), height: ceil(metrics.fontSize * 3.6))
    }

    @MainActor
    static func exclamationImage(metrics: StickerTemplateMetrics,
                                 screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = exclamationSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.07)
            let cadre = CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord)
            let cx = cadre.midX
            let point = cadre.width * 0.80
            // La barre s'AMINCIT vers le bas : à largeur constante ce serait un
            // « i » retourné, pas un point d'exclamation.
            let rayonHaut = cadre.width / 2
            let rayonBas = rayonHaut * 0.55
            let yBas = cadre.maxY - point - metrics.gap * 0.6 - rayonBas
            let barre = UIBezierPath()
            barre.addArc(withCenter: CGPoint(x: cx, y: cadre.minY + rayonHaut), radius: rayonHaut,
                         startAngle: .pi, endAngle: 0, clockwise: true)
            barre.addLine(to: CGPoint(x: cx + rayonBas, y: yBas))
            barre.addArc(withCenter: CGPoint(x: cx, y: yBas), radius: rayonBas,
                         startAngle: 0, endAngle: .pi, clockwise: true)
            barre.close()
            let cadreBarre = CGRect(x: cadre.minX, y: cadre.minY, width: cadre.width,
                                    height: yBas + rayonBas - cadre.minY)
            StickerTemplateDrawing.fillWithOutline(barre,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.loveWarm,
                                                   in: cadreBarre,
                                                   outline: StickerTemplatePalette.surface, width: bord)
            let disque = UIBezierPath(ovalIn: CGRect(x: cx - point / 2, y: cadre.maxY - point,
                                                     width: point, height: point))
            StickerTemplateDrawing.fillWithOutline(disque, fill: StickerTemplatePalette.loveWarm,
                                                   outline: StickerTemplatePalette.surface, width: bord)
        }
    }

    // MARK: - surprise.whatBubble — « Quoi ?! » dans une bulle

    private struct BubbleLayout {
        let police: UIFont
        let queue: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func bubbleLayout(caption: String, metrics: StickerTemplateMetrics) -> BubbleLayout {
        // La queue fait partie de la boîte mesurée : c'est elle que le
        // hit-test doit couvrir, pas seulement le corps.
        let queue = metrics.fontSize * 0.45
        let l = StickerTemplateDrawing.captionLayout(caption: caption, glyph: .none, metrics: metrics,
                                                     textScale: 0.85, weight: .black, extraHeight: queue)
        return BubbleLayout(police: l.police, queue: queue, taille: l.taille)
    }

    @MainActor
    static func whatBubbleSize(caption: String, metrics: StickerTemplateMetrics) -> CGSize {
        bubbleLayout(caption: caption, metrics: metrics).taille
    }

    @MainActor
    static func whatBubbleImage(caption: String, metrics: StickerTemplateMetrics,
                                screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = bubbleLayout(caption: caption, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let bulle = StickerTemplateDrawing.speechBubblePath(in: cadre, tail: l.queue)
            StickerTemplateDrawing.fillWithOutline(bulle,
                                                   gradientFrom: StickerTemplatePalette.surface,
                                                   to: StickerTemplatePalette.indigoLight,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.accent, width: bord)
            let corps = CGRect(x: cadre.minX, y: cadre.minY, width: cadre.width,
                               height: cadre.height - l.queue)
            StickerTemplateDrawing.drawCentered(caption, font: l.police,
                                                color: StickerTemplatePalette.label, in: corps)
        }
    }

    // MARK: - surprise.openMouth — la bouche en O

    @MainActor
    static func openMouthSize(metrics: StickerTemplateMetrics) -> CGSize {
        let côté = ceil(metrics.fontSize * 2.8)
        return CGSize(width: côté, height: côté)
    }

    @MainActor
    static func openMouthImage(metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = openMouthSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.07)
            let cadre = CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord)
            let visage = UIBezierPath(ovalIn: cadre)
            StickerTemplateDrawing.fillWithOutline(visage,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.loveWarm,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface, width: bord)
            let côté = cadre.width
            // Les sourcils HAUTS sont ce qui distingue la stupeur du simple
            // chant : sans eux, une bouche en O dit « oh » et non « oh ! ».
            StickerTemplatePalette.ink.setStroke()
            for x in [0.34, 0.66] as [CGFloat] {
                let centreŒil = CGPoint(x: cadre.minX + côté * x, y: cadre.minY + côté * 0.40)
                let sourcil = UIBezierPath(arcCenter: CGPoint(x: centreŒil.x, y: centreŒil.y - côté * 0.06),
                                           radius: côté * 0.11,
                                           startAngle: .pi * 1.15, endAngle: .pi * 1.85, clockwise: true)
                sourcil.lineWidth = bord
                sourcil.lineCapStyle = .round
                sourcil.stroke()
            }
            StickerTemplatePalette.ink.setFill()
            for x in [0.34, 0.66] as [CGFloat] {
                let rayon = côté * 0.085
                let centreŒil = CGPoint(x: cadre.minX + côté * x, y: cadre.minY + côté * 0.42)
                UIBezierPath(ovalIn: CGRect(x: centreŒil.x - rayon, y: centreŒil.y - rayon,
                                            width: rayon * 2, height: rayon * 2)).fill()
            }
            let bouche = CGRect(x: cadre.midX - côté * 0.13, y: cadre.minY + côté * 0.56,
                                width: côté * 0.26, height: côté * 0.32)
            UIBezierPath(ovalIn: bouche).fill()
            StickerTemplatePalette.surface.setFill()
            for x in [0.34, 0.66] as [CGFloat] {
                let reflet = côté * 0.035
                UIBezierPath(ovalIn: CGRect(x: cadre.minX + côté * x - côté * 0.045,
                                            y: cadre.minY + côté * 0.42 - côté * 0.05,
                                            width: reflet * 2, height: reflet * 2)).fill()
            }
        }
    }

    // MARK: - surprise.shockBolt — l'éclair sur cartouche encre

    private static func shockBoltPath(in r: CGRect) -> UIBezierPath {
        let éclair = UIBezierPath()
        éclair.move(to: CGPoint(x: r.minX + r.width * 0.55, y: r.minY))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.15, y: r.minY + r.height * 0.58))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.48, y: r.minY + r.height * 0.58))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.38, y: r.maxY))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.85, y: r.minY + r.height * 0.38))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.52, y: r.minY + r.height * 0.38))
        éclair.close()
        return éclair
    }

    @MainActor
    static func shockBoltSize(caption: String, metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: caption, glyph: .custom, metrics: metrics).taille
    }

    @MainActor
    static func shockBoltImage(caption: String, metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = StickerTemplateDrawing.captionLayout(caption: caption, glyph: .custom, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.3)
            StickerTemplateDrawing.fill(carte,
                                        gradientFrom: StickerTemplatePalette.night,
                                        to: StickerTemplatePalette.ink, in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.55).setStroke()
            carte.lineWidth = max(1, metrics.fontSize * 0.05)
            carte.stroke()
            let cadreÉclair = CGRect(x: metrics.horizontalPadding + l.glyphe * 0.15,
                                     y: cadre.midY - l.glyphe / 2,
                                     width: l.glyphe * 0.70, height: l.glyphe)
            StickerTemplateDrawing.fillWithOutline(Self.shockBoltPath(in: cadreÉclair),
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.loveWarm,
                                                   in: cadreÉclair,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, metrics.fontSize * 0.03))
            StickerTemplateDrawing.draw(
                caption, font: l.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: metrics.horizontalPadding + l.glyphe + metrics.gap,
                            y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    // MARK: - surprise.wideEyes — deux yeux, pas de visage

    @MainActor
    static func wideEyesSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 3.4), height: ceil(metrics.fontSize * 2.0))
    }

    @MainActor
    static func wideEyesImage(metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = wideEyesSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.07)
            let cadre = CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord)
            let largeurŒil = (cadre.width - metrics.gap) / 2
            // Les deux pupilles regardent au MÊME endroit, en haut à droite :
            // deux regards divergents feraient un loucheur, pas un surpris.
            for index in 0..<2 {
                let œil = CGRect(x: cadre.minX + CGFloat(index) * (largeurŒil + metrics.gap),
                                 y: cadre.minY, width: largeurŒil, height: cadre.height)
                StickerTemplateDrawing.fillWithOutline(UIBezierPath(ovalIn: œil),
                                                       fill: StickerTemplatePalette.surface,
                                                       outline: StickerTemplatePalette.ink, width: bord)
                let centre = CGPoint(x: œil.midX + œil.width * 0.08, y: œil.midY - œil.height * 0.05)
                let iris = œil.height * 0.50
                StickerTemplatePalette.accent.setFill()
                UIBezierPath(ovalIn: CGRect(x: centre.x - iris / 2, y: centre.y - iris / 2,
                                            width: iris, height: iris)).fill()
                let pupille = iris * 0.55
                StickerTemplatePalette.ink.setFill()
                UIBezierPath(ovalIn: CGRect(x: centre.x - pupille / 2, y: centre.y - pupille / 2,
                                            width: pupille, height: pupille)).fill()
                let reflet = pupille * 0.35
                StickerTemplatePalette.surface.setFill()
                UIBezierPath(ovalIn: CGRect(x: centre.x - pupille * 0.30, y: centre.y - pupille * 0.35,
                                            width: reflet, height: reflet)).fill()
            }
        }
    }

    // MARK: - surprise.noWay — la pastille à liseré pointillé

    @MainActor
    static func noWaySize(caption: String, metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: caption, glyph: .symbol("questionmark"),
                                             metrics: metrics).taille
    }

    @MainActor
    static func noWayImage(caption: String, metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let glyphe = StickerTemplateDrawing.Glyph.symbol("questionmark")
        let l = StickerTemplateDrawing.captionLayout(caption: caption, glyph: glyphe, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let bord = max(1, metrics.fontSize * 0.06)
            let pastille = StickerTemplateDrawing.pillPath(in: cadre.insetBy(dx: bord, dy: bord))
            StickerTemplatePalette.surface.setFill()
            pastille.fill()
            // Le pointillé dit le doute — un trait plein serait une étiquette
            // qui affirme, pas une pastille qui demande.
            pastille.setLineDash([metrics.fontSize * 0.22, metrics.fontSize * 0.14], count: 2, phase: 0)
            pastille.lineWidth = bord
            pastille.lineCapStyle = .round
            StickerTemplatePalette.loveWarm.setStroke()
            pastille.stroke()
            StickerTemplateDrawing.drawCaptionContent(l, caption: caption, glyph: glyphe, metrics: metrics,
                                                      in: cadre,
                                                      textColor: StickerTemplatePalette.label,
                                                      glyphColor: StickerTemplatePalette.loveWarm)
        }
    }

    // MARK: - surprise.unbelievable — le ruban à chevrons

    private struct RibbonLayout {
        let police: UIFont
        let queue: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func unbelievableLayout(caption: String, metrics: StickerTemplateMetrics) -> RibbonLayout {
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.85, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(caption, font: police)
        let queue = metrics.fontSize * 0.5
        let taille = CGSize(
            width: ceil(queue * 2 + metrics.horizontalPadding * 2 + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + tailleTexte.height)
        )
        return RibbonLayout(police: police, queue: queue, taille: taille)
    }

    @MainActor
    static func unbelievableSize(caption: String, metrics: StickerTemplateMetrics) -> CGSize {
        unbelievableLayout(caption: caption, metrics: metrics).taille
    }

    @MainActor
    static func unbelievableImage(caption: String, metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = unbelievableLayout(caption: caption, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.05)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let h = cadre.height, q = l.queue
            let ruban = UIBezierPath()
            ruban.move(to: CGPoint(x: cadre.minX, y: cadre.minY))
            ruban.addLine(to: CGPoint(x: cadre.maxX, y: cadre.minY))
            ruban.addLine(to: CGPoint(x: cadre.maxX - q, y: cadre.minY + h / 2))
            ruban.addLine(to: CGPoint(x: cadre.maxX, y: cadre.maxY))
            ruban.addLine(to: CGPoint(x: cadre.minX, y: cadre.maxY))
            ruban.addLine(to: CGPoint(x: cadre.minX + q, y: cadre.minY + h / 2))
            ruban.close()
            // Rose→indigo, l'inverse du ruban d'heure (indigo→violet) : deux
            // rubans de la même teinte se confondraient dans la palette.
            StickerTemplateDrawing.fillWithOutline(ruban,
                                                   gradientFrom: StickerTemplatePalette.loveWarm,
                                                   to: StickerTemplatePalette.accent,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface, width: bord)
            StickerTemplateDrawing.drawCentered(caption, font: l.police,
                                                color: StickerTemplatePalette.surface, in: cadre)
        }
    }

    // MARK: - surprise.mindBlown — la tête qui rayonne

    private struct MindBlownLayout {
        let police: UIFont
        let tailleTexte: CGSize
        let tête: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func mindBlownLayout(caption: String, metrics: StickerTemplateMetrics) -> MindBlownLayout {
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.72, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(caption, font: police)
        let tête = metrics.fontSize * 1.7
        let taille = CGSize(
            width: ceil(max(tête, tailleTexte.width) + metrics.horizontalPadding * 2),
            height: ceil(metrics.verticalPadding * 2 + tête + metrics.gap * 0.6 + tailleTexte.height)
        )
        return MindBlownLayout(police: police, tailleTexte: tailleTexte, tête: tête, taille: taille)
    }

    @MainActor
    static func mindBlownSize(caption: String, metrics: StickerTemplateMetrics) -> CGSize {
        mindBlownLayout(caption: caption, metrics: metrics).taille
    }

    @MainActor
    static func mindBlownImage(caption: String, metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = mindBlownLayout(caption: caption, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.3)
            StickerTemplateDrawing.fill(carte,
                                        gradientFrom: StickerTemplatePalette.surface,
                                        to: StickerTemplatePalette.indigoLight, in: cadre)
            StickerTemplatePalette.hairline.setStroke()
            carte.lineWidth = max(1, metrics.fontSize * 0.05)
            carte.stroke()

            // Le sommet du crâne est ABSENT — c'est lui qui est parti. Une
            // tête entière avec des rayons dirait « idée », pas « soufflé ».
            let t = CGRect(x: cadre.midX - l.tête / 2, y: metrics.verticalPadding,
                           width: l.tête, height: l.tête)
            let rayon = l.tête * 0.36
            let centre = CGPoint(x: t.midX, y: t.maxY - rayon)
            let crâne = UIBezierPath()
            crâne.move(to: CGPoint(x: centre.x + rayon, y: centre.y))
            crâne.addArc(withCenter: centre, radius: rayon, startAngle: 0, endAngle: .pi, clockwise: true)
            crâne.close()
            let cadreCrâne = CGRect(x: centre.x - rayon, y: centre.y, width: rayon * 2, height: rayon)
            StickerTemplateDrawing.fill(crâne,
                                        gradientFrom: StickerTemplatePalette.accent,
                                        to: StickerTemplatePalette.ink, in: cadreCrâne)
            Self.drawUpwardRays(center: centre, inner: rayon * 0.30, outer: rayon * 1.75, count: 7,
                                width: max(1, metrics.fontSize * 0.07),
                                color: StickerTemplatePalette.warmBulb)

            StickerTemplateDrawing.draw(
                caption, font: l.police, color: StickerTemplatePalette.label,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: t.maxY + metrics.gap * 0.6))
        }
    }

    /// Des rayons vers le HAUT seulement — un éventail de 120° au-dessus du
    /// crâne, une étincelle rose une branche sur trois.
    @MainActor
    private static func drawUpwardRays(center: CGPoint, inner: CGFloat, outer: CGFloat, count: Int,
                                       width: CGFloat, color: UIColor) {
        let pas = 1 / CGFloat(max(1, count - 1))
        for index in 0..<count {
            let angle = -CGFloat.pi * (1 / 6 + 2 / 3 * CGFloat(index) * pas)
            let trait = UIBezierPath()
            trait.move(to: CGPoint(x: center.x + cos(angle) * inner, y: center.y + sin(angle) * inner))
            trait.addLine(to: CGPoint(x: center.x + cos(angle) * outer, y: center.y + sin(angle) * outer))
            trait.lineWidth = width
            trait.lineCapStyle = .round
            color.setStroke()
            trait.stroke()
            guard index % 3 == 0 else { continue }
            let étincelle = CGPoint(x: center.x + cos(angle) * (outer + width * 1.6),
                                    y: center.y + sin(angle) * (outer + width * 1.6))
            StickerTemplatePalette.loveWarm.setFill()
            UIBezierPath(ovalIn: CGRect(x: étincelle.x - width, y: étincelle.y - width,
                                        width: width * 2, height: width * 2)).fill()
        }
    }

    // MARK: - Le registre de la famille STUPEUR

    static let surpriseDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseWow,
            name: { Self.wowCaption },
            measure: { _, m in Self.burstSize(caption: Self.wowCaption, metrics: m) },
            draw: { _, m, échelle in
                Self.burstImage(caption: Self.wowCaption, points: 12, innerRatio: 0.80,
                                haut: StickerTemplatePalette.warmBulb, bas: StickerTemplatePalette.loveWarm,
                                texte: StickerTemplatePalette.surface, metrics: m, screenScale: échelle)
            }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseOmg,
            name: { Self.omgCaption },
            measure: { _, m in Self.burstSize(caption: Self.omgCaption, metrics: m) },
            draw: { _, m, échelle in
                Self.burstImage(caption: Self.omgCaption, points: 8, innerRatio: 0.70,
                                haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.loveCool,
                                texte: StickerTemplatePalette.warmBulb, metrics: m, screenScale: échelle)
            }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseExclamation,
            name: { String(localized: "sticker.template.surprise.exclamation", defaultValue: "!", bundle: .module) },
            measure: { _, m in Self.exclamationSize(metrics: m) },
            draw: { _, m, échelle in Self.exclamationImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseWhatBubble,
            name: { Self.whatBubbleCaption },
            measure: { _, m in Self.whatBubbleSize(caption: Self.whatBubbleCaption, metrics: m) },
            draw: { _, m, échelle in
                Self.whatBubbleImage(caption: Self.whatBubbleCaption, metrics: m, screenScale: échelle)
            }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseOpenMouth,
            name: { String(localized: "sticker.template.surprise.openMouth", defaultValue: "Bouche bée", bundle: .module) },
            measure: { _, m in Self.openMouthSize(metrics: m) },
            draw: { _, m, échelle in Self.openMouthImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseShockBolt,
            name: { Self.shockBoltCaption },
            measure: { _, m in Self.shockBoltSize(caption: Self.shockBoltCaption, metrics: m) },
            draw: { _, m, échelle in
                Self.shockBoltImage(caption: Self.shockBoltCaption, metrics: m, screenScale: échelle)
            }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseWideEyes,
            name: { String(localized: "sticker.template.surprise.wideEyes", defaultValue: "Yeux écarquillés", bundle: .module) },
            measure: { _, m in Self.wideEyesSize(metrics: m) },
            draw: { _, m, échelle in Self.wideEyesImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseNoWay,
            name: { Self.noWayCaption },
            measure: { _, m in Self.noWaySize(caption: Self.noWayCaption, metrics: m) },
            draw: { _, m, échelle in
                Self.noWayImage(caption: Self.noWayCaption, metrics: m, screenScale: échelle)
            }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseUnbelievable,
            name: { Self.unbelievableCaption },
            measure: { _, m in Self.unbelievableSize(caption: Self.unbelievableCaption, metrics: m) },
            draw: { _, m, échelle in
                Self.unbelievableImage(caption: Self.unbelievableCaption, metrics: m, screenScale: échelle)
            }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.surpriseMindBlown,
            name: { Self.mindBlownCaption },
            measure: { _, m in Self.mindBlownSize(caption: Self.mindBlownCaption, metrics: m) },
            draw: { _, m, échelle in
                Self.mindBlownImage(caption: Self.mindBlownCaption, metrics: m, screenScale: échelle)
            }),
    ]
}
