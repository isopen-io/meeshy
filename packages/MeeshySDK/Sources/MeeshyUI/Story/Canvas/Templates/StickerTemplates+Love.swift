import Foundation
import UIKit
import MeeshySDK

// MARK: - Les trois décorations d'AMOUR (#4718)

/// **Aucune de ces trois ne porte de texte libre.** L'auteur a déjà l'outil
/// texte pour les mots, et un emplacement de PROSE ouvrirait la question du
/// Prisme Linguistique (#4721) que ce lot ne traite pas. `love.since` porte une
/// DATE — une valeur, jamais un discours : elle ne part pas à la traduction.
extension StickerTemplateRenderer {

    static func sinceDate(_ slots: [String: String]) -> String {
        slots[StickerSlotFiller.dateSlot] ?? ""
    }

    // MARK: - love.heartFrame — le cœur plein

    @MainActor
    static func heartFrameSize(metrics: StickerTemplateMetrics) -> CGSize {
        // Un cœur est plus large que haut d'environ un dixième : le prendre
        // carré l'écraserait dans sa pointe.
        let largeur = ceil(metrics.fontSize * 3.0)
        return CGSize(width: largeur, height: ceil(largeur * 0.92))
    }

    @MainActor
    static func heartFrameImage(metrics: StickerTemplateMetrics,
                                screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = heartFrameSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.10)
            let cadre = CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord)
            let cœur = StickerTemplateDrawing.heartPath(in: cadre)
            StickerTemplateDrawing.fill(cœur,
                                        gradientFrom: StickerTemplatePalette.loveWarm,
                                        to: StickerTemplatePalette.loveCool,
                                        in: cadre)
            // Le liseré clair détache le cœur d'une photo sombre : sans lui, la
            // décoration disparaît sur un fond de nuit.
            StickerTemplatePalette.surface.setStroke()
            cœur.lineWidth = bord
            cœur.stroke()
        }
    }

    // MARK: - love.doubleHeart — les deux cœurs entrelacés

    @MainActor
    static func doubleHeartSize(metrics: StickerTemplateMetrics) -> CGSize {
        let largeur = ceil(metrics.fontSize * 3.6)
        return CGSize(width: largeur, height: ceil(largeur * 0.80))
    }

    @MainActor
    static func doubleHeartImage(metrics: StickerTemplateMetrics,
                                 screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = doubleHeartSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1.2, metrics.fontSize * 0.08)
            let côté = taille.width * 0.62

            // Le GRAND derrière, le petit devant : l'ordre de dessin EST la
            // profondeur. L'inverser donnerait deux cœurs qui se chevauchent
            // sans se croiser.
            let grand = CGRect(x: taille.width - côté - bord,
                               y: bord,
                               width: côté, height: côté * 0.92)
            let cheminGrand = StickerTemplateDrawing.heartPath(in: grand)
            StickerTemplateDrawing.fill(cheminGrand,
                                        gradientFrom: StickerTemplatePalette.loveCool,
                                        to: StickerTemplatePalette.accent,
                                        in: grand)
            StickerTemplatePalette.surface.withAlphaComponent(0.85).setStroke()
            cheminGrand.lineWidth = bord
            cheminGrand.stroke()

            let petitCôté = côté * 0.80
            let petit = CGRect(x: bord,
                               y: taille.height - petitCôté * 0.92 - bord,
                               width: petitCôté, height: petitCôté * 0.92)
            let cheminPetit = StickerTemplateDrawing.heartPath(in: petit)
            StickerTemplateDrawing.fill(cheminPetit,
                                        gradientFrom: StickerTemplatePalette.loveWarm,
                                        to: StickerTemplatePalette.loveCool,
                                        in: petit)
            StickerTemplatePalette.surface.setStroke()
            cheminPetit.lineWidth = bord
            cheminPetit.stroke()
        }
    }

    // MARK: - love.since — « depuis le … »

    /// Le libellé « depuis le ». Localisé, donc il vit dans `MeeshyUI` —
    /// `MeeshySDK` n'a aucune ressource de localisation (cf. `Package.swift`).
    @MainActor
    static var sinceCaption: String {
        String(localized: "sticker.template.love.since",
               defaultValue: "depuis le", bundle: .module)
    }

    @MainActor
    private static func sinceLayout(slots: [String: String],
                                    metrics: StickerTemplateMetrics)
        -> (date: String, policeLibellé: UIFont, policeDate: UIFont,
            tailleLibellé: CGSize, tailleDate: CGSize, cœur: CGFloat, taille: CGSize) {
        let date = sinceDate(slots)
        let policeLibellé = StickerTemplateDrawing.font(size: metrics.fontSize * 0.52, weight: .medium)
        let policeDate = StickerTemplateDrawing.font(size: metrics.fontSize * 0.80, weight: .bold)
        let tailleLibellé = StickerTemplateDrawing.measure(sinceCaption, font: policeLibellé)
        let tailleDate = StickerTemplateDrawing.measure(date, font: policeDate)
        let cœur = metrics.fontSize * 1.0

        let largeurTexte = max(tailleLibellé.width, tailleDate.width)
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 1.6 + cœur + metrics.gap + largeurTexte
                        + metrics.horizontalPadding * 0.8),
            height: ceil(metrics.verticalPadding * 1.6
                         + tailleLibellé.height + tailleDate.height)
        )
        return (date, policeLibellé, policeDate, tailleLibellé, tailleDate, cœur, taille)
    }

    @MainActor
    static func sinceSize(slots: [String: String], metrics: StickerTemplateMetrics) -> CGSize {
        sinceLayout(slots: slots, metrics: metrics).taille
    }

    @MainActor
    static func sinceImage(slots: [String: String], metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = sinceLayout(slots: slots, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: l.taille.height * 0.32)
            StickerTemplatePalette.surface.setFill()
            carte.fill()
            StickerTemplatePalette.loveWarm.withAlphaComponent(0.45).setStroke()
            carte.lineWidth = max(1, metrics.fontSize * 0.06)
            carte.stroke()

            let cadreCœur = CGRect(x: metrics.horizontalPadding * 0.8,
                                   y: (l.taille.height - l.cœur * 0.92) / 2,
                                   width: l.cœur, height: l.cœur * 0.92)
            let cœur = StickerTemplateDrawing.heartPath(in: cadreCœur)
            StickerTemplateDrawing.fill(cœur,
                                        gradientFrom: StickerTemplatePalette.loveWarm,
                                        to: StickerTemplatePalette.loveCool,
                                        in: cadreCœur)

            let xTexte = metrics.horizontalPadding * 0.8 + l.cœur + metrics.gap
            let yHaut = (l.taille.height - l.tailleLibellé.height - l.tailleDate.height) / 2
            StickerTemplateDrawing.draw(
                sinceCaption, font: l.policeLibellé,
                color: StickerTemplatePalette.label.withAlphaComponent(0.62),
                at: CGPoint(x: xTexte, y: yHaut))
            StickerTemplateDrawing.draw(
                l.date, font: l.policeDate, color: StickerTemplatePalette.label,
                at: CGPoint(x: xTexte, y: yHaut + l.tailleLibellé.height))
        }
    }

    // MARK: - Le registre de la famille AMOUR

    static let loveDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveHeartFrame,
            name: { String(localized: "sticker.template.love.heartFrame", defaultValue: "Cœur", bundle: .module) },
            measure: { _, m in Self.heartFrameSize(metrics: m) },
            draw: { _, m, échelle in Self.heartFrameImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveDoubleHeart,
            name: { String(localized: "sticker.template.love.doubleHeart", defaultValue: "Deux cœurs", bundle: .module) },
            measure: { _, m in Self.doubleHeartSize(metrics: m) },
            draw: { _, m, échelle in Self.doubleHeartImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveSince,
            name: { String(localized: "sticker.template.love.sinceName", defaultValue: "Depuis le", bundle: .module) },
            measure: { s, m in Self.sinceSize(slots: s, metrics: m) },
            draw: { s, m, échelle in Self.sinceImage(slots: s, metrics: m, screenScale: échelle) }),
    ]
}
