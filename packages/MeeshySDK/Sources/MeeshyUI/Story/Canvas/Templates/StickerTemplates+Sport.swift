import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de SPORT (#4820)

/// L'effort et ce qu'il rapporte, en DEUX temps : cinq objets posés seuls — le
/// ballon, la coupe, le vélo, le podium, la médaille — et cinq cartouches à mot,
/// chacun sur une silhouette différente (pastille, cartouche, fanion, bulle,
/// écusson). Dix cartouches au glyphe près se ressembleraient trop pour se
/// distinguer du coin de l'œil dans la palette.
///
/// Tout est tracé en Bézier, sans emoji : un ballon emoji change de dessin d'une
/// version d'iOS à l'autre, et une décoration doit se rendre pareil sur iOS 16 et
/// sur iOS 26 — la raison même pour laquelle `heartPath` existe. La légende vient
/// de `String(localized:)` à clé LITTÉRALE : le LECTEUR lit « Kick-off » là où
/// l'auteur a posé « Coup d'envoi ». Aucun emplacement, donc rien à traduire.
extension StickerTemplateRenderer {

    // MARK: - Le patron des cartouches à mot

    /// Ce qui distingue une carte de sport : sa SILHOUETTE, ses deux couleurs
    /// et l'objet tracé à gauche du mot. La mesure est celle de tous les
    /// cartouches (`captionLayout`) ; le cadre de l'icône est RÉSERVÉ
    /// (`Glyph.custom`) et chaque carte y trace ce qu'elle veut.
    private struct SportCard {
        /// La silhouette. La bulle mange sa queue, l'écusson sa pointe, le fanion
        /// son encoche : la mesure doit le savoir, sinon le raster les rogne.
        enum Fond {
            case cartouche
            case pastille
            case bulle
            /// Un fanion de supporter : le bord droit rentre en V.
            case fanion
            /// Un écusson de club : les épaules droites, la pointe en bas.
            case écusson
        }

        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let fond: Fond
        let haut: UIColor
        let bas: UIColor
        let liseré: UIColor
        let texte: UIColor
        let icône: @MainActor (CGRect) -> Void
    }

    /// La mesure UNIQUE des cartes, servie à `measure` comme à `draw` : deux
    /// calculs feraient dériver la cible de tap du pixel dessiné.
    @MainActor
    private static func sportCardLayout(_ carte: SportCard, metrics: StickerTemplateMetrics)
        -> (légende: String, l: StickerTemplateDrawing.CaptionLayout,
            queue: CGFloat, encoche: CGFloat, taille: CGSize) {
        let légende = carte.name()
        let queue: CGFloat
        let encoche: CGFloat
        switch carte.fond {
        case .bulle: queue = metrics.fontSize * 0.45; encoche = 0
        case .écusson: queue = metrics.fontSize * 0.42; encoche = 0
        case .fanion: queue = 0; encoche = metrics.fontSize * 0.55
        case .cartouche, .pastille: queue = 0; encoche = 0
        }
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics, extraHeight: queue)
        return (légende, l, queue, encoche,
                CGSize(width: ceil(l.taille.width + encoche), height: l.taille.height))
    }

    @MainActor
    private static func sportCardSize(_ carte: SportCard, metrics: StickerTemplateMetrics) -> CGSize {
        sportCardLayout(carte, metrics: metrics).taille
    }

    @MainActor
    private static func sportCardImage(_ carte: SportCard, metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let c = sportCardLayout(carte, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: c.taille, screenScale: screenScale) {
            let trait = max(1, metrics.fontSize * 0.05)
            let plein = CGRect(origin: .zero, size: c.taille)
            // Le liseré de `fillWithOutline` déborde d'un trait vers l'EXTÉRIEUR :
            // sans ce retrait, le bord de la forme serait coupé net par le raster.
            let contour = plein.insetBy(dx: trait, dy: trait)
            let contenu = CGRect(x: 0, y: 0,
                                 width: plein.width - c.encoche, height: plein.height - c.queue)
            let forme: UIBezierPath
            switch carte.fond {
            case .cartouche:
                forme = UIBezierPath(roundedRect: contour, cornerRadius: contour.height * 0.28)
            case .pastille:
                forme = StickerTemplateDrawing.pillPath(in: contour)
            case .bulle:
                forme = StickerTemplateDrawing.speechBubblePath(in: contour, tail: c.queue)
            case .fanion:
                forme = Self.sportPennantPath(in: contour, notch: c.encoche)
            case .écusson:
                forme = Self.sportShieldPath(in: contour, point: c.queue)
            }
            StickerTemplateDrawing.fillWithOutline(forme, gradientFrom: carte.haut, to: carte.bas,
                                                   in: contour, outline: carte.liseré, width: trait)
            let icône = CGRect(x: metrics.horizontalPadding, y: contenu.midY - c.l.glyphe / 2,
                               width: c.l.glyphe, height: c.l.glyphe)
            carte.icône(icône)
            StickerTemplateDrawing.draw(
                c.légende, font: c.l.police, color: carte.texte,
                at: CGPoint(x: metrics.horizontalPadding + c.l.glyphe + metrics.gap,
                            y: contenu.midY - c.l.tailleTexte.height / 2))
        }
    }

    private static func sportCardDrawer(_ carte: SportCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: carte.name,
            measure: { _, m in Self.sportCardSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.sportCardImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: - Les silhouettes propres au sport

    /// Un fanion : le bord droit rentre en V de `notch`, les deux coins gauches
    /// restent arrondis — c'est la hampe.
    private static func sportPennantPath(in rect: CGRect, notch: CGFloat) -> UIBezierPath {
        let rayon = min(rect.height * 0.26, rect.width * 0.10)
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: rect.minX + rayon, y: rect.minY))
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
        chemin.addLine(to: CGPoint(x: rect.maxX - notch, y: rect.midY))
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        chemin.addLine(to: CGPoint(x: rect.minX + rayon, y: rect.maxY))
        chemin.addArc(withCenter: CGPoint(x: rect.minX + rayon, y: rect.maxY - rayon),
                      radius: rayon, startAngle: CGFloat.pi / 2, endAngle: CGFloat.pi, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.minX, y: rect.minY + rayon))
        chemin.addArc(withCenter: CGPoint(x: rect.minX + rayon, y: rect.minY + rayon),
                      radius: rayon, startAngle: CGFloat.pi, endAngle: 3 * CGFloat.pi / 2, clockwise: true)
        chemin.close()
        chemin.lineJoinStyle = .round
        return chemin
    }

    /// Un écusson : épaules droites, flancs qui plongent vers une pointe basse
    /// haute de `point`.
    private static func sportShieldPath(in rect: CGRect, point pointe: CGFloat) -> UIBezierPath {
        let rayon = min((rect.height - pointe) * 0.32, rect.width * 0.12)
        let épaule = rect.maxY - pointe
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: rect.minX, y: rect.minY + rayon))
        chemin.addArc(withCenter: CGPoint(x: rect.minX + rayon, y: rect.minY + rayon),
                      radius: rayon, startAngle: CGFloat.pi, endAngle: 3 * CGFloat.pi / 2, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.maxX - rayon, y: rect.minY))
        chemin.addArc(withCenter: CGPoint(x: rect.maxX - rayon, y: rect.minY + rayon),
                      radius: rayon, startAngle: 3 * CGFloat.pi / 2, endAngle: 2 * CGFloat.pi, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.maxX, y: épaule))
        chemin.addCurve(to: CGPoint(x: rect.midX, y: rect.maxY),
                        controlPoint1: CGPoint(x: rect.maxX, y: rect.maxY - pointe * 0.10),
                        controlPoint2: CGPoint(x: rect.midX + rect.width * 0.20, y: rect.maxY))
        chemin.addCurve(to: CGPoint(x: rect.minX, y: épaule),
                        controlPoint1: CGPoint(x: rect.midX - rect.width * 0.20, y: rect.maxY),
                        controlPoint2: CGPoint(x: rect.minX, y: rect.maxY - pointe * 0.10))
        chemin.close()
        chemin.lineJoinStyle = .round
        return chemin
    }

    /// Un pentagone régulier — la pièce du ballon de foot, et rien d'autre dans
    /// le dépôt ne sait en tracer un.
    private static func sportPentagonPath(center: CGPoint, radius: CGFloat,
                                          rotation: CGFloat) -> UIBezierPath {
        let chemin = UIBezierPath()
        for index in 0..<5 {
            let angle = rotation - CGFloat.pi / 2 + CGFloat(index) * 2 * CGFloat.pi / 5
            let point = CGPoint(x: center.x + cos(angle) * radius,
                                y: center.y + sin(angle) * radius)
            if index == 0 { chemin.move(to: point) } else { chemin.addLine(to: point) }
        }
        chemin.close()
        chemin.lineJoinStyle = .round
        return chemin
    }

    /// Une bande de ruban droite, de `haut` vers `bas` : les deux bandes de la
    /// médaille se rejoignent derrière le disque.
    private static func sportRibbonStrap(from haut: CGPoint, to bas: CGPoint,
                                         largeur: CGFloat) -> UIBezierPath {
        let bande = UIBezierPath()
        bande.move(to: CGPoint(x: haut.x - largeur / 2, y: haut.y))
        bande.addLine(to: CGPoint(x: haut.x + largeur / 2, y: haut.y))
        bande.addLine(to: CGPoint(x: bas.x + largeur / 2, y: bas.y))
        bande.addLine(to: CGPoint(x: bas.x - largeur / 2, y: bas.y))
        bande.close()
        return bande
    }

    // MARK: - Les objets tracés à gauche des mots

    /// Un chronomètre : la couronne, le boîtier clair, deux aiguilles arrêtées.
    @MainActor
    private static func sportStopwatchIcon(in r: CGRect) {
        let trait = max(1, r.width * 0.07)
        let couronne = UIBezierPath(
            roundedRect: CGRect(x: r.midX - r.width * 0.10, y: r.minY,
                                width: r.width * 0.20, height: r.height * 0.17),
            cornerRadius: r.width * 0.05)
        StickerTemplatePalette.warmBulb.setFill()
        couronne.fill()

        let boîtier = CGRect(x: r.minX + r.width * 0.08, y: r.minY + r.height * 0.20,
                             width: r.width * 0.84, height: r.height * 0.76)
            .insetBy(dx: trait / 2, dy: trait / 2)
        let cadran = UIBezierPath(ovalIn: boîtier)
        StickerTemplatePalette.surface.setFill()
        cadran.fill()
        StickerTemplatePalette.warmBulb.setStroke()
        cadran.lineWidth = trait
        cadran.stroke()

        let centre = CGPoint(x: boîtier.midX, y: boîtier.midY)
        let aiguilles = UIBezierPath()
        aiguilles.move(to: centre)
        aiguilles.addLine(to: CGPoint(x: centre.x, y: boîtier.minY + boîtier.height * 0.16))
        aiguilles.move(to: centre)
        aiguilles.addLine(to: CGPoint(x: boîtier.maxX - boîtier.width * 0.20,
                                      y: centre.y + boîtier.height * 0.14))
        aiguilles.lineWidth = trait * 0.9
        aiguilles.lineCapStyle = .round
        StickerTemplatePalette.pin.setStroke()
        aiguilles.stroke()
    }

    /// Une basket vue de profil : la tige, trois lacets, la semelle rouge.
    @MainActor
    private static func sportSneakerIcon(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1, l * 0.06)
        let tige = UIBezierPath()
        tige.move(to: CGPoint(x: r.minX + l * 0.08, y: r.minY + h * 0.72))
        tige.addLine(to: CGPoint(x: r.minX + l * 0.12, y: r.minY + h * 0.30))
        tige.addCurve(to: CGPoint(x: r.minX + l * 0.48, y: r.minY + h * 0.44),
                      controlPoint1: CGPoint(x: r.minX + l * 0.28, y: r.minY + h * 0.24),
                      controlPoint2: CGPoint(x: r.minX + l * 0.36, y: r.minY + h * 0.36))
        tige.addCurve(to: CGPoint(x: r.maxX - l * 0.06, y: r.minY + h * 0.68),
                      controlPoint1: CGPoint(x: r.minX + l * 0.68, y: r.minY + h * 0.52),
                      controlPoint2: CGPoint(x: r.maxX - l * 0.12, y: r.minY + h * 0.54))
        tige.addLine(to: CGPoint(x: r.maxX - l * 0.06, y: r.minY + h * 0.72))
        tige.close()
        StickerTemplateDrawing.fillWithOutline(tige, fill: StickerTemplatePalette.surface,
                                               outline: StickerTemplatePalette.night, width: trait * 0.6)

        let semelle = UIBezierPath(
            roundedRect: CGRect(x: r.minX + l * 0.04, y: r.minY + h * 0.70,
                                width: l * 0.92, height: h * 0.16),
            cornerRadius: h * 0.08)
        StickerTemplatePalette.pin.setFill()
        semelle.fill()

        StickerTemplatePalette.night.setStroke()
        for index in 0..<3 {
            let lacet = UIBezierPath()
            let x = r.minX + l * (0.20 + CGFloat(index) * 0.11)
            let y = r.minY + h * (0.32 + CGFloat(index) * 0.045)
            lacet.move(to: CGPoint(x: x, y: y))
            lacet.addLine(to: CGPoint(x: x + l * 0.11, y: y + h * 0.13))
            lacet.lineWidth = trait * 0.75
            lacet.lineCapStyle = .round
            lacet.stroke()
        }
    }

    /// Un haltère : la barre claire et quatre disques d'or, les extérieurs plus
    /// hauts — ce qui fait lire le poids.
    @MainActor
    private static func sportDumbbellIcon(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1, l * 0.06)
        let barre = UIBezierPath(
            roundedRect: CGRect(x: r.minX + l * 0.22, y: r.midY - h * 0.07,
                                width: l * 0.56, height: h * 0.14),
            cornerRadius: h * 0.07)
        StickerTemplatePalette.surface.setFill()
        barre.fill()

        let plaques: [(x: CGFloat, hauteur: CGFloat)] = [
            (0.02, 0.46), (0.17, 0.34), (0.69, 0.34), (0.84, 0.46),
        ]
        for plaque in plaques {
            let cadre = CGRect(x: r.minX + l * plaque.x, y: r.midY - h * plaque.hauteur / 2,
                               width: l * 0.14, height: h * plaque.hauteur)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: cadre, cornerRadius: l * 0.05),
                fill: StickerTemplatePalette.warmBulb,
                outline: StickerTemplatePalette.surface, width: trait * 0.4)
        }
    }

    /// Le contour d'une flamme, inscrit dans `rect`. Deux fois tracé — la
    /// grande et son cœur — plutôt que deux dessins qui dériveraient.
    private static func sportFlamePath(in rect: CGRect) -> UIBezierPath {
        let l = rect.width, h = rect.height
        let flamme = UIBezierPath()
        flamme.move(to: CGPoint(x: rect.midX, y: rect.minY))
        flamme.addCurve(to: CGPoint(x: rect.maxX, y: rect.minY + h * 0.62),
                        controlPoint1: CGPoint(x: rect.midX + l * 0.32, y: rect.minY + h * 0.22),
                        controlPoint2: CGPoint(x: rect.maxX, y: rect.minY + h * 0.34))
        flamme.addCurve(to: CGPoint(x: rect.midX, y: rect.maxY),
                        controlPoint1: CGPoint(x: rect.maxX, y: rect.maxY),
                        controlPoint2: CGPoint(x: rect.midX + l * 0.28, y: rect.maxY))
        flamme.addCurve(to: CGPoint(x: rect.minX, y: rect.minY + h * 0.62),
                        controlPoint1: CGPoint(x: rect.midX - l * 0.28, y: rect.maxY),
                        controlPoint2: CGPoint(x: rect.minX, y: rect.maxY))
        flamme.addCurve(to: CGPoint(x: rect.midX, y: rect.minY),
                        controlPoint1: CGPoint(x: rect.minX, y: rect.minY + h * 0.34),
                        controlPoint2: CGPoint(x: rect.midX - l * 0.32, y: rect.minY + h * 0.22))
        flamme.close()
        return flamme
    }

    /// Une flamme claire à cœur rouge — posée sur une carte chaude, une flamme
    /// dorée se serait fondue dans son fond.
    @MainActor
    private static func sportFlameIcon(in r: CGRect) {
        let grande = Self.sportFlamePath(in: r)
        StickerTemplateDrawing.fill(grande, gradientFrom: StickerTemplatePalette.surface,
                                    to: StickerTemplatePalette.warmBulb, in: r)
        let cadre = CGRect(x: r.minX + r.width * 0.28, y: r.minY + r.height * 0.42,
                           width: r.width * 0.44, height: r.height * 0.56)
        StickerTemplatePalette.pin.setFill()
        Self.sportFlamePath(in: cadre).fill()
    }

    /// Un sifflet d'arbitre : le corps, l'embout à droite, l'évent et l'anneau.
    @MainActor
    private static func sportWhistleIcon(in r: CGRect) {
        let l = r.width, h = r.height
        let trait = max(1, l * 0.06)
        let corps = CGRect(x: r.minX + l * 0.04, y: r.minY + h * 0.34,
                           width: l * 0.62, height: h * 0.46)
        let sifflet = UIBezierPath(roundedRect: corps, cornerRadius: corps.height * 0.44)
        sifflet.append(UIBezierPath(
            roundedRect: CGRect(x: corps.maxX - l * 0.04, y: corps.midY - h * 0.10,
                                width: l * 0.30, height: h * 0.20),
            cornerRadius: h * 0.06))
        StickerTemplateDrawing.fillWithOutline(sifflet, fill: StickerTemplatePalette.warmBulb,
                                               outline: StickerTemplatePalette.surface, width: trait * 0.5)

        let évent = corps.width * 0.24
        StickerTemplatePalette.night.setFill()
        UIBezierPath(ovalIn: CGRect(x: corps.minX + corps.width * 0.28,
                                    y: corps.midY - évent / 2,
                                    width: évent, height: évent)).fill()

        let anneau = UIBezierPath(ovalIn: CGRect(x: corps.minX + corps.width * 0.14,
                                                 y: r.minY + h * 0.04,
                                                 width: l * 0.24, height: h * 0.32))
        anneau.lineWidth = trait
        StickerTemplatePalette.surface.setStroke()
        anneau.stroke()
    }

    // MARK: - sport.soccerBall — le ballon

    @MainActor
    private static func sportBallSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 2.8), height: ceil(metrics.fontSize * 2.8))
    }

    @MainActor
    private static func sportBallImage(metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = sportBallSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let trait = max(1.5, metrics.fontSize * 0.07)
            let cadre = CGRect(origin: .zero, size: taille).insetBy(dx: trait / 2, dy: trait / 2)
            let disque = UIBezierPath(ovalIn: cadre)
            StickerTemplateDrawing.fill(disque, gradientFrom: StickerTemplatePalette.surface,
                                        to: StickerTemplatePalette.hairline, in: cadre)
            StickerTemplatePalette.night.setStroke()
            disque.lineWidth = trait
            disque.stroke()
            let centre = CGPoint(x: cadre.midX, y: cadre.midY)
            let rayon = cadre.width / 2
            StickerTemplatePalette.night.setFill()
            Self.sportPentagonPath(center: centre, radius: rayon * 0.34, rotation: 0).fill()
            // Les pièces du bord sont RETOURNÉES et posées dans l'axe des pointes
            // du pentagone central : sans ce décalage, on lirait une rosace.
            StickerTemplatePalette.night.setStroke()
            for index in 0..<5 {
                let angle = -CGFloat.pi / 2 + CGFloat(index) * 2 * CGFloat.pi / 5
                let axe = CGPoint(x: cos(angle), y: sin(angle))
                Self.sportPentagonPath(
                    center: CGPoint(x: centre.x + axe.x * rayon * 0.70,
                                    y: centre.y + axe.y * rayon * 0.70),
                    radius: rayon * 0.24, rotation: angle + CGFloat.pi / 2).fill()
                let couture = UIBezierPath()
                couture.move(to: CGPoint(x: centre.x + axe.x * rayon * 0.34,
                                         y: centre.y + axe.y * rayon * 0.34))
                couture.addLine(to: CGPoint(x: centre.x + axe.x * rayon * 0.50,
                                            y: centre.y + axe.y * rayon * 0.50))
                couture.lineWidth = trait * 0.8
                couture.lineCapStyle = .round
                couture.stroke()
            }
        }
    }

    // MARK: - sport.goldMedal — la médaille moletée

    @MainActor
    private static var sportGoldMedalCaption: String {
        String(localized: "sticker.template.sport.goldMedal.caption", defaultValue: "N°1", bundle: .module)
    }

    @MainActor
    private static func sportMedalLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, ruban: CGFloat, disque: CGFloat, taille: CGSize) {
        let légende = sportGoldMedalCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.60, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // Le médaillon ne fait que 70 % du disque : le mot doit tenir DEDANS.
        let disque = ceil(max(metrics.fontSize * 2.8,
                              tailleTexte.width * 1.7 + metrics.horizontalPadding))
        let ruban = metrics.fontSize * 0.95
        return (légende, police, ruban, disque,
                CGSize(width: disque, height: ceil(ruban + disque)))
    }

    @MainActor
    private static func sportMedalSize(metrics: StickerTemplateMetrics) -> CGSize {
        sportMedalLayout(metrics: metrics).taille
    }

    @MainActor
    private static func sportMedalImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = sportMedalLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.07)
            let cx = l.taille.width / 2
            let attache = CGPoint(x: cx, y: l.ruban + l.disque * 0.20)
            StickerTemplatePalette.pin.setFill()
            Self.sportRibbonStrap(from: CGPoint(x: cx - l.disque * 0.30, y: 0), to: attache,
                                  largeur: l.ruban * 0.55).fill()
            StickerTemplatePalette.sky.setFill()
            Self.sportRibbonStrap(from: CGPoint(x: cx + l.disque * 0.30, y: 0), to: attache,
                                  largeur: l.ruban * 0.55).fill()

            // Le bord MOLETÉ — ce qui distingue une médaille frappée d'un jeton.
            let cadre = CGRect(x: bord / 2, y: l.ruban + bord / 2,
                               width: l.disque - bord, height: l.disque - bord)
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.starPath(in: cadre, points: 26, innerRatio: 0.90),
                gradientFrom: StickerTemplatePalette.warmBulb, to: StickerTemplatePalette.pin,
                in: cadre, outline: StickerTemplatePalette.surface, width: bord * 0.4)
            let médaillon = cadre.insetBy(dx: cadre.width * 0.15, dy: cadre.height * 0.15)
            let creux = UIBezierPath(ovalIn: médaillon)
            StickerTemplatePalette.surface.setFill()
            creux.fill()
            StickerTemplatePalette.night.setStroke()
            creux.lineWidth = bord * 0.5
            creux.stroke()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.night, in: médaillon)
        }
    }

    // MARK: - sport.trophy — la coupe

    @MainActor
    private static func sportTrophySize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 2.7), height: ceil(metrics.fontSize * 3.0))
    }

    @MainActor
    private static func sportTrophyImage(metrics: StickerTemplateMetrics,
                                         screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = sportTrophySize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.06)

            // Les anses d'abord : la vasque les recouvre à leur naissance, comme
            // deux anneaux soudés au bord.
            StickerTemplatePalette.warmBulb.setStroke()
            for côté in [CGFloat(-1), CGFloat(1)] {
                let anse = UIBezierPath(
                    arcCenter: CGPoint(x: l / 2 + côté * l * 0.32, y: h * 0.24),
                    radius: l * 0.15,
                    startAngle: côté < 0 ? CGFloat.pi / 2 : -CGFloat.pi / 2,
                    endAngle: côté < 0 ? 3 * CGFloat.pi / 2 : CGFloat.pi / 2,
                    clockwise: true)
                anse.lineWidth = trait * 1.4
                anse.lineCapStyle = .round
                anse.stroke()
            }
            let vasque = UIBezierPath()
            vasque.move(to: CGPoint(x: l * 0.20, y: h * 0.09))
            vasque.addLine(to: CGPoint(x: l * 0.80, y: h * 0.09))
            vasque.addCurve(to: CGPoint(x: l * 0.50, y: h * 0.58),
                            controlPoint1: CGPoint(x: l * 0.79, y: h * 0.42),
                            controlPoint2: CGPoint(x: l * 0.66, y: h * 0.58))
            vasque.addCurve(to: CGPoint(x: l * 0.20, y: h * 0.09),
                            controlPoint1: CGPoint(x: l * 0.34, y: h * 0.58),
                            controlPoint2: CGPoint(x: l * 0.21, y: h * 0.42))
            vasque.close()
            let cadre = CGRect(x: l * 0.20, y: h * 0.09, width: l * 0.60, height: h * 0.49)
            StickerTemplateDrawing.fillWithOutline(vasque,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: trait * 0.5)
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.starPath(in: CGRect(x: l * 0.36, y: h * 0.16,
                                                           width: l * 0.28, height: l * 0.28),
                                                points: 5, innerRatio: 0.46),
                fill: StickerTemplatePalette.surface,
                outline: StickerTemplatePalette.warmBulb, width: trait * 0.3)
            StickerTemplatePalette.night.setFill()
            UIBezierPath(rect: CGRect(x: l * 0.43, y: h * 0.55, width: l * 0.14, height: h * 0.20)).fill()
            UIBezierPath(roundedRect: CGRect(x: l * 0.28, y: h * 0.73, width: l * 0.44, height: h * 0.10),
                         cornerRadius: h * 0.03).fill()
            UIBezierPath(roundedRect: CGRect(x: l * 0.18, y: h * 0.83, width: l * 0.64, height: h * 0.13),
                         cornerRadius: h * 0.04).fill()
        }
    }

    // MARK: - sport.bike — le vélo

    @MainActor
    private static func sportBikeSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 3.6), height: ceil(metrics.fontSize * 2.2))
    }

    @MainActor
    private static func sportBikeImage(metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = sportBikeSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let rayon = h * 0.30
            let moyeux = [CGPoint(x: l * 0.22, y: h * 0.66), CGPoint(x: l * 0.78, y: h * 0.66)]
            for moyeu in moyeux {
                let roue = UIBezierPath(arcCenter: moyeu, radius: rayon,
                                        startAngle: 0, endAngle: 2 * CGFloat.pi, clockwise: true)
                roue.lineWidth = trait * 1.6
                StickerTemplatePalette.surface.setStroke()
                roue.stroke()
                let rais = UIBezierPath()
                for index in 0..<6 {
                    let angle = CGFloat(index) / 6 * 2 * CGFloat.pi
                    rais.move(to: moyeu)
                    rais.addLine(to: CGPoint(x: moyeu.x + cos(angle) * rayon * 0.86,
                                             y: moyeu.y + sin(angle) * rayon * 0.86))
                }
                rais.lineWidth = trait * 0.5
                StickerTemplatePalette.surface.withAlphaComponent(0.6).setStroke()
                rais.stroke()
            }
            let cadre = UIBezierPath()
            let selle = CGPoint(x: l * 0.40, y: h * 0.28)
            cadre.move(to: moyeux[0])
            cadre.addLine(to: selle)
            cadre.addLine(to: moyeux[1])
            cadre.addLine(to: moyeux[0])
            cadre.move(to: selle)
            cadre.addLine(to: CGPoint(x: l * 0.72, y: h * 0.24))
            cadre.addLine(to: CGPoint(x: l * 0.62, y: h * 0.18))
            cadre.lineWidth = trait * 1.4
            cadre.lineCapStyle = .round
            cadre.lineJoinStyle = .round
            StickerTemplatePalette.warmBulb.setStroke()
            cadre.stroke()
            StickerTemplatePalette.pin.setFill()
            let pédalier = h * 0.14
            UIBezierPath(ovalIn: CGRect(x: l * 0.50 - pédalier / 2, y: h * 0.66 - pédalier / 2,
                                        width: pédalier, height: pédalier)).fill()
            StickerTemplatePalette.night.setFill()
            UIBezierPath(roundedRect: CGRect(x: l * 0.33, y: h * 0.21, width: l * 0.14, height: h * 0.08),
                         cornerRadius: h * 0.04).fill()
        }
    }

    // MARK: - sport.podium — les trois marches

    @MainActor
    private static func sportPodiumSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 3.4), height: ceil(metrics.fontSize * 2.6))
    }

    @MainActor
    private static func sportPodiumImage(metrics: StickerTemplateMetrics,
                                         screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = sportPodiumSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1, metrics.fontSize * 0.05)
            let police = StickerTemplateDrawing.digitFont(size: metrics.fontSize * 0.60, weight: .black)
            let marches: [(x: CGFloat, largeur: CGFloat, sommet: CGFloat,
                           couleur: UIColor, chiffre: String)] = [
                (0.02, 0.30, 0.46, StickerTemplatePalette.lilac, "2"),
                (0.345, 0.31, 0.22, StickerTemplatePalette.warmBulb, "1"),
                (0.68, 0.30, 0.60, StickerTemplatePalette.indigoLight, "3"),
            ]
            for marche in marches {
                let bloc = CGRect(x: l * marche.x + trait / 2, y: h * marche.sommet,
                                  width: l * marche.largeur - trait, height: h - trait / 2 - h * marche.sommet)
                let forme = UIBezierPath(roundedRect: bloc, cornerRadius: l * 0.03)
                marche.couleur.setFill()
                forme.fill()
                StickerTemplatePalette.surface.setStroke()
                forme.lineWidth = trait
                forme.stroke()
                StickerTemplateDrawing.drawCentered(
                    marche.chiffre, font: police, color: StickerTemplatePalette.night,
                    in: CGRect(x: bloc.minX, y: bloc.minY + h * 0.04,
                               width: bloc.width, height: h * 0.28))
            }
            // L'étoile de la première marche : sans elle, trois blocs colorés ne
            // disent pas un podium.
            let côté = h * 0.19
            StickerTemplateDrawing.fillWithOutline(
                StickerTemplateDrawing.starPath(in: CGRect(x: l / 2 - côté / 2, y: h * 0.02,
                                                           width: côté, height: côté),
                                                points: 5, innerRatio: 0.46),
                fill: StickerTemplatePalette.warmBulb,
                outline: StickerTemplatePalette.surface, width: trait * 0.5)
        }
    }

    // MARK: - Le registre de la famille SPORT

    private static let sportCards: [SportCard] = [
        SportCard(id: StickerTemplateCatalog.ID.sportStopwatch,
                  name: { String(localized: "sticker.template.sport.stopwatch", defaultValue: "Record !", bundle: .module) },
                  fond: .pastille,
                  haut: StickerTemplatePalette.night, bas: StickerTemplatePalette.ink,
                  liseré: StickerTemplatePalette.warmBulb,
                  texte: StickerTemplatePalette.surface,
                  icône: { r in Self.sportStopwatchIcon(in: r) }),
        SportCard(id: StickerTemplateCatalog.ID.sportSneakers,
                  name: { String(localized: "sticker.template.sport.sneakers", defaultValue: "On y va", bundle: .module) },
                  fond: .cartouche,
                  haut: StickerTemplatePalette.leaf, bas: StickerTemplatePalette.sky,
                  liseré: StickerTemplatePalette.surface.withAlphaComponent(0.7),
                  texte: StickerTemplatePalette.surface,
                  icône: { r in Self.sportSneakerIcon(in: r) }),
        SportCard(id: StickerTemplateCatalog.ID.sportDumbbell,
                  name: { String(localized: "sticker.template.sport.dumbbell", defaultValue: "Séance", bundle: .module) },
                  fond: .fanion,
                  haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.night,
                  liseré: StickerTemplatePalette.surface.withAlphaComponent(0.6),
                  texte: StickerTemplatePalette.surface,
                  icône: { r in Self.sportDumbbellIcon(in: r) }),
        SportCard(id: StickerTemplateCatalog.ID.sportFlame,
                  name: { String(localized: "sticker.template.sport.flame", defaultValue: "En feu", bundle: .module) },
                  fond: .bulle,
                  haut: StickerTemplatePalette.pin, bas: StickerTemplatePalette.loveCool,
                  liseré: StickerTemplatePalette.surface,
                  texte: StickerTemplatePalette.surface,
                  icône: { r in Self.sportFlameIcon(in: r) }),
        SportCard(id: StickerTemplateCatalog.ID.sportWhistle,
                  name: { String(localized: "sticker.template.sport.whistle", defaultValue: "Coup d'envoi", bundle: .module) },
                  fond: .écusson,
                  haut: StickerTemplatePalette.sky, bas: StickerTemplatePalette.accent,
                  liseré: StickerTemplatePalette.surface,
                  texte: StickerTemplatePalette.surface,
                  icône: { r in Self.sportWhistleIcon(in: r) }),
    ]

    static let sportDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.sportSoccerBall,
            name: { String(localized: "sticker.template.sport.soccerBall", defaultValue: "Ballon de foot", bundle: .module) },
            measure: { _, m in Self.sportBallSize(metrics: m) },
            draw: { _, m, échelle in Self.sportBallImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.sportGoldMedal,
            name: { String(localized: "sticker.template.sport.goldMedal", defaultValue: "Médaille d'or", bundle: .module) },
            measure: { _, m in Self.sportMedalSize(metrics: m) },
            draw: { _, m, échelle in Self.sportMedalImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.sportTrophy,
            name: { String(localized: "sticker.template.sport.trophy", defaultValue: "Trophée", bundle: .module) },
            measure: { _, m in Self.sportTrophySize(metrics: m) },
            draw: { _, m, échelle in Self.sportTrophyImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.sportBike,
            name: { String(localized: "sticker.template.sport.bike", defaultValue: "À vélo", bundle: .module) },
            measure: { _, m in Self.sportBikeSize(metrics: m) },
            draw: { _, m, échelle in Self.sportBikeImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.sportPodium,
            name: { String(localized: "sticker.template.sport.podium", defaultValue: "Podium", bundle: .module) },
            measure: { _, m in Self.sportPodiumSize(metrics: m) },
            draw: { _, m, échelle in Self.sportPodiumImage(metrics: m, screenScale: échelle) }),
    ] + sportCards.map { sportCardDrawer($0) }
}
