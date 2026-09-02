import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de SALUTATIONS (#4820)

/// Un mot adressé à qui regarde — et chaque mot a SA silhouette : un soleil
/// qui se lève pour « Bonjour », un cœur pour « Merci », une bouche pour
/// « Bisous ». Dix cartouches à glyphe différent se ressembleraient trop pour
/// se reconnaître du coin de l'œil dans la palette.
///
/// La légende vient de `String(localized:)`, avec une clé LITTÉRALE par mot :
/// le LECTEUR lit « Thanks » là où l'auteur a posé « Merci ». Aucun
/// emplacement, donc rien à remplir et rien à traduire.
extension StickerTemplateRenderer {

    // MARK: Les mots

    @MainActor
    static var helloCaption: String {
        String(localized: "sticker.template.greeting.hello", defaultValue: "Bonjour", bundle: .module)
    }

    @MainActor
    static var thanksCaption: String {
        String(localized: "sticker.template.greeting.thanks", defaultValue: "Merci", bundle: .module)
    }

    @MainActor
    static var welcomeCaption: String {
        String(localized: "sticker.template.greeting.welcome", defaultValue: "Bienvenue", bundle: .module)
    }

    @MainActor
    static var bonVoyageCaption: String {
        String(localized: "sticker.template.greeting.bonVoyage", defaultValue: "Bon voyage", bundle: .module)
    }

    @MainActor
    static var kissesCaption: String {
        String(localized: "sticker.template.greeting.kisses", defaultValue: "Bisous", bundle: .module)
    }

    // MARK: - Le patron des cartouches à glyphe

    /// Ce qui distingue une carte de salutation : sa FORME et ce qu'elle
    /// ajoute autour du mot (des étoiles, une traînée). Le contenu — glyphe à
    /// gauche, légende à droite — est celui de tous les cartouches.
    private struct GreetingCard {
        enum Forme {
            /// Un cartouche arrondi, avec une bande RÉSERVÉE en haut et en bas,
            /// en fractions du corps — pour y poser le décor sans toucher le
            /// mot.
            case cartouche(haut: CGFloat, bas: CGFloat)
            /// Une bulle de dialogue ; la queue occupe le bas.
            case bulle

            func marges(metrics: StickerTemplateMetrics) -> (haut: CGFloat, bas: CGFloat) {
                switch self {
                case .cartouche(let haut, let bas):
                    return (metrics.fontSize * haut, metrics.fontSize * bas)
                case .bulle:
                    return (0, metrics.fontSize * 0.45)
                }
            }
        }

        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible au
        /// catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let forme: Forme
        let glyph: StickerTemplateDrawing.Glyph
        let haut: UIColor
        let bas: UIColor
        let liseré: UIColor
        let texte: UIColor
        let glyphe: UIColor
        /// Le décor, dessiné APRÈS le mot : reçoit le cadre entier et la zone
        /// du contenu, pour viser les bandes réservées.
        let décor: @MainActor (CGRect, CGRect, StickerTemplateMetrics) -> Void
    }

    @MainActor
    private static func cardLayout(_ carte: GreetingCard, metrics: StickerTemplateMetrics)
        -> (légende: String, l: StickerTemplateDrawing.CaptionLayout, haut: CGFloat, bas: CGFloat) {
        let légende = carte.name()
        let marges = carte.forme.marges(metrics: metrics)
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: carte.glyph,
                                                     metrics: metrics,
                                                     extraHeight: marges.haut + marges.bas)
        return (légende, l, marges.haut, marges.bas)
    }

    @MainActor
    private static func cardSize(_ carte: GreetingCard, metrics: StickerTemplateMetrics) -> CGSize {
        cardLayout(carte, metrics: metrics).l.taille
    }

    @MainActor
    private static func cardImage(_ carte: GreetingCard, metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let c = cardLayout(carte, metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: c.l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: c.l.taille)
            let contenu = CGRect(x: 0, y: c.haut, width: cadre.width,
                                 height: cadre.height - c.haut - c.bas)
            let forme: UIBezierPath
            switch carte.forme {
            case .cartouche:
                forme = UIBezierPath(roundedRect: cadre, cornerRadius: contenu.height * 0.30)
            case .bulle:
                forme = StickerTemplateDrawing.speechBubblePath(in: cadre, tail: c.bas)
            }
            StickerTemplateDrawing.fillWithOutline(forme, gradientFrom: carte.haut, to: carte.bas,
                                                   in: cadre, outline: carte.liseré,
                                                   width: max(1, metrics.fontSize * 0.05))
            StickerTemplateDrawing.drawCaptionContent(c.l, caption: c.légende, glyph: carte.glyph,
                                                      metrics: metrics, in: contenu,
                                                      textColor: carte.texte, glyphColor: carte.glyphe)
            carte.décor(cadre, contenu, metrics)
        }
    }

    private static func cardDrawer(_ carte: GreetingCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: { carte.name() },
            measure: { _, m in Self.cardSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.cardImage(carte, metrics: m, screenScale: échelle) })
    }

    // MARK: Les décors des cartes

    /// Trois petites étoiles dans la bande du haut — ce qui fait la NUIT, le
    /// croissant seul ferait un soir.
    @MainActor
    private static func nightStars(in bande: CGRect, metrics: StickerTemplateMetrics) {
        StickerTemplatePalette.warmBulb.setFill()
        let étoiles: [(x: CGFloat, y: CGFloat, côté: CGFloat)] = [
            (0.50, 0.55, 0.30), (0.66, 0.30, 0.20), (0.82, 0.60, 0.25),
        ]
        for étoile in étoiles {
            let côté = metrics.fontSize * étoile.côté
            let cadre = CGRect(x: bande.minX + bande.width * étoile.x - côté / 2,
                               y: bande.minY + bande.height * étoile.y - côté / 2 + metrics.verticalPadding * 0.4,
                               width: côté, height: côté)
            StickerTemplateDrawing.starPath(in: cadre, points: 4, innerRatio: 0.40).fill()
        }
    }

    /// La traînée pointillée de l'avion, ondulant dans la bande du bas — elle
    /// court sous tout le mot, pas seulement sous l'avion.
    @MainActor
    private static func planeTrail(in bande: CGRect, metrics: StickerTemplateMetrics) {
        let traînée = UIBezierPath()
        let marge = metrics.horizontalPadding * 0.6
        traînée.move(to: CGPoint(x: bande.minX + marge, y: bande.minY + bande.height * 0.55))
        traînée.addCurve(to: CGPoint(x: bande.maxX - marge, y: bande.minY + bande.height * 0.35),
                         controlPoint1: CGPoint(x: bande.width * 0.35, y: bande.maxY),
                         controlPoint2: CGPoint(x: bande.width * 0.65, y: bande.minY))
        traînée.lineWidth = max(1, metrics.fontSize * 0.05)
        traînée.lineCapStyle = .round
        traînée.setLineDash([metrics.fontSize * 0.06, metrics.fontSize * 0.14], count: 2, phase: 0)
        StickerTemplatePalette.surface.withAlphaComponent(0.85).setStroke()
        traînée.stroke()
    }

    // MARK: - greeting.hello — le soleil levant

    @MainActor
    private static func helloLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize,
            soleil: CGFloat, bandeau: CGFloat, taille: CGSize) {
        let légende = helloCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.78, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // La moitié haute — disque et rayons — au-dessus d'un bandeau qui
        // fait l'horizon : le mot est écrit SUR l'horizon.
        let soleil = metrics.fontSize * 1.5
        let bandeau = ceil(metrics.verticalPadding * 2 + tailleTexte.height)
        let taille = CGSize(
            width: ceil(max(tailleTexte.width + metrics.horizontalPadding * 2, soleil * 2.2)),
            height: ceil(soleil + bandeau)
        )
        return (légende, police, tailleTexte, soleil, bandeau, taille)
    }

    @MainActor
    static func helloSize(metrics: StickerTemplateMetrics) -> CGSize {
        helloLayout(metrics: metrics).taille
    }

    @MainActor
    static func helloImage(metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = helloLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let centre = CGPoint(x: l.taille.width / 2, y: l.soleil)
            let rayon = l.soleil * 0.42

            // Sept rayons sur la moitié haute seulement : `drawRays` en ferait
            // le tour complet, et le bandeau n'en cacherait que la moitié.
            StickerTemplatePalette.warmBulb.setStroke()
            for index in 0...6 {
                let angle = CGFloat.pi + CGFloat(index) * CGFloat.pi / 6
                let trait = UIBezierPath()
                trait.move(to: CGPoint(x: centre.x + cos(angle) * rayon * 1.35,
                                       y: centre.y + sin(angle) * rayon * 1.35))
                trait.addLine(to: CGPoint(x: centre.x + cos(angle) * l.soleil * 0.95,
                                          y: centre.y + sin(angle) * l.soleil * 0.95))
                trait.lineWidth = max(1, metrics.fontSize * 0.08)
                trait.lineCapStyle = .round
                trait.stroke()
            }

            let demi = UIBezierPath()
            demi.move(to: CGPoint(x: centre.x - rayon, y: centre.y))
            demi.addArc(withCenter: centre, radius: rayon,
                        startAngle: .pi, endAngle: 2 * .pi, clockwise: true)
            demi.close()
            StickerTemplatePalette.warmBulb.setFill()
            demi.fill()

            let horizon = CGRect(x: 0, y: l.soleil, width: l.taille.width, height: l.bandeau)
            let bandeau = UIBezierPath(roundedRect: horizon, cornerRadius: l.bandeau * 0.35)
            StickerTemplateDrawing.fill(bandeau,
                                        gradientFrom: StickerTemplatePalette.accent,
                                        to: StickerTemplatePalette.loveCool,
                                        in: horizon)
            StickerTemplatePalette.surface.withAlphaComponent(0.7).setStroke()
            bandeau.lineWidth = max(1, metrics.fontSize * 0.05)
            bandeau.stroke()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: horizon)
        }
    }

    // MARK: - greeting.thanks — le mot dans le cœur

    @MainActor
    private static func thanksLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, taille: CGSize) {
        let légende = thanksCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.72, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // Le mot s'écrit à la partie la plus large du cœur ; les marges sont
        // plus généreuses qu'un cartouche parce que les lobes rognent les
        // coins.
        let largeur = ceil(max(tailleTexte.width + metrics.horizontalPadding * 2.4,
                               metrics.fontSize * 3.0))
        return (légende, police, CGSize(width: largeur, height: ceil(largeur * 0.92)))
    }

    @MainActor
    static func thanksSize(metrics: StickerTemplateMetrics) -> CGSize {
        thanksLayout(metrics: metrics).taille
    }

    @MainActor
    static func thanksImage(metrics: StickerTemplateMetrics,
                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = thanksLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.10)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let cœur = StickerTemplateDrawing.heartPath(in: cadre)
            StickerTemplateDrawing.fill(cœur,
                                        gradientFrom: StickerTemplatePalette.loveWarm,
                                        to: StickerTemplatePalette.loveCool,
                                        in: cadre)
            StickerTemplatePalette.surface.setStroke()
            cœur.lineWidth = bord
            cœur.stroke()
            StickerTemplateDrawing.drawCentered(
                l.légende, font: l.police, color: StickerTemplatePalette.surface,
                in: CGRect(x: 0, y: l.taille.height * 0.24,
                           width: l.taille.width, height: l.taille.height * 0.40))
        }
    }

    // MARK: - greeting.welcome — la bannière à pointes

    @MainActor
    private static func welcomeLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, pointe: CGFloat, taille: CGSize) {
        // Capitales : une bannière d'accueil se lit de loin.
        let légende = welcomeCaption.uppercased()
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.78, weight: .black)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let pointe = metrics.fontSize * 0.55
        let taille = CGSize(
            width: ceil(pointe * 2 + metrics.horizontalPadding * 2 + tailleTexte.width),
            height: ceil(metrics.verticalPadding * 2 + tailleTexte.height)
        )
        return (légende, police, pointe, taille)
    }

    @MainActor
    static func welcomeSize(metrics: StickerTemplateMetrics) -> CGSize {
        welcomeLayout(metrics: metrics).taille
    }

    @MainActor
    static func welcomeImage(metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = welcomeLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let h = l.taille.height, L = l.taille.width, p = l.pointe
            let bannière = UIBezierPath()
            bannière.move(to: CGPoint(x: 0, y: 0))
            bannière.addLine(to: CGPoint(x: L, y: 0))
            bannière.addLine(to: CGPoint(x: L - p, y: h / 2))
            bannière.addLine(to: CGPoint(x: L, y: h))
            bannière.addLine(to: CGPoint(x: 0, y: h))
            bannière.addLine(to: CGPoint(x: p, y: h / 2))
            bannière.close()
            // Lilas → indigo et un liseré clair : le ruban d'heure est
            // indigo → violet sans liseré, et les deux ne doivent pas se
            // confondre dans la palette.
            StickerTemplateDrawing.fillWithOutline(bannière,
                                                   gradientFrom: StickerTemplatePalette.lilac,
                                                   to: StickerTemplatePalette.accent,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface.withAlphaComponent(0.8),
                                                   width: max(1, metrics.fontSize * 0.05))
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.surface, in: cadre)
        }
    }

    // MARK: - greeting.bonVoyage — l'étiquette de bagage

    @MainActor
    private static func bonVoyageLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize,
            ficelle: CGFloat, coin: CGFloat, trou: CGFloat, taille: CGSize) {
        let légende = bonVoyageCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.78, weight: .bold)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        // La ficelle sort à GAUCHE de l'étiquette : sa zone fait partie de la
        // boîte, sinon elle serait rognée par le raster.
        let ficelle = metrics.fontSize * 0.9
        let coin = metrics.fontSize * 0.35
        let trou = metrics.fontSize * 0.14
        let taille = CGSize(
            width: ceil(ficelle + coin * 0.8 + trou * 2 + metrics.gap + tailleTexte.width
                        + metrics.horizontalPadding),
            height: ceil(metrics.verticalPadding * 2 + tailleTexte.height)
        )
        return (légende, police, tailleTexte, ficelle, coin, trou, taille)
    }

    @MainActor
    static func bonVoyageSize(metrics: StickerTemplateMetrics) -> CGSize {
        bonVoyageLayout(metrics: metrics).taille
    }

    @MainActor
    static func bonVoyageImage(metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = bonVoyageLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let h = l.taille.height, L = l.taille.width
            let x0 = l.ficelle
            let trait = max(1, metrics.fontSize * 0.06)
            let centreTrou = CGPoint(x: x0 + l.coin * 0.8 + l.trou, y: h / 2)

            // La ficelle d'abord : l'étiquette la recouvre, et le trou creusé
            // ensuite la montre passant DEDANS.
            let ficelle = UIBezierPath()
            ficelle.move(to: centreTrou)
            ficelle.addCurve(to: CGPoint(x: metrics.fontSize * 0.12, y: h * 0.22),
                             controlPoint1: CGPoint(x: centreTrou.x - l.ficelle * 0.55, y: h * 0.98),
                             controlPoint2: CGPoint(x: l.ficelle * 0.02, y: h * 0.72))
            ficelle.lineWidth = trait
            ficelle.lineCapStyle = .round
            StickerTemplatePalette.accent.setStroke()
            ficelle.stroke()

            let étiquette = UIBezierPath()
            étiquette.move(to: CGPoint(x: x0 + l.coin, y: 0))
            étiquette.addLine(to: CGPoint(x: L, y: 0))
            étiquette.addLine(to: CGPoint(x: L, y: h))
            étiquette.addLine(to: CGPoint(x: x0 + l.coin, y: h))
            étiquette.addLine(to: CGPoint(x: x0, y: h - l.coin))
            étiquette.addLine(to: CGPoint(x: x0, y: l.coin))
            étiquette.close()
            étiquette.lineJoinStyle = .round
            StickerTemplatePalette.surface.setFill()
            étiquette.fill()
            étiquette.lineWidth = trait
            StickerTemplatePalette.accent.setStroke()
            étiquette.stroke()

            // Le trou est CREUSÉ, jamais peint : la scène se voit au travers.
            let trou = UIBezierPath(arcCenter: centreTrou, radius: l.trou,
                                    startAngle: 0, endAngle: .pi * 2, clockwise: true)
            if let contexte = UIGraphicsGetCurrentContext() {
                contexte.saveGState()
                contexte.setBlendMode(.clear)
                trou.fill()
                contexte.restoreGState()
            }
            trou.lineWidth = trait * 0.8
            trou.stroke()

            StickerTemplateDrawing.draw(
                l.légende, font: l.police, color: StickerTemplatePalette.label,
                at: CGPoint(x: x0 + l.coin * 0.8 + l.trou * 2 + metrics.gap,
                            y: (h - l.tailleTexte.height) / 2))
        }
    }

    // MARK: - greeting.kisses — la bouche

    @MainActor
    private static func kissesLayout(metrics: StickerTemplateMetrics)
        -> (légende: String, police: UIFont, tailleTexte: CGSize,
            lèvres: CGSize, pastille: CGFloat, taille: CGSize) {
        let légende = kissesCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.72, weight: .heavy)
        let tailleTexte = StickerTemplateDrawing.measure(légende, font: police)
        let lèvres = CGSize(width: metrics.fontSize * 2.4, height: metrics.fontSize * 1.3)
        let pastille = ceil(tailleTexte.height + metrics.verticalPadding * 0.8)
        let taille = CGSize(
            width: ceil(max(lèvres.width, tailleTexte.width + metrics.horizontalPadding * 2)),
            height: ceil(lèvres.height + metrics.gap + pastille)
        )
        return (légende, police, tailleTexte, lèvres, pastille, taille)
    }

    @MainActor
    static func kissesSize(metrics: StickerTemplateMetrics) -> CGSize {
        kissesLayout(metrics: metrics).taille
    }

    /// Une bouche : l'arc de Cupidon en haut — deux bosses et un creux —, une
    /// seule courbe pleine en bas. Symétrique autour de `rect.midX`.
    private static func lipsPath(in rect: CGRect) -> UIBezierPath {
        let l = rect.width, h = rect.height
        let gauche = CGPoint(x: rect.minX, y: rect.minY + h * 0.45)
        let droite = CGPoint(x: rect.maxX, y: rect.minY + h * 0.45)
        let chemin = UIBezierPath()
        chemin.move(to: gauche)
        chemin.addCurve(to: CGPoint(x: rect.minX + l * 0.32, y: rect.minY),
                        controlPoint1: CGPoint(x: rect.minX + l * 0.08, y: rect.minY + h * 0.28),
                        controlPoint2: CGPoint(x: rect.minX + l * 0.20, y: rect.minY))
        chemin.addCurve(to: CGPoint(x: rect.midX, y: rect.minY + h * 0.18),
                        controlPoint1: CGPoint(x: rect.minX + l * 0.40, y: rect.minY),
                        controlPoint2: CGPoint(x: rect.midX - l * 0.05, y: rect.minY + h * 0.18))
        chemin.addCurve(to: CGPoint(x: rect.maxX - l * 0.32, y: rect.minY),
                        controlPoint1: CGPoint(x: rect.midX + l * 0.05, y: rect.minY + h * 0.18),
                        controlPoint2: CGPoint(x: rect.maxX - l * 0.40, y: rect.minY))
        chemin.addCurve(to: droite,
                        controlPoint1: CGPoint(x: rect.maxX - l * 0.20, y: rect.minY),
                        controlPoint2: CGPoint(x: rect.maxX - l * 0.08, y: rect.minY + h * 0.28))
        chemin.addCurve(to: gauche,
                        controlPoint1: CGPoint(x: rect.maxX - l * 0.10, y: rect.maxY + h * 0.05),
                        controlPoint2: CGPoint(x: rect.minX + l * 0.10, y: rect.maxY + h * 0.05))
        chemin.close()
        return chemin
    }

    @MainActor
    static func kissesImage(metrics: StickerTemplateMetrics,
                            screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = kissesLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.2, metrics.fontSize * 0.07)
            let cadreLèvres = CGRect(x: (l.taille.width - l.lèvres.width) / 2, y: bord,
                                     width: l.lèvres.width, height: l.lèvres.height - bord * 2)
            let bouche = lipsPath(in: cadreLèvres)
            StickerTemplateDrawing.fill(bouche,
                                        gradientFrom: StickerTemplatePalette.loveWarm,
                                        to: StickerTemplatePalette.loveCool,
                                        in: cadreLèvres)
            StickerTemplatePalette.surface.setStroke()
            bouche.lineWidth = bord
            bouche.lineJoinStyle = .round
            bouche.stroke()

            // La ligne des lèvres — sans elle, la forme est un pétale.
            let ligne = UIBezierPath()
            ligne.move(to: CGPoint(x: cadreLèvres.minX + bord, y: cadreLèvres.minY + cadreLèvres.height * 0.45))
            ligne.addQuadCurve(to: CGPoint(x: cadreLèvres.maxX - bord, y: cadreLèvres.minY + cadreLèvres.height * 0.45),
                               controlPoint: CGPoint(x: cadreLèvres.midX, y: cadreLèvres.minY + cadreLèvres.height * 0.58))
            ligne.lineWidth = bord * 0.7
            ligne.lineCapStyle = .round
            StickerTemplatePalette.loveCool.setStroke()
            ligne.stroke()

            let largeurPastille = min(l.taille.width, l.tailleTexte.width + metrics.horizontalPadding * 1.4)
            let cadrePastille = CGRect(x: (l.taille.width - largeurPastille) / 2,
                                       y: l.lèvres.height + metrics.gap,
                                       width: largeurPastille, height: l.pastille)
            StickerTemplatePalette.surface.setFill()
            StickerTemplateDrawing.pillPath(in: cadrePastille).fill()
            StickerTemplateDrawing.drawCentered(l.légende, font: l.police,
                                                color: StickerTemplatePalette.loveWarm, in: cadrePastille)
        }
    }

    // MARK: - Le registre de la famille SALUTATIONS

    private static let greetingCards: [GreetingCard] = [
        GreetingCard(id: StickerTemplateCatalog.ID.greetingGoodEvening,
                     name: { String(localized: "sticker.template.greeting.goodEvening", defaultValue: "Bonsoir", bundle: .module) },
                     forme: .cartouche(haut: 0, bas: 0),
                     glyph: .symbol("moon.fill"),
                     haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.night,
                     liseré: StickerTemplatePalette.surface.withAlphaComponent(0.55),
                     texte: StickerTemplatePalette.surface, glyphe: StickerTemplatePalette.warmBulb,
                     décor: { _, _, _ in }),
        GreetingCard(id: StickerTemplateCatalog.ID.greetingGoodNight,
                     name: { String(localized: "sticker.template.greeting.goodNight", defaultValue: "Bonne nuit", bundle: .module) },
                     forme: .cartouche(haut: 0.55, bas: 0),
                     glyph: .symbol("moon.zzz.fill"),
                     haut: StickerTemplatePalette.night, bas: StickerTemplatePalette.ink,
                     liseré: StickerTemplatePalette.lilac.withAlphaComponent(0.6),
                     texte: StickerTemplatePalette.surface, glyphe: StickerTemplatePalette.surface,
                     décor: { cadre, contenu, m in
                         Self.nightStars(in: CGRect(x: 0, y: 0, width: cadre.width, height: contenu.minY), metrics: m)
                     }),
        GreetingCard(id: StickerTemplateCatalog.ID.greetingHi,
                     name: { String(localized: "sticker.template.greeting.hi", defaultValue: "Salut !", bundle: .module) },
                     forme: .bulle,
                     glyph: .symbol("hand.wave.fill"),
                     haut: StickerTemplatePalette.lilac, bas: StickerTemplatePalette.accent,
                     liseré: StickerTemplatePalette.surface,
                     texte: StickerTemplatePalette.surface, glyphe: StickerTemplatePalette.warmBulb,
                     décor: { _, _, _ in }),
        GreetingCard(id: StickerTemplateCatalog.ID.greetingSeeYou,
                     name: { String(localized: "sticker.template.greeting.seeYou", defaultValue: "À bientôt", bundle: .module) },
                     forme: .cartouche(haut: 0, bas: 0.45),
                     glyph: .symbol("airplane"),
                     haut: StickerTemplatePalette.sky, bas: StickerTemplatePalette.accent,
                     liseré: StickerTemplatePalette.surface.withAlphaComponent(0.55),
                     texte: StickerTemplatePalette.surface, glyphe: StickerTemplatePalette.surface,
                     décor: { cadre, contenu, m in
                         Self.planeTrail(in: CGRect(x: 0, y: contenu.maxY, width: cadre.width,
                                                    height: cadre.maxY - contenu.maxY), metrics: m)
                     }),
        GreetingCard(id: StickerTemplateCatalog.ID.greetingBonAppetit,
                     name: { String(localized: "sticker.template.greeting.bonAppetit", defaultValue: "Bon appétit", bundle: .module) },
                     forme: .cartouche(haut: 0, bas: 0),
                     glyph: .symbol("fork.knife"),
                     haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.indigoLight.withAlphaComponent(0.6),
                     liseré: StickerTemplatePalette.hairline,
                     texte: StickerTemplatePalette.label, glyphe: StickerTemplatePalette.accent,
                     décor: { _, _, _ in }),
    ]

    static let greetingDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.greetingHello,
            name: { Self.helloCaption },
            measure: { _, m in Self.helloSize(metrics: m) },
            draw: { _, m, échelle in Self.helloImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.greetingThanks,
            name: { Self.thanksCaption },
            measure: { _, m in Self.thanksSize(metrics: m) },
            draw: { _, m, échelle in Self.thanksImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.greetingWelcome,
            name: { Self.welcomeCaption },
            measure: { _, m in Self.welcomeSize(metrics: m) },
            draw: { _, m, échelle in Self.welcomeImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.greetingBonVoyage,
            name: { Self.bonVoyageCaption },
            measure: { _, m in Self.bonVoyageSize(metrics: m) },
            draw: { _, m, échelle in Self.bonVoyageImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.greetingKisses,
            name: { Self.kissesCaption },
            measure: { _, m in Self.kissesSize(metrics: m) },
            draw: { _, m, échelle in Self.kissesImage(metrics: m, screenScale: échelle) }),
    ] + greetingCards.map(cardDrawer)
}
