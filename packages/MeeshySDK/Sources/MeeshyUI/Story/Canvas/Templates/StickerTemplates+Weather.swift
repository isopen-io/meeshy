import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de MÉTÉO (#4820)

/// Chaque décoration est un CARTOUCHE — une icône dessinée à gauche, la
/// légende à droite — sur un fond qui dit le temps : ciel pour le soleil, encre
/// pour la nuit. La légende vient de `String(localized:)`, donc de la langue du
/// LECTEUR : l'id porte le sens, le dessin le dit dans chaque langue.
extension StickerTemplateRenderer {

    // MARK: Le patron d'un cartouche météo

    private struct WeatherCard {
        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let haut: UIColor
        let bas: UIColor
        let texte: UIColor
        let icône: @MainActor (CGRect) -> Void
    }

    @MainActor
    private static func weatherSize(_ carte: WeatherCard, metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: carte.name(), glyph: .custom,
                                             metrics: metrics).taille
    }

    @MainActor
    private static func weatherImage(_ carte: WeatherCard, metrics: StickerTemplateMetrics,
                                     screenScale: CGFloat) -> (UIImage?, CGSize) {
        let légende = carte.name()
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte3 = UIBezierPath(roundedRect: cadre, cornerRadius: l.taille.height * 0.30)
            StickerTemplateDrawing.fill(carte3, gradientFrom: carte.haut, to: carte.bas, in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.55).setStroke()
            carte3.lineWidth = max(1, metrics.fontSize * 0.05)
            carte3.stroke()
            let icône = CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                               width: l.glyphe, height: l.glyphe)
            carte.icône(icône)
            StickerTemplateDrawing.draw(
                légende, font: l.police, color: carte.texte,
                at: CGPoint(x: metrics.horizontalPadding + l.glyphe + metrics.gap,
                            y: cadre.midY - l.tailleTexte.height / 2))
        }
    }

    private static func weatherDrawer(_ carte: WeatherCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: carte.name,
            measure: { _, m in Self.weatherSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.weatherImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: Les icônes

    @MainActor
    private static func sun(in r: CGRect, color: UIColor) {
        let disque = r.insetBy(dx: r.width * 0.26, dy: r.height * 0.26)
        StickerTemplateDrawing.drawRays(center: CGPoint(x: r.midX, y: r.midY),
                                        inner: disque.width * 0.68, outer: r.width * 0.5,
                                        count: 8, width: max(1, r.width * 0.07), color: color)
        color.setFill()
        UIBezierPath(ovalIn: disque).fill()
    }

    @MainActor
    private static func cloud(in r: CGRect, fill: UIColor, outline: UIColor) {
        StickerTemplateDrawing.fillWithOutline(
            StickerTemplateDrawing.cloudPath(in: r.insetBy(dx: r.width * 0.04, dy: r.height * 0.10)),
            fill: fill, outline: outline, width: max(1, r.width * 0.05))
    }

    @MainActor
    private static func drops(in r: CGRect, color: UIColor, count: Int) {
        color.setFill()
        let largeur = r.width / CGFloat(count * 2)
        for index in 0..<count {
            let x = r.minX + largeur * CGFloat(index * 2) + largeur * 0.5
            StickerTemplateDrawing.dropPath(in: CGRect(x: x, y: r.minY, width: largeur,
                                                       height: r.height)).fill()
        }
    }

    @MainActor
    private static func bolt(in r: CGRect, color: UIColor) {
        let éclair = UIBezierPath()
        éclair.move(to: CGPoint(x: r.minX + r.width * 0.55, y: r.minY))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.15, y: r.minY + r.height * 0.58))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.48, y: r.minY + r.height * 0.58))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.38, y: r.maxY))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.85, y: r.minY + r.height * 0.38))
        éclair.addLine(to: CGPoint(x: r.minX + r.width * 0.52, y: r.minY + r.height * 0.38))
        éclair.close()
        color.setFill()
        éclair.fill()
    }

    @MainActor
    private static func flakes(in r: CGRect, color: UIColor) {
        let côté = r.width * 0.30
        for (i, point) in [CGPoint(x: 0.18, y: 0.15), CGPoint(x: 0.62, y: 0.55), CGPoint(x: 0.10, y: 0.62)].enumerated() {
            let cadre = CGRect(x: r.minX + r.width * point.x, y: r.minY + r.height * point.y,
                               width: côté * (i == 1 ? 1.2 : 1), height: côté * (i == 1 ? 1.2 : 1))
            StickerTemplateDrawing.drawSymbol("snowflake", in: cadre, color: color, weight: .bold)
        }
    }

    @MainActor
    private static func rainbow(in r: CGRect) {
        let couleurs = [StickerTemplatePalette.pin, StickerTemplatePalette.warmBulb,
                        StickerTemplatePalette.leaf, StickerTemplatePalette.sky,
                        StickerTemplatePalette.loveCool]
        let centre = CGPoint(x: r.midX, y: r.maxY - r.height * 0.12)
        let épaisseur = r.width * 0.075
        for (index, couleur) in couleurs.enumerated() {
            let rayon = r.width * 0.46 - épaisseur * CGFloat(index)
            let arc = UIBezierPath(arcCenter: centre, radius: rayon,
                                   startAngle: .pi, endAngle: 0, clockwise: true)
            arc.lineWidth = épaisseur
            arc.lineCapStyle = .round
            couleur.setStroke()
            arc.stroke()
        }
    }

    // MARK: Les dix cartes

    static let weatherDrawers: [StickerTemplateDrawer] = [
        WeatherCard(id: StickerTemplateCatalog.ID.weatherSunny,
                    name: { String(localized: "sticker.template.weather.sunny", defaultValue: "Grand soleil", bundle: .module) },
                    haut: StickerTemplatePalette.sky, bas: StickerTemplatePalette.accent,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in Self.sun(in: r, color: StickerTemplatePalette.warmBulb) }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherCloudy,
                    name: { String(localized: "sticker.template.weather.cloudy", defaultValue: "Nuageux", bundle: .module) },
                    haut: StickerTemplatePalette.lilac, bas: StickerTemplatePalette.accent,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in Self.cloud(in: r, fill: StickerTemplatePalette.surface,
                                             outline: StickerTemplatePalette.hairline) }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherRainy,
                    name: { String(localized: "sticker.template.weather.rainy", defaultValue: "Pluie", bundle: .module) },
                    haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.night,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in
                        Self.cloud(in: CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height * 0.62),
                                   fill: StickerTemplatePalette.surface, outline: StickerTemplatePalette.hairline)
                        Self.drops(in: CGRect(x: r.minX + r.width * 0.15, y: r.minY + r.height * 0.66,
                                              width: r.width * 0.70, height: r.height * 0.34),
                                   color: StickerTemplatePalette.sky, count: 3)
                    }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherStormy,
                    name: { String(localized: "sticker.template.weather.stormy", defaultValue: "Orage", bundle: .module) },
                    haut: StickerTemplatePalette.night, bas: StickerTemplatePalette.ink,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in
                        Self.cloud(in: CGRect(x: r.minX, y: r.minY, width: r.width, height: r.height * 0.60),
                                   fill: StickerTemplatePalette.lilac, outline: StickerTemplatePalette.hairline)
                        Self.bolt(in: CGRect(x: r.minX + r.width * 0.28, y: r.minY + r.height * 0.50,
                                             width: r.width * 0.44, height: r.height * 0.50),
                                  color: StickerTemplatePalette.warmBulb)
                    }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherSnowy,
                    name: { String(localized: "sticker.template.weather.snowy", defaultValue: "Neige", bundle: .module) },
                    haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.hairline,
                    texte: StickerTemplatePalette.label,
                    icône: { r in Self.flakes(in: r, color: StickerTemplatePalette.sky) }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherWindy,
                    name: { String(localized: "sticker.template.weather.windy", defaultValue: "Vent", bundle: .module) },
                    haut: StickerTemplatePalette.lilac, bas: StickerTemplatePalette.sky,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in StickerTemplateDrawing.drawSymbol("wind", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherRainbow,
                    name: { String(localized: "sticker.template.weather.rainbow", defaultValue: "Arc-en-ciel", bundle: .module) },
                    haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.indigoLight,
                    texte: StickerTemplatePalette.label,
                    icône: { r in Self.rainbow(in: r) }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherHot,
                    name: { String(localized: "sticker.template.weather.hot", defaultValue: "Canicule", bundle: .module) },
                    haut: StickerTemplatePalette.warmBulb, bas: StickerTemplatePalette.pin,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in StickerTemplateDrawing.drawSymbol("thermometer.sun.fill", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherCold,
                    name: { String(localized: "sticker.template.weather.cold", defaultValue: "Glacial", bundle: .module) },
                    haut: StickerTemplatePalette.sky, bas: StickerTemplatePalette.lilac,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in StickerTemplateDrawing.drawSymbol("snowflake", in: r, color: StickerTemplatePalette.surface, weight: .bold) }),
        WeatherCard(id: StickerTemplateCatalog.ID.weatherNight,
                    name: { String(localized: "sticker.template.weather.night", defaultValue: "Nuit étoilée", bundle: .module) },
                    haut: StickerTemplatePalette.night, bas: StickerTemplatePalette.ink,
                    texte: StickerTemplatePalette.surface,
                    icône: { r in StickerTemplateDrawing.drawSymbol("moon.stars.fill", in: r, color: StickerTemplatePalette.warmBulb, weight: .bold) }),
    ].map { weatherDrawer($0) }
}
