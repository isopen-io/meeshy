import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations d'ENCOURAGEMENT (#4820)

/// Un mot qui pousse en avant — et chaque mot a SA silhouette : un ruban à
/// pans pour « Bravo ! », une flèche pour « Fonce ! », une médaille pour
/// « Fier de toi », un sceau dentelé pour « Respect ». Dix cartouches à glyphe
/// différent se ressembleraient trop pour se reconnaître du coin de l'œil dans
/// la palette.
///
/// La légende vient de `String(localized:)`, avec une clé LITTÉRALE par mot :
/// le LECTEUR lit « Well done! » là où l'auteur a posé « Bien joué ». Aucun
/// emplacement, donc rien à remplir et rien à traduire.
extension StickerTemplateRenderer {

    // MARK: Les mots des silhouettes dessinées à part

    @MainActor
    private static var cheerBravoCaption: String {
        String(localized: "sticker.template.cheer.bravo.caption", defaultValue: "Bravo !", bundle: .module)
    }

    @MainActor
    private static var cheerGoForItCaption: String {
        String(localized: "sticker.template.cheer.goForIt.caption", defaultValue: "Fonce !", bundle: .module)
    }

    @MainActor
    private static var cheerProudOfYouCaption: String {
        String(localized: "sticker.template.cheer.proudOfYou.caption", defaultValue: "Fier de toi", bundle: .module)
    }

    @MainActor
    private static var cheerRespectCaption: String {
        String(localized: "sticker.template.cheer.respect.caption", defaultValue: "Respect", bundle: .module)
    }

    // MARK: - Le patron des cartouches à icône

    /// Ce qui distingue une carte d'encouragement : sa FORME, ses couleurs et
    /// l'icône dessinée à gauche du mot. La mesure est celle de tous les
    /// cartouches (`captionLayout`), le cadre de l'icône est RÉSERVÉ
    /// (`Glyph.custom`) et chaque carte y trace ce qu'elle veut.
    private struct CheerCard {
        enum Forme {
            case cartouche
            /// Un cartouche à DOUBLE liseré — le trait d'un serment.
            case double
            case pastille
            /// Une bulle de dialogue ; la queue occupe le bas.
            case bulle
        }

        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let forme: Forme
        let haut: UIColor
        let bas: UIColor
        let liseré: UIColor
        let texte: UIColor
        let icône: @MainActor (CGRect, StickerTemplateMetrics) -> Void
    }

    @MainActor
    private static func cheerCardLayout(_ carte: CheerCard, metrics: StickerTemplateMetrics)
        -> (légende: String, l: StickerTemplateDrawing.CaptionLayout, queue: CGFloat) {
        let légende = carte.name()
        let queue: CGFloat = carte.forme == .bulle ? metrics.fontSize * 0.45 : 0
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics, extraHeight: queue)
        return (légende, l, queue)
    }

    @MainActor
    private static func cheerCardSize(_ carte: CheerCard, metrics: StickerTemplateMetrics) -> CGSize {
        cheerCardLayout(carte, metrics: metrics).l.taille
    }

    @MainActor
    private static func cheerCardImage(_ carte: CheerCard, metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let c = cheerCardLayout(carte, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: c.l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: c.l.taille)
            let contenu = CGRect(x: 0, y: 0, width: cadre.width, height: cadre.height - c.queue)
            let trait = max(1, metrics.fontSize * 0.05)
            let rayon = contenu.height * 0.30
            let forme: UIBezierPath
            switch carte.forme {
            case .cartouche, .double:
                forme = UIBezierPath(roundedRect: cadre, cornerRadius: rayon)
            case .pastille:
                forme = StickerTemplateDrawing.pillPath(in: cadre)
            case .bulle:
                forme = StickerTemplateDrawing.speechBubblePath(in: cadre, tail: c.queue)
            }
            StickerTemplateDrawing.fillWithOutline(forme, gradientFrom: carte.haut, to: carte.bas,
                                                   in: cadre, outline: carte.liseré, width: trait)
            if carte.forme == .double {
                let retrait = trait * 3
                let intérieur = UIBezierPath(roundedRect: cadre.insetBy(dx: retrait, dy: retrait),
                                             cornerRadius: max(trait, rayon - retrait))
                intérieur.lineWidth = trait
                carte.liseré.setStroke()
                intérieur.stroke()
            }
            let icône = CGRect(x: metrics.horizontalPadding, y: contenu.midY - c.l.glyphe / 2,
                               width: c.l.glyphe, height: c.l.glyphe)
            carte.icône(icône, metrics)
            StickerTemplateDrawing.draw(
                c.légende, font: c.l.police, color: carte.texte,
                at: CGPoint(x: metrics.horizontalPadding + c.l.glyphe + metrics.gap,
                            y: contenu.midY - c.l.tailleTexte.height / 2))
        }
    }

    private static func cheerCardDrawer(_ carte: CheerCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: carte.name,
            measure: { _, m in Self.cheerCardSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.cheerCardImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: Les icônes des cartes

    /// Une flamme — une goutte penchée, et une petite goutte claire dedans qui
    /// fait le cœur du feu. Tracée plutôt qu'empruntée à `flame.fill` : la
    /// météo a déjà son éclair SF, l'encouragement veut sa propre main.
    @MainActor
    private static func cheerFlame(in r: CGRect) {
        let l = r.width, h = r.height
        let flamme = UIBezierPath()
        flamme.move(to: CGPoint(x: r.minX + l * 0.62, y: r.minY))
        flamme.addCurve(to: CGPoint(x: r.maxX, y: r.minY + h * 0.66),
                        controlPoint1: CGPoint(x: r.minX + l * 0.58, y: r.minY + h * 0.36),
                        controlPoint2: CGPoint(x: r.maxX, y: r.minY + h * 0.42))
        flamme.addArc(withCenter: CGPoint(x: r.midX, y: r.minY + h * 0.66),
                      radius: l / 2, startAngle: 0, endAngle: .pi, clockwise: true)
        flamme.addCurve(to: CGPoint(x: r.minX + l * 0.62, y: r.minY),
                        controlPoint1: CGPoint(x: r.minX, y: r.minY + h * 0.22),
                        controlPoint2: CGPoint(x: r.minX + l * 0.30, y: r.minY + h * 0.34))
        flamme.close()
        StickerTemplateDrawing.fill(flamme, gradientFrom: StickerTemplatePalette.warmBulb,
                                    to: StickerTemplatePalette.pin, in: r)
        StickerTemplatePalette.surface.withAlphaComponent(0.85).setFill()
        StickerTemplateDrawing.dropPath(in: CGRect(x: r.minX + l * 0.30, y: r.minY + h * 0.46,
                                                   width: l * 0.40, height: h * 0.48)).fill()
    }

    /// Une étoile pleine, liserée clair pour se détacher du fond.
    @MainActor
    private static func cheerStar(in r: CGRect) {
        StickerTemplateDrawing.fillWithOutline(
            StickerTemplateDrawing.starPath(in: r, points: 5, innerRatio: 0.50),
            fill: StickerTemplatePalette.warmBulb, outline: StickerTemplatePalette.surface,
            width: max(1, r.width * 0.06))
    }

    /// Une flèche qui MONTE — le trait part d'en bas à gauche, la pointe vise
    /// le coin haut droit. Deux paliers sous le trait font la marche gravie.
    @MainActor
    private static func cheerRisingArrow(in r: CGRect, color: UIColor) {
        let l = r.width, h = r.height
        let épaisseur = max(1, l * 0.13)
        let tige = UIBezierPath()
        tige.move(to: CGPoint(x: r.minX + l * 0.10, y: r.minY + h * 0.90))
        tige.addLine(to: CGPoint(x: r.minX + l * 0.74, y: r.minY + h * 0.26))
        tige.lineWidth = épaisseur
        tige.lineCapStyle = .round
        color.setStroke()
        tige.stroke()

        let pointe = UIBezierPath()
        pointe.move(to: CGPoint(x: r.maxX - l * 0.04, y: r.minY + h * 0.04))
        pointe.addLine(to: CGPoint(x: r.maxX - l * 0.04, y: r.minY + h * 0.48))
        pointe.addLine(to: CGPoint(x: r.minX + l * 0.52, y: r.minY + h * 0.04))
        pointe.close()
        pointe.lineJoinStyle = .round
        color.setFill()
        pointe.fill()

        for (index, largeur) in [CGFloat(0.28), CGFloat(0.50)].enumerated() {
            let palier = UIBezierPath()
            let y = r.maxY - h * (0.02 + CGFloat(index) * 0.18)
            palier.move(to: CGPoint(x: r.maxX - l * largeur, y: y))
            palier.addLine(to: CGPoint(x: r.maxX - l * 0.04, y: y))
            palier.lineWidth = épaisseur * 0.6
            palier.lineCapStyle = .round
            palier.stroke()
        }
    }

    /// Un cœur clair liseré, à gauche du merci.
    @MainActor
    private static func cheerHeart(in r: CGRect) {
        let cadre = r.insetBy(dx: r.width * 0.06, dy: r.height * 0.10)
        StickerTemplateDrawing.fillWithOutline(
            StickerTemplateDrawing.heartPath(in: cadre),
            fill: StickerTemplatePalette.surface, outline: StickerTemplatePalette.loveWarm,
            width: max(1, r.width * 0.05))
    }

    // MARK: - cheer.bravo — le ruban à pans

    @MainActor
    private static func cheerBravoLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, bande: CGSize, débord: CGFloat, pan: CGSize, taille: CGSize) {
        let légende = cheerBravoCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.80, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // La bande DÉBORDE du mot de chaque côté : c'est là que pendent les
        // pans, et que brillent les deux étincelles.
        let débord = metrics.fontSize * 0.70
        let bande = CGSize(width: ceil(tailleTexte.width + metrics.horizontalPadding * 2 + débord * 2),
                           height: ceil(tailleTexte.height + metrics.verticalPadding * 2))
        let pan = CGSize(width: metrics.fontSize * 1.05, height: metrics.fontSize * 0.60)
        let taille = CGSize(width: bande.width, height: ceil(bande.height + pan.height))
        return (légende, police, bande, débord, pan, taille)
    }

    @MainActor
    private static func cheerBravoSize(metrics: StickerTemplateMetrics) -> CGSize {
        cheerBravoLayout(metrics: metrics).taille
    }

    /// Un pan de ruban : un rectangle qui pend sous la bande, entaillé en V
    /// au bas. `gauche` dit de quel côté il pend.
    private static func cheerRibbonTail(x: CGFloat, y: CGFloat, size: CGSize) -> UIBezierPath {
        let pan = UIBezierPath()
        pan.move(to: CGPoint(x: x, y: y))
        pan.addLine(to: CGPoint(x: x + size.width, y: y))
        pan.addLine(to: CGPoint(x: x + size.width, y: y + size.height))
        pan.addLine(to: CGPoint(x: x + size.width / 2, y: y + size.height * 0.62))
        pan.addLine(to: CGPoint(x: x, y: y + size.height))
        pan.close()
        pan.lineJoinStyle = .round
        return pan
    }

    @MainActor
    private static func cheerBravoImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = cheerBravoLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let trait = max(1, metrics.fontSize * 0.05)
            // Les pans d'abord : la bande les recouvre, et leur haut disparaît
            // derrière elle comme s'ils y étaient cousus.
            let débutPans = l.bande.height - metrics.verticalPadding * 0.6
            StickerTemplatePalette.night.setFill()
            cheerRibbonTail(x: l.débord * 0.25, y: débutPans,
                            size: CGSize(width: l.pan.width, height: l.taille.height - débutPans)).fill()
            cheerRibbonTail(x: l.bande.width - l.débord * 0.25 - l.pan.width, y: débutPans,
                            size: CGSize(width: l.pan.width, height: l.taille.height - débutPans)).fill()

            let bande = CGRect(origin: .zero, size: l.bande)
            let ruban = UIBezierPath(roundedRect: bande, cornerRadius: l.bande.height * 0.22)
            StickerTemplateDrawing.fillWithOutline(ruban,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.loveCool,
                                                   in: bande,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: trait)
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: bande)

            // Deux étincelles dans les débords — ce qui fait la fête, le
            // ruban seul ferait une étiquette.
            StickerTemplatePalette.warmBulb.setFill()
            let côté = metrics.fontSize * 0.42
            for x in [l.débord * 0.5, l.bande.width - l.débord * 0.5] {
                let cadre = CGRect(x: x - côté / 2, y: bande.midY - côté / 2, width: côté, height: côté)
                StickerTemplateDrawing.starPath(in: cadre, points: 4, innerRatio: 0.38).fill()
            }
        }
    }

    // MARK: - cheer.goForIt — la flèche lancée

    @MainActor
    private static func cheerGoForItLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, traits: CGFloat, pointe: CGFloat, corps: CGSize, taille: CGSize) {
        // Capitales : un ordre de départ se lit de loin.
        let légende = cheerGoForItCaption.uppercased()
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.80, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let pointe = metrics.fontSize * 0.65
        // Les traits de vitesse sortent à GAUCHE de la flèche : leur zone fait
        // partie de la boîte, sinon le raster les rognerait.
        let traits = metrics.fontSize * 0.75
        let corps = CGSize(width: ceil(tailleTexte.width + metrics.horizontalPadding * 2 + pointe * 0.45),
                           height: ceil(tailleTexte.height + metrics.verticalPadding * 2))
        let taille = CGSize(width: ceil(traits + corps.width + pointe), height: corps.height)
        return (légende, police, traits, pointe, corps, taille)
    }

    @MainActor
    private static func cheerGoForItSize(metrics: StickerTemplateMetrics) -> CGSize {
        cheerGoForItLayout(metrics: metrics).taille
    }

    @MainActor
    private static func cheerGoForItImage(metrics: StickerTemplateMetrics,
                                          screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = cheerGoForItLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let h = l.taille.height, x0 = l.traits, p = l.pointe
            let trait = max(1, metrics.fontSize * 0.05)

            StickerTemplatePalette.surface.withAlphaComponent(0.85).setStroke()
            for (index, fraction) in [CGFloat(0.55), CGFloat(1.0), CGFloat(0.70)].enumerated() {
                let y = h * (0.28 + CGFloat(index) * 0.22)
                let ligne = UIBezierPath()
                ligne.move(to: CGPoint(x: x0 - metrics.gap - l.traits * fraction * 0.8, y: y))
                ligne.addLine(to: CGPoint(x: x0 - metrics.gap, y: y))
                ligne.lineWidth = trait * 1.4
                ligne.lineCapStyle = .round
                ligne.stroke()
            }

            let flèche = UIBezierPath()
            flèche.move(to: CGPoint(x: x0, y: 0))
            flèche.addLine(to: CGPoint(x: x0 + l.corps.width, y: 0))
            flèche.addLine(to: CGPoint(x: x0 + l.corps.width + p, y: h / 2))
            flèche.addLine(to: CGPoint(x: x0 + l.corps.width, y: h))
            flèche.addLine(to: CGPoint(x: x0, y: h))
            flèche.addLine(to: CGPoint(x: x0 + p * 0.45, y: h / 2))
            flèche.close()
            let cadre = CGRect(x: x0, y: 0, width: l.corps.width + p, height: h)
            StickerTemplateDrawing.fillWithOutline(flèche,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: trait)
            StickerTemplateDrawing.drawCentered(
                l.légende, font: l.police, color: StickerTemplatePalette.surface,
                in: CGRect(x: x0 + p * 0.45, y: 0, width: l.corps.width - p * 0.45, height: h))
        }
    }

    // MARK: - cheer.proudOfYou — la médaille

    @MainActor
    private static func cheerProudOfYouLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, ruban: CGSize, disque: CGFloat, taille: CGSize) {
        let légende = cheerProudOfYouCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.60, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // Le disque est rond : le mot doit tenir dans sa CORDE, pas dans son
        // diamètre — d'où la marge plus large qu'un cartouche.
        let disque = ceil(max(metrics.fontSize * 3.0,
                              tailleTexte.width + metrics.horizontalPadding * 1.8))
        let ruban = CGSize(width: metrics.fontSize * 0.55, height: metrics.fontSize * 1.0)
        return (légende, police, ruban, disque, CGSize(width: disque, height: ceil(ruban.height + disque)))
    }

    @MainActor
    private static func cheerProudOfYouSize(metrics: StickerTemplateMetrics) -> CGSize {
        cheerProudOfYouLayout(metrics: metrics).taille
    }

    /// Une bande de ruban qui descend de `haut` vers `bas`, large de `largeur`,
    /// coupée droit — les deux bandes se rejoignent derrière le disque.
    private static func cheerMedalStrap(from haut: CGPoint, to bas: CGPoint, largeur: CGFloat) -> UIBezierPath {
        let bande = UIBezierPath()
        bande.move(to: CGPoint(x: haut.x - largeur / 2, y: haut.y))
        bande.addLine(to: CGPoint(x: haut.x + largeur / 2, y: haut.y))
        bande.addLine(to: CGPoint(x: bas.x + largeur / 2, y: bas.y))
        bande.addLine(to: CGPoint(x: bas.x - largeur / 2, y: bas.y))
        bande.close()
        return bande
    }

    @MainActor
    private static func cheerProudOfYouImage(metrics: StickerTemplateMetrics,
                                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = cheerProudOfYouLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.08)
            let cx = l.taille.width / 2
            // Les deux bandes d'abord, en V, qui plongent derrière le disque :
            // l'une indigo, l'autre violette — les couleurs de la marque, pas
            // le tricolore d'un podium.
            let attache = CGPoint(x: cx, y: l.ruban.height + l.disque * 0.22)
            StickerTemplatePalette.accent.setFill()
            cheerMedalStrap(from: CGPoint(x: cx - l.disque * 0.30, y: 0), to: attache,
                            largeur: l.ruban.width).fill()
            StickerTemplatePalette.loveCool.setFill()
            cheerMedalStrap(from: CGPoint(x: cx + l.disque * 0.30, y: 0), to: attache,
                            largeur: l.ruban.width).fill()

            let cadre = CGRect(x: bord / 2, y: l.ruban.height + bord / 2,
                               width: l.disque - bord, height: l.disque - bord)
            let disque = UIBezierPath(ovalIn: cadre)
            StickerTemplateDrawing.fill(disque, gradientFrom: StickerTemplatePalette.warmBulb,
                                        to: StickerTemplatePalette.loveWarm, in: cadre)
            StickerTemplatePalette.surface.setStroke()
            disque.lineWidth = bord
            disque.stroke()
            // L'anneau intérieur — ce qui fait la médaille, le disque seul
            // ferait un badge.
            let anneau = UIBezierPath(ovalIn: cadre.insetBy(dx: bord * 2.2, dy: bord * 2.2))
            anneau.lineWidth = bord * 0.6
            StickerTemplatePalette.surface.withAlphaComponent(0.7).setStroke()
            anneau.stroke()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: cadre)
        }
    }

    // MARK: - cheer.respect — le sceau dentelé

    @MainActor
    private static func cheerRespectLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, taille: CGSize) {
        // Capitales : un sceau grave son mot.
        let légende = cheerRespectCaption.uppercased()
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.62, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let diamètre = ceil(max(metrics.fontSize * 3.2,
                                tailleTexte.width + metrics.horizontalPadding * 2.2))
        return (légende, police, CGSize(width: diamètre, height: diamètre))
    }

    @MainActor
    private static func cheerRespectSize(metrics: StickerTemplateMetrics) -> CGSize {
        cheerRespectLayout(metrics: metrics).taille
    }

    /// Un disque au bord fait de `bosses` demi-cercles — le sceau d'un
    /// diplôme. Chaque bosse est un arc dont le centre court sur un anneau
    /// intérieur, et l'arc suivant s'y raccorde par une droite courte.
    private static func cheerSealPath(in rect: CGRect, bosses: Int) -> UIBezierPath {
        let centre = CGPoint(x: rect.midX, y: rect.midY)
        let rayon = min(rect.width, rect.height) / 2
        let bosse = rayon * .pi / CGFloat(bosses) * 0.62
        let anneau = rayon - bosse
        let chemin = UIBezierPath()
        for index in 0..<bosses {
            let angle = CGFloat(index) / CGFloat(bosses) * 2 * .pi
            let c = CGPoint(x: centre.x + cos(angle) * anneau, y: centre.y + sin(angle) * anneau)
            chemin.addArc(withCenter: c, radius: bosse,
                          startAngle: angle - .pi / 2, endAngle: angle + .pi / 2, clockwise: true)
        }
        chemin.close()
        return chemin
    }

    @MainActor
    private static func cheerRespectImage(metrics: StickerTemplateMetrics,
                                          screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = cheerRespectLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.2, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            StickerTemplateDrawing.fillWithOutline(cheerSealPath(in: cadre, bosses: 18),
                                                   gradientFrom: StickerTemplatePalette.night,
                                                   to: StickerTemplatePalette.ink,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.warmBulb,
                                                   width: bord)
            // Deux anneaux d'or — celui du dedans en pointillé, comme la
            // gravure d'un cachet.
            StickerTemplatePalette.warmBulb.setStroke()
            let anneau = UIBezierPath(ovalIn: cadre.insetBy(dx: cadre.width * 0.14, dy: cadre.height * 0.14))
            anneau.lineWidth = bord
            anneau.stroke()
            let gravure = UIBezierPath(ovalIn: cadre.insetBy(dx: cadre.width * 0.19, dy: cadre.height * 0.19))
            gravure.lineWidth = bord * 0.6
            gravure.setLineDash([bord * 1.2, bord * 1.2], count: 2, phase: 0)
            gravure.stroke()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.warmBulb, in: cadre)
        }
    }

    // MARK: - Le registre de la famille ENCOURAGEMENT

    private static let cheerCards: [CheerCard] = [
        CheerCard(id: StickerTemplateCatalog.ID.cheerCourage,
                  name: { String(localized: "sticker.template.cheer.courage.caption", defaultValue: "Courage", bundle: .module) },
                  forme: .cartouche,
                  haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.night,
                  liseré: StickerTemplatePalette.surface.withAlphaComponent(0.6),
                  texte: StickerTemplatePalette.surface,
                  icône: { r, _ in Self.cheerFlame(in: r.insetBy(dx: r.width * 0.16, dy: r.height * 0.04)) }),
        CheerCard(id: StickerTemplateCatalog.ID.cheerYouGotThis,
                  name: { String(localized: "sticker.template.cheer.youGotThis.caption", defaultValue: "Tu gères", bundle: .module) },
                  forme: .bulle,
                  haut: StickerTemplatePalette.lilac, bas: StickerTemplatePalette.accent,
                  liseré: StickerTemplatePalette.surface,
                  texte: StickerTemplatePalette.surface,
                  icône: { r, _ in
                      StickerTemplateDrawing.drawSymbol("hand.thumbsup.fill", in: r,
                                                        color: StickerTemplatePalette.warmBulb, weight: .bold)
                  }),
        CheerCard(id: StickerTemplateCatalog.ID.cheerNeverGiveUp,
                  name: { String(localized: "sticker.template.cheer.neverGiveUp.caption", defaultValue: "On lâche rien", bundle: .module) },
                  forme: .double,
                  haut: StickerTemplatePalette.night, bas: StickerTemplatePalette.ink,
                  liseré: StickerTemplatePalette.lilac.withAlphaComponent(0.8),
                  texte: StickerTemplatePalette.surface,
                  icône: { r, _ in
                      StickerTemplateDrawing.drawSymbol("bolt.fill", in: r.insetBy(dx: r.width * 0.08, dy: 0),
                                                        color: StickerTemplatePalette.warmBulb, weight: .bold)
                  }),
        CheerCard(id: StickerTemplateCatalog.ID.cheerWellPlayed,
                  name: { String(localized: "sticker.template.cheer.wellPlayed.caption", defaultValue: "Bien joué", bundle: .module) },
                  forme: .cartouche,
                  haut: StickerTemplatePalette.leaf, bas: StickerTemplatePalette.sky,
                  liseré: StickerTemplatePalette.surface.withAlphaComponent(0.7),
                  texte: StickerTemplatePalette.surface,
                  icône: { r, _ in Self.cheerStar(in: r) }),
        CheerCard(id: StickerTemplateCatalog.ID.cheerYouWillMakeIt,
                  name: { String(localized: "sticker.template.cheer.youWillMakeIt.caption", defaultValue: "Tu vas y arriver", bundle: .module) },
                  forme: .pastille,
                  haut: StickerTemplatePalette.sky, bas: StickerTemplatePalette.accent,
                  liseré: StickerTemplatePalette.surface.withAlphaComponent(0.6),
                  texte: StickerTemplatePalette.surface,
                  icône: { r, _ in Self.cheerRisingArrow(in: r, color: StickerTemplatePalette.warmBulb) }),
        CheerCard(id: StickerTemplateCatalog.ID.cheerThankYou,
                  name: { String(localized: "sticker.template.cheer.thankYou.caption", defaultValue: "Merci !", bundle: .module) },
                  forme: .pastille,
                  haut: StickerTemplatePalette.loveWarm, bas: StickerTemplatePalette.loveCool,
                  liseré: StickerTemplatePalette.surface,
                  texte: StickerTemplatePalette.surface,
                  icône: { r, _ in Self.cheerHeart(in: r) }),
    ]

    static let cheerDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.cheerBravo,
            name: { Self.cheerBravoCaption },
            measure: { _, m in Self.cheerBravoSize(metrics: m) },
            draw: { _, m, échelle in Self.cheerBravoImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.cheerGoForIt,
            name: { Self.cheerGoForItCaption },
            measure: { _, m in Self.cheerGoForItSize(metrics: m) },
            draw: { _, m, échelle in Self.cheerGoForItImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.cheerProudOfYou,
            name: { Self.cheerProudOfYouCaption },
            measure: { _, m in Self.cheerProudOfYouSize(metrics: m) },
            draw: { _, m, échelle in Self.cheerProudOfYouImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.cheerRespect,
            name: { Self.cheerRespectCaption },
            measure: { _, m in Self.cheerRespectSize(metrics: m) },
            draw: { _, m, échelle in Self.cheerRespectImage(metrics: m, screenScale: échelle) }),
    ] + cheerCards.map { cheerCardDrawer($0) }
}
