import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de TRAVAIL (#4820)

/// Ce sur QUOI on travaille — l'écran, la mallette, l'idée, la liste cochée.
/// La famille DISPONIBILITÉ dit l'ÉTAT de la personne (« en réunion », « de
/// retour bientôt ») ; celle-ci dit son OUVRAGE : deux questions, deux
/// familles, et aucun badge de présence ici.
///
/// Sept objets posés seuls — le portable, la mallette, l'ampoule, la fusée, le
/// graphe, le cerveau, l'équipe — et trois cartouches à mot, chacun sur une
/// silhouette différente (une note au coin corné, un écusson à pointe, une
/// pancarte suspendue). Dix cartouches au glyphe près se ressembleraient trop
/// pour se distinguer du coin de l'œil dans la palette.
///
/// Tout est tracé en Bézier, sans emoji ni symbole SF : un ordinateur emoji
/// change de dessin d'une version d'iOS à l'autre, et une décoration doit se
/// rendre pareil sur iOS 16 et sur iOS 26 — la raison même pour laquelle
/// `heartPath` existe. Les mots viennent de `String(localized:)` à clé
/// LITTÉRALE : ils appartiennent au GABARIT, donc le LECTEUR lit « Done » là
/// où l'auteur a posé « Terminé ». Aucun emplacement, donc rien à remplir.
extension StickerTemplateRenderer {

    // MARK: - Le patron des cartouches de travail

    /// Ce qui distingue une carte de travail : sa SILHOUETTE, ses deux couleurs
    /// et l'objet tracé à gauche du mot. La mesure est celle de tous les
    /// cartouches (`captionLayout`) ; le cadre de l'icône est RÉSERVÉ
    /// (`Glyph.custom`) et chaque carte y trace ce qu'elle veut.
    private struct WorkCard {
        /// La silhouette. L'écusson mange sa pointe EN BAS, la pancarte sa
        /// suspension EN HAUT : la mesure doit le savoir, sinon le raster les
        /// rogne.
        enum Fond {
            /// Une feuille de bloc-notes : trois coins arrondis, le quatrième plié.
            case note
            /// Un badge de validation : les épaules droites, la pointe en bas.
            case écusson
            /// Une plaque pendue à deux cordelettes.
            case pancarte
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
    private static func workCardLayout(_ carte: WorkCard, metrics: StickerTemplateMetrics)
        -> (légende: String, l: StickerTemplateDrawing.CaptionLayout,
            hautExtra: CGFloat, basExtra: CGFloat, taille: CGSize) {
        let légende = carte.name()
        let hautExtra: CGFloat
        let basExtra: CGFloat
        switch carte.fond {
        case .note: hautExtra = 0; basExtra = 0
        case .écusson: hautExtra = 0; basExtra = metrics.fontSize * 0.42
        case .pancarte: hautExtra = metrics.fontSize * 0.58; basExtra = 0
        }
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics,
                                                     extraHeight: hautExtra + basExtra)
        return (légende, l, hautExtra, basExtra, l.taille)
    }

    @MainActor
    private static func workCardSize(_ carte: WorkCard, metrics: StickerTemplateMetrics) -> CGSize {
        workCardLayout(carte, metrics: metrics).taille
    }

    @MainActor
    private static func workCardImage(_ carte: WorkCard, metrics: StickerTemplateMetrics,
                                      screenScale: CGFloat) -> (UIImage?, CGSize) {
        let c = workCardLayout(carte, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: c.taille, screenScale: screenScale) {
            let trait = max(1, metrics.fontSize * 0.05)
            let plein = CGRect(origin: .zero, size: c.taille)
            // Le liseré de `fillWithOutline` déborde d'un trait vers l'EXTÉRIEUR :
            // sans ce retrait, le bord de la forme serait coupé net par le raster.
            let contour = plein.insetBy(dx: trait, dy: trait)
            let forme: UIBezierPath
            let fondRect: CGRect
            let contenu: CGRect
            switch carte.fond {
            case .note:
                forme = Self.workNotePath(in: contour, fold: contour.height * 0.30)
                fondRect = contour
                contenu = contour
            case .écusson:
                forme = Self.workBadgePath(in: contour, point: c.basExtra)
                fondRect = contour
                contenu = CGRect(x: contour.minX, y: contour.minY,
                                 width: contour.width, height: contour.height - c.basExtra)
            case .pancarte:
                let plaque = CGRect(x: contour.minX, y: contour.minY + c.hautExtra,
                                    width: contour.width, height: contour.height - c.hautExtra)
                Self.workSignCords(in: contour, plate: plaque, width: trait)
                forme = UIBezierPath(roundedRect: plaque, cornerRadius: plaque.height * 0.28)
                fondRect = plaque
                contenu = plaque
            }
            StickerTemplateDrawing.fillWithOutline(forme, gradientFrom: carte.haut, to: carte.bas,
                                                   in: fondRect, outline: carte.liseré, width: trait)
            carte.icône(CGRect(x: metrics.horizontalPadding, y: contenu.midY - c.l.glyphe / 2,
                               width: c.l.glyphe, height: c.l.glyphe))
            StickerTemplateDrawing.draw(
                c.légende, font: c.l.police, color: carte.texte,
                at: CGPoint(x: metrics.horizontalPadding + c.l.glyphe + metrics.gap,
                            y: contenu.midY - c.l.tailleTexte.height / 2))
        }
    }

    private static func workCardDrawer(_ carte: WorkCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: carte.name,
            measure: { _, m in Self.workCardSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.workCardImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: - Les silhouettes propres au travail

    /// Une feuille de bloc-notes : trois coins arrondis et le quatrième CORNÉ,
    /// en haut à droite — c'est le pli qui fait lire une feuille plutôt qu'une
    /// carte de plus.
    private static func workNotePath(in rect: CGRect, fold pli: CGFloat) -> UIBezierPath {
        let rayon = min(rect.height * 0.24, rect.width * 0.10)
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: rect.minX + rayon, y: rect.minY))
        chemin.addLine(to: CGPoint(x: rect.maxX - pli, y: rect.minY))
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.minY + pli))
        chemin.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY - rayon))
        chemin.addArc(withCenter: CGPoint(x: rect.maxX - rayon, y: rect.maxY - rayon),
                      radius: rayon, startAngle: 0, endAngle: CGFloat.pi / 2, clockwise: true)
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

    /// Un badge de validation : épaules droites, flancs verticaux, et une
    /// pointe basse en V haute de `pointe` — le sceau qu'on tamponne sur ce
    /// qui est fini.
    private static func workBadgePath(in rect: CGRect, point pointe: CGFloat) -> UIBezierPath {
        let épaule = rect.maxY - pointe
        let rayon = min((épaule - rect.minY) * 0.30, rect.width * 0.10)
        let chemin = UIBezierPath()
        chemin.move(to: CGPoint(x: rect.minX, y: rect.minY + rayon))
        chemin.addArc(withCenter: CGPoint(x: rect.minX + rayon, y: rect.minY + rayon),
                      radius: rayon, startAngle: CGFloat.pi, endAngle: 3 * CGFloat.pi / 2, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.maxX - rayon, y: rect.minY))
        chemin.addArc(withCenter: CGPoint(x: rect.maxX - rayon, y: rect.minY + rayon),
                      radius: rayon, startAngle: 3 * CGFloat.pi / 2, endAngle: 2 * CGFloat.pi, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.maxX, y: épaule - rayon))
        chemin.addArc(withCenter: CGPoint(x: rect.maxX - rayon, y: épaule - rayon),
                      radius: rayon, startAngle: 0, endAngle: CGFloat.pi / 2, clockwise: true)
        chemin.addLine(to: CGPoint(x: rect.midX + pointe * 0.85, y: épaule))
        chemin.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
        chemin.addLine(to: CGPoint(x: rect.midX - pointe * 0.85, y: épaule))
        chemin.addLine(to: CGPoint(x: rect.minX + rayon, y: épaule))
        chemin.addArc(withCenter: CGPoint(x: rect.minX + rayon, y: épaule - rayon),
                      radius: rayon, startAngle: CGFloat.pi / 2, endAngle: CGFloat.pi, clockwise: true)
        chemin.close()
        chemin.lineJoinStyle = .round
        return chemin
    }

    /// Les deux cordelettes et l'anneau d'une pancarte, tracés AVANT la plaque :
    /// leurs pieds passent dessous, sinon deux traits clairs coupent le mot.
    @MainActor
    private static func workSignCords(in cadre: CGRect, plate plaque: CGRect, width trait: CGFloat) {
        let accroche = CGPoint(x: cadre.midX, y: cadre.minY + trait * 2)
        let corde = UIBezierPath()
        corde.move(to: CGPoint(x: plaque.minX + plaque.width * 0.20, y: plaque.midY))
        corde.addLine(to: accroche)
        corde.addLine(to: CGPoint(x: plaque.maxX - plaque.width * 0.20, y: plaque.midY))
        corde.lineWidth = trait
        corde.lineCapStyle = .round
        corde.lineJoinStyle = .round
        StickerTemplatePalette.surface.setStroke()
        corde.stroke()
        let côté = trait * 3
        let anneau = UIBezierPath(ovalIn: CGRect(x: accroche.x - côté / 2, y: cadre.minY + trait / 2,
                                                 width: côté, height: côté))
        anneau.lineWidth = trait * 0.8
        anneau.stroke()
    }

    // MARK: - Les objets tracés à gauche des mots

    /// Une coche tracée dans `rect` — la brique des listes et du sceau.
    @MainActor
    private static func workCheckMark(in r: CGRect, color: UIColor, width trait: CGFloat) {
        let coche = UIBezierPath()
        coche.move(to: CGPoint(x: r.minX + r.width * 0.14, y: r.minY + r.height * 0.52))
        coche.addLine(to: CGPoint(x: r.minX + r.width * 0.40, y: r.minY + r.height * 0.78))
        coche.addLine(to: CGPoint(x: r.maxX - r.width * 0.10, y: r.minY + r.height * 0.20))
        coche.lineWidth = trait
        coche.lineCapStyle = .round
        coche.lineJoinStyle = .round
        color.setStroke()
        coche.stroke()
    }

    /// Trois lignes de liste, les deux premières cochées : c'est le RESTE à
    /// faire, pas les coches, qui dit qu'on est en train de travailler.
    @MainActor
    private static func workTickListIcon(in r: CGRect) {
        let trait = max(1, r.width * 0.07)
        let côté = r.height * 0.24
        for index in 0..<3 {
            let y = r.minY + r.height * (0.05 + CGFloat(index) * 0.35)
            let boîte = CGRect(x: r.minX, y: y, width: côté, height: côté)
            let carré = UIBezierPath(roundedRect: boîte, cornerRadius: côté * 0.28)
            StickerTemplatePalette.accent.setStroke()
            carré.lineWidth = trait
            if index < 2 {
                StickerTemplatePalette.accent.setFill()
                carré.fill()
                Self.workCheckMark(in: boîte.insetBy(dx: côté * 0.18, dy: côté * 0.18),
                                   color: StickerTemplatePalette.surface, width: trait * 0.9)
            } else {
                carré.stroke()
            }
            let ligne = UIBezierPath(
                roundedRect: CGRect(x: boîte.maxX + r.width * 0.12, y: y + côté * 0.28,
                                    width: r.width - côté - r.width * 0.12, height: côté * 0.42),
                cornerRadius: côté * 0.21)
            StickerTemplatePalette.label.withAlphaComponent(index < 2 ? 0.35 : 0.75).setFill()
            ligne.fill()
        }
    }

    /// Un sceau : un disque clair et la coche verte dedans. Posé sur un badge
    /// vert, une coche verte se serait fondue — d'où le disque.
    @MainActor
    private static func workSealIcon(in r: CGRect) {
        let trait = max(1, r.width * 0.09)
        StickerTemplatePalette.surface.setFill()
        UIBezierPath(ovalIn: r.insetBy(dx: trait, dy: trait)).fill()
        Self.workCheckMark(in: r.insetBy(dx: r.width * 0.24, dy: r.height * 0.24),
                           color: StickerTemplatePalette.leaf, width: trait * 1.4)
    }

    /// Une maison à la fenêtre ALLUMÉE : une maison éteinte dit qu'on rentre,
    /// pas qu'on y travaille.
    @MainActor
    private static func workHouseIcon(in r: CGRect) {
        let trait = max(1, r.width * 0.08)
        let murs = UIBezierPath(
            roundedRect: CGRect(x: r.minX + r.width * 0.16, y: r.minY + r.height * 0.42,
                                width: r.width * 0.68, height: r.height * 0.52),
            cornerRadius: r.width * 0.08)
        StickerTemplatePalette.surface.setFill()
        murs.fill()
        let toit = UIBezierPath()
        toit.move(to: CGPoint(x: r.minX + r.width * 0.04, y: r.minY + r.height * 0.46))
        toit.addLine(to: CGPoint(x: r.midX, y: r.minY + r.height * 0.06))
        toit.addLine(to: CGPoint(x: r.maxX - r.width * 0.04, y: r.minY + r.height * 0.46))
        toit.lineWidth = trait
        toit.lineCapStyle = .round
        toit.lineJoinStyle = .round
        StickerTemplatePalette.surface.setStroke()
        toit.stroke()
        StickerTemplatePalette.warmBulb.setFill()
        UIBezierPath(roundedRect: CGRect(x: r.midX - r.width * 0.12, y: r.minY + r.height * 0.56,
                                         width: r.width * 0.24, height: r.height * 0.24),
                     cornerRadius: r.width * 0.05).fill()
    }

    // MARK: - work.laptop — le portable ouvert

    @MainActor
    private static func workLaptopSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 3.4), height: ceil(metrics.fontSize * 2.3))
    }

    @MainActor
    private static func workLaptopImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = workLaptopSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let capot = CGRect(x: l * 0.15 + trait, y: trait,
                               width: l * 0.70 - trait * 2, height: h * 0.66)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: capot, cornerRadius: h * 0.10),
                gradientFrom: StickerTemplatePalette.night, to: StickerTemplatePalette.accent,
                in: capot, outline: StickerTemplatePalette.surface, width: trait)

            // Trois lignes de code et le curseur : c'est le CURSEUR — que
            // l'animation `.blink` fait battre — qui dit qu'on écrit, pas l'écran.
            let marge = capot.width * 0.12
            let lignes: [(y: CGFloat, largeur: CGFloat, couleur: UIColor)] = [
                (0.20, 0.50, StickerTemplatePalette.surface),
                (0.42, 0.70, StickerTemplatePalette.indigoLight),
                (0.64, 0.34, StickerTemplatePalette.surface),
            ]
            for ligne in lignes {
                let barre = CGRect(x: capot.minX + marge, y: capot.minY + capot.height * ligne.y,
                                   width: capot.width * ligne.largeur, height: capot.height * 0.11)
                ligne.couleur.withAlphaComponent(0.85).setFill()
                UIBezierPath(roundedRect: barre, cornerRadius: barre.height / 2).fill()
            }
            let curseur = CGRect(x: capot.minX + marge + capot.width * 0.40,
                                 y: capot.minY + capot.height * 0.62,
                                 width: capot.width * 0.08, height: capot.height * 0.16)
            StickerTemplatePalette.warmBulb.setFill()
            UIBezierPath(roundedRect: curseur, cornerRadius: curseur.width * 0.35).fill()

            // La base : un trapèze PLUS LARGE que l'écran — c'est la perspective
            // qui fait lire un portable ouvert plutôt qu'un téléviseur.
            let base = UIBezierPath()
            base.move(to: CGPoint(x: l * 0.05, y: h - trait))
            base.addLine(to: CGPoint(x: l * 0.95, y: h - trait))
            base.addLine(to: CGPoint(x: capot.maxX, y: capot.maxY))
            base.addLine(to: CGPoint(x: capot.minX, y: capot.maxY))
            base.close()
            base.lineJoinStyle = .round
            StickerTemplateDrawing.fillWithOutline(base, fill: StickerTemplatePalette.surface,
                                                   outline: StickerTemplatePalette.hairline,
                                                   width: trait * 0.5)
        }
    }

    // MARK: - work.briefcase — la mallette posée

    @MainActor
    private static func workBriefcaseSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 2.9), height: ceil(metrics.fontSize * 2.4))
    }

    @MainActor
    private static func workBriefcaseImage(metrics: StickerTemplateMetrics,
                                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = workBriefcaseSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let poignée = UIBezierPath(
                roundedRect: CGRect(x: l * 0.34, y: trait, width: l * 0.32, height: h * 0.28),
                cornerRadius: h * 0.12)
            poignée.lineWidth = trait * 1.6
            StickerTemplatePalette.surface.setStroke()
            poignée.stroke()

            let corps = CGRect(x: trait, y: h * 0.28, width: l - trait * 2, height: h * 0.72 - trait)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: corps, cornerRadius: h * 0.16),
                gradientFrom: StickerTemplatePalette.warmBulb, to: StickerTemplatePalette.pin,
                in: corps, outline: StickerTemplatePalette.surface, width: trait)

            // La bande claire et le fermoir : sans eux, la mallette n'est qu'un
            // rectangle chaud aux coins arrondis.
            let bande = CGRect(x: corps.minX, y: corps.minY + corps.height * 0.32,
                               width: corps.width, height: corps.height * 0.20)
            StickerTemplatePalette.surface.withAlphaComponent(0.92).setFill()
            UIBezierPath(rect: bande).fill()
            let fermoir = CGRect(x: corps.midX - l * 0.07, y: bande.midY - h * 0.07,
                                 width: l * 0.14, height: h * 0.14)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: fermoir, cornerRadius: h * 0.04),
                fill: StickerTemplatePalette.accent, outline: StickerTemplatePalette.night,
                width: trait * 0.4)
        }
    }

    // MARK: - work.idea — l'ampoule

    @MainActor
    private static func workBulbSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 2.6), height: ceil(metrics.fontSize * 2.8))
    }

    @MainActor
    private static func workBulbImage(metrics: StickerTemplateMetrics,
                                      screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = workBulbSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let rayon = l * 0.31
            let centre = CGPoint(x: l / 2, y: h * 0.16 + rayon)
            // Les rayons AVANT le verre : leurs pieds passent sous l'ampoule.
            StickerTemplateDrawing.drawRays(center: centre, inner: rayon * 1.16, outer: rayon * 1.40,
                                            count: 8, width: trait,
                                            color: StickerTemplatePalette.warmBulb)
            let verre = CGRect(x: centre.x - rayon, y: centre.y - rayon,
                               width: rayon * 2, height: rayon * 2)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(ovalIn: verre), gradientFrom: StickerTemplatePalette.surface,
                to: StickerTemplatePalette.warmBulb, in: verre,
                outline: StickerTemplatePalette.warmBulb, width: trait * 0.7)

            // Le filament — deux boucles : c'est lui qui fait l'ampoule, pas le
            // rond, qui ne serait qu'un soleil de plus.
            let filament = UIBezierPath()
            filament.move(to: CGPoint(x: centre.x - rayon * 0.36, y: centre.y + rayon * 0.30))
            filament.addCurve(to: CGPoint(x: centre.x, y: centre.y + rayon * 0.10),
                              controlPoint1: CGPoint(x: centre.x - rayon * 0.32, y: centre.y - rayon * 0.42),
                              controlPoint2: CGPoint(x: centre.x - rayon * 0.04, y: centre.y - rayon * 0.46))
            filament.addCurve(to: CGPoint(x: centre.x + rayon * 0.36, y: centre.y + rayon * 0.30),
                              controlPoint1: CGPoint(x: centre.x + rayon * 0.04, y: centre.y - rayon * 0.46),
                              controlPoint2: CGPoint(x: centre.x + rayon * 0.32, y: centre.y - rayon * 0.42))
            filament.lineWidth = trait * 0.8
            filament.lineCapStyle = .round
            StickerTemplatePalette.pin.setStroke()
            filament.stroke()

            let largeur = rayon * 0.92
            let hautCulot = centre.y + rayon * 0.84
            let culot = CGRect(x: centre.x - largeur / 2, y: hautCulot,
                               width: largeur, height: h - trait - hautCulot)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: culot, cornerRadius: largeur * 0.22),
                fill: StickerTemplatePalette.neutral, outline: StickerTemplatePalette.surface,
                width: trait * 0.5)
            StickerTemplatePalette.surface.withAlphaComponent(0.7).setStroke()
            for part: CGFloat in [0.34, 0.64] {
                let bague = UIBezierPath()
                bague.move(to: CGPoint(x: culot.minX, y: culot.minY + culot.height * part))
                bague.addLine(to: CGPoint(x: culot.maxX, y: culot.minY + culot.height * part))
                bague.lineWidth = trait * 0.5
                bague.stroke()
            }
        }
    }

    // MARK: - work.rocket — la fusée

    @MainActor
    private static func workRocketSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 2.2), height: ceil(metrics.fontSize * 3.4))
    }

    @MainActor
    private static func workRocketImage(metrics: StickerTemplateMetrics,
                                        screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = workRocketSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let gauche = l * 0.26, droite = l * 0.74

            // La flamme d'abord : le corps la recouvre, sinon elle lui monte
            // dessus et la fusée a l'air de brûler.
            let souffle = CGRect(x: l * 0.32, y: h * 0.68, width: l * 0.36, height: h * 0.30)
            let flamme = UIBezierPath()
            flamme.move(to: CGPoint(x: souffle.midX, y: souffle.maxY))
            flamme.addCurve(to: CGPoint(x: souffle.minX, y: souffle.minY + souffle.height * 0.24),
                            controlPoint1: CGPoint(x: souffle.midX - souffle.width * 0.34,
                                                   y: souffle.maxY - souffle.height * 0.30),
                            controlPoint2: CGPoint(x: souffle.minX,
                                                   y: souffle.minY + souffle.height * 0.70))
            flamme.addQuadCurve(to: CGPoint(x: souffle.maxX, y: souffle.minY + souffle.height * 0.24),
                                controlPoint: CGPoint(x: souffle.midX, y: souffle.minY))
            flamme.addCurve(to: CGPoint(x: souffle.midX, y: souffle.maxY),
                            controlPoint1: CGPoint(x: souffle.maxX,
                                                   y: souffle.minY + souffle.height * 0.70),
                            controlPoint2: CGPoint(x: souffle.midX + souffle.width * 0.34,
                                                   y: souffle.maxY - souffle.height * 0.30))
            flamme.close()
            StickerTemplateDrawing.fill(flamme, gradientFrom: StickerTemplatePalette.warmBulb,
                                        to: StickerTemplatePalette.pin, in: souffle)

            let ailerons = UIBezierPath()
            ailerons.move(to: CGPoint(x: gauche, y: h * 0.50))
            ailerons.addLine(to: CGPoint(x: l * 0.05, y: h * 0.78))
            ailerons.addLine(to: CGPoint(x: gauche, y: h * 0.72))
            ailerons.close()
            ailerons.move(to: CGPoint(x: droite, y: h * 0.50))
            ailerons.addLine(to: CGPoint(x: l * 0.95, y: h * 0.78))
            ailerons.addLine(to: CGPoint(x: droite, y: h * 0.72))
            ailerons.close()
            StickerTemplatePalette.pin.setFill()
            ailerons.fill()

            let corps = UIBezierPath()
            corps.move(to: CGPoint(x: l / 2, y: trait))
            corps.addCurve(to: CGPoint(x: droite, y: h * 0.50),
                           controlPoint1: CGPoint(x: droite, y: h * 0.14),
                           controlPoint2: CGPoint(x: droite, y: h * 0.30))
            corps.addLine(to: CGPoint(x: droite, y: h * 0.70))
            corps.addQuadCurve(to: CGPoint(x: gauche, y: h * 0.70),
                               controlPoint: CGPoint(x: l / 2, y: h * 0.80))
            corps.addLine(to: CGPoint(x: gauche, y: h * 0.50))
            corps.addCurve(to: CGPoint(x: l / 2, y: trait),
                           controlPoint1: CGPoint(x: gauche, y: h * 0.30),
                           controlPoint2: CGPoint(x: gauche, y: h * 0.14))
            corps.close()
            StickerTemplateDrawing.fillWithOutline(
                corps, gradientFrom: StickerTemplatePalette.surface,
                to: StickerTemplatePalette.indigoLight,
                in: CGRect(x: gauche, y: 0, width: droite - gauche, height: h * 0.80),
                outline: StickerTemplatePalette.accent, width: trait)

            let hublot = CGRect(x: l / 2 - l * 0.15, y: h * 0.30, width: l * 0.30, height: l * 0.30)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(ovalIn: hublot), gradientFrom: StickerTemplatePalette.sky,
                to: StickerTemplatePalette.night, in: hublot,
                outline: StickerTemplatePalette.surface, width: trait * 0.6)
        }
    }

    // MARK: - work.chart — la courbe qui monte

    @MainActor
    private static func workChartSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 3.2), height: ceil(metrics.fontSize * 2.6))
    }

    @MainActor
    private static func workChartImage(metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = workChartSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let carte = CGRect(origin: .zero, size: taille).insetBy(dx: trait, dy: trait)
            StickerTemplateDrawing.fillWithOutline(
                UIBezierPath(roundedRect: carte, cornerRadius: h * 0.16),
                gradientFrom: StickerTemplatePalette.surface,
                to: StickerTemplatePalette.indigoLight.withAlphaComponent(0.55),
                in: carte, outline: StickerTemplatePalette.hairline, width: trait)

            let plan = carte.insetBy(dx: carte.width * 0.12, dy: carte.height * 0.16)
            let axes = UIBezierPath()
            axes.move(to: CGPoint(x: plan.minX, y: plan.minY))
            axes.addLine(to: CGPoint(x: plan.minX, y: plan.maxY))
            axes.addLine(to: CGPoint(x: plan.maxX, y: plan.maxY))
            axes.lineWidth = trait * 0.7
            axes.lineCapStyle = .round
            StickerTemplatePalette.hairline.setStroke()
            axes.stroke()

            let barres: [(x: CGFloat, hauteur: CGFloat, couleur: UIColor)] = [
                (0.06, 0.34, StickerTemplatePalette.indigoLight),
                (0.36, 0.56, StickerTemplatePalette.lilac),
                (0.66, 0.80, StickerTemplatePalette.accent),
            ]
            for barre in barres {
                let cadre = CGRect(x: plan.minX + plan.width * barre.x,
                                   y: plan.maxY - plan.height * barre.hauteur,
                                   width: plan.width * 0.22, height: plan.height * barre.hauteur)
                barre.couleur.setFill()
                UIBezierPath(roundedRect: cadre, cornerRadius: plan.width * 0.05).fill()
            }

            // La courbe et sa flèche : trois barres montent déjà, mais c'est la
            // FLÈCHE qui dit « en hausse » sans un mot.
            let pointe = CGPoint(x: plan.maxX - plan.width * 0.03, y: plan.minY + plan.height * 0.06)
            let courbe = UIBezierPath()
            courbe.move(to: CGPoint(x: plan.minX + plan.width * 0.04,
                                    y: plan.maxY - plan.height * 0.16))
            courbe.addCurve(to: pointe,
                            controlPoint1: CGPoint(x: plan.minX + plan.width * 0.42,
                                                   y: plan.maxY - plan.height * 0.28),
                            controlPoint2: CGPoint(x: plan.minX + plan.width * 0.46, y: plan.minY))
            courbe.lineWidth = trait * 1.2
            courbe.lineCapStyle = .round
            StickerTemplatePalette.leaf.setStroke()
            courbe.stroke()
            let flèche = UIBezierPath()
            flèche.move(to: CGPoint(x: pointe.x - plan.width * 0.15, y: pointe.y + plan.height * 0.02))
            flèche.addLine(to: pointe)
            flèche.addLine(to: CGPoint(x: pointe.x - plan.width * 0.02, y: pointe.y + plan.height * 0.20))
            flèche.lineWidth = trait * 1.2
            flèche.lineCapStyle = .round
            flèche.lineJoinStyle = .round
            flèche.stroke()
        }
    }

    // MARK: - work.brainstorm — le cerveau qui étincelle

    /// Un cerveau : une masse ovale et quatre bosses — un tracé COMPOSÉ, comme
    /// le nuage, donc rempli par `fillWithOutline` pour que seul le bord
    /// extérieur porte le liseré.
    private static func workBrainPath(in rect: CGRect) -> UIBezierPath {
        let l = rect.width, h = rect.height
        let chemin = UIBezierPath(ovalIn: CGRect(x: rect.minX, y: rect.minY + h * 0.28,
                                                 width: l, height: h * 0.72))
        let bosses: [(x: CGFloat, y: CGFloat, côté: CGFloat)] = [
            (0.00, 0.18, 0.34), (0.24, 0.00, 0.32), (0.48, 0.01, 0.32), (0.68, 0.16, 0.32),
        ]
        for bosse in bosses {
            chemin.append(UIBezierPath(ovalIn: CGRect(x: rect.minX + l * bosse.x,
                                                      y: rect.minY + h * bosse.y,
                                                      width: l * bosse.côté, height: l * bosse.côté)))
        }
        return chemin
    }

    @MainActor
    private static func workBrainSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 3.0), height: ceil(metrics.fontSize * 2.7))
    }

    @MainActor
    private static func workBrainImage(metrics: StickerTemplateMetrics,
                                       screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = workBrainSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let cadre = CGRect(x: l * 0.04, y: h * 0.18, width: l * 0.70, height: h * 0.74)
            StickerTemplateDrawing.fillWithOutline(
                Self.workBrainPath(in: cadre), gradientFrom: StickerTemplatePalette.lilac,
                to: StickerTemplatePalette.accent, in: cadre,
                outline: StickerTemplatePalette.surface, width: trait * 0.8)

            // Les circonvolutions : trois arcs clairs, sans quoi la masse reste
            // un nuage.
            StickerTemplatePalette.surface.withAlphaComponent(0.65).setStroke()
            let plis: [(x: CGFloat, y: CGFloat, rayon: CGFloat, début: CGFloat, fin: CGFloat)] = [
                (0.30, 0.42, 0.20, 0.60, 1.70),
                (0.58, 0.36, 0.16, 1.10, 2.30),
                (0.44, 0.70, 0.18, 3.40, 5.00),
            ]
            for pli in plis {
                let arc = UIBezierPath(
                    arcCenter: CGPoint(x: cadre.minX + cadre.width * pli.x,
                                       y: cadre.minY + cadre.height * pli.y),
                    radius: cadre.width * pli.rayon,
                    startAngle: pli.début * CGFloat.pi / 2, endAngle: pli.fin * CGFloat.pi / 2,
                    clockwise: true)
                arc.lineWidth = trait * 0.7
                arc.lineCapStyle = .round
                arc.stroke()
            }
            // Le sillon central : c'est lui qui donne les DEUX hémisphères.
            let sillon = UIBezierPath()
            sillon.move(to: CGPoint(x: cadre.minX + cadre.width * 0.46, y: cadre.minY + cadre.height * 0.10))
            sillon.addCurve(to: CGPoint(x: cadre.minX + cadre.width * 0.50, y: cadre.maxY - cadre.height * 0.06),
                            controlPoint1: CGPoint(x: cadre.minX + cadre.width * 0.36, y: cadre.midY),
                            controlPoint2: CGPoint(x: cadre.minX + cadre.width * 0.62, y: cadre.midY))
            sillon.lineWidth = trait * 0.7
            sillon.lineCapStyle = .round
            sillon.stroke()

            // Trois étincelles à droite : l'idée qui jaillit, pas l'organe.
            let étincelles: [(x: CGFloat, y: CGFloat, côté: CGFloat)] = [
                (0.78, 0.04, 0.20), (0.86, 0.30, 0.12), (0.76, 0.48, 0.09),
            ]
            for étincelle in étincelles {
                let côtéÉtoile = h * étincelle.côté
                StickerTemplateDrawing.fillWithOutline(
                    StickerTemplateDrawing.starPath(
                        in: CGRect(x: l * étincelle.x, y: h * étincelle.y,
                                   width: côtéÉtoile, height: côtéÉtoile),
                        points: 4, innerRatio: 0.34),
                    fill: StickerTemplatePalette.warmBulb,
                    outline: StickerTemplatePalette.surface, width: trait * 0.35)
            }
        }
    }

    // MARK: - work.team — les trois de l'équipe

    @MainActor
    private static func workTeamSize(metrics: StickerTemplateMetrics) -> CGSize {
        CGSize(width: ceil(metrics.fontSize * 3.4), height: ceil(metrics.fontSize * 2.2))
    }

    @MainActor
    private static func workTeamImage(metrics: StickerTemplateMetrics,
                                      screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = workTeamSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let l = taille.width, h = taille.height
            let trait = max(1.5, metrics.fontSize * 0.05)
            let couleurs = [StickerTemplatePalette.sky,
                            StickerTemplatePalette.accent,
                            StickerTemplatePalette.leaf]
            // Le rayon se DÉDUIT de la hauteur moins le liseré, et le pas de la
            // largeur restante : trois disques posés en dur déborderaient du
            // raster dès que la métrique change.
            let rayon = h * 0.42 - trait
            let marge = rayon + trait
            let pas = (l - marge * 2) / 2
            // À l'envers : le premier de l'équipe passe DEVANT les deux autres.
            for index in (0..<3).reversed() {
                let centre = CGPoint(x: marge + CGFloat(index) * pas, y: h / 2)
                StickerTemplateDrawing.fillWithOutline(
                    UIBezierPath(ovalIn: CGRect(x: centre.x - rayon, y: centre.y - rayon,
                                                width: rayon * 2, height: rayon * 2)),
                    fill: couleurs[index], outline: StickerTemplatePalette.surface, width: trait)
                StickerTemplatePalette.surface.setFill()
                UIBezierPath(ovalIn: CGRect(x: centre.x - rayon * 0.26, y: centre.y - rayon * 0.54,
                                            width: rayon * 0.52, height: rayon * 0.52)).fill()
                let épaules = UIBezierPath(arcCenter: CGPoint(x: centre.x, y: centre.y + rayon * 0.64),
                                           radius: rayon * 0.50,
                                           startAngle: CGFloat.pi, endAngle: 2 * CGFloat.pi,
                                           clockwise: true)
                épaules.close()
                épaules.fill()
            }
        }
    }

    // MARK: - Le registre de la famille TRAVAIL

    private static let workCards: [WorkCard] = [
        WorkCard(id: StickerTemplateCatalog.ID.workChecklist,
                 name: { String(localized: "sticker.template.work.checklist", defaultValue: "À faire", bundle: .module) },
                 fond: .note,
                 haut: StickerTemplatePalette.surface,
                 bas: StickerTemplatePalette.indigoLight.withAlphaComponent(0.55),
                 liseré: StickerTemplatePalette.hairline,
                 texte: StickerTemplatePalette.label,
                 icône: { r in Self.workTickListIcon(in: r) }),
        WorkCard(id: StickerTemplateCatalog.ID.workDone,
                 name: { String(localized: "sticker.template.work.done", defaultValue: "Terminé", bundle: .module) },
                 fond: .écusson,
                 haut: StickerTemplatePalette.leaf, bas: StickerTemplatePalette.sky,
                 liseré: StickerTemplatePalette.surface,
                 texte: StickerTemplatePalette.surface,
                 icône: { r in Self.workSealIcon(in: r) }),
        WorkCard(id: StickerTemplateCatalog.ID.workRemote,
                 name: { String(localized: "sticker.template.work.remote", defaultValue: "Télétravail", bundle: .module) },
                 fond: .pancarte,
                 haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.night,
                 liseré: StickerTemplatePalette.surface.withAlphaComponent(0.7),
                 texte: StickerTemplatePalette.surface,
                 icône: { r in Self.workHouseIcon(in: r) }),
    ]

    static let workDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.workLaptop,
            name: { String(localized: "sticker.template.work.laptop", defaultValue: "Au clavier", bundle: .module) },
            measure: { _, m in Self.workLaptopSize(metrics: m) },
            draw: { _, m, échelle in Self.workLaptopImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.workBriefcase,
            name: { String(localized: "sticker.template.work.briefcase", defaultValue: "Au bureau", bundle: .module) },
            measure: { _, m in Self.workBriefcaseSize(metrics: m) },
            draw: { _, m, échelle in Self.workBriefcaseImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.workIdea,
            name: { String(localized: "sticker.template.work.idea", defaultValue: "Une idée", bundle: .module) },
            measure: { _, m in Self.workBulbSize(metrics: m) },
            draw: { _, m, échelle in Self.workBulbImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.workRocket,
            name: { String(localized: "sticker.template.work.rocket", defaultValue: "Ça décolle", bundle: .module) },
            measure: { _, m in Self.workRocketSize(metrics: m) },
            draw: { _, m, échelle in Self.workRocketImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.workChart,
            name: { String(localized: "sticker.template.work.chart", defaultValue: "En hausse", bundle: .module) },
            measure: { _, m in Self.workChartSize(metrics: m) },
            draw: { _, m, échelle in Self.workChartImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.workBrainstorm,
            name: { String(localized: "sticker.template.work.brainstorm", defaultValue: "Remue-méninges", bundle: .module) },
            measure: { _, m in Self.workBrainSize(metrics: m) },
            draw: { _, m, échelle in Self.workBrainImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.workTeam,
            name: { String(localized: "sticker.template.work.team", defaultValue: "En équipe", bundle: .module) },
            measure: { _, m in Self.workTeamSize(metrics: m) },
            draw: { _, m, échelle in Self.workTeamImage(metrics: m, screenScale: échelle) }),
    ] + workCards.map { workCardDrawer($0) }
}
