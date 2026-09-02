import Foundation
import UIKit
import MeeshySDK

// MARK: - Trois pastilles de lieu de plus (#4745)

/// Le porteur en voulait davantage, et **visuellement bien distinctes** : trois
/// cartouches rectangulaires de plus se seraient ressemblés. Chacune ci-dessous
/// change de SILHOUETTE — dentelée, ronde, à chevrons — pour se reconnaître du
/// coin de l'œil dans la palette.
///
/// Fichier séparé de `StickerTemplates+Location` : celui-ci tenait déjà 220
/// lignes, et trois dessins de plus l'auraient poussé vers la limite du budget
/// pour un gain de cohésion nul — ce sont trois formes indépendantes.
extension StickerTemplateRenderer {

    // MARK: - location.stamp — le timbre à bord dentelé

    @MainActor
    private static func stampLayout(slots: [String: String],
                                    metrics: StickerTemplateMetrics)
        -> (nom: String, détail: String, policeNom: UIFont, policeDétail: UIFont,
            tailleNom: CGSize, tailleDétail: CGSize, dent: CGFloat, taille: CGSize) {
        let nom = placeName(slots)
        let détail = placeDetail(slots)
        let policeNom = StickerTemplateDrawing.font(size: metrics.fontSize * 0.82, weight: .heavy)
        let policeDétail = StickerTemplateDrawing.font(size: metrics.fontSize * 0.5, weight: .medium)
        let tailleNom = StickerTemplateDrawing.measure(nom, font: policeNom)
        let tailleDétail = détail.isEmpty ? .zero
            : StickerTemplateDrawing.measure(détail, font: policeDétail)
        // Le rayon d'une dent. La silhouette ENTIÈRE en dépend, donc elle vit
        // dans la mesure — la calculer au dessin ferait diverger la boîte du
        // hit-test et du bord réellement tracé.
        let dent = metrics.fontSize * 0.16
        let largeurTexte = max(tailleNom.width, tailleDétail.width)
        let taille = CGSize(
            width: ceil(largeurTexte + metrics.horizontalPadding * 2 + dent * 2),
            height: ceil(tailleNom.height + (détail.isEmpty ? 0 : tailleDétail.height)
                         + metrics.verticalPadding * 2 + dent * 2)
        )
        return (nom, détail, policeNom, policeDétail, tailleNom, tailleDétail, dent, taille)
    }

    @MainActor
    static func stampSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        stampLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func stampImage(slots: [String: String], metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = stampLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: l.dent, dy: l.dent)
            UIBezierPath(rect: cadre).addClip()
            StickerTemplatePalette.surface.setFill()
            UIBezierPath(rect: CGRect(origin: .zero, size: l.taille)).fill()

            // Les dents : des demi-disques CREUSÉS sur les quatre bords. En
            // `.clear`, jamais en blanc — une décoration se pose sur une scène
            // colorée, et un blanc y ferait un cadre opaque.
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                contexte.resetClip()
                contexte.setBlendMode(.clear)
                Self.stampNotches(in: l.taille, tooth: l.dent).forEach { $0.fill() }
                contexte.restoreGState()
            }

            let liseré = UIBezierPath(rect: cadre.insetBy(dx: l.dent * 0.5, dy: l.dent * 0.5))
            liseré.lineWidth = max(1, metrics.fontSize * 0.05)
            liseré.setLineDash([l.dent, l.dent * 0.8], count: 2, phase: 0)
            StickerTemplatePalette.hairline.setStroke()
            liseré.stroke()

            let hauteurTexte = l.tailleNom.height + (l.détail.isEmpty ? 0 : l.tailleDétail.height)
            let yHaut = (l.taille.height - hauteurTexte) / 2
            StickerTemplateDrawing.draw(
                l.nom, font: l.policeNom, color: StickerTemplatePalette.label,
                at: CGPoint(x: (l.taille.width - l.tailleNom.width) / 2, y: yHaut))
            guard !l.détail.isEmpty else { return }
            StickerTemplateDrawing.draw(
                l.détail, font: l.policeDétail,
                color: StickerTemplatePalette.label.withAlphaComponent(0.6),
                at: CGPoint(x: (l.taille.width - l.tailleDétail.width) / 2,
                            y: yHaut + l.tailleNom.height))
        }
    }

    /// Les demi-disques du bord, répartis pour tomber JUSTE aux quatre coins :
    /// un pas fixe laisserait une dent tronquée sur un timbre étroit.
    private static func stampNotches(in taille: CGSize, tooth: CGFloat) -> [UIBezierPath] {
        var chemins: [UIBezierPath] = []
        func semer(longueur: CGFloat, _ point: (CGFloat) -> CGPoint) {
            let compte = max(2, Int((longueur / (tooth * 2)).rounded()))
            let pas = longueur / CGFloat(compte)
            for i in 0...compte {
                let c = point(CGFloat(i) * pas)
                chemins.append(UIBezierPath(arcCenter: c, radius: tooth,
                                            startAngle: 0, endAngle: .pi * 2, clockwise: true))
            }
        }
        semer(longueur: taille.width) { CGPoint(x: $0, y: 0) }
        semer(longueur: taille.width) { CGPoint(x: $0, y: taille.height) }
        semer(longueur: taille.height) { CGPoint(x: 0, y: $0) }
        semer(longueur: taille.height) { CGPoint(x: taille.width, y: $0) }
        return chemins
    }

    // MARK: - location.compass — le cartouche à boussole

    @MainActor
    private static func compassLayout(slots: [String: String],
                                      metrics: StickerTemplateMetrics)
        -> (nom: String, police: UIFont, tailleNom: CGSize, rose: CGFloat, taille: CGSize) {
        let nom = placeName(slots)
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.8, weight: .bold)
        let tailleNom = StickerTemplateDrawing.measure(nom, font: police)
        let rose = metrics.fontSize * 1.6
        let taille = CGSize(
            width: ceil(rose + metrics.gap + tailleNom.width + metrics.horizontalPadding * 1.6),
            height: ceil(max(rose, tailleNom.height) + metrics.verticalPadding * 1.4)
        )
        return (nom, police, tailleNom, rose, taille)
    }

    @MainActor
    static func compassSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        compassLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func compassImage(slots: [String: String], metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = compassLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let capsule = UIBezierPath(roundedRect: cadre, cornerRadius: l.taille.height / 2)
            StickerTemplateDrawing.fill(capsule,
                                        gradientFrom: StickerTemplatePalette.surface,
                                        to: StickerTemplatePalette.hairline.withAlphaComponent(0.45),
                                        in: cadre)

            // **La rose pointe le NORD, et rien d'autre.** Faire pointer le
            // lieu demanderait un relèvement que la palette n'a pas ; une
            // aiguille qui désigne une direction fausse serait pire qu'une
            // décoration franche.
            let centreRose = CGPoint(x: metrics.horizontalPadding * 0.6 + l.rose / 2,
                                     y: l.taille.height / 2)
            let rayon = l.rose / 2
            StickerTemplatePalette.hairline.setStroke()
            let anneau = UIBezierPath(arcCenter: centreRose, radius: rayon * 0.92,
                                      startAngle: 0, endAngle: .pi * 2, clockwise: true)
            anneau.lineWidth = max(1, metrics.fontSize * 0.06)
            anneau.stroke()

            let aiguille = UIBezierPath()
            aiguille.move(to: CGPoint(x: centreRose.x, y: centreRose.y - rayon * 0.72))
            aiguille.addLine(to: CGPoint(x: centreRose.x - rayon * 0.26, y: centreRose.y + rayon * 0.3))
            aiguille.addLine(to: CGPoint(x: centreRose.x, y: centreRose.y + rayon * 0.12))
            aiguille.addLine(to: CGPoint(x: centreRose.x + rayon * 0.26, y: centreRose.y + rayon * 0.3))
            aiguille.close()
            StickerTemplatePalette.pin.setFill()
            aiguille.fill()

            StickerTemplateDrawing.draw(
                l.nom, font: l.police, color: StickerTemplatePalette.label,
                at: CGPoint(x: centreRose.x + rayon + metrics.gap,
                            y: (l.taille.height - l.tailleNom.height) / 2))
        }
    }

    // MARK: - location.marquee — l'enseigne lumineuse

    @MainActor
    private static func marqueeLayout(slots: [String: String],
                                      metrics: StickerTemplateMetrics)
        -> (nom: String, police: UIFont, tailleNom: CGSize, ampoule: CGFloat, taille: CGSize) {
        // Capitales : une enseigne ne se lit pas en bas-de-casse.
        let nom = placeName(slots).uppercased()
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.78, weight: .black)
        let tailleNom = StickerTemplateDrawing.measure(nom, font: police)
        let ampoule = metrics.fontSize * 0.16
        let taille = CGSize(
            width: ceil(tailleNom.width + metrics.horizontalPadding * 2.2),
            height: ceil(tailleNom.height + metrics.verticalPadding * 2.2)
        )
        return (nom, police, tailleNom, ampoule, taille)
    }

    @MainActor
    static func marqueeSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        marqueeLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func marqueeImage(slots: [String: String], metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = marqueeLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let panneau = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.2)
            StickerTemplateDrawing.fill(panneau,
                                        gradientFrom: StickerTemplatePalette.ink,
                                        to: StickerTemplatePalette.loveCool.withAlphaComponent(0.9),
                                        in: cadre)

            // Les ampoules du pourtour — ce qui fait l'enseigne. Espacées
            // depuis la LARGEUR réelle pour qu'aucune ne tombe à cheval sur un
            // coin.
            StickerTemplatePalette.warmBulb.setFill()
            let marge = l.ampoule * 1.6
            let compte = max(3, Int(((l.taille.width - marge * 2) / (l.ampoule * 3.2)).rounded()))
            let pas = (l.taille.width - marge * 2) / CGFloat(compte)
            for i in 0...compte {
                let x = marge + CGFloat(i) * pas
                for y in [marge, l.taille.height - marge] {
                    UIBezierPath(arcCenter: CGPoint(x: x, y: y), radius: l.ampoule,
                                 startAngle: 0, endAngle: .pi * 2, clockwise: true).fill()
                }
            }

            StickerTemplateDrawing.drawCentered(l.nom, font: l.police,
                                                color: StickerTemplatePalette.surface,
                                                in: cadre)
        }
    }
}
