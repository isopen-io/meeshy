import Foundation
import UIKit
import MeeshySDK

// MARK: - Les trois décorations de LIEU (#4718)

extension StickerTemplateRenderer {

    // MARK: Les emplacements, lus une fois

    static func placeName(_ slots: [String: String]) -> String {
        slots[StickerSlotFiller.placeNameSlot] ?? ""
    }

    /// Le détail est VIDE quand le nom a déjà pris l'adresse (lieu sans nom) :
    /// `StickerSlotFiller.placeSlots` s'en charge, et les gabarits qui posent
    /// deux lignes doivent donc supporter que la seconde n'existe pas.
    static func placeDetail(_ slots: [String: String]) -> String {
        slots[StickerSlotFiller.placeDetailSlot] ?? ""
    }

    // MARK: - location.pill — l'existante, déplacée sans être touchée

    @MainActor
    static func pillSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        let étiquette = placeName(slots)
        let police = UIFont.systemFont(ofSize: metrics.fontSize, weight: .semibold)
        let tailleTexte = StickerTemplateDrawing.measure(étiquette, font: police)
        let tailleIcône = metrics.fontSize
        return CGSize(
            width: ceil(metrics.horizontalPadding * 2 + tailleIcône + metrics.gap + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + max(tailleIcône, tailleTexte.height))
        )
    }

    @MainActor
    static func pillImage(slots: [String: String], metrics: StickerTemplateMetrics,
                          screenScale: CGFloat) -> (UIImage?, CGSize) {
        let étiquette = placeName(slots)
        // `systemFont` et non la police arrondie des autres gabarits : ce dessin
        // est celui d'avant le #4717, au pixel près. Le changer ici ferait
        // rougir la garde de non-régression — et bougerait toutes les pastilles
        // déjà publiées.
        let police = UIFont.systemFont(ofSize: metrics.fontSize, weight: .semibold)
        let attributs: [NSAttributedString.Key: Any] = [
            .font: police, .foregroundColor: StickerTemplatePalette.label,
        ]
        let tailleTexte = (étiquette as NSString).size(withAttributes: attributs)
        let tailleIcône = metrics.fontSize
        let taille = pillSize(slots: slots, metrics: metrics)

        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let pastille = UIBezierPath(roundedRect: CGRect(origin: .zero, size: taille),
                                        cornerRadius: taille.height / 2)
            StickerTemplatePalette.surface.setFill()
            pastille.fill()

            let cadreIcône = CGRect(x: metrics.horizontalPadding,
                                    y: (taille.height - tailleIcône) / 2,
                                    width: tailleIcône, height: tailleIcône)
            let config = UIImage.SymbolConfiguration(pointSize: tailleIcône * 0.82, weight: .semibold)
            UIImage(systemName: "mappin.circle.fill", withConfiguration: config)?
                .withTintColor(StickerTemplatePalette.pin, renderingMode: .alwaysOriginal)
                .draw(in: cadreIcône)

            let cadreTexte = CGRect(x: metrics.horizontalPadding + tailleIcône + metrics.gap,
                                    y: (taille.height - tailleTexte.height) / 2,
                                    width: tailleTexte.width, height: tailleTexte.height)
            (étiquette as NSString).draw(in: cadreTexte, withAttributes: attributs)
        }
    }

    // MARK: - location.postcard — le cartouche « carte postale »

    /// Deux lignes : le nom en grand, le détail en petit sous un filet.
    @MainActor
    private static func postcardLayout(slots: [String: String],
                                       metrics: StickerTemplateMetrics)
        -> (nom: String, détail: String, policeNom: UIFont, policeDétail: UIFont,
            tailleNom: CGSize, tailleDétail: CGSize, taille: CGSize) {
        let nom = placeName(slots)
        let détail = placeDetail(slots)
        let policeNom = StickerTemplateDrawing.font(size: metrics.fontSize, weight: .bold)
        let policeDétail = StickerTemplateDrawing.font(size: metrics.fontSize * 0.62, weight: .medium)
        let tailleNom = StickerTemplateDrawing.measure(nom, font: policeNom)
        let tailleDétail = détail.isEmpty ? .zero
            : StickerTemplateDrawing.measure(détail, font: policeDétail)

        let largeurTexte = max(tailleNom.width, tailleDétail.width)
        let hauteurTexte = tailleNom.height
            + (détail.isEmpty ? 0 : metrics.gap * 0.6 + tailleDétail.height)
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2 + largeurTexte + metrics.fontSize * 0.9),
            height: ceil(metrics.verticalPadding * 2 + hauteurTexte)
        )
        return (nom, détail, policeNom, policeDétail, tailleNom, tailleDétail, taille)
    }

    @MainActor
    static func postcardSize(slots: [String: String],
                             metrics: StickerTemplateMetrics) -> CGSize {
        postcardLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func postcardImage(slots: [String: String], metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = postcardLayout(slots: slots, metrics: metrics)
        let rayon = metrics.fontSize * 0.28
        let liseré = max(1, metrics.fontSize * 0.045)

        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: liseré, dy: liseré)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: rayon)
            StickerTemplatePalette.surface.setFill()
            carte.fill()
            // Le double filet de la carte postale : un trait épais au bord, un
            // trait fin en retrait.
            StickerTemplatePalette.hairline.setStroke()
            carte.lineWidth = liseré
            carte.stroke()
            let intérieur = UIBezierPath(roundedRect: cadre.insetBy(dx: liseré * 2.4, dy: liseré * 2.4),
                                         cornerRadius: rayon * 0.7)
            intérieur.lineWidth = liseré * 0.6
            intérieur.stroke()

            let épingle = metrics.fontSize * 0.62
            let cadreÉpingle = CGRect(x: metrics.horizontalPadding * 0.45,
                                      y: metrics.verticalPadding * 0.55,
                                      width: épingle, height: épingle)
            let config = UIImage.SymbolConfiguration(pointSize: épingle * 0.9, weight: .bold)
            UIImage(systemName: "mappin", withConfiguration: config)?
                .withTintColor(StickerTemplatePalette.pin, renderingMode: .alwaysOriginal)
                .draw(in: cadreÉpingle)

            let xTexte = metrics.horizontalPadding + metrics.fontSize * 0.45
            StickerTemplateDrawing.draw(l.nom, font: l.policeNom,
                                        color: StickerTemplatePalette.label,
                                        at: CGPoint(x: xTexte, y: metrics.verticalPadding))
            guard !l.détail.isEmpty else { return }
            StickerTemplateDrawing.draw(
                l.détail, font: l.policeDétail,
                color: StickerTemplatePalette.label.withAlphaComponent(0.66),
                at: CGPoint(x: xTexte,
                            y: metrics.verticalPadding + l.tailleNom.height + metrics.gap * 0.6))
        }
    }

    // MARK: - location.ticket — l'étiquette perforée

    @MainActor
    private static func ticketLayout(slots: [String: String],
                                     metrics: StickerTemplateMetrics)
        -> (nom: String, police: UIFont, tailleNom: CGSize, souche: CGFloat, taille: CGSize) {
        let nom = placeName(slots)
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.86, weight: .bold)
        let tailleNom = StickerTemplateDrawing.measure(nom, font: police)
        // La souche — la part gauche, avant la perforation — porte l'épingle.
        let souche = metrics.fontSize * 1.5
        let taille = CGSize(
            width: ceil(souche + metrics.horizontalPadding * 1.6 + tailleNom.width),
            height: ceil(metrics.verticalPadding * 2 + max(metrics.fontSize, tailleNom.height))
        )
        return (nom, police, tailleNom, souche, taille)
    }

    @MainActor
    static func ticketSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        ticketLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func ticketImage(slots: [String: String], metrics: StickerTemplateMetrics,
                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = ticketLayout(slots: slots, metrics: metrics)
        let entaille = l.taille.height * 0.16

        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let plein = CGRect(origin: .zero, size: l.taille)
            let billet = UIBezierPath(roundedRect: plein, cornerRadius: metrics.fontSize * 0.22)
            StickerTemplatePalette.surface.setFill()
            billet.fill()

            // Les deux encoches de perforation, creusées dans le fond en mode
            // `.clear` : elles doivent RETIRER de la matière, pas peindre du
            // blanc — une décoration se pose sur une scène colorée.
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                contexte.setBlendMode(.clear)
                for centre in [CGPoint(x: l.souche, y: 0), CGPoint(x: l.souche, y: l.taille.height)] {
                    UIBezierPath(arcCenter: centre, radius: entaille,
                                 startAngle: 0, endAngle: .pi * 2, clockwise: true).fill()
                }
                contexte.restoreGState()
            }

            // Le pointillé de découpe entre la souche et le libellé.
            let découpe = UIBezierPath()
            découpe.move(to: CGPoint(x: l.souche, y: entaille * 1.3))
            découpe.addLine(to: CGPoint(x: l.souche, y: l.taille.height - entaille * 1.3))
            découpe.setLineDash([entaille * 0.5, entaille * 0.45], count: 2, phase: 0)
            découpe.lineWidth = max(1, metrics.fontSize * 0.05)
            StickerTemplatePalette.hairline.setStroke()
            découpe.stroke()

            let épingle = metrics.fontSize * 0.78
            let config = UIImage.SymbolConfiguration(pointSize: épingle, weight: .bold)
            UIImage(systemName: "mappin.and.ellipse", withConfiguration: config)?
                .withTintColor(StickerTemplatePalette.pin, renderingMode: .alwaysOriginal)
                .draw(in: CGRect(x: (l.souche - épingle) / 2,
                                 y: (l.taille.height - épingle) / 2,
                                 width: épingle, height: épingle))

            StickerTemplateDrawing.draw(
                l.nom, font: l.police, color: StickerTemplatePalette.label,
                at: CGPoint(x: l.souche + metrics.horizontalPadding * 0.8,
                            y: (l.taille.height - l.tailleNom.height) / 2))
        }
    }
}
