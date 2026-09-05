import Foundation
import UIKit
import MeeshySDK

// MARK: - Quatre pastilles de lieu de plus (#4820)

/// Quatre SILHOUETTES de plus pour le lieu — une carte pliée, un panneau sur
/// son poteau, une étiquette de bagage, un globe — parce que dix cartouches
/// rectangulaires ne se distinguent pas du coin de l'œil dans la palette.
///
/// Tous lisent `placeName` / `placeDetail` (`StickerTemplates+Location`) : le
/// détail est VIDE pour un lieu sans nom, et aucun d'eux ne dessine alors une
/// seconde ligne. Fichier séparé de `+LocationExtra`, qui tenait déjà son
/// budget — ce sont quatre formes indépendantes, sans code commun avec lui.
extension StickerTemplateRenderer {

    // MARK: Les deux lignes d'un lieu, mesurées une fois

    /// Le nom et son détail, polices et mesures comprises. La hauteur du bloc
    /// tient compte de l'absence du détail : c'est elle que chaque gabarit
    /// mesure, donc la boîte et le dessin ne divergent jamais.
    private struct PlaceLines {
        let nom: String
        let détail: String
        let policeNom: UIFont
        let policeDétail: UIFont
        let tailleNom: CGSize
        let tailleDétail: CGSize
        let entre: CGFloat

        var largeur: CGFloat { max(tailleNom.width, tailleDétail.width) }
        var hauteur: CGFloat {
            tailleNom.height + (détail.isEmpty ? 0 : entre + tailleDétail.height)
        }
    }

    @MainActor
    private static func placeLines(slots: [String: String], metrics: StickerTemplateMetrics,
                                   nameScale: CGFloat, nameWeight: UIFont.Weight,
                                   detailScale: CGFloat) -> PlaceLines {
        let nom = placeName(slots)
        let détail = placeDetail(slots)
        let policeNom = StickerTemplateDrawing.font(size: metrics.fontSize * nameScale, weight: nameWeight)
        let policeDétail = StickerTemplateDrawing.font(size: metrics.fontSize * detailScale, weight: .medium)
        return PlaceLines(
            nom: nom, détail: détail,
            policeNom: policeNom, policeDétail: policeDétail,
            tailleNom: StickerTemplateDrawing.measure(nom, font: policeNom),
            tailleDétail: détail.isEmpty ? .zero : StickerTemplateDrawing.measure(détail, font: policeDétail),
            entre: metrics.gap * 0.4)
    }

    /// Dessine les deux lignes, alignées à gauche sur `x` ou centrées sur lui.
    @MainActor
    private static func drawPlaceLines(_ l: PlaceLines, x: CGFloat, y: CGFloat,
                                       centered: Bool, color: UIColor) {
        let xNom = centered ? x - l.tailleNom.width / 2 : x
        StickerTemplateDrawing.draw(l.nom, font: l.policeNom, color: color,
                                    at: CGPoint(x: xNom, y: y))
        guard !l.détail.isEmpty else { return }
        let xDétail = centered ? x - l.tailleDétail.width / 2 : x
        StickerTemplateDrawing.draw(l.détail, font: l.policeDétail,
                                    color: color.withAlphaComponent(0.66),
                                    at: CGPoint(x: xDétail, y: y + l.tailleNom.height + l.entre))
    }

    // MARK: - location.mapPin — la carte pliée

    private struct MapPinLayout {
        let lignes: PlaceLines
        let carte: CGSize
        let taille: CGSize
    }

    @MainActor
    private static func mapPinLayout(slots: [String: String],
                                     metrics: StickerTemplateMetrics) -> MapPinLayout {
        let lignes = placeLines(slots: slots, metrics: metrics,
                                nameScale: 0.82, nameWeight: .bold, detailScale: 0.55)
        // La carte est au moins aussi large que le nom qu'elle coiffe : plus
        // étroite, elle aurait l'air d'une vignette collée sur le texte.
        let carte = CGSize(width: max(metrics.fontSize * 3.2, lignes.largeur),
                           height: metrics.fontSize * 1.55)
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2 + carte.width),
            height: ceil(metrics.verticalPadding * 2 + carte.height + metrics.gap * 0.8 + lignes.hauteur)
        )
        return MapPinLayout(lignes: lignes, carte: carte, taille: taille)
    }

    @MainActor
    static func mapPinSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        mapPinLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func mapPinImage(slots: [String: String], metrics: StickerTemplateMetrics,
                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = mapPinLayout(slots: slots, metrics: metrics)
        let trait = max(1, metrics.fontSize * 0.05)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: trait, dy: trait)
            let fond = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.3)
            StickerTemplatePalette.surface.setFill()
            fond.fill()
            StickerTemplatePalette.hairline.setStroke()
            fond.lineWidth = trait
            fond.stroke()

            let carte = CGRect(x: (l.taille.width - l.carte.width) / 2, y: metrics.verticalPadding,
                               width: l.carte.width, height: l.carte.height)
            Self.drawFoldedMap(in: carte, lineWidth: trait)
            let épingle = CGRect(x: carte.midX - metrics.fontSize * 0.28,
                                 y: carte.minY + metrics.fontSize * 0.05,
                                 width: metrics.fontSize * 0.56, height: metrics.fontSize * 0.82)
            Self.drawPin(in: épingle)

            Self.drawPlaceLines(l.lignes, x: l.taille.width / 2, y: carte.maxY + metrics.gap * 0.8,
                                centered: true, color: StickerTemplatePalette.label)
        }
    }

    /// Trois panneaux en accordéon : ceux du bord se replient vers l'arrière
    /// — leur tranche extérieure est plus courte —, le central reste de face
    /// et plus clair, c'est lui qui prend la lumière.
    @MainActor
    private static func drawFoldedMap(in r: CGRect, lineWidth: CGFloat) {
        let panneau = r.width / 3
        let repli = r.height * 0.12
        let gauche = UIBezierPath()
        gauche.move(to: CGPoint(x: r.minX, y: r.minY + repli))
        gauche.addLine(to: CGPoint(x: r.minX + panneau, y: r.minY))
        gauche.addLine(to: CGPoint(x: r.minX + panneau, y: r.maxY))
        gauche.addLine(to: CGPoint(x: r.minX, y: r.maxY - repli))
        gauche.close()
        let droite = UIBezierPath()
        droite.move(to: CGPoint(x: r.maxX - panneau, y: r.minY))
        droite.addLine(to: CGPoint(x: r.maxX, y: r.minY + repli))
        droite.addLine(to: CGPoint(x: r.maxX, y: r.maxY - repli))
        droite.addLine(to: CGPoint(x: r.maxX - panneau, y: r.maxY))
        droite.close()
        let centre = UIBezierPath(rect: CGRect(x: r.minX + panneau, y: r.minY,
                                               width: panneau, height: r.height))

        StickerTemplatePalette.sky.withAlphaComponent(0.55).setFill()
        gauche.fill()
        droite.fill()
        StickerTemplatePalette.sky.withAlphaComponent(0.28).setFill()
        centre.fill()

        // Les routes, tracées sous le clip des trois panneaux pour s'arrêter
        // au bord de la carte et non de son cadre.
        if let contexte = UIGraphicsGetCurrentContext() {
            contexte.saveGState()
            let masque = UIBezierPath()
            masque.append(gauche)
            masque.append(centre)
            masque.append(droite)
            masque.addClip()

            let principale = UIBezierPath()
            principale.move(to: CGPoint(x: r.minX, y: r.minY + r.height * 0.72))
            principale.addCurve(to: CGPoint(x: r.maxX, y: r.minY + r.height * 0.30),
                                controlPoint1: CGPoint(x: r.minX + r.width * 0.35, y: r.minY + r.height * 0.95),
                                controlPoint2: CGPoint(x: r.minX + r.width * 0.60, y: r.minY + r.height * 0.05))
            principale.lineWidth = lineWidth * 1.6
            StickerTemplatePalette.warmBulb.setStroke()
            principale.stroke()

            let secondaire = UIBezierPath()
            secondaire.move(to: CGPoint(x: r.minX + r.width * 0.15, y: r.minY))
            secondaire.addCurve(to: CGPoint(x: r.minX + r.width * 0.55, y: r.maxY),
                                controlPoint1: CGPoint(x: r.minX + r.width * 0.10, y: r.minY + r.height * 0.55),
                                controlPoint2: CGPoint(x: r.minX + r.width * 0.60, y: r.minY + r.height * 0.55))
            secondaire.lineWidth = lineWidth
            StickerTemplatePalette.leaf.setStroke()
            secondaire.stroke()
            contexte.restoreGState()
        }

        StickerTemplatePalette.hairline.setStroke()
        for x in [r.minX + panneau, r.maxX - panneau] {
            let pli = UIBezierPath()
            pli.move(to: CGPoint(x: x, y: r.minY))
            pli.addLine(to: CGPoint(x: x, y: r.maxY))
            pli.lineWidth = lineWidth
            pli.stroke()
        }
    }

    /// L'épingle : la goutte partagée RETOURNÉE — la pointe en bas, sur le
    /// lieu — et un disque clair au cœur de sa tête. La matrice est écrite en
    /// clair (`d = -1`, `ty = minY + maxY`) : elle échange `minY` et `maxY`
    /// sans dépendre de l'ordre de composition des transformations.
    @MainActor
    private static func drawPin(in r: CGRect) {
        let goutte = StickerTemplateDrawing.dropPath(in: r)
        goutte.apply(CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: r.minY + r.maxY))
        StickerTemplatePalette.pin.setFill()
        goutte.fill()
        StickerTemplatePalette.surface.setFill()
        UIBezierPath(arcCenter: CGPoint(x: r.midX, y: r.minY + r.height * 0.38),
                     radius: r.width * 0.2,
                     startAngle: 0, endAngle: .pi * 2, clockwise: true).fill()
    }

    // MARK: - location.roadSign — le panneau directionnel

    private struct RoadSignLayout {
        let lignes: PlaceLines
        let panneau: CGSize
        let pointe: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func roadSignLayout(slots: [String: String],
                                       metrics: StickerTemplateMetrics) -> RoadSignLayout {
        let lignes = placeLines(slots: slots, metrics: metrics,
                                nameScale: 0.82, nameWeight: .heavy, detailScale: 0.52)
        let pointe = metrics.fontSize * 0.7
        let panneau = CGSize(width: metrics.horizontalPadding * 2 + lignes.largeur + pointe,
                             height: metrics.verticalPadding * 2 + lignes.hauteur)
        // Le poteau prolonge le panneau vers le bas : c'est lui qui fait la
        // silhouette, et il compte dans la boîte de tap.
        let taille = CGSize(width: ceil(panneau.width),
                            height: ceil(panneau.height + metrics.fontSize * 0.9))
        return RoadSignLayout(lignes: lignes, panneau: panneau, pointe: pointe, taille: taille)
    }

    @MainActor
    static func roadSignSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        roadSignLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func roadSignImage(slots: [String: String], metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = roadSignLayout(slots: slots, metrics: metrics)
        let liseré = max(1, metrics.fontSize * 0.05)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let panneau = CGRect(origin: .zero, size: l.panneau).insetBy(dx: liseré, dy: liseré)

            // Le poteau d'abord : le panneau le recouvre. Accent, et non l'encre
            // du label — un poteau indigo sombre disparaîtrait sur une nuit.
            let mât = UIBezierPath()
            let xMât = panneau.minX + panneau.width * 0.30
            mât.move(to: CGPoint(x: xMât, y: panneau.maxY - metrics.fontSize * 0.1))
            mât.addLine(to: CGPoint(x: xMât, y: l.taille.height - metrics.fontSize * 0.08))
            mât.lineWidth = max(1, metrics.fontSize * 0.14)
            mât.lineCapStyle = .round
            StickerTemplatePalette.accent.setStroke()
            mât.stroke()

            let flèche = Self.arrowSignPath(in: panneau, tip: l.pointe)
            StickerTemplateDrawing.fillWithOutline(flèche, fill: StickerTemplatePalette.leaf,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: liseré)

            Self.drawPlaceLines(l.lignes, x: panneau.minX + metrics.horizontalPadding,
                                y: panneau.midY - l.lignes.hauteur / 2,
                                centered: false, color: StickerTemplatePalette.surface)
        }
    }

    /// Un pentagone fléché vers la droite — rectangle + pointe. Les angles
    /// sont adoucis par le trait à jointure ronde de `fillWithOutline`.
    private static func arrowSignPath(in r: CGRect, tip: CGFloat) -> UIBezierPath {
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: r.minX, y: r.minY))
        chemin.addLine(to: CGPoint(x: r.maxX - tip, y: r.minY))
        chemin.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        chemin.addLine(to: CGPoint(x: r.maxX - tip, y: r.maxY))
        chemin.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        chemin.close()
        return chemin
    }

    // MARK: - location.luggageTag — l'étiquette de bagage

    private struct LuggageTagLayout {
        let lignes: PlaceLines
        /// La marge réservée à la ficelle, à gauche de l'étiquette.
        let ficelle: CGFloat
        /// La zone de l'œillet, entre le bord coupé et le texte.
        let œillet: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func luggageTagLayout(slots: [String: String],
                                         metrics: StickerTemplateMetrics) -> LuggageTagLayout {
        let lignes = placeLines(slots: slots, metrics: metrics,
                                nameScale: 0.8, nameWeight: .bold, detailScale: 0.5)
        let ficelle = metrics.fontSize * 0.9
        let œillet = metrics.fontSize * 0.95
        let taille = CGSize(
            width: ceil(ficelle + œillet + metrics.horizontalPadding * 1.6 + lignes.largeur),
            height: ceil(metrics.verticalPadding * 2 + lignes.hauteur)
        )
        return LuggageTagLayout(lignes: lignes, ficelle: ficelle, œillet: œillet, taille: taille)
    }

    @MainActor
    static func luggageTagSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        luggageTagLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func luggageTagImage(slots: [String: String], metrics: StickerTemplateMetrics,
                                screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = luggageTagLayout(slots: slots, metrics: metrics)
        let liseré = max(1, metrics.fontSize * 0.05)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let étiquette = CGRect(x: l.ficelle, y: 0,
                                   width: l.taille.width - l.ficelle, height: l.taille.height)
                .insetBy(dx: liseré, dy: liseré)
            let forme = Self.tagPath(in: étiquette, chamfer: metrics.fontSize * 0.45)
            StickerTemplateDrawing.fillWithOutline(forme,
                                                   gradientFrom: StickerTemplatePalette.surface,
                                                   to: StickerTemplatePalette.warmBulb,
                                                   in: étiquette,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: liseré)

            // Le trou est CREUSÉ (`.clear`), jamais peint en blanc : on doit
            // voir la scène au travers, comme au travers d'un vrai œillet.
            let trou = CGPoint(x: étiquette.minX + l.œillet * 0.5, y: étiquette.midY)
            let rayonTrou = metrics.fontSize * 0.14
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                contexte.setBlendMode(.clear)
                UIBezierPath(arcCenter: trou, radius: rayonTrou,
                             startAngle: 0, endAngle: .pi * 2, clockwise: true).fill()
                contexte.restoreGState()
            }
            let renfort = UIBezierPath(arcCenter: trou, radius: rayonTrou * 1.7,
                                       startAngle: 0, endAngle: .pi * 2, clockwise: true)
            renfort.lineWidth = max(1, metrics.fontSize * 0.06)
            StickerTemplatePalette.hairline.setStroke()
            renfort.stroke()

            // La ficelle passe par le trou et fait une boucle vers la gauche.
            let corde = UIBezierPath()
            let h = l.taille.height
            let xGauche = liseré * 2
            corde.move(to: trou)
            corde.addCurve(to: CGPoint(x: xGauche, y: trou.y - h * 0.18),
                           controlPoint1: CGPoint(x: trou.x - l.ficelle * 0.35, y: trou.y - h * 0.28),
                           controlPoint2: CGPoint(x: xGauche + l.ficelle * 0.2, y: trou.y - h * 0.42))
            corde.addCurve(to: trou,
                           controlPoint1: CGPoint(x: xGauche, y: trou.y + h * 0.40),
                           controlPoint2: CGPoint(x: trou.x - l.ficelle * 0.35, y: trou.y + h * 0.28))
            corde.lineWidth = max(1, metrics.fontSize * 0.06)
            corde.lineCapStyle = .round
            corde.stroke()

            Self.drawPlaceLines(l.lignes, x: étiquette.minX + l.œillet + metrics.horizontalPadding * 0.6,
                                y: étiquette.midY - l.lignes.hauteur / 2,
                                centered: false, color: StickerTemplatePalette.label)
        }
    }

    /// Une étiquette allongée dont le coin haut-gauche est COUPÉ — la
    /// silhouette d'une étiquette de bagage, reconnaissable avant d'être lue.
    private static func tagPath(in r: CGRect, chamfer: CGFloat) -> UIBezierPath {
        let coin = min(chamfer, r.height * 0.45)
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: r.minX + coin, y: r.minY))
        chemin.addLine(to: CGPoint(x: r.maxX, y: r.minY))
        chemin.addLine(to: CGPoint(x: r.maxX, y: r.maxY))
        chemin.addLine(to: CGPoint(x: r.minX, y: r.maxY))
        chemin.addLine(to: CGPoint(x: r.minX, y: r.minY + coin))
        chemin.close()
        return chemin
    }

    // MARK: - location.globe — le globe

    private struct GlobeLayout {
        let lignes: PlaceLines
        let globe: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func globeLayout(slots: [String: String],
                                    metrics: StickerTemplateMetrics) -> GlobeLayout {
        let lignes = placeLines(slots: slots, metrics: metrics,
                                nameScale: 0.8, nameWeight: .bold, detailScale: 0.5)
        let globe = metrics.fontSize * 1.5
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2.2 + globe + metrics.gap + lignes.largeur),
            height: ceil(max(globe, lignes.hauteur) + metrics.verticalPadding * 1.6)
        )
        return GlobeLayout(lignes: lignes, globe: globe, taille: taille)
    }

    @MainActor
    static func globeSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        globeLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func globeImage(slots: [String: String], metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = globeLayout(slots: slots, metrics: metrics)
        let liseré = max(1, metrics.fontSize * 0.05)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: liseré, dy: liseré)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.34)
            StickerTemplatePalette.surface.setFill()
            carte.fill()
            StickerTemplatePalette.hairline.setStroke()
            carte.lineWidth = liseré
            carte.stroke()

            let disque = CGRect(x: cadre.minX + metrics.horizontalPadding * 1.1,
                                y: cadre.midY - l.globe / 2,
                                width: l.globe, height: l.globe)
            Self.drawGlobe(in: disque, lineWidth: liseré)

            Self.drawPlaceLines(l.lignes, x: disque.maxX + metrics.gap,
                                y: cadre.midY - l.lignes.hauteur / 2,
                                centered: false, color: StickerTemplatePalette.label)
        }
    }

    /// Un disque de ciel ombré vers l'indigo, un continent de forme LIBRE —
    /// aucune terre réelle : un globe de décoration ne doit pas avoir l'air de
    /// désigner un pays —, deux méridiens et l'équateur en clair.
    @MainActor
    private static func drawGlobe(in r: CGRect, lineWidth: CGFloat) {
        let disque = UIBezierPath(ovalIn: r)
        StickerTemplateDrawing.fill(disque, gradientFrom: StickerTemplatePalette.sky,
                                    to: StickerTemplatePalette.accent, in: r)
        guard let contexte = UIGraphicsGetCurrentContext() else { return }
        contexte.saveGState()
        disque.addClip()

        let x = r.minX, y = r.minY, w = r.width, h = r.height
        let terre = UIBezierPath()
        terre.move(to: CGPoint(x: x + w * 0.30, y: y + h * 0.22))
        terre.addCurve(to: CGPoint(x: x + w * 0.66, y: y + h * 0.30),
                       controlPoint1: CGPoint(x: x + w * 0.42, y: y + h * 0.10),
                       controlPoint2: CGPoint(x: x + w * 0.60, y: y + h * 0.14))
        terre.addCurve(to: CGPoint(x: x + w * 0.58, y: y + h * 0.62),
                       controlPoint1: CGPoint(x: x + w * 0.74, y: y + h * 0.42),
                       controlPoint2: CGPoint(x: x + w * 0.70, y: y + h * 0.56))
        terre.addCurve(to: CGPoint(x: x + w * 0.36, y: y + h * 0.74),
                       controlPoint1: CGPoint(x: x + w * 0.50, y: y + h * 0.70),
                       controlPoint2: CGPoint(x: x + w * 0.44, y: y + h * 0.84))
        terre.addCurve(to: CGPoint(x: x + w * 0.30, y: y + h * 0.22),
                       controlPoint1: CGPoint(x: x + w * 0.24, y: y + h * 0.60),
                       controlPoint2: CGPoint(x: x + w * 0.20, y: y + h * 0.36))
        terre.close()
        StickerTemplatePalette.leaf.setFill()
        terre.fill()

        StickerTemplatePalette.surface.withAlphaComponent(0.7).setStroke()
        let largeurs: [CGFloat] = [0.36, 0.72]
        for largeur in largeurs {
            let méridien = UIBezierPath(ovalIn: CGRect(x: r.midX - w * largeur / 2, y: r.minY,
                                                       width: w * largeur, height: h))
            méridien.lineWidth = lineWidth
            méridien.stroke()
        }
        let équateur = UIBezierPath()
        équateur.move(to: CGPoint(x: r.minX, y: r.midY))
        équateur.addLine(to: CGPoint(x: r.maxX, y: r.midY))
        équateur.lineWidth = lineWidth
        équateur.stroke()
        contexte.restoreGState()

        // Le liseré clair détache le globe du cartouche.
        StickerTemplatePalette.surface.setStroke()
        disque.lineWidth = lineWidth * 1.4
        disque.stroke()
    }

    // MARK: - Le registre des quatre pastilles de plus

    /// Une clé LITTÉRALE par gabarit : une clé construite serait invisible au
    /// catalogue de chaînes, donc jamais traduite.
    static let locationMoreDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.locationMapPin,
            name: { String(localized: "sticker.template.location.mapPin", defaultValue: "Carte pliée", bundle: .module) },
            measure: { s, m in Self.mapPinSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.mapPinImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.locationRoadSign,
            name: { String(localized: "sticker.template.location.roadSign", defaultValue: "Panneau", bundle: .module) },
            measure: { s, m in Self.roadSignSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.roadSignImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.locationLuggageTag,
            name: { String(localized: "sticker.template.location.luggageTag", defaultValue: "Étiquette de bagage", bundle: .module) },
            measure: { s, m in Self.luggageTagSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.luggageTagImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.locationGlobe,
            name: { String(localized: "sticker.template.location.globe", defaultValue: "Globe", bundle: .module) },
            measure: { s, m in Self.globeSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.globeImage(slots: s, metrics: m, screenScale: échelle) }),
    ]
}
