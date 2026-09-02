import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de DISPONIBILITÉ (#4820)

/// Des BADGES de statut. Huit sont des cartouches à légende — un point de
/// présence ou une icône à gauche, le mot à droite — dont la SILHOUETTE
/// (pastille ou carte) et le fond disent l'état : surface pour ce qui est
/// joignable, encre pour ce qui ne veut pas l'être. Les deux derniers changent
/// de forme pour se reconnaître du coin de l'œil : un badge rond légendé
/// dessous, un ruban à chevrons.
///
/// La légende vient de `String(localized:)` — la langue du LECTEUR : l'id
/// porte le sens, le dessin le dit dans chaque langue.
extension StickerTemplateRenderer {

    // MARK: Le patron d'un cartouche de disponibilité

    private struct AvailabilityCard {
        enum Silhouette {
            /// Une capsule — les points de présence, comme sur un avatar.
            case pill
            /// Une carte à coins arrondis — les états qui ont une icône.
            case card
        }

        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let silhouette: Silhouette
        let haut: UIColor
        let bas: UIColor
        let liseré: UIColor
        let texte: UIColor
        let icône: @MainActor (CGRect) -> Void
    }

    @MainActor
    private static func availabilitySize(_ carte: AvailabilityCard,
                                         metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: carte.name(), glyph: .custom,
                                             metrics: metrics).taille
    }

    @MainActor
    private static func availabilityImage(_ carte: AvailabilityCard,
                                          metrics: StickerTemplateMetrics,
                                          screenScale: CGFloat) -> (UIImage?, CGSize) {
        let légende = carte.name()
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let forme: UIBezierPath
            switch carte.silhouette {
            case .pill: forme = StickerTemplateDrawing.pillPath(in: cadre)
            case .card: forme = UIBezierPath(roundedRect: cadre, cornerRadius: l.taille.height * 0.30)
            }
            StickerTemplateDrawing.fill(forme, gradientFrom: carte.haut, to: carte.bas, in: cadre)
            carte.liseré.setStroke()
            forme.lineWidth = max(1, metrics.fontSize * 0.05)
            forme.stroke()
            carte.icône(CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                               width: l.glyphe, height: l.glyphe))
            StickerTemplateDrawing.draw(
                légende, font: l.police, color: carte.texte,
                at: CGPoint(x: metrics.horizontalPadding + l.glyphe + metrics.gap,
                            y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    private static func availabilityDrawer(_ carte: AvailabilityCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: carte.name,
            measure: { _, m in Self.availabilitySize(carte, metrics: m) },
            draw: { _, m, échelle in Self.availabilityImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: Les icônes dessinées à la main

    /// Le point de présence — un disque cerclé de clair, avec un HALO quand il
    /// respire : c'est le halo qui distingue « disponible » d'« occupé » avant
    /// même la couleur.
    @MainActor
    private static func presenceDot(in r: CGRect, color: UIColor, halo: Bool) {
        if halo {
            color.withAlphaComponent(0.22).setFill()
            UIBezierPath(ovalIn: r.insetBy(dx: r.width * 0.06, dy: r.height * 0.06)).fill()
        }
        let disque = UIBezierPath(ovalIn: r.insetBy(dx: r.width * 0.26, dy: r.height * 0.26))
        color.setFill()
        disque.fill()
        StickerTemplatePalette.surface.setStroke()
        disque.lineWidth = max(1, r.width * 0.07)
        disque.stroke()
    }

    /// Une tasse — corps aux coins bas arrondis, anse en arc, deux volutes de
    /// vapeur. Tracée plutôt qu'empruntée à `cup.and.saucer.fill` : le
    /// symbole change de dessin entre iOS 16 et 26, et la pause doit se
    /// rendre pareil partout.
    @MainActor
    private static func cup(in r: CGRect, body: UIColor, steam: UIColor) {
        let l = r.width, h = r.height
        let corps = CGRect(x: r.minX + l * 0.10, y: r.minY + h * 0.44, width: l * 0.58, height: h * 0.44)
        let tasse = UIBezierPath(roundedRect: corps, byRoundingCorners: [.bottomLeft, .bottomRight],
                                 cornerRadii: CGSize(width: l * 0.16, height: l * 0.16))
        body.setFill()
        tasse.fill()

        let anse = UIBezierPath(arcCenter: CGPoint(x: corps.maxX, y: corps.minY + corps.height * 0.42),
                                radius: l * 0.14, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: true)
        anse.lineWidth = max(1, l * 0.09)
        anse.lineCapStyle = .round
        body.setStroke()
        anse.stroke()

        let soucoupe = UIBezierPath()
        soucoupe.move(to: CGPoint(x: r.minX + l * 0.02, y: corps.maxY + h * 0.06))
        soucoupe.addLine(to: CGPoint(x: r.minX + l * 0.80, y: corps.maxY + h * 0.06))
        soucoupe.lineWidth = max(1, h * 0.07)
        soucoupe.lineCapStyle = .round
        body.withAlphaComponent(0.55).setStroke()
        soucoupe.stroke()

        // Les deux volutes : une sinusoïde tracée en deux courbes, décalée pour
        // que la vapeur ait l'air de monter, pas de deux traits parallèles.
        steam.setStroke()
        for décalage: CGFloat in [0.30, 0.50] {
            let x = r.minX + l * décalage
            let volute = UIBezierPath()
            volute.move(to: CGPoint(x: x, y: r.minY + h * 0.36))
            volute.addCurve(to: CGPoint(x: x, y: r.minY + h * 0.20),
                            controlPoint1: CGPoint(x: x - l * 0.08, y: r.minY + h * 0.32),
                            controlPoint2: CGPoint(x: x + l * 0.08, y: r.minY + h * 0.24))
            volute.addCurve(to: CGPoint(x: x, y: r.minY + h * 0.04),
                            controlPoint1: CGPoint(x: x - l * 0.08, y: r.minY + h * 0.16),
                            controlPoint2: CGPoint(x: x + l * 0.08, y: r.minY + h * 0.08))
            volute.lineWidth = max(1, l * 0.06)
            volute.lineCapStyle = .round
            volute.stroke()
        }
    }

    // MARK: Les huit cartouches

    private static let availabilityCards: [AvailabilityCard] = [
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityAvailable,
            name: { String(localized: "sticker.template.availability.available", defaultValue: "Disponible", bundle: .module) },
            silhouette: .pill,
            haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.surface,
            liseré: StickerTemplatePalette.leaf.withAlphaComponent(0.55),
            texte: StickerTemplatePalette.label,
            icône: { r in Self.presenceDot(in: r, color: StickerTemplatePalette.leaf, halo: true) }),
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityBusy,
            name: { String(localized: "sticker.template.availability.busy", defaultValue: "Occupé·e", bundle: .module) },
            silhouette: .pill,
            haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.hairline.withAlphaComponent(0.6),
            liseré: StickerTemplatePalette.pin.withAlphaComponent(0.55),
            texte: StickerTemplatePalette.label,
            icône: { r in Self.presenceDot(in: r, color: StickerTemplatePalette.pin, halo: false) }),
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityDoNotDisturb,
            name: { String(localized: "sticker.template.availability.doNotDisturb", defaultValue: "Ne pas déranger", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.ink, bas: StickerTemplatePalette.night,
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.45),
            texte: StickerTemplatePalette.surface,
            icône: { r in StickerTemplateDrawing.drawSymbol("moon.fill", in: r, color: StickerTemplatePalette.warmBulb, weight: .bold) }),
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityInMeeting,
            name: { String(localized: "sticker.template.availability.inMeeting", defaultValue: "En réunion", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.lilac, bas: StickerTemplatePalette.accent,
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.55),
            texte: StickerTemplatePalette.surface,
            icône: { r in StickerTemplateDrawing.drawSymbol("calendar", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityOnBreak,
            name: { String(localized: "sticker.template.availability.onBreak", defaultValue: "En pause", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.indigoLight.withAlphaComponent(0.7),
            liseré: StickerTemplatePalette.hairline,
            texte: StickerTemplatePalette.label,
            icône: { r in Self.cup(in: r, body: StickerTemplatePalette.accent, steam: StickerTemplatePalette.lilac) }),
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityOnVacation,
            name: { String(localized: "sticker.template.availability.onVacation", defaultValue: "En vacances", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.sky, bas: StickerTemplatePalette.warmBulb,
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.6),
            texte: StickerTemplatePalette.surface,
            icône: { r in StickerTemplateDrawing.drawSymbol("beach.umbrella.fill", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityAway,
            name: { String(localized: "sticker.template.availability.away", defaultValue: "Absent·e", bundle: .module) },
            silhouette: .pill,
            haut: StickerTemplatePalette.neutral, bas: StickerTemplatePalette.neutral.withAlphaComponent(0.82),
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.5),
            texte: StickerTemplatePalette.surface,
            icône: { r in StickerTemplateDrawing.drawSymbol("figure.walk", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
        AvailabilityCard(
            id: StickerTemplateCatalog.ID.availabilityCallMe,
            name: { String(localized: "sticker.template.availability.callMe", defaultValue: "Rappelle-moi", bundle: .module) },
            silhouette: .card,
            haut: StickerTemplatePalette.leaf, bas: StickerTemplatePalette.leaf.withAlphaComponent(0.84),
            liseré: StickerTemplatePalette.surface.withAlphaComponent(0.6),
            texte: StickerTemplatePalette.surface,
            icône: { r in StickerTemplateDrawing.drawSymbol("phone.fill", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
    ]

    // MARK: - availability.online — le badge rond, légendé dessous

    @MainActor
    private static func onlineLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize, badge: CGFloat,
            capsule: CGSize, taille: CGSize) {
        let légende = String(localized: "sticker.template.availability.online",
                             defaultValue: "En ligne", bundle: .module)
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.62, weight: .bold)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let badge = metrics.fontSize * 1.5
        // La légende vit dans sa propre capsule d'encre : sans elle, un mot
        // clair posé sous un badge se perdrait sur une photo claire.
        let capsule = CGSize(width: ceil(tailleTexte.width + metrics.horizontalPadding * 1.2),
                             height: ceil(tailleTexte.height + metrics.verticalPadding * 0.7))
        let taille = CGSize(
            width: ceil(max(badge, capsule.width) + metrics.gap * 2),
            height: ceil(metrics.gap + badge + metrics.gap * 0.6 + capsule.height + metrics.gap)
        )
        return (légende, police, tailleTexte, badge, capsule, taille)
    }

    @MainActor
    static func onlineSize(metrics: StickerTemplateMetrics) -> CGSize {
        onlineLayout(metrics: metrics).taille
    }

    @MainActor
    static func onlineImage(metrics: StickerTemplateMetrics,
                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = onlineLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let centreX = l.taille.width / 2
            let anneau = max(1.5, metrics.fontSize * 0.12)
            let cadreBadge = CGRect(x: centreX - l.badge / 2, y: metrics.gap,
                                    width: l.badge, height: l.badge)
                .insetBy(dx: anneau / 2, dy: anneau / 2)
            let disque = UIBezierPath(ovalIn: cadreBadge)
            StickerTemplateDrawing.fill(disque,
                                        gradientFrom: StickerTemplatePalette.leaf,
                                        to: StickerTemplatePalette.leaf.withAlphaComponent(0.8),
                                        in: cadreBadge)
            StickerTemplatePalette.surface.setStroke()
            disque.lineWidth = anneau
            disque.stroke()
            // Un reflet en haut à gauche : c'est lui qui fait la bille, pas le
            // disque plat d'un point de présence.
            StickerTemplatePalette.surface.withAlphaComponent(0.45).setFill()
            UIBezierPath(ovalIn: CGRect(x: cadreBadge.minX + cadreBadge.width * 0.22,
                                        y: cadreBadge.minY + cadreBadge.height * 0.16,
                                        width: cadreBadge.width * 0.28,
                                        height: cadreBadge.height * 0.20)).fill()

            let cadreCapsule = CGRect(x: centreX - l.capsule.width / 2,
                                      y: metrics.gap + l.badge + metrics.gap * 0.6,
                                      width: l.capsule.width, height: l.capsule.height)
            StickerTemplatePalette.ink.setFill()
            StickerTemplateDrawing.pillPath(in: cadreCapsule).fill()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface,
                                                in: cadreCapsule)
        }
    }

    // MARK: - availability.backSoon — le ruban à chevrons

    @MainActor
    private static func backSoonLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize, queue: CGFloat, taille: CGSize) {
        let légende = String(localized: "sticker.template.availability.backSoon",
                             defaultValue: "De retour bientôt", bundle: .module)
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.72, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let queue = metrics.fontSize * 0.5
        let taille = CGSize(
            width: ceil(queue * 2 + metrics.horizontalPadding * 2 + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + tailleTexte.height)
        )
        return (légende, police, tailleTexte, queue, taille)
    }

    @MainActor
    static func backSoonSize(metrics: StickerTemplateMetrics) -> CGSize {
        backSoonLayout(metrics: metrics).taille
    }

    @MainActor
    static func backSoonImage(metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = backSoonLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let h = l.taille.height, L = l.taille.width, q = l.queue
            let cadre = CGRect(origin: .zero, size: l.taille)
            // Même silhouette que `time.ribbon`, mais le mot est ROND et le
            // fond va du lilas à l'indigo : un ruban de retour, pas une heure.
            let ruban = UIBezierPath()
            ruban.move(to: CGPoint(x: 0, y: 0))
            ruban.addLine(to: CGPoint(x: L, y: 0))
            ruban.addLine(to: CGPoint(x: L - q, y: h / 2))
            ruban.addLine(to: CGPoint(x: L, y: h))
            ruban.addLine(to: CGPoint(x: 0, y: h))
            ruban.addLine(to: CGPoint(x: q, y: h / 2))
            ruban.close()
            StickerTemplateDrawing.fill(ruban,
                                        gradientFrom: StickerTemplatePalette.lilac,
                                        to: StickerTemplatePalette.accent,
                                        in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.6).setStroke()
            ruban.lineWidth = max(1, metrics.fontSize * 0.05)
            ruban.lineJoinStyle = .round
            ruban.stroke()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface,
                                                in: cadre)
        }
    }

    // MARK: - Le registre de la famille DISPONIBILITÉ

    static let availabilityDrawers: [StickerTemplateDrawer] = availabilityCards.map(availabilityDrawer) + [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.availabilityOnline,
            name: { String(localized: "sticker.template.availability.online", defaultValue: "En ligne", bundle: .module) },
            measure: { _, m in Self.onlineSize(metrics: m) },
            draw: { _, m, échelle in Self.onlineImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.availabilityBackSoon,
            name: { String(localized: "sticker.template.availability.backSoon", defaultValue: "De retour bientôt", bundle: .module) },
            measure: { _, m in Self.backSoonSize(metrics: m) },
            draw: { _, m, échelle in Self.backSoonImage(metrics: m, screenScale: échelle) }),
    ]
}
