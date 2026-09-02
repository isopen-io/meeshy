import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de VOYAGE (#4820)

/// Partir, être ailleurs, revenir. Huit silhouettes NUES tracées à la main —
/// l'avion, la valise, le passeport, le palmier, le camping-car, l'hôtel, le
/// sac à dos, la locomotive — et deux cartouches qui portent un mot : un
/// BILLET à encoches et un PANNEAU fléché. Aucun emplacement : ce qui s'y lit
/// est la légende du GABARIT, donc la langue du LECTEUR.
///
/// Les silhouettes se distinguent par leur PROPORTION autant que par leur
/// motif — un train est large, un passeport est haut. Dix cartouches au glyphe
/// près se ressembleraient trop pour se reconnaître du coin de l'œil dans la
/// palette, et c'est là qu'on les choisit.
///
/// **Tous les noms de ce fichier sont préfixés `travel` / `Travel`.** Les
/// familles partagent UNE extension de `StickerTemplateRenderer` : deux types
/// homonymes écrits dans deux fichiers y seraient le MÊME type nominal, et se
/// heurteraient même déclarés `private`.
extension StickerTemplateRenderer {

    // MARK: - Le socle des silhouettes nues

    private enum TravelSilhouette {
        case plane, suitcase, passport, palm, camper, hotel, backpack, train

        /// Largeur / hauteur. Le rapport vit ICI, une fois : la mesure et le
        /// dessin le lisent tous les deux, donc ne peuvent pas diverger.
        var ratio: CGFloat {
            switch self {
            case .plane: return 1.12
            case .suitcase: return 1.02
            case .passport: return 0.88
            case .palm: return 0.96
            case .camper: return 1.32
            case .hotel: return 0.86
            case .backpack: return 0.88
            case .train: return 1.28
            }
        }
    }

    private struct TravelFrame {
        let taille: CGSize
        let cadre: CGRect
        let bord: CGFloat
    }

    /// Un cadre de `fontSize × 3` de haut. `cadre` rentre d'UN trait et demi :
    /// `fillWithOutline` trace en `lineWidth = bord × 2`, dont la moitié
    /// extérieure se ferait rogner par le raster.
    @MainActor
    private static func travelFrame(for silhouette: TravelSilhouette,
                                    metrics: StickerTemplateMetrics) -> TravelFrame {
        let hauteur = ceil(metrics.fontSize * 3.0)
        let bord = max(1.5, metrics.fontSize * 0.075)
        let taille = CGSize(width: ceil(hauteur * silhouette.ratio), height: hauteur)
        return TravelFrame(
            taille: taille,
            cadre: CGRect(origin: .zero, size: taille).insetBy(dx: bord * 1.5, dy: bord * 1.5),
            bord: bord)
    }

    // MARK: - Les gestes de tracé de la famille

    /// Un point en coordonnées RELATIVES au cadre — tout le dessin de cette
    /// famille est écrit en fractions, donc croît avec `fontSize` sans qu'un
    /// pixel en dur ne s'y glisse.
    private static func travelPoint(_ r: CGRect, _ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: r.minX + r.width * x, y: r.minY + r.height * y)
    }

    private static func travelBox(_ r: CGRect, _ x0: CGFloat, _ y0: CGFloat,
                                  _ x1: CGFloat, _ y1: CGFloat) -> CGRect {
        CGRect(x: r.minX + r.width * x0, y: r.minY + r.height * y0,
               width: r.width * (x1 - x0), height: r.height * (y1 - y0))
    }

    private static func travelShape(in r: CGRect, _ points: [(CGFloat, CGFloat)]) -> UIBezierPath {
        let chemin = UIBezierPath()
        for (index, point) in points.enumerated() {
            let position = Self.travelPoint(r, point.0, point.1)
            if index == 0 { chemin.move(to: position) } else { chemin.addLine(to: position) }
        }
        chemin.close()
        return chemin
    }

    private static func travelDisc(center centre: CGPoint, radius rayon: CGFloat) -> UIBezierPath {
        UIBezierPath(ovalIn: CGRect(x: centre.x - rayon, y: centre.y - rayon,
                                    width: rayon * 2, height: rayon * 2))
    }

    private static func travelRotate(_ chemin: UIBezierPath, by angle: CGFloat, around centre: CGPoint) {
        chemin.apply(CGAffineTransform(translationX: -centre.x, y: -centre.y))
        chemin.apply(CGAffineTransform(rotationAngle: angle))
        chemin.apply(CGAffineTransform(translationX: centre.x, y: centre.y))
    }

    /// Une lentille entre deux points — une palme, une aile. Le renflement se
    /// prend sur la NORMALE au segment : la forme suit donc son inclinaison,
    /// et cinq palmes rayonnent sans qu'aucune ne soit écrite à la main.
    private static func travelFrond(from base: CGPoint, to pointe: CGPoint,
                                    bulge renflement: CGFloat) -> UIBezierPath {
        let dx = pointe.x - base.x, dy = pointe.y - base.y
        let longueur = max(0.001, sqrt(dx * dx + dy * dy))
        let décalage = CGPoint(x: -dy / longueur * renflement, y: dx / longueur * renflement)
        let milieu = CGPoint(x: (base.x + pointe.x) / 2, y: (base.y + pointe.y) / 2)
        let chemin = UIBezierPath()
        chemin.move(to: base)
        chemin.addQuadCurve(to: pointe,
                            controlPoint: CGPoint(x: milieu.x + décalage.x, y: milieu.y + décalage.y))
        chemin.addQuadCurve(to: base,
                            controlPoint: CGPoint(x: milieu.x - décalage.x, y: milieu.y - décalage.y))
        chemin.close()
        return chemin
    }

    /// Un avion vu de dessus, nez en haut — fuselage, deux ailes, deux plans
    /// de queue en UN tracé, pour un seul liseré autour de la silhouette.
    private static func travelPlanePath(in r: CGRect) -> UIBezierPath {
        let avion = Self.travelShape(in: r, [(0.50, 0.00), (0.575, 0.15), (0.585, 0.62),
                                             (0.555, 0.92), (0.50, 1.00), (0.445, 0.92),
                                             (0.415, 0.62), (0.425, 0.15)])
        avion.append(Self.travelShape(in: r, [(0.44, 0.33), (0.02, 0.60), (0.03, 0.70), (0.45, 0.55)]))
        avion.append(Self.travelShape(in: r, [(0.56, 0.33), (0.98, 0.60), (0.97, 0.70), (0.55, 0.55)]))
        avion.append(Self.travelShape(in: r, [(0.46, 0.77), (0.24, 0.92), (0.25, 0.99), (0.47, 0.89)]))
        avion.append(Self.travelShape(in: r, [(0.54, 0.77), (0.76, 0.92), (0.75, 0.99), (0.53, 0.89)]))
        return avion
    }

    /// Un billet : coins arrondis et DEUX encoches concaves sur la ligne de
    /// perforation. Les arcs vont en sens ANTI-horaire pour creuser vers
    /// l'intérieur — dans l'autre sens ils bomberaient hors du cadre.
    private static func travelTicketPath(in r: CGRect, notch encoche: CGFloat,
                                         at perforation: CGFloat, corner c: CGFloat) -> UIBezierPath {
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: r.minX + c, y: r.minY))
        chemin.addLine(to: CGPoint(x: perforation - encoche, y: r.minY))
        chemin.addArc(withCenter: CGPoint(x: perforation, y: r.minY), radius: encoche,
                      startAngle: CGFloat.pi, endAngle: 0, clockwise: false)
        chemin.addLine(to: CGPoint(x: r.maxX - c, y: r.minY))
        chemin.addQuadCurve(to: CGPoint(x: r.maxX, y: r.minY + c),
                            controlPoint: CGPoint(x: r.maxX, y: r.minY))
        chemin.addLine(to: CGPoint(x: r.maxX, y: r.maxY - c))
        chemin.addQuadCurve(to: CGPoint(x: r.maxX - c, y: r.maxY),
                            controlPoint: CGPoint(x: r.maxX, y: r.maxY))
        chemin.addLine(to: CGPoint(x: perforation + encoche, y: r.maxY))
        chemin.addArc(withCenter: CGPoint(x: perforation, y: r.maxY), radius: encoche,
                      startAngle: 0, endAngle: CGFloat.pi, clockwise: false)
        chemin.addLine(to: CGPoint(x: r.minX + c, y: r.maxY))
        chemin.addQuadCurve(to: CGPoint(x: r.minX, y: r.maxY - c),
                            controlPoint: CGPoint(x: r.minX, y: r.maxY))
        chemin.addLine(to: CGPoint(x: r.minX, y: r.minY + c))
        chemin.addQuadCurve(to: CGPoint(x: r.minX + c, y: r.minY),
                            controlPoint: CGPoint(x: r.minX, y: r.minY))
        chemin.close()
        return chemin
    }

    @MainActor
    private static func travelWheel(center centre: CGPoint, radius rayon: CGFloat, bord: CGFloat) {
        StickerTemplateDrawing.fillWithOutline(Self.travelDisc(center: centre, radius: rayon),
                                               fill: StickerTemplatePalette.label,
                                               outline: StickerTemplatePalette.surface,
                                               width: bord * 0.7)
        StickerTemplatePalette.hairline.setFill()
        Self.travelDisc(center: centre, radius: rayon * 0.40).fill()
    }

    /// Une grille de fenêtres dont une sur trois reste éteinte : un hôtel dont
    /// TOUTES les chambres brillent n'a l'air d'aucun hôtel.
    @MainActor
    private static func travelWindows(in r: CGRect, columns colonnes: Int, rows rangées: Int,
                                      radius rayon: CGFloat) {
        let pasX = r.width / CGFloat(colonnes), pasY = r.height / CGFloat(rangées)
        for ligne in 0..<rangées {
            for colonne in 0..<colonnes {
                let cadre = CGRect(x: r.minX + pasX * CGFloat(colonne) + pasX * 0.22,
                                   y: r.minY + pasY * CGFloat(ligne) + pasY * 0.20,
                                   width: pasX * 0.56, height: pasY * 0.58)
                let allumée = (ligne * 2 + colonne) % 3 != 1
                let teinte = allumée ? StickerTemplatePalette.warmBulb : StickerTemplatePalette.night
                teinte.setFill()
                UIBezierPath(roundedRect: cadre, cornerRadius: rayon).fill()
            }
        }
    }

    // MARK: - travel.plane — l'avion et sa traînée

    @MainActor
    private static func travelPlaneImage(metrics: StickerTemplateMetrics,
                                         screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .plane, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let cadreAvion = Self.travelBox(r, 0.30, 0.02, 1.00, 0.86)
            let avion = Self.travelPlanePath(in: cadreAvion)
            Self.travelRotate(avion, by: 0.34,
                              around: CGPoint(x: cadreAvion.midX, y: cadreAvion.midY))
            // La traînée AVANT l'avion : elle passe sous la queue plutôt que
            // par-dessus, et l'appareil reste devant son propre sillage.
            let queue = CGPoint(x: avion.bounds.minX + avion.bounds.width * 0.26,
                                y: avion.bounds.maxY - avion.bounds.height * 0.06)
            let départ = Self.travelPoint(r, 0.02, 0.98)
            let contrôle = Self.travelPoint(r, 0.20, 1.00)
            StickerTemplatePalette.surface.withAlphaComponent(0.80).setFill()
            for index in 0..<6 {
                // **Les trois poids de la Bézier sont HISSÉS et TYPÉS** — la
                // géométrie est identique, seule la façon de l'écrire change.
                //
                // Écrites en ligne, les deux coordonnées formaient chacune une
                // somme de trois produits de trois à quatre facteurs mêlant
                // `CGFloat` et le littéral `2`. Le vérificateur de types doit
                // alors explorer les surcharges de `*` et `+` sur tout l'arbre,
                // et le coût est combinatoire : il a dépassé sa limite sur le
                // runner CI (`unable to type-check this expression in
                // reasonable time`) alors que la même expression passait sur
                // une machine plus rapide.
                //
                // C'est la seule classe d'erreur où « ça compile chez moi » est
                // littéralement vrai et sans valeur : le verdict dépend d'un
                // DÉLAI, donc de la machine. Un build local vert n'en garde
                // aucune — seul un budget (`-warn-long-function-bodies`) le
                // ferait, et il rougirait sur la machine la plus rapide.
                let t: CGFloat = CGFloat(index) / 5.0
                let inverse: CGFloat = 1 - t
                let poidsDépart: CGFloat = inverse * inverse
                let poidsContrôle: CGFloat = 2 * inverse * t
                let poidsQueue: CGFloat = t * t
                let position = CGPoint(
                    x: poidsDépart * départ.x + poidsContrôle * contrôle.x + poidsQueue * queue.x,
                    y: poidsDépart * départ.y + poidsContrôle * contrôle.y + poidsQueue * queue.y)
                Self.travelDisc(center: position,
                                radius: f.bord * (0.55 + 0.55 * t)).fill()
            }
            StickerTemplateDrawing.fillWithOutline(avion,
                                                   gradientFrom: StickerTemplatePalette.sky,
                                                   to: StickerTemplatePalette.accent,
                                                   in: cadreAvion,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            let hublot = CGPoint(x: cadreAvion.midX + cadreAvion.width * 0.02,
                                 y: cadreAvion.midY - cadreAvion.height * 0.26)
            StickerTemplatePalette.warmBulb.setFill()
            Self.travelDisc(center: hublot, radius: f.bord * 1.1).fill()
        }
    }

    // MARK: - travel.suitcase — la valise à sangles

    @MainActor
    private static func travelSuitcaseImage(metrics: StickerTemplateMetrics,
                                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .suitcase, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            // La poignée d'abord : la coque la recouvre à moitié, et c'est ce
            // recouvrement qui lui donne son épaisseur.
            let poignée = UIBezierPath(roundedRect: Self.travelBox(r, 0.36, 0.05, 0.64, 0.33),
                                       cornerRadius: r.height * 0.11)
            poignée.lineWidth = r.height * 0.105
            StickerTemplatePalette.surface.setStroke()
            poignée.stroke()
            poignée.lineWidth = r.height * 0.060
            StickerTemplatePalette.label.setStroke()
            poignée.stroke()

            let coque = UIBezierPath(roundedRect: Self.travelBox(r, 0.05, 0.24, 0.95, 0.96),
                                     cornerRadius: r.height * 0.14)
            StickerTemplateDrawing.fillWithOutline(coque,
                                                   gradientFrom: StickerTemplatePalette.loveCool,
                                                   to: StickerTemplatePalette.accent,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            guard let contexte = UIGraphicsGetCurrentContext() else { return }
            contexte.saveGState()
            coque.addClip()
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(rect: Self.travelBox(r, 0.21, 0.20, 0.31, 1.00)).fill()
            UIBezierPath(rect: Self.travelBox(r, 0.69, 0.20, 0.79, 1.00)).fill()
            contexte.restoreGState()

            StickerTemplatePalette.label.setFill()
            for x in [CGFloat(0.19), CGFloat(0.67)] {
                UIBezierPath(roundedRect: Self.travelBox(r, x, 0.52, x + 0.14, 0.64),
                             cornerRadius: r.height * 0.025).fill()
            }
            // Deux autocollants : ce qui distingue une valise D'AILLEURS d'une
            // mallette de bureau.
            let étoile = Self.travelBox(r, 0.38, 0.34, 0.62, 0.58)
            StickerTemplatePalette.leaf.setFill()
            StickerTemplateDrawing.starPath(in: étoile, points: 5, innerRatio: 0.45).fill()
            StickerTemplatePalette.pin.setFill()
            Self.travelDisc(center: Self.travelPoint(r, 0.50, 0.78), radius: r.height * 0.075).fill()
            StickerTemplatePalette.surface.setFill()
            Self.travelDisc(center: Self.travelPoint(r, 0.50, 0.78), radius: r.height * 0.035).fill()
        }
    }

    // MARK: - travel.passport — le carnet et son tampon

    @MainActor
    private static func travelPassportImage(metrics: StickerTemplateMetrics,
                                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .passport, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            // Les pages débordent de la couverture par la droite : c'est ce
            // décalage d'un cheveu qui fait lire un CARNET plutôt qu'une carte.
            let pages = UIBezierPath(roundedRect: Self.travelBox(r, 0.14, 0.06, 0.90, 0.94),
                                     cornerRadius: r.height * 0.05)
            StickerTemplateDrawing.fillWithOutline(pages,
                                                   fill: StickerTemplatePalette.surface,
                                                   outline: StickerTemplatePalette.hairline,
                                                   width: f.bord * 0.6)
            let couverture = UIBezierPath(roundedRect: Self.travelBox(r, 0.04, 0.02, 0.82, 0.98),
                                          cornerRadius: r.height * 0.06)
            StickerTemplateDrawing.fillWithOutline(couverture,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.night,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            // L'emblème est un globe TRACÉ — anneau, méridien, équateur : un
            // glyphe s'y redessinerait d'une version d'iOS à l'autre.
            let globe = Self.travelBox(r, 0.24, 0.14, 0.62, 0.42)
            let côtéGlobe = min(globe.width, globe.height)
            let anneau = UIBezierPath(ovalIn: CGRect(x: globe.midX - côtéGlobe / 2,
                                                     y: globe.midY - côtéGlobe / 2,
                                                     width: côtéGlobe, height: côtéGlobe))
            StickerTemplatePalette.warmBulb.setStroke()
            anneau.lineWidth = f.bord * 0.85
            anneau.stroke()
            let méridien = UIBezierPath(ovalIn: CGRect(x: globe.midX - côtéGlobe * 0.19,
                                                       y: globe.midY - côtéGlobe / 2,
                                                       width: côtéGlobe * 0.38, height: côtéGlobe))
            méridien.lineWidth = f.bord * 0.6
            méridien.stroke()
            let équateur = UIBezierPath()
            équateur.move(to: CGPoint(x: globe.midX - côtéGlobe / 2, y: globe.midY))
            équateur.addLine(to: CGPoint(x: globe.midX + côtéGlobe / 2, y: globe.midY))
            équateur.lineWidth = f.bord * 0.6
            équateur.stroke()

            StickerTemplatePalette.surface.withAlphaComponent(0.88).setFill()
            UIBezierPath(roundedRect: Self.travelBox(r, 0.14, 0.52, 0.70, 0.585),
                         cornerRadius: r.height * 0.03).fill()
            UIBezierPath(roundedRect: Self.travelBox(r, 0.14, 0.635, 0.52, 0.69),
                         cornerRadius: r.height * 0.025).fill()

            // Le tampon, incliné, à cheval sur la tranche : la preuve du
            // voyage, et la seule courbe d'une silhouette toute en angles.
            let rayon = r.height * 0.20
            let centre = Self.travelPoint(r, 0.70, 0.77)
            let cadreTampon = CGRect(x: centre.x - rayon, y: centre.y - rayon,
                                     width: rayon * 2, height: rayon * 2)
            let dentelé = StickerTemplateDrawing.starPath(in: cadreTampon, points: 20, innerRatio: 0.90)
            Self.travelRotate(dentelé, by: -0.32, around: centre)
            StickerTemplatePalette.pin.setStroke()
            dentelé.lineWidth = f.bord * 0.9
            dentelé.stroke()
            let intérieur = UIBezierPath(ovalIn: cadreTampon.insetBy(dx: rayon * 0.30, dy: rayon * 0.30))
            intérieur.lineWidth = f.bord * 0.6
            intérieur.stroke()
            StickerTemplatePalette.pin.setFill()
            StickerTemplateDrawing.starPath(in: cadreTampon.insetBy(dx: rayon * 0.62, dy: rayon * 0.62),
                                            points: 5, innerRatio: 0.45).fill()
        }
    }

    // MARK: - travel.boardingPass — le billet à encoches

    @MainActor
    private static var travelBoardingPassCaption: String {
        String(localized: "sticker.template.travel.boardingPass",
               defaultValue: "Embarquement", bundle: .module)
    }

    private struct TravelTicketLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        let talon: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func travelTicketLayout(metrics: StickerTemplateMetrics) -> TravelTicketLayout {
        let légende = travelBoardingPassCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.62, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let talon = ceil(metrics.fontSize * 1.7)
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2 + tailleTexte.width + metrics.gap + talon),
            height: ceil(metrics.verticalPadding * 2
                         + max(tailleTexte.height + metrics.fontSize * 0.55, metrics.fontSize * 1.5)))
        return TravelTicketLayout(légende: légende, police: police, tailleTexte: tailleTexte,
                                  talon: talon, taille: taille)
    }

    @MainActor
    private static func travelBoardingPassImage(metrics: StickerTemplateMetrics,
                                                screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = travelTicketLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord * 1.5, dy: bord * 1.5)
            let perforation = cadre.maxX - l.talon
            let billet = Self.travelTicketPath(in: cadre, notch: metrics.fontSize * 0.24,
                                               at: perforation, corner: cadre.height * 0.24)
            StickerTemplateDrawing.fillWithOutline(billet,
                                                   gradientFrom: StickerTemplatePalette.sky,
                                                   to: StickerTemplatePalette.accent,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            // Des TIRETS, jamais un trait plein : c'est la perforation qui
            // fait lire « billet » plutôt que « carte ».
            let tiret = metrics.fontSize * 0.17
            StickerTemplatePalette.surface.withAlphaComponent(0.75).setFill()
            var y = cadre.minY + tiret
            while y < cadre.maxY - tiret {
                UIBezierPath(roundedRect: CGRect(x: perforation - bord * 0.6, y: y,
                                                 width: bord * 1.2, height: tiret),
                             cornerRadius: bord * 0.6).fill()
                y += tiret * 1.9
            }
            let origineTexte = CGPoint(x: cadre.minX + metrics.horizontalPadding,
                                       y: cadre.midY - l.tailleTexte.height / 2
                                          - metrics.fontSize * 0.14)
            StickerTemplateDrawing.draw(l.légende, font: l.police,
                                        color: StickerTemplatePalette.surface, at: origineTexte)
            StickerTemplatePalette.surface.withAlphaComponent(0.55).setFill()
            UIBezierPath(roundedRect: CGRect(x: origineTexte.x,
                                             y: origineTexte.y + l.tailleTexte.height
                                                + metrics.fontSize * 0.12,
                                             width: l.tailleTexte.width * 0.62,
                                             height: max(1, bord * 0.7)),
                         cornerRadius: bord * 0.35).fill()
            // Le talon porte l'avion, incliné comme au décollage.
            let centreTalon = CGPoint(x: perforation + l.talon / 2, y: cadre.midY)
            let côté = min(l.talon * 0.66, cadre.height * 0.66)
            let avion = Self.travelPlanePath(in: CGRect(x: centreTalon.x - côté / 2,
                                                        y: centreTalon.y - côté / 2,
                                                        width: côté, height: côté))
            Self.travelRotate(avion, by: 0.55, around: centreTalon)
            StickerTemplatePalette.warmBulb.setFill()
            avion.fill()
        }
    }

    // MARK: - travel.palm — le palmier sur son îlot

    @MainActor
    private static func travelPalmImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .palm, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            StickerTemplatePalette.warmBulb.setFill()
            Self.travelDisc(center: Self.travelPoint(r, 0.82, 0.20), radius: r.height * 0.14).fill()

            let île = UIBezierPath()
            île.move(to: Self.travelPoint(r, 0.04, 0.99))
            île.addQuadCurve(to: Self.travelPoint(r, 0.96, 0.99), controlPoint: Self.travelPoint(r, 0.50, 0.72))
            île.close()
            StickerTemplateDrawing.fillWithOutline(île,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.8)
            let tronc = UIBezierPath()
            tronc.move(to: Self.travelPoint(r, 0.38, 0.92))
            tronc.addQuadCurve(to: Self.travelPoint(r, 0.55, 0.29), controlPoint: Self.travelPoint(r, 0.40, 0.58))
            tronc.addLine(to: Self.travelPoint(r, 0.66, 0.31))
            tronc.addQuadCurve(to: Self.travelPoint(r, 0.51, 0.93), controlPoint: Self.travelPoint(r, 0.53, 0.60))
            tronc.close()
            StickerTemplateDrawing.fillWithOutline(tronc,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.night,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.8)
            let base = Self.travelPoint(r, 0.60, 0.30)
            let directions: [(CGFloat, CGFloat)] = [(-0.50, -0.02), (-0.36, -0.22),
                                                    (0.00, -0.29), (0.28, -0.20), (0.32, 0.06)]
            let palmes = UIBezierPath()
            for direction in directions {
                palmes.append(Self.travelFrond(
                    from: base,
                    to: CGPoint(x: base.x + r.width * direction.0,
                                y: base.y + r.height * direction.1),
                    bulge: r.height * 0.10))
            }
            StickerTemplateDrawing.fillWithOutline(palmes,
                                                   gradientFrom: StickerTemplatePalette.leaf,
                                                   to: StickerTemplatePalette.accent,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.7)
            StickerTemplatePalette.label.setFill()
            Self.travelDisc(center: Self.travelPoint(r, 0.54, 0.36), radius: r.height * 0.042).fill()
            Self.travelDisc(center: Self.travelPoint(r, 0.65, 0.38), radius: r.height * 0.036).fill()
        }
    }

    // MARK: - travel.camper — le camping-car

    @MainActor
    private static func travelCamperImage(metrics: StickerTemplateMetrics,
                                          screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .camper, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            let toit = UIBezierPath(roundedRect: Self.travelBox(r, 0.14, 0.06, 0.40, 0.20),
                                    cornerRadius: r.height * 0.04)
            StickerTemplateDrawing.fillWithOutline(toit,
                                                   fill: StickerTemplatePalette.lilac,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.7)
            // La caisse et la cabine en UN tracé : deux liserés se croiseraient
            // au milieu du véhicule, là où il n'y a aucune arête.
            let carrosserie = UIBezierPath(roundedRect: Self.travelBox(r, 0.02, 0.18, 0.72, 0.80),
                                           cornerRadius: r.height * 0.14)
            carrosserie.append(Self.travelShape(in: r, [(0.64, 0.30), (0.84, 0.30),
                                                        (0.98, 0.52), (0.98, 0.80),
                                                        (0.64, 0.80)]))
            StickerTemplateDrawing.fillWithOutline(carrosserie,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.night,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            guard let contexte = UIGraphicsGetCurrentContext() else { return }
            contexte.saveGState()
            carrosserie.addClip()
            StickerTemplatePalette.surface.setFill()
            UIBezierPath(rect: Self.travelBox(r, 0.00, 0.00, 1.00, 0.46)).fill()
            StickerTemplatePalette.pin.setFill()
            UIBezierPath(rect: Self.travelBox(r, 0.00, 0.46, 1.00, 0.53)).fill()
            StickerTemplatePalette.sky.setFill()
            UIBezierPath(roundedRect: Self.travelBox(r, 0.07, 0.25, 0.32, 0.42),
                         cornerRadius: r.height * 0.03).fill()
            Self.travelShape(in: r, [(0.68, 0.32), (0.83, 0.32), (0.94, 0.50), (0.68, 0.50)]).fill()
            contexte.restoreGState()

            let porte = UIBezierPath(roundedRect: Self.travelBox(r, 0.38, 0.24, 0.60, 0.78),
                                     cornerRadius: r.height * 0.04)
            porte.lineWidth = f.bord * 0.6
            StickerTemplatePalette.surface.withAlphaComponent(0.85).setStroke()
            porte.stroke()
            StickerTemplatePalette.warmBulb.setFill()
            Self.travelDisc(center: Self.travelPoint(r, 0.565, 0.58), radius: r.height * 0.028).fill()
            Self.travelDisc(center: Self.travelPoint(r, 0.955, 0.66), radius: r.height * 0.045).fill()
            Self.travelWheel(center: Self.travelPoint(r, 0.22, 0.82), radius: r.height * 0.145, bord: f.bord)
            Self.travelWheel(center: Self.travelPoint(r, 0.79, 0.82), radius: r.height * 0.145, bord: f.bord)
        }
    }

    // MARK: - travel.hotel — la façade et ses trois étoiles

    @MainActor
    private static func travelHotelImage(metrics: StickerTemplateMetrics,
                                         screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .hotel, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            // Le classement se DESSINE — trois étoiles : l'écrire tomberait
            // dans une langue et une seule.
            let côtéÉtoile = r.height * 0.15
            StickerTemplatePalette.warmBulb.setFill()
            for x in [CGFloat(0.28), CGFloat(0.50), CGFloat(0.72)] {
                let centre = Self.travelPoint(r, x, 0.09)
                StickerTemplateDrawing.starPath(
                    in: CGRect(x: centre.x - côtéÉtoile / 2, y: centre.y - côtéÉtoile / 2,
                               width: côtéÉtoile, height: côtéÉtoile),
                    points: 5, innerRatio: 0.45).fill()
            }
            let bâtiment = UIBezierPath(roundedRect: Self.travelBox(r, 0.10, 0.28, 0.90, 1.00),
                                        cornerRadius: r.height * 0.04)
            StickerTemplateDrawing.fillWithOutline(bâtiment,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.night,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            let corniche = UIBezierPath(roundedRect: Self.travelBox(r, 0.02, 0.21, 0.98, 0.30),
                                        cornerRadius: r.height * 0.028)
            StickerTemplateDrawing.fillWithOutline(corniche,
                                                   fill: StickerTemplatePalette.lilac,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.7)
            Self.travelWindows(in: Self.travelBox(r, 0.16, 0.34, 0.84, 0.80),
                               columns: 3, rows: 3, radius: r.height * 0.014)
            let porte = UIBezierPath(roundedRect: Self.travelBox(r, 0.40, 0.84, 0.60, 1.00),
                                     cornerRadius: r.height * 0.02)
            StickerTemplateDrawing.fillWithOutline(porte,
                                                   fill: StickerTemplatePalette.warmBulb,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.6)
            let auvent = UIBezierPath()
            auvent.move(to: Self.travelPoint(r, 0.28, 0.86))
            auvent.addQuadCurve(to: Self.travelPoint(r, 0.72, 0.86), controlPoint: Self.travelPoint(r, 0.50, 0.70))
            auvent.close()
            StickerTemplateDrawing.fillWithOutline(auvent,
                                                   fill: StickerTemplatePalette.pin,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.6)
        }
    }

    // MARK: - travel.backpack — le sac à dos

    @MainActor
    private static func travelBackpackImage(metrics: StickerTemplateMetrics,
                                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .backpack, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            // Les bretelles passent DERRIÈRE la coque : deux traits épais,
            // doublés d'un liseré clair, que le sac vient couvrir.
            let bretelles = UIBezierPath()
            bretelles.move(to: Self.travelPoint(r, 0.34, 0.26))
            bretelles.addQuadCurve(to: Self.travelPoint(r, 0.19, 0.84), controlPoint: Self.travelPoint(r, 0.05, 0.52))
            bretelles.move(to: Self.travelPoint(r, 0.66, 0.26))
            bretelles.addQuadCurve(to: Self.travelPoint(r, 0.81, 0.84), controlPoint: Self.travelPoint(r, 0.95, 0.52))
            bretelles.lineCapStyle = .round
            bretelles.lineWidth = r.height * 0.125
            StickerTemplatePalette.surface.setStroke()
            bretelles.stroke()
            bretelles.lineWidth = r.height * 0.080
            StickerTemplatePalette.lilac.setStroke()
            bretelles.stroke()

            let poignée = UIBezierPath(roundedRect: Self.travelBox(r, 0.42, 0.03, 0.58, 0.20),
                                       cornerRadius: r.height * 0.055)
            poignée.lineWidth = f.bord * 2.0
            StickerTemplatePalette.surface.setStroke()
            poignée.stroke()

            let sac = UIBezierPath(roundedRect: Self.travelBox(r, 0.12, 0.22, 0.88, 0.96),
                                   cornerRadius: r.height * 0.19)
            StickerTemplateDrawing.fillWithOutline(sac,
                                                   gradientFrom: StickerTemplatePalette.leaf,
                                                   to: StickerTemplatePalette.accent,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            let rabat = UIBezierPath(roundedRect: Self.travelBox(r, 0.12, 0.17, 0.88, 0.55),
                                     cornerRadius: r.height * 0.17)
            StickerTemplateDrawing.fillWithOutline(rabat,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.night,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.8)
            StickerTemplatePalette.warmBulb.setFill()
            for x in [CGFloat(0.28), CGFloat(0.60)] {
                UIBezierPath(roundedRect: Self.travelBox(r, x, 0.47, x + 0.12, 0.60),
                             cornerRadius: r.height * 0.025).fill()
            }
            let poche = UIBezierPath(roundedRect: Self.travelBox(r, 0.26, 0.66, 0.74, 0.90),
                                     cornerRadius: r.height * 0.06)
            StickerTemplateDrawing.fillWithOutline(
                poche,
                fill: StickerTemplatePalette.surface.withAlphaComponent(0.30),
                outline: StickerTemplatePalette.surface,
                width: f.bord * 0.6)
        }
    }

    // MARK: - travel.train — la locomotive

    @MainActor
    private static func travelTrainImage(metrics: StickerTemplateMetrics,
                                         screenScale: CGFloat) -> (UIImage?, CGSize) {
        let f = travelFrame(for: .train, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: f.taille, screenScale: screenScale) {
            let r = f.cadre
            StickerTemplatePalette.hairline.setFill()
            UIBezierPath(roundedRect: Self.travelBox(r, 0.00, 0.94, 1.00, 1.00),
                         cornerRadius: r.height * 0.02).fill()
            // Trois bouffées qui grossissent en s'éloignant : c'est leur
            // dégradé de taille qui fait le mouvement, pas l'animation.
            StickerTemplatePalette.surface.withAlphaComponent(0.85).setFill()
            let bouffées: [(CGFloat, CGFloat, CGFloat)] = [(0.70, 0.14, 0.050),
                                                           (0.81, 0.07, 0.068),
                                                           (0.94, 0.11, 0.044)]
            for bouffée in bouffées {
                Self.travelDisc(center: Self.travelPoint(r, bouffée.0, bouffée.1),
                                radius: r.height * bouffée.2).fill()
            }
            let cheminée = UIBezierPath(roundedRect: Self.travelBox(r, 0.62, 0.22, 0.76, 0.42),
                                        cornerRadius: r.height * 0.03)
            StickerTemplateDrawing.fillWithOutline(cheminée,
                                                   fill: StickerTemplatePalette.night,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord * 0.7)
            let loco = UIBezierPath(roundedRect: Self.travelBox(r, 0.30, 0.36, 0.88, 0.82),
                                    cornerRadius: r.height * 0.10)
            loco.append(UIBezierPath(roundedRect: Self.travelBox(r, 0.06, 0.20, 0.42, 0.82),
                                     cornerRadius: r.height * 0.09))
            loco.append(UIBezierPath(roundedRect: Self.travelBox(r, 0.02, 0.13, 0.46, 0.25),
                                     cornerRadius: r.height * 0.04))
            StickerTemplateDrawing.fillWithOutline(loco,
                                                   gradientFrom: StickerTemplatePalette.pin,
                                                   to: StickerTemplatePalette.night,
                                                   in: r,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: f.bord)
            guard let contexte = UIGraphicsGetCurrentContext() else { return }
            contexte.saveGState()
            loco.addClip()
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(rect: Self.travelBox(r, 0.00, 0.62, 1.00, 0.69)).fill()
            StickerTemplatePalette.sky.setFill()
            UIBezierPath(roundedRect: Self.travelBox(r, 0.10, 0.29, 0.30, 0.48),
                         cornerRadius: r.height * 0.03).fill()
            contexte.restoreGState()

            StickerTemplatePalette.warmBulb.setFill()
            Self.travelDisc(center: Self.travelPoint(r, 0.845, 0.50), radius: r.height * 0.055).fill()
            for x in [CGFloat(0.20), CGFloat(0.45), CGFloat(0.71)] {
                Self.travelWheel(center: Self.travelPoint(r, x, 0.855), radius: r.height * 0.115, bord: f.bord)
            }
        }
    }

    // MARK: - travel.onMyWay — le panneau fléché

    @MainActor
    private static var travelOnMyWayCaption: String {
        String(localized: "sticker.template.travel.onMyWay",
               defaultValue: "En route", bundle: .module)
    }

    private struct TravelSignLayout {
        let légende: String
        let police: UIFont
        let tailleTexte: CGSize
        let plaque: CGRect
        let pointe: CGFloat
        let rivets: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func travelSignLayout(metrics: StickerTemplateMetrics) -> TravelSignLayout {
        let légende = travelOnMyWayCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.72, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let pointe = ceil(metrics.fontSize * 0.85)
        let rivets = ceil(metrics.fontSize * 0.50)
        let largeur = ceil(metrics.horizontalPadding * 2 + rivets + metrics.gap
                           + tailleTexte.width + pointe)
        let hauteurPlaque = ceil(tailleTexte.height + metrics.verticalPadding * 1.7)
        let taille = CGSize(width: largeur, height: ceil(hauteurPlaque + metrics.fontSize * 1.0))
        return TravelSignLayout(légende: légende, police: police, tailleTexte: tailleTexte,
                                plaque: CGRect(x: 0, y: 0, width: largeur, height: hauteurPlaque),
                                pointe: pointe, rivets: rivets, taille: taille)
    }

    @MainActor
    private static func travelSignImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = travelSignLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.06)
            let plaque = l.plaque.insetBy(dx: bord * 1.5, dy: bord * 1.5)
            // Le poteau d'abord : la plaque le coiffe, et la jonction se voit
            // moins qu'un poteau collé sous un bord déjà tracé.
            let poteau = UIBezierPath(roundedRect: CGRect(x: plaque.minX + metrics.fontSize * 0.75,
                                                          y: plaque.midY,
                                                          width: metrics.fontSize * 0.26,
                                                          height: l.taille.height - plaque.midY
                                                                  - bord * 1.5),
                                      cornerRadius: metrics.fontSize * 0.10)
            StickerTemplateDrawing.fillWithOutline(poteau,
                                                   fill: StickerTemplatePalette.neutral,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord * 0.7)
            let c = plaque.height * 0.26
            let flèche = UIBezierPath()
            flèche.move(to: CGPoint(x: plaque.minX + c, y: plaque.minY))
            flèche.addLine(to: CGPoint(x: plaque.maxX - l.pointe, y: plaque.minY))
            flèche.addLine(to: CGPoint(x: plaque.maxX, y: plaque.midY))
            flèche.addLine(to: CGPoint(x: plaque.maxX - l.pointe, y: plaque.maxY))
            flèche.addLine(to: CGPoint(x: plaque.minX + c, y: plaque.maxY))
            flèche.addQuadCurve(to: CGPoint(x: plaque.minX, y: plaque.maxY - c),
                                controlPoint: CGPoint(x: plaque.minX, y: plaque.maxY))
            flèche.addLine(to: CGPoint(x: plaque.minX, y: plaque.minY + c))
            flèche.addQuadCurve(to: CGPoint(x: plaque.minX + c, y: plaque.minY),
                                controlPoint: CGPoint(x: plaque.minX, y: plaque.minY))
            flèche.close()
            StickerTemplateDrawing.fillWithOutline(flèche,
                                                   gradientFrom: StickerTemplatePalette.leaf,
                                                   to: StickerTemplatePalette.accent,
                                                   in: plaque,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            StickerTemplatePalette.surface.withAlphaComponent(0.85).setFill()
            let rivet = l.rivets * 0.30
            for y in [CGFloat(0.34), CGFloat(0.66)] {
                Self.travelDisc(center: CGPoint(x: plaque.minX + metrics.horizontalPadding
                                                   + l.rivets / 2,
                                                y: plaque.minY + plaque.height * y),
                                radius: rivet).fill()
            }
            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.surface,
                at: CGPoint(x: plaque.minX + metrics.horizontalPadding + l.rivets + metrics.gap,
                            y: plaque.midY - l.tailleTexte.height / 2))
        }
    }

    // MARK: - Le registre de la famille VOYAGE

    static let travelDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelPlane,
            name: { String(localized: "sticker.template.travel.plane", defaultValue: "Avion", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .plane, metrics: m).taille },
            draw: { _, m, échelle in Self.travelPlaneImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelSuitcase,
            name: { String(localized: "sticker.template.travel.suitcase", defaultValue: "Valise", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .suitcase, metrics: m).taille },
            draw: { _, m, échelle in Self.travelSuitcaseImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelPassport,
            name: { String(localized: "sticker.template.travel.passport", defaultValue: "Passeport", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .passport, metrics: m).taille },
            draw: { _, m, échelle in Self.travelPassportImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelBoardingPass,
            name: { Self.travelBoardingPassCaption },
            measure: { _, m in Self.travelTicketLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.travelBoardingPassImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelPalm,
            name: { String(localized: "sticker.template.travel.palm", defaultValue: "Palmier", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .palm, metrics: m).taille },
            draw: { _, m, échelle in Self.travelPalmImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelCamper,
            name: { String(localized: "sticker.template.travel.camper", defaultValue: "Camping-car", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .camper, metrics: m).taille },
            draw: { _, m, échelle in Self.travelCamperImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelHotel,
            name: { String(localized: "sticker.template.travel.hotel", defaultValue: "Hôtel", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .hotel, metrics: m).taille },
            draw: { _, m, échelle in Self.travelHotelImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelBackpack,
            name: { String(localized: "sticker.template.travel.backpack", defaultValue: "Sac à dos", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .backpack, metrics: m).taille },
            draw: { _, m, échelle in Self.travelBackpackImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelTrain,
            name: { String(localized: "sticker.template.travel.train", defaultValue: "Train", bundle: .module) },
            measure: { _, m in Self.travelFrame(for: .train, metrics: m).taille },
            draw: { _, m, échelle in Self.travelTrainImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.travelOnMyWay,
            name: { Self.travelOnMyWayCaption },
            measure: { _, m in Self.travelSignLayout(metrics: m).taille },
            draw: { _, m, échelle in Self.travelSignImage(metrics: m, screenScale: échelle) }),
    ]
}
