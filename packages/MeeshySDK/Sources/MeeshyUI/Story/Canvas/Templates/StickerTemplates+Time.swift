import Foundation
import UIKit
import MeeshySDK

// MARK: - Les trois décorations d'HEURE (#4718)

/// **L'heure est FIGÉE à la pose** (décision D1 du 2026-09-01) : rien ici ne lit
/// l'horloge. Les trois gabarits dessinent ce que `StickerSlotFiller` a écrit
/// dans les emplacements au moment où l'auteur a posé la décoration — c'est ce
/// qui fait que tout lecteur voit la même heure que lui, et qu'une story
/// archivée garde son sens.
extension StickerTemplateRenderer {

    static func timeText(_ slots: [String: String]) -> String {
        slots[StickerSlotFiller.timeSlot] ?? ""
    }

    /// L'heure et les minutes en NOMBRES — pour les aiguilles. Ré-analyser la
    /// chaîne d'affichage casserait à la première locale qui écrit « 2:32 PM ».
    static func clockHands(_ slots: [String: String]) -> (heure: Int, minute: Int) {
        (Int(slots[StickerSlotFiller.hourSlot] ?? "") ?? 0,
         Int(slots[StickerSlotFiller.minuteSlot] ?? "") ?? 0)
    }

    // MARK: - time.digital — les chiffres à segments

    @MainActor
    private static func digitalLayout(slots: [String: String],
                                      metrics: StickerTemplateMetrics)
        -> (texte: String, police: UIFont, tailleTexte: CGSize, taille: CGSize) {
        let texte = timeText(slots)
        let police = StickerTemplateDrawing.digitFont(size: metrics.fontSize, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(texte, font: police)
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2 + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + tailleTexte.height)
        )
        return (texte, police, tailleTexte, taille)
    }

    @MainActor
    static func digitalSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        digitalLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func digitalImage(slots: [String: String], metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = digitalLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let boîte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.26)
            // Fond ENCRE, chiffres clairs : c'est le seul gabarit sombre, et
            // c'est ce qui lui donne l'air d'un afficheur plutôt que d'une
            // étiquette.
            StickerTemplateDrawing.fill(boîte,
                                        gradientFrom: StickerTemplatePalette.ink,
                                        to: StickerTemplatePalette.accent.withAlphaComponent(0.92),
                                        in: cadre)
            StickerTemplateDrawing.drawCentered(l.texte, font: l.police,
                                                color: StickerTemplatePalette.surface,
                                                in: cadre)
        }
    }

    // MARK: - time.analog — le cadran aux aiguilles figées

    @MainActor
    static func analogSize(metrics: StickerTemplateMetrics) -> CGSize {
        // Un cadran est CARRÉ et ne dépend d'aucun texte : sa taille ne varie
        // pas d'une minute à l'autre, contrairement aux deux autres.
        let côté = ceil(metrics.fontSize * 3.2)
        return CGSize(width: côté, height: côté)
    }

    @MainActor
    static func analogImage(slots: [String: String], metrics: StickerTemplateMetrics,
                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = analogSize(metrics: metrics)
        let (heure, minute) = clockHands(slots)
        let centre = CGPoint(x: taille.width / 2, y: taille.height / 2)
        let rayon = taille.width / 2

        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let anneau = max(1.5, metrics.fontSize * 0.09)
            let cadran = UIBezierPath(ovalIn: CGRect(origin: .zero, size: taille)
                .insetBy(dx: anneau / 2, dy: anneau / 2))
            StickerTemplatePalette.surface.setFill()
            cadran.fill()
            StickerTemplatePalette.hairline.setStroke()
            cadran.lineWidth = anneau
            cadran.stroke()

            // Les douze index. Les quatre cardinaux sont plus longs : sans eux,
            // un cadran lu du coin de l'œil n'a plus d'orientation.
            StickerTemplatePalette.label.withAlphaComponent(0.55).setStroke()
            for index in 0..<12 {
                let angle = CGFloat(index) * .pi / 6
                let cardinal = index % 3 == 0
                let longueur = rayon * (cardinal ? 0.20 : 0.11)
                let début = CGPoint(x: centre.x + sin(angle) * (rayon - anneau - longueur),
                                    y: centre.y - cos(angle) * (rayon - anneau - longueur))
                let fin = CGPoint(x: centre.x + sin(angle) * (rayon - anneau),
                                  y: centre.y - cos(angle) * (rayon - anneau))
                let trait = UIBezierPath()
                trait.move(to: début); trait.addLine(to: fin)
                trait.lineWidth = anneau * (cardinal ? 0.9 : 0.55)
                trait.lineCapStyle = .round
                trait.stroke()
            }

            // Les aiguilles. L'aiguille des heures avance AVEC les minutes —
            // la figer sur l'heure pleine donnerait un cadran qui contredit
            // l'heure qu'il affiche.
            let angleMinute = CGFloat(minute) / 60 * 2 * .pi
            let angleHeure = (CGFloat(heure % 12) + CGFloat(minute) / 60) / 12 * 2 * .pi
            aiguille(from: centre, angle: angleHeure, length: rayon * 0.48,
                     width: anneau * 1.25, color: StickerTemplatePalette.label)
            aiguille(from: centre, angle: angleMinute, length: rayon * 0.70,
                     width: anneau * 0.9, color: StickerTemplatePalette.accent)

            let pivot = anneau * 1.4
            StickerTemplatePalette.pin.setFill()
            UIBezierPath(ovalIn: CGRect(x: centre.x - pivot / 2, y: centre.y - pivot / 2,
                                        width: pivot, height: pivot)).fill()
        }
    }

    @MainActor
    private static func aiguille(from centre: CGPoint, angle: CGFloat, length: CGFloat,
                                 width: CGFloat, color: UIColor) {
        let trait = UIBezierPath()
        trait.move(to: centre)
        trait.addLine(to: CGPoint(x: centre.x + sin(angle) * length,
                                  y: centre.y - cos(angle) * length))
        trait.lineWidth = width
        trait.lineCapStyle = .round
        color.setStroke()
        trait.stroke()
    }

    // MARK: - time.ribbon — le bandeau incliné

    @MainActor
    private static func ribbonLayout(slots: [String: String],
                                     metrics: StickerTemplateMetrics)
        -> (texte: String, police: UIFont, tailleTexte: CGSize, queue: CGFloat, taille: CGSize) {
        let texte = timeText(slots)
        let police = StickerTemplateDrawing.digitFont(size: metrics.fontSize * 0.92, weight: .bold)
        let tailleTexte = StickerTemplateDrawing.measure(texte, font: police)
        let queue = metrics.fontSize * 0.5
        let taille = CGSize(
            width: ceil(queue * 2 + metrics.horizontalPadding * 2 + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + tailleTexte.height)
        )
        return (texte, police, tailleTexte, queue, taille)
    }

    @MainActor
    static func ribbonSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        ribbonLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func ribbonImage(slots: [String: String], metrics: StickerTemplateMetrics,
                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = ribbonLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let h = l.taille.height, L = l.taille.width, q = l.queue
            // Un ruban : un rectangle dont les deux extrémités sont creusées
            // en chevron. La forme est tracée, jamais approchée par une image —
            // elle doit rester nette à toute échelle.
            let ruban = UIBezierPath()
            ruban.move(to: CGPoint(x: 0, y: 0))
            ruban.addLine(to: CGPoint(x: L, y: 0))
            ruban.addLine(to: CGPoint(x: L - q, y: h / 2))
            ruban.addLine(to: CGPoint(x: L, y: h))
            ruban.addLine(to: CGPoint(x: 0, y: h))
            ruban.addLine(to: CGPoint(x: q, y: h / 2))
            ruban.close()

            StickerTemplateDrawing.fill(ruban,
                                        gradientFrom: StickerTemplatePalette.accent,
                                        to: StickerTemplatePalette.loveCool,
                                        in: CGRect(origin: .zero, size: l.taille))
            StickerTemplateDrawing.drawCentered(l.texte, font: l.police,
                                                color: StickerTemplatePalette.surface,
                                                in: CGRect(origin: .zero, size: l.taille))
        }
    }

    // MARK: - Le registre de la famille HEURE

    static let timeDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeDigital,
            name: { String(localized: "sticker.template.time.digital", defaultValue: "Heure numérique", bundle: .module) },
            measure: { s, m in Self.digitalSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.digitalImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeAnalog,
            name: { String(localized: "sticker.template.time.analog", defaultValue: "Cadran", bundle: .module) },
            measure: { _, m in Self.analogSize(metrics: m) },
            draw: { s, m, échelle in Self.analogImage(slots: s, metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.timeRibbon,
            name: { String(localized: "sticker.template.time.ribbon", defaultValue: "Ruban", bundle: .module) },
            measure: { s, m in Self.ribbonSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.ribbonImage(slots: s, metrics: m, screenScale: échelle) }),
    ]
}
