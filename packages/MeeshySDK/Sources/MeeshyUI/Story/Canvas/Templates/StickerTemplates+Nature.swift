import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de NATURE & ANIMAUX (#4820)

/// La nature se reconnaît à sa SILHOUETTE : cinq glyphes nus tracés à la main
/// — une fleur, un papillon, une feuille, un cactus, un arc-en-ciel — et cinq
/// cartouches dont la FORME dit le sujet : une bulle qui miaule, un os qui
/// aboie, un timbre de sommet, une carte de plage, une capsule de nuit. La
/// palette est celle de la marque — `leaf` pour ce qui pousse, `warmBulb` pour
/// ce qui brille, `surface` en liseré pour se détacher d'une photo sombre.
extension StickerTemplateRenderer {

    // MARK: - Le socle des glyphes nus

    /// Les cinq silhouettes sans mot, et le rapport largeur/hauteur de chacune.
    /// Le rapport vit ICI, une fois : la mesure et le dessin le lisent tous les
    /// deux, donc ne peuvent pas diverger.
    private enum NatureSilhouette {
        case flower, butterfly, leaf, cactus, rainbow

        var ratio: CGFloat {
            switch self {
            case .flower, .leaf: return 1.0
            case .butterfly: return 1.15
            case .cactus: return 0.82
            case .rainbow: return 1.4
            }
        }
    }

    /// Un cadre de `fontSize × 3` de haut, comme les visages de la JOIE, et
    /// son liseré. Seule la largeur change d'une silhouette à l'autre.
    private struct NatureFrame {
        let taille: CGSize
        let cadre: CGRect
        let bord: CGFloat
    }

    @MainActor
    private static func natureFrame(for silhouette: NatureSilhouette,
                                    metrics: StickerTemplateMetrics) -> NatureFrame {
        let côté = ceil(metrics.fontSize * 3.0)
        let bord = max(1.5, metrics.fontSize * 0.08)
        let taille = CGSize(width: ceil(côté * silhouette.ratio), height: côté)
        return NatureFrame(taille: taille,
                           cadre: CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord),
                           bord: bord)
    }

    private static let deuxCôtés: [CGFloat] = [-1, 1]

    /// Un ovale centré sur `centre` et tourné de `angle` — un pétale, une aile.
    private static func petalPath(center centre: CGPoint, size: CGSize, angle: CGFloat) -> UIBezierPath {
        let chemin = UIBezierPath(ovalIn: CGRect(x: -size.width / 2, y: -size.height / 2,
                                                 width: size.width, height: size.height))
        chemin.apply(CGAffineTransform(rotationAngle: angle))
        chemin.apply(CGAffineTransform(translationX: centre.x, y: centre.y))
        return chemin
    }

    private static func rotate(_ chemin: UIBezierPath, by angle: CGFloat, around centre: CGPoint) {
        chemin.apply(CGAffineTransform(translationX: -centre.x, y: -centre.y))
        chemin.apply(CGAffineTransform(rotationAngle: angle))
        chemin.apply(CGAffineTransform(translationX: centre.x, y: centre.y))
    }

    @MainActor
    private static func outline(_ chemin: UIBezierPath, width: CGFloat, color: UIColor) {
        color.setStroke()
        chemin.lineWidth = width
        chemin.lineJoinStyle = .round
        chemin.stroke()
    }

    // MARK: - nature.flower — la fleur qui s'ouvre

    @MainActor
    private static func flowerImage(metrics: StickerTemplateMetrics,
                                    screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = natureFrame(for: .flower, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let centre = CGPoint(x: f.cadre.midX, y: f.cadre.midY)
            let rayon = f.cadre.width / 2
            // Six pétales dans UN tracé : un seul liseré, et le dégradé haut→bas
            // du cadre teinte ceux du haut plus froids que ceux du bas.
            let pétales = UIBezierPath()
            for index in 0..<6 {
                let angle = CGFloat(index) * .pi / 3
                pétales.append(Self.petalPath(
                    center: CGPoint(x: centre.x + sin(angle) * rayon * 0.52,
                                    y: centre.y - cos(angle) * rayon * 0.52),
                    size: CGSize(width: rayon * 0.56, height: rayon * 0.96),
                    angle: angle))
            }
            StickerTemplateDrawing.fillWithOutline(pétales,
                                                   gradientFrom: StickerTemplatePalette.loveCool,
                                                   to: StickerTemplatePalette.loveWarm,
                                                   in: f.cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            let cœur = UIBezierPath(arcCenter: centre, radius: rayon * 0.30,
                                    startAngle: 0, endAngle: .pi * 2, clockwise: true)
            StickerTemplatePalette.warmBulb.setFill()
            cœur.fill()
            Self.outline(cœur, width: f.bord * 0.8, color: StickerTemplatePalette.surface)
        }
    }

    // MARK: - nature.butterfly — le papillon

    @MainActor
    private static func butterflyImage(metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = natureFrame(for: .butterfly, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let centre = CGPoint(x: f.cadre.midX, y: f.cadre.midY + f.cadre.height * 0.04)
            let r = f.cadre.height / 2
            // Quatre ailes en ovales inclinés — les hautes s'évasent vers le
            // haut, les basses vers le bas — dans un seul tracé.
            let ailes = UIBezierPath()
            for côté in Self.deuxCôtés {
                ailes.append(Self.petalPath(
                    center: CGPoint(x: centre.x + côté * r * 0.46, y: centre.y - r * 0.30),
                    size: CGSize(width: r * 0.62, height: r * 0.96),
                    angle: côté * .pi * 0.22))
                ailes.append(Self.petalPath(
                    center: CGPoint(x: centre.x + côté * r * 0.36, y: centre.y + r * 0.40),
                    size: CGSize(width: r * 0.50, height: r * 0.66),
                    angle: -côté * .pi * 0.18))
            }
            StickerTemplateDrawing.fillWithOutline(ailes,
                                                   gradientFrom: StickerTemplatePalette.sky,
                                                   to: StickerTemplatePalette.loveCool,
                                                   in: f.cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            // Un ocelle clair par aile haute : sans lui, deux ovales bleus.
            StickerTemplatePalette.surface.withAlphaComponent(0.85).setFill()
            let ocelle = r * 0.16
            for côté in Self.deuxCôtés {
                UIBezierPath(ovalIn: CGRect(x: centre.x + côté * r * 0.52 - ocelle / 2,
                                            y: centre.y - r * 0.42 - ocelle / 2,
                                            width: ocelle, height: ocelle)).fill()
            }
            let corps = StickerTemplateDrawing.pillPath(
                in: CGRect(x: centre.x - r * 0.09, y: centre.y - r * 0.55,
                           width: r * 0.18, height: r * 1.20))
            StickerTemplatePalette.night.setFill()
            corps.fill()
            Self.outline(corps, width: f.bord * 0.6, color: StickerTemplatePalette.surface)
            let antennes = UIBezierPath()
            for côté in Self.deuxCôtés {
                antennes.move(to: CGPoint(x: centre.x, y: centre.y - r * 0.55))
                antennes.addQuadCurve(to: CGPoint(x: centre.x + côté * r * 0.30, y: centre.y - r * 0.92),
                                      controlPoint: CGPoint(x: centre.x + côté * r * 0.05,
                                                            y: centre.y - r * 0.85))
            }
            antennes.lineWidth = f.bord * 0.6
            antennes.lineCapStyle = .round
            StickerTemplatePalette.night.setStroke()
            antennes.stroke()
        }
    }

    // MARK: - nature.leaf — la feuille d'automne

    /// Une feuille inscrite dans `rect`, pointe en haut, base en bas.
    private static func leafPath(in rect: CGRect) -> UIBezierPath {
        let pointe = CGPoint(x: rect.midX, y: rect.minY)
        let base = CGPoint(x: rect.midX, y: rect.maxY)
        let chemin = UIBezierPath()
        chemin.move(to: pointe)
        chemin.addCurve(to: base,
                        controlPoint1: CGPoint(x: rect.maxX + rect.width * 0.15, y: rect.minY + rect.height * 0.25),
                        controlPoint2: CGPoint(x: rect.maxX, y: rect.maxY - rect.height * 0.10))
        chemin.addCurve(to: pointe,
                        controlPoint1: CGPoint(x: rect.minX, y: rect.maxY - rect.height * 0.10),
                        controlPoint2: CGPoint(x: rect.minX - rect.width * 0.15, y: rect.minY + rect.height * 0.25))
        chemin.close()
        return chemin
    }

    @MainActor
    private static func leafImage(metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = natureFrame(for: .leaf, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let centre = CGPoint(x: f.cadre.midX, y: f.cadre.midY)
            let limbe = f.cadre.insetBy(dx: f.cadre.width * 0.22, dy: f.cadre.height * 0.10)
            // Inclinée : une feuille droite est un logo, une feuille penchée tombe.
            let angle = -CGFloat.pi * 0.16
            let feuille = Self.leafPath(in: limbe)
            Self.rotate(feuille, by: angle, around: centre)
            StickerTemplateDrawing.fillWithOutline(feuille,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: f.cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            let nervures = UIBezierPath()
            nervures.move(to: CGPoint(x: limbe.midX, y: limbe.minY + limbe.height * 0.08))
            nervures.addLine(to: CGPoint(x: limbe.midX, y: limbe.maxY))
            for rang in 1...3 {
                let y = limbe.minY + limbe.height * (0.22 + 0.20 * CGFloat(rang))
                let portée = limbe.width * (0.34 - 0.06 * CGFloat(rang))
                for côté in Self.deuxCôtés {
                    nervures.move(to: CGPoint(x: limbe.midX, y: y))
                    nervures.addLine(to: CGPoint(x: limbe.midX + côté * portée, y: y - limbe.height * 0.10))
                }
            }
            Self.rotate(nervures, by: angle, around: centre)
            nervures.lineWidth = f.bord * 0.5
            nervures.lineCapStyle = .round
            StickerTemplatePalette.surface.withAlphaComponent(0.8).setStroke()
            nervures.stroke()
        }
    }

    // MARK: - nature.cat — la bulle qui miaule

    /// Le nom du gabarit est « Chat » ; ce qui est DESSINÉ est le cri — d'où
    /// la seconde clé `.caption`.
    @MainActor
    private static var catCaption: String {
        String(localized: "sticker.template.nature.cat.caption", defaultValue: "Miaou", bundle: .module)
    }

    private struct BubbleLayout {
        let légende: String
        let cartouche: StickerTemplateDrawing.CaptionLayout
        let queue: CGFloat
    }

    @MainActor
    private static func catLayout(metrics: StickerTemplateMetrics) -> BubbleLayout {
        let légende = catCaption
        let queue = ceil(metrics.verticalPadding * 1.3)
        let cartouche = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                             metrics: metrics, extraHeight: queue)
        return BubbleLayout(légende: légende, cartouche: cartouche, queue: queue)
    }

    /// Une tête de chat — un disque, deux oreilles, les yeux, le nez, six
    /// moustaches. Tracée, pas empruntée : un emoji chat change de dessin
    /// d'une version d'iOS à l'autre.
    @MainActor
    private static func catHead(in r: CGRect, bord: CGFloat) {
        let centre = CGPoint(x: r.midX, y: r.midY + r.height * 0.08)
        let rayon = r.width * 0.40
        let tête = UIBezierPath()
        for côté in Self.deuxCôtés {
            // L'oreille gauche est tracée dans l'ordre INVERSE de la droite :
            // un triangle miroir tourne à l'envers, et sous la règle du
            // nombre d'enroulements il creuserait un trou dans le disque.
            let sommets = [CGPoint(x: centre.x + côté * rayon * 0.35, y: centre.y - rayon * 0.85),
                           CGPoint(x: centre.x + côté * rayon * 0.80, y: centre.y - rayon * 1.30),
                           CGPoint(x: centre.x + côté * rayon * 0.95, y: centre.y - rayon * 0.30)]
            let ordonnés = côté > 0 ? sommets : sommets.reversed()
            let oreille = UIBezierPath()
            oreille.move(to: ordonnés[0])
            oreille.addLine(to: ordonnés[1])
            oreille.addLine(to: ordonnés[2])
            oreille.close()
            tête.append(oreille)
        }
        tête.append(UIBezierPath(arcCenter: centre, radius: rayon,
                                 startAngle: 0, endAngle: .pi * 2, clockwise: true))
        StickerTemplateDrawing.fillWithOutline(tête, fill: StickerTemplatePalette.warmBulb,
                                               outline: StickerTemplatePalette.surface, width: bord)
        StickerTemplatePalette.night.setFill()
        let œil = rayon * 0.13
        for côté in Self.deuxCôtés {
            UIBezierPath(ovalIn: CGRect(x: centre.x + côté * rayon * 0.38 - œil,
                                        y: centre.y - rayon * 0.22 - œil * 1.3,
                                        width: œil * 2, height: œil * 2.6)).fill()
        }
        let nez = UIBezierPath()
        nez.move(to: CGPoint(x: centre.x - rayon * 0.14, y: centre.y + rayon * 0.12))
        nez.addLine(to: CGPoint(x: centre.x + rayon * 0.14, y: centre.y + rayon * 0.12))
        nez.addLine(to: CGPoint(x: centre.x, y: centre.y + rayon * 0.32))
        nez.close()
        StickerTemplatePalette.pin.setFill()
        nez.fill()
        let moustaches = UIBezierPath()
        for côté in Self.deuxCôtés {
            for rang in -1...1 {
                moustaches.move(to: CGPoint(x: centre.x + côté * rayon * 0.30, y: centre.y + rayon * 0.30))
                moustaches.addLine(to: CGPoint(x: centre.x + côté * rayon * 1.05,
                                               y: centre.y + rayon * (0.20 + 0.18 * CGFloat(rang))))
            }
        }
        moustaches.lineWidth = max(1, bord * 0.4)
        moustaches.lineCapStyle = .round
        StickerTemplatePalette.night.setStroke()
        moustaches.stroke()
    }

    @MainActor
    private static func catImage(metrics: StickerTemplateMetrics,
                                 screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = catLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.cartouche.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.cartouche.taille).insetBy(dx: bord, dy: bord)
            let bulle = StickerTemplateDrawing.speechBubblePath(in: cadre, tail: l.queue)
            StickerTemplateDrawing.fillWithOutline(bulle,
                                                   gradientFrom: StickerTemplatePalette.lilac,
                                                   to: StickerTemplatePalette.accent,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            let corps = CGRect(x: cadre.minX, y: cadre.minY, width: cadre.width, height: cadre.height - l.queue)
            let tête = CGRect(x: metrics.horizontalPadding, y: corps.midY - l.cartouche.glyphe / 2,
                              width: l.cartouche.glyphe, height: l.cartouche.glyphe)
            Self.catHead(in: tête, bord: bord)
            StickerTemplateDrawing.draw(
                l.légende, font: l.cartouche.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: tête.maxX + metrics.gap,
                            y: corps.midY - l.cartouche.tailleTexte.height / 2))
        }
    }

    // MARK: - nature.dog — l'os qui aboie

    @MainActor
    private static var dogCaption: String {
        String(localized: "sticker.template.nature.dog.caption", defaultValue: "Wouf", bundle: .module)
    }

    private struct BoneLayout {
        let légende: String
        let cartouche: StickerTemplateDrawing.CaptionLayout
        /// Le rayon des quatre têtes de l'os, qui débordent la barre.
        let tête: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func dogLayout(metrics: StickerTemplateMetrics) -> BoneLayout {
        let légende = dogCaption
        let cartouche = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom, metrics: metrics)
        let tête = cartouche.taille.height * 0.26
        return BoneLayout(légende: légende, cartouche: cartouche, tête: tête,
                          taille: CGSize(width: ceil(cartouche.taille.width + tête * 2),
                                         height: cartouche.taille.height))
    }

    /// Un os : une barre et quatre têtes rondes, dans un seul tracé.
    private static func bonePath(in rect: CGRect, head tête: CGFloat) -> UIBezierPath {
        let chemin = UIBezierPath(
            roundedRect: CGRect(x: rect.minX + tête, y: rect.minY + rect.height * 0.18,
                                width: rect.width - tête * 2, height: rect.height * 0.64),
            cornerRadius: rect.height * 0.20)
        for x in [rect.minX + tête, rect.maxX - tête] {
            for y in [rect.minY + tête, rect.maxY - tête] {
                chemin.append(UIBezierPath(ovalIn: CGRect(x: x - tête, y: y - tête,
                                                          width: tête * 2, height: tête * 2)))
            }
        }
        return chemin
    }

    /// Une empreinte : un coussinet et quatre doigts en arc.
    @MainActor
    private static func pawPrint(in r: CGRect, color: UIColor) {
        color.setFill()
        UIBezierPath(ovalIn: CGRect(x: r.minX + r.width * 0.20, y: r.minY + r.height * 0.48,
                                    width: r.width * 0.60, height: r.height * 0.48)).fill()
        let doigt = CGSize(width: r.width * 0.22, height: r.height * 0.28)
        let positions = [CGPoint(x: 0.12, y: 0.30), CGPoint(x: 0.36, y: 0.06),
                         CGPoint(x: 0.64, y: 0.06), CGPoint(x: 0.88, y: 0.30)]
        for position in positions {
            UIBezierPath(ovalIn: CGRect(x: r.minX + r.width * position.x - doigt.width / 2,
                                        y: r.minY + r.height * position.y,
                                        width: doigt.width, height: doigt.height)).fill()
        }
    }

    @MainActor
    private static func dogImage(metrics: StickerTemplateMetrics,
                                 screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = dogLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let os = Self.bonePath(in: cadre, head: l.tête)
            // L'os est clair : son liseré est indigo, un liseré clair n'y
            // laisserait rien à voir.
            StickerTemplateDrawing.fillWithOutline(os,
                                                   gradientFrom: StickerTemplatePalette.surface,
                                                   to: StickerTemplatePalette.indigoLight,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.lilac,
                                                   width: bord)
            let patte = CGRect(x: cadre.minX + l.tête + metrics.horizontalPadding - bord,
                               y: cadre.midY - l.cartouche.glyphe * 0.42,
                               width: l.cartouche.glyphe * 0.84, height: l.cartouche.glyphe * 0.84)
            Self.pawPrint(in: patte, color: StickerTemplatePalette.night)
            StickerTemplateDrawing.draw(
                l.légende, font: l.cartouche.police, color: StickerTemplatePalette.night,
                at: CGPoint(x: cadre.minX + l.tête + metrics.horizontalPadding - bord
                                + l.cartouche.glyphe + metrics.gap,
                            y: cadre.midY - l.cartouche.tailleTexte.height / 2))
        }
    }

    // MARK: - nature.mountain — le timbre du sommet

    @MainActor
    private static var mountainCaption: String {
        String(localized: "sticker.template.nature.mountain.caption", defaultValue: "Sommet", bundle: .module)
    }

    private struct StampLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        /// Le rayon d'une dent de la perforation.
        let dent: CGFloat
        let scène: CGRect
        let taille: CGSize
    }

    @MainActor
    private static func mountainLayout(metrics: StickerTemplateMetrics) -> StampLayout {
        let légende = mountainCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.62, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let dent = metrics.fontSize * 0.14
        let marge = dent * 2.4
        let scèneLargeur = max(metrics.fontSize * 3.0, tailleTexte.width + metrics.horizontalPadding)
        let scèneHauteur = metrics.fontSize * 1.9
        let taille = CGSize(width: ceil(scèneLargeur + marge * 2),
                            height: ceil(marge * 2 + scèneHauteur + metrics.gap * 0.6 + tailleTexte.height))
        return StampLayout(légende: légende, police: police, tailleTexte: tailleTexte, dent: dent,
                           scène: CGRect(x: marge, y: marge,
                                         width: taille.width - marge * 2, height: scèneHauteur),
                           taille: taille)
    }

    /// Un timbre : un rectangle dont chaque bord est dentelé de demi-disques
    /// CREUX. Les arcs sont tracés dans le sens inverse des aiguilles — c'est
    /// ce qui les fait mordre vers l'intérieur plutôt que bomber dehors.
    private static func stampPath(in rect: CGRect, tooth dent: CGFloat) -> UIBezierPath {
        let pas = dent * 2.6
        let colonnes = max(2, Int(rect.width / pas))
        let rangées = max(2, Int(rect.height / pas))
        let dx = rect.width / CGFloat(colonnes)
        let dy = rect.height / CGFloat(rangées)
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: rect.minX, y: rect.minY))
        for index in 0..<colonnes {
            chemin.addArc(withCenter: CGPoint(x: rect.minX + dx * (CGFloat(index) + 0.5), y: rect.minY),
                          radius: dent, startAngle: .pi, endAngle: 0, clockwise: false)
        }
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        for index in 0..<rangées {
            chemin.addArc(withCenter: CGPoint(x: rect.maxX, y: rect.minY + dy * (CGFloat(index) + 0.5)),
                          radius: dent, startAngle: -CGFloat.pi / 2, endAngle: CGFloat.pi / 2, clockwise: false)
        }
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        for index in 0..<colonnes {
            chemin.addArc(withCenter: CGPoint(x: rect.maxX - dx * (CGFloat(index) + 0.5), y: rect.maxY),
                          radius: dent, startAngle: 0, endAngle: .pi, clockwise: false)
        }
        chemin.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        for index in 0..<rangées {
            chemin.addArc(withCenter: CGPoint(x: rect.minX, y: rect.maxY - dy * (CGFloat(index) + 0.5)),
                          radius: dent, startAngle: CGFloat.pi / 2, endAngle: -CGFloat.pi / 2, clockwise: false)
        }
        chemin.close()
        return chemin
    }

    /// Un mont sous sa neige — un triangle, et un zigzag dont les pointes
    /// tombent exactement sur les arêtes.
    @MainActor
    private static func mount(in r: CGRect, haut: UIColor, bas: UIColor) {
        let sommet = CGPoint(x: r.midX, y: r.minY)
        let mont = UIBezierPath()
        mont.move(to: CGPoint(x: r.minX, y: r.maxY))
        mont.addLine(to: sommet)
        mont.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        mont.close()
        StickerTemplateDrawing.fill(mont, gradientFrom: haut, to: bas, in: r)
        let demi = r.width / 2
        let profondeur: CGFloat = 0.30
        let neige = UIBezierPath()
        neige.move(to: sommet)
        neige.addLine(to: CGPoint(x: sommet.x + demi * profondeur, y: r.minY + r.height * profondeur))
        neige.addLine(to: CGPoint(x: sommet.x + demi * profondeur * 0.5, y: r.minY + r.height * profondeur * 0.75))
        neige.addLine(to: CGPoint(x: sommet.x, y: r.minY + r.height * profondeur * 1.05))
        neige.addLine(to: CGPoint(x: sommet.x - demi * profondeur * 0.5, y: r.minY + r.height * profondeur * 0.75))
        neige.addLine(to: CGPoint(x: sommet.x - demi * profondeur, y: r.minY + r.height * profondeur))
        neige.close()
        StickerTemplatePalette.surface.setFill()
        neige.fill()
    }

    @MainActor
    private static func mountainImage(metrics: StickerTemplateMetrics,
                                      screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = mountainLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.05)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let timbre = Self.stampPath(in: cadre, tooth: l.dent)
            StickerTemplateDrawing.fillWithOutline(timbre,
                                                   gradientFrom: StickerTemplatePalette.surface,
                                                   to: StickerTemplatePalette.indigoLight,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.hairline,
                                                   width: bord)
            // Le cadre intérieur en trait fin : c'est lui qui fait un TIMBRE
            // plutôt qu'une carte crénelée.
            let intérieur = UIBezierPath(rect: cadre.insetBy(dx: l.dent * 1.7, dy: l.dent * 1.7))
            intérieur.lineWidth = max(1, bord * 0.5)
            StickerTemplatePalette.hairline.setStroke()
            intérieur.stroke()

            let scène = l.scène
            StickerTemplateDrawing.fill(UIBezierPath(rect: scène),
                                        gradientFrom: StickerTemplatePalette.sky,
                                        to: StickerTemplatePalette.surface, in: scène)
            let soleil = scène.height * 0.24
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(ovalIn: CGRect(x: scène.minX + scène.width * 0.10, y: scène.minY + scène.height * 0.12,
                                        width: soleil, height: soleil)).fill()
            Self.mount(in: CGRect(x: scène.minX + scène.width * 0.30, y: scène.minY + scène.height * 0.28,
                                  width: scène.width * 0.62, height: scène.height * 0.72),
                       haut: StickerTemplatePalette.lilac, bas: StickerTemplatePalette.indigoLight)
            Self.mount(in: CGRect(x: scène.minX + scène.width * 0.02, y: scène.minY + scène.height * 0.40,
                                  width: scène.width * 0.62, height: scène.height * 0.60),
                       haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.night)
            StickerTemplateDrawing.drawCentered(
                l.légende, font: l.police, color: StickerTemplatePalette.label,
                in: CGRect(x: cadre.minX, y: scène.maxY + metrics.gap * 0.6,
                           width: cadre.width, height: l.tailleTexte.height))
        }
    }

    // MARK: - nature.wave — la carte de plage

    @MainActor
    private static var waveCaption: String {
        String(localized: "sticker.template.nature.wave.caption", defaultValue: "À la plage", bundle: .module)
    }

    private struct SeaLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        let taille: CGSize
    }

    @MainActor
    private static func waveLayout(metrics: StickerTemplateMetrics) -> SeaLayout {
        let légende = waveCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.68, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let taille = CGSize(
            width: ceil(max(metrics.fontSize * 3.4, tailleTexte.width + metrics.horizontalPadding * 2)),
            height: ceil(metrics.fontSize * 1.6 + tailleTexte.height + metrics.verticalPadding * 1.5))
        return SeaLayout(légende: légende, police: police, tailleTexte: tailleTexte, taille: taille)
    }

    /// Une houle : une ligne de crêtes en quarts d'onde. Fermée jusqu'au bas
    /// du cadre pour être remplie ; ouverte pour n'en tracer que l'écume.
    private static func swellPath(in r: CGRect, crest crête: CGFloat, amplitude: CGFloat,
                                  crests: Int, up: Bool, closed: Bool) -> UIBezierPath {
        let segments = crests * 2
        let largeur = r.width / CGFloat(segments)
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: r.minX, y: crête))
        for index in 0..<segments {
            let x0 = r.minX + largeur * CGFloat(index)
            let sens: CGFloat = (index % 2 == 0) == up ? -1 : 1
            chemin.addQuadCurve(to: CGPoint(x: x0 + largeur, y: crête),
                                controlPoint: CGPoint(x: x0 + largeur / 2, y: crête + sens * amplitude * 2))
        }
        guard closed else { return chemin }
        chemin.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        chemin.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        chemin.close()
        return chemin
    }

    @MainActor
    private static func waveImage(metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = waveLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.45)
            StickerTemplateDrawing.fill(carte, gradientFrom: StickerTemplatePalette.surface,
                                        to: StickerTemplatePalette.sky, in: cadre)
            guard let contexte = UIGraphicsGetCurrentContext() else { return }
            // Soleil et houles sont DÉCOUPÉS par la carte : une vague qui
            // dépasse ses coins arrondis serait une carte cassée.
            contexte.saveGState()
            carte.addClip()
            let soleil = metrics.fontSize * 0.55
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(ovalIn: CGRect(x: cadre.maxX - soleil - metrics.horizontalPadding * 0.6,
                                        y: cadre.minY + metrics.verticalPadding * 0.5,
                                        width: soleil, height: soleil)).fill()
            let amplitude = metrics.fontSize * 0.12
            StickerTemplatePalette.lilac.setFill()
            Self.swellPath(in: cadre, crest: cadre.minY + metrics.fontSize * 1.0, amplitude: amplitude,
                           crests: 3, up: true, closed: true).fill()
            StickerTemplatePalette.accent.setFill()
            Self.swellPath(in: cadre, crest: cadre.minY + metrics.fontSize * 1.38, amplitude: amplitude,
                           crests: 3, up: false, closed: true).fill()
            let écume = Self.swellPath(in: cadre, crest: cadre.minY + metrics.fontSize * 1.38,
                                       amplitude: amplitude, crests: 3, up: false, closed: false)
            écume.lineWidth = max(1, bord * 0.6)
            StickerTemplatePalette.surface.withAlphaComponent(0.7).setStroke()
            écume.stroke()
            contexte.restoreGState()
            Self.outline(carte, width: bord, color: StickerTemplatePalette.surface)
            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: cadre.midX - l.tailleTexte.width / 2,
                            y: cadre.maxY - metrics.verticalPadding * 0.75 - l.tailleTexte.height))
        }
    }

    // MARK: - nature.moon — la capsule de nuit

    @MainActor
    private static var moonCaption: String {
        String(localized: "sticker.template.nature.moon.caption", defaultValue: "Bonne nuit", bundle: .module)
    }

    private struct PillLayout {
        let légende: String
        let cartouche: StickerTemplateDrawing.CaptionLayout
    }

    @MainActor
    private static func moonLayout(metrics: StickerTemplateMetrics) -> PillLayout {
        let légende = moonCaption
        return PillLayout(légende: légende,
                          cartouche: StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                                          metrics: metrics))
    }

    /// Un croissant et trois étoiles à quatre branches. Le croissant est
    /// TRACÉ — un demi-disque, et une courbe qui le creuse — pas un glyphe.
    @MainActor
    private static func crescentAndStars(in r: CGRect, bord: CGFloat) {
        let rayon = r.height * 0.40
        let centre = CGPoint(x: r.minX + r.width * 0.40, y: r.midY)
        let pointe = CGPoint(x: centre.x, y: centre.y - rayon)
        let croissant = UIBezierPath()
        croissant.move(to: pointe)
        croissant.addArc(withCenter: centre, radius: rayon,
                         startAngle: -CGFloat.pi / 2, endAngle: CGFloat.pi / 2, clockwise: false)
        croissant.addCurve(to: pointe,
                           controlPoint1: CGPoint(x: centre.x - rayon * 0.55, y: centre.y + rayon * 0.80),
                           controlPoint2: CGPoint(x: centre.x - rayon * 0.55, y: centre.y - rayon * 0.80))
        croissant.close()
        StickerTemplatePalette.warmBulb.setFill()
        croissant.fill()
        Self.outline(croissant, width: bord * 0.7, color: StickerTemplatePalette.surface)
        let étoiles: [(CGPoint, CGFloat)] = [
            (CGPoint(x: r.minX + r.width * 0.80, y: r.minY + r.height * 0.22), r.height * 0.26),
            (CGPoint(x: r.minX + r.width * 0.90, y: r.minY + r.height * 0.58), r.height * 0.18),
            (CGPoint(x: r.minX + r.width * 0.66, y: r.minY + r.height * 0.84), r.height * 0.20),
        ]
        StickerTemplatePalette.surface.setFill()
        for (position, côté) in étoiles {
            StickerTemplateDrawing.starPath(
                in: CGRect(x: position.x - côté / 2, y: position.y - côté / 2, width: côté, height: côté),
                points: 4, innerRatio: 0.38).fill()
        }
    }

    @MainActor
    private static func moonImage(metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = moonLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.cartouche.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.cartouche.taille).insetBy(dx: bord, dy: bord)
            StickerTemplateDrawing.fillWithOutline(StickerTemplateDrawing.pillPath(in: cadre),
                                                   gradientFrom: StickerTemplatePalette.night,
                                                   to: StickerTemplatePalette.accent,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            let glyphe = CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.cartouche.glyphe / 2,
                                width: l.cartouche.glyphe, height: l.cartouche.glyphe)
            Self.crescentAndStars(in: glyphe, bord: bord)
            StickerTemplateDrawing.draw(
                l.légende, font: l.cartouche.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: glyphe.maxX + metrics.gap,
                            y: cadre.midY - l.cartouche.tailleTexte.height / 2))
        }
    }

    // MARK: - nature.cactus — le cactus en pot

    @MainActor
    private static func cactusImage(metrics: StickerTemplateMetrics,
                                    screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = natureFrame(for: .cactus, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let l = r.width, h = r.height
            let pot = UIBezierPath()
            pot.move(to: CGPoint(x: r.minX + l * 0.22, y: r.minY + h * 0.78))
            pot.addLine(to: CGPoint(x: r.maxX - l * 0.22, y: r.minY + h * 0.78))
            pot.addLine(to: CGPoint(x: r.maxX - l * 0.27, y: r.maxY))
            pot.addLine(to: CGPoint(x: r.minX + l * 0.27, y: r.maxY))
            pot.close()
            pot.append(UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.17, y: r.minY + h * 0.72,
                                                        width: l * 0.66, height: h * 0.10),
                                    cornerRadius: h * 0.02))
            StickerTemplateDrawing.fillWithOutline(pot,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            // Le tronc et deux bras — cinq capsules dans UN tracé, pour un
            // seul liseré autour de la silhouette.
            let cactus = StickerTemplateDrawing.pillPath(
                in: CGRect(x: r.midX - l * 0.17, y: r.minY + h * 0.14, width: l * 0.34, height: h * 0.62))
            cactus.append(StickerTemplateDrawing.pillPath(
                in: CGRect(x: r.minX + l * 0.06, y: r.minY + h * 0.30, width: l * 0.20, height: h * 0.30)))
            cactus.append(UIBezierPath(roundedRect: CGRect(x: r.minX + l * 0.06, y: r.minY + h * 0.48,
                                                           width: l * 0.32, height: h * 0.14),
                                       cornerRadius: h * 0.07))
            cactus.append(StickerTemplateDrawing.pillPath(
                in: CGRect(x: r.maxX - l * 0.26, y: r.minY + h * 0.38, width: l * 0.20, height: h * 0.28)))
            cactus.append(UIBezierPath(roundedRect: CGRect(x: r.midX, y: r.minY + h * 0.54,
                                                           width: l * 0.30, height: h * 0.14),
                                       cornerRadius: h * 0.07))
            StickerTemplateDrawing.fillWithOutline(cactus, fill: StickerTemplatePalette.leaf,
                                                   outline: StickerTemplatePalette.surface, width: f.bord)
            let côtes = UIBezierPath()
            for côté in Self.deuxCôtés {
                côtes.move(to: CGPoint(x: r.midX + côté * l * 0.06, y: r.minY + h * 0.22))
                côtes.addLine(to: CGPoint(x: r.midX + côté * l * 0.06, y: r.minY + h * 0.70))
            }
            côtes.lineWidth = f.bord * 0.5
            côtes.lineCapStyle = .round
            StickerTemplatePalette.surface.withAlphaComponent(0.35).setStroke()
            côtes.stroke()
            // La fleur au sommet : c'est elle qui fait un cactus AIMABLE.
            let fleur = CGRect(x: r.midX - l * 0.11, y: r.minY + h * 0.14 - l * 0.11, width: l * 0.22, height: l * 0.22)
            StickerTemplatePalette.loveWarm.setFill()
            StickerTemplateDrawing.starPath(in: fleur, points: 8, innerRatio: 0.55).fill()
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(ovalIn: fleur.insetBy(dx: fleur.width * 0.34, dy: fleur.height * 0.34)).fill()
        }
    }

    // MARK: - nature.rainbow — l'arc-en-ciel entre deux nuages

    @MainActor
    private static func rainbowImage(metrics: StickerTemplateMetrics,
                                     screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = natureFrame(for: .rainbow, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let centre = CGPoint(x: r.midX, y: r.maxY - r.height * 0.16)
            let extérieur = r.width * 0.46
            let bande = extérieur * 0.105
            let couleurs = [StickerTemplatePalette.pin, StickerTemplatePalette.warmBulb,
                            StickerTemplatePalette.leaf, StickerTemplatePalette.sky,
                            StickerTemplatePalette.accent, StickerTemplatePalette.loveCool]
            // Un halo clair SOUS les bandes : c'est le liseré, sur les deux
            // bords de l'arc à la fois.
            let halo = UIBezierPath(arcCenter: centre, radius: extérieur - bande * 3,
                                    startAngle: .pi, endAngle: 0, clockwise: true)
            halo.lineWidth = bande * 6 + f.bord * 2
            halo.lineCapStyle = .butt
            StickerTemplatePalette.surface.setStroke()
            halo.stroke()
            for (index, couleur) in couleurs.enumerated() {
                let arc = UIBezierPath(arcCenter: centre, radius: extérieur - bande * (CGFloat(index) + 0.5),
                                       startAngle: .pi, endAngle: 0, clockwise: true)
                arc.lineWidth = bande
                arc.lineCapStyle = .butt
                couleur.setStroke()
                arc.stroke()
            }
            for côté in Self.deuxCôtés {
                let nuage = CGRect(x: centre.x + côté * (extérieur - bande * 3) - r.width * 0.15,
                                   y: centre.y - r.height * 0.14,
                                   width: r.width * 0.30, height: r.height * 0.24)
                StickerTemplateDrawing.fillWithOutline(StickerTemplateDrawing.cloudPath(in: nuage),
                                                       fill: StickerTemplatePalette.surface,
                                                       outline: StickerTemplatePalette.hairline,
                                                       width: f.bord * 0.6)
            }
        }
    }

    // MARK: - Le registre de la famille NATURE & ANIMAUX

    static let natureDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureFlower,
            name: { String(localized: "sticker.template.nature.flower", defaultValue: "Fleur", bundle: .module) },
            measure: { _, m in Self.natureFrame(for: .flower, metrics: m).taille },
            draw: { _, m, échelle in Self.flowerImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureButterfly,
            name: { String(localized: "sticker.template.nature.butterfly", defaultValue: "Papillon", bundle: .module) },
            measure: { _, m in Self.natureFrame(for: .butterfly, metrics: m).taille },
            draw: { _, m, échelle in Self.butterflyImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureLeaf,
            name: { String(localized: "sticker.template.nature.leaf", defaultValue: "Feuille d'automne", bundle: .module) },
            measure: { _, m in Self.natureFrame(for: .leaf, metrics: m).taille },
            draw: { _, m, échelle in Self.leafImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureCat,
            name: { String(localized: "sticker.template.nature.cat", defaultValue: "Chat", bundle: .module) },
            measure: { _, m in Self.catLayout(metrics: m).cartouche.taille },
            draw: { _, m, échelle in Self.catImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureDog,
            name: { String(localized: "sticker.template.nature.dog", defaultValue: "Chien", bundle: .module) },
            measure: { _, m in Self.dogLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.dogImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureMountain,
            name: { String(localized: "sticker.template.nature.mountain", defaultValue: "Montagne", bundle: .module) },
            measure: { _, m in Self.mountainLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.mountainImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureWave,
            name: { String(localized: "sticker.template.nature.wave", defaultValue: "Vague", bundle: .module) },
            measure: { _, m in Self.waveLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.waveImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureMoon,
            name: { String(localized: "sticker.template.nature.moon", defaultValue: "Lune et étoiles", bundle: .module) },
            measure: { _, m in Self.moonLayout(metrics: m).cartouche.taille },
            draw: { _, m, échelle in Self.moonImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureCactus,
            name: { String(localized: "sticker.template.nature.cactus", defaultValue: "Cactus", bundle: .module) },
            measure: { _, m in Self.natureFrame(for: .cactus, metrics: m).taille },
            draw: { _, m, échelle in Self.cactusImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.natureRainbow,
            name: { String(localized: "sticker.template.nature.rainbow", defaultValue: "Arc-en-ciel", bundle: .module) },
            measure: { _, m in Self.natureFrame(for: .rainbow, metrics: m).taille },
            draw: { _, m, échelle in Self.rainbowImage(metrics: m, screenScale: échelle) }),
    ]
}
