import Foundation
import UIKit
import MeeshySDK

// MARK: - Les dix décorations de JOIE (#4820)

/// La joie se reconnaît à sa SILHOUETTE avant sa légende : trois visages
/// tracés à la main qui ne diffèrent que par les yeux, un éclat qui crie, une
/// étoile, un nuage, une bulle, et trois cartouches de formes distinctes. La
/// palette est celle de la marque — l'ambre `warmBulb` pour ce qui rit,
/// l'indigo `accent` pour ce qui porte un mot, `surface` en liseré pour se
/// détacher d'une photo sombre.
extension StickerTemplateRenderer {

    // MARK: - Le visage — le socle des trois têtes

    /// Un carré dont le disque occupe tout, moins le liseré. Trois gabarits
    /// la partagent et n'y changent que les yeux et la bouche : c'est ce qui
    /// leur donne un air de famille sans rendre deux fois le même PNG.
    private struct Face {
        let taille: CGSize
        let bord: CGFloat
        let centre: CGPoint
        let rayon: CGFloat
    }

    @MainActor
    private static func faceLayout(metrics: StickerTemplateMetrics) -> Face {
        let côté = ceil(metrics.fontSize * 3.0)
        let bord = max(1.5, metrics.fontSize * 0.10)
        return Face(taille: CGSize(width: côté, height: côté),
                    bord: bord,
                    centre: CGPoint(x: côté / 2, y: côté / 2),
                    rayon: côté / 2 - bord)
    }

    /// Le disque ambré, son reflet et son liseré — sans les yeux ni la bouche.
    @MainActor
    private static func drawFaceDisk(_ face: Face) {
        let disque = UIBezierPath(arcCenter: face.centre, radius: face.rayon,
                                  startAngle: 0, endAngle: .pi * 2, clockwise: true)
        StickerTemplatePalette.warmBulb.setFill()
        disque.fill()
        // Le reflet en haut à gauche : c'est lui qui fait une BILLE plutôt
        // qu'un rond plat.
        StickerTemplatePalette.surface.withAlphaComponent(0.35).setFill()
        UIBezierPath(ovalIn: CGRect(x: face.centre.x - face.rayon * 0.58,
                                    y: face.centre.y - face.rayon * 0.74,
                                    width: face.rayon * 0.50,
                                    height: face.rayon * 0.30)).fill()
        StickerTemplatePalette.surface.setStroke()
        disque.lineWidth = face.bord
        disque.stroke()
    }

    /// Les deux centres d'yeux, symétriques autour de l'axe du visage.
    private static func eyeCenters(_ face: Face) -> [CGPoint] {
        let côtés: [CGFloat] = [-1, 1]
        return côtés.map { côté in
            CGPoint(x: face.centre.x + face.rayon * 0.38 * côté,
                    y: face.centre.y - face.rayon * 0.24)
        }
    }

    /// Un sourire : un arc TRACÉ, jamais un glyphe — il reste net à toute
    /// échelle et identique d'iOS 16 à iOS 26.
    @MainActor
    private static func drawSmile(_ face: Face, width: CGFloat, spread: CGFloat) {
        let sourire = UIBezierPath(arcCenter: CGPoint(x: face.centre.x,
                                                      y: face.centre.y + face.rayon * 0.05),
                                   radius: face.rayon * spread,
                                   startAngle: .pi * 0.15, endAngle: .pi * 0.85, clockwise: true)
        sourire.lineWidth = width
        sourire.lineCapStyle = .round
        StickerTemplatePalette.night.setStroke()
        sourire.stroke()
    }

    // MARK: - joy.bigSmile — le grand sourire

    @MainActor
    static func bigSmileSize(metrics: StickerTemplateMetrics) -> CGSize {
        faceLayout(metrics: metrics).taille
    }

    @MainActor
    static func bigSmileImage(metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let face = faceLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: face.taille, screenScale: screenScale) {
            Self.drawFaceDisk(face)
            // Deux yeux ovales, un peu plus hauts que larges : ronds, ils
            // feraient un visage étonné plutôt qu'heureux.
            StickerTemplatePalette.night.setFill()
            let œil = face.rayon * 0.13
            for centre in Self.eyeCenters(face) {
                UIBezierPath(ovalIn: CGRect(x: centre.x - œil, y: centre.y - œil * 1.3,
                                            width: œil * 2, height: œil * 2.6)).fill()
            }
            Self.drawSmile(face, width: face.bord * 1.2, spread: 0.58)
        }
    }

    // MARK: - joy.heartEyes — les yeux en cœur

    @MainActor
    static func heartEyesSize(metrics: StickerTemplateMetrics) -> CGSize {
        faceLayout(metrics: metrics).taille
    }

    @MainActor
    static func heartEyesImage(metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let face = faceLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: face.taille, screenScale: screenScale) {
            Self.drawFaceDisk(face)
            let largeur = face.rayon * 0.60
            for centre in Self.eyeCenters(face) {
                let cadre = CGRect(x: centre.x - largeur / 2, y: centre.y - largeur * 0.46,
                                   width: largeur, height: largeur * 0.92)
                let cœur = StickerTemplateDrawing.heartPath(in: cadre)
                StickerTemplateDrawing.fill(cœur,
                                            gradientFrom: StickerTemplatePalette.loveWarm,
                                            to: StickerTemplatePalette.loveCool,
                                            in: cadre)
                StickerTemplatePalette.surface.setStroke()
                cœur.lineWidth = face.bord * 0.5
                cœur.stroke()
            }
            Self.drawSmile(face, width: face.bord * 0.9, spread: 0.46)
        }
    }

    // MARK: - joy.starGrin — les étoiles plein les yeux

    @MainActor
    static func starGrinSize(metrics: StickerTemplateMetrics) -> CGSize {
        faceLayout(metrics: metrics).taille
    }

    @MainActor
    static func starGrinImage(metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let face = faceLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: face.taille, screenScale: screenScale) {
            Self.drawFaceDisk(face)
            let côté = face.rayon * 0.64
            for centre in Self.eyeCenters(face) {
                let cadre = CGRect(x: centre.x - côté / 2, y: centre.y - côté / 2,
                                   width: côté, height: côté)
                let étoile = StickerTemplateDrawing.starPath(in: cadre, points: 5, innerRatio: 0.48)
                StickerTemplateDrawing.fill(étoile,
                                            gradientFrom: StickerTemplatePalette.sky,
                                            to: StickerTemplatePalette.accent,
                                            in: cadre)
                StickerTemplatePalette.surface.setStroke()
                étoile.lineWidth = face.bord * 0.5
                étoile.lineJoinStyle = .round
                étoile.stroke()
            }
            // La bouche est un demi-disque PLEIN, pas un arc : c'est ce qui
            // fait un rire éclatant plutôt qu'un sourire.
            let bouche = CGPoint(x: face.centre.x, y: face.centre.y + face.rayon * 0.22)
            let rire = UIBezierPath(arcCenter: bouche, radius: face.rayon * 0.50,
                                    startAngle: 0, endAngle: .pi, clockwise: true)
            rire.close()
            StickerTemplatePalette.night.setFill()
            rire.fill()
            guard let contexte = UIGraphicsGetCurrentContext() else { return }
            contexte.saveGState()
            rire.addClip()
            StickerTemplatePalette.surface.setFill()
            UIBezierPath(rect: CGRect(x: bouche.x - face.rayon * 0.5, y: bouche.y,
                                      width: face.rayon, height: face.rayon * 0.14)).fill()
            contexte.restoreGState()
        }
    }

    // MARK: - joy.yay — l'éclat qui crie

    /// Le mot est le NOM du gabarit — une seule clé, une seule traduction.
    @MainActor
    private static var yayWord: String {
        String(localized: "sticker.template.joy.yay", defaultValue: "YOUPI", bundle: .module)
    }

    private struct YayLayout {
        let mot: String
        let police: UIFont
        let taille: CGSize
    }

    @MainActor
    private static func yayLayout(metrics: StickerTemplateMetrics) -> YayLayout {
        let mot = yayWord
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.95, weight: .black)
        let tailleMot = StickerTemplateDrawing.measure(mot, font: police)
        // Les branches débordent le mot largement : un éclat serré autour de
        // ses lettres serait un cartouche crénelé, pas une explosion.
        let taille = CGSize(width: ceil(tailleMot.width + metrics.horizontalPadding * 3.0),
                            height: ceil(tailleMot.height + metrics.verticalPadding * 4.0))
        return YayLayout(mot: mot, police: police, taille: taille)
    }

    @MainActor
    static func yaySize(metrics: StickerTemplateMetrics) -> CGSize {
        yayLayout(metrics: metrics).taille
    }

    @MainActor
    static func yayImage(metrics: StickerTemplateMetrics,
                         screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = yayLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.07)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            // `burstPath` inscrit un CERCLE ; l'éclat d'un mot est plus large
            // que haut. On le trace carré puis on l'étire en x — la seule
            // façon de garder des branches régulières sur un ovale.
            let éclat = StickerTemplateDrawing.burstPath(
                in: CGRect(x: 0, y: 0, width: cadre.height, height: cadre.height),
                points: 14, innerRatio: 0.80)
            éclat.apply(CGAffineTransform(scaleX: cadre.width / cadre.height, y: 1))
            éclat.apply(CGAffineTransform(translationX: cadre.minX, y: cadre.minY))
            StickerTemplateDrawing.fillWithOutline(éclat,
                                                   gradientFrom: StickerTemplatePalette.warmBulb,
                                                   to: StickerTemplatePalette.pin,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            StickerTemplateDrawing.drawCentered(l.mot, font: l.police,
                                                color: StickerTemplatePalette.night, in: cadre)
        }
    }

    // MARK: - joy.sparkle — l'étoile et son mot

    @MainActor
    private static var sparkleWord: String {
        String(localized: "sticker.template.joy.sparkle", defaultValue: "Joie", bundle: .module)
    }

    private struct SparkleLayout {
        let mot: String
        let police: UIFont
        let étoile: CGFloat
        let pastille: CGSize
        let taille: CGSize
    }

    @MainActor
    private static func sparkleLayout(metrics: StickerTemplateMetrics) -> SparkleLayout {
        let mot = sparkleWord
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.70, weight: .heavy)
        let tailleMot = StickerTemplateDrawing.measure(mot, font: police)
        let étoile = metrics.fontSize * 2.3
        // Le mot vit dans une PASTILLE : posé nu sous l'étoile, il serait
        // illisible sur la moitié des photos.
        let pastille = CGSize(width: ceil(tailleMot.width + metrics.horizontalPadding * 1.6),
                              height: ceil(tailleMot.height + metrics.verticalPadding))
        let taille = CGSize(width: ceil(max(étoile * 1.35, pastille.width)),
                            height: ceil(étoile + metrics.gap * 0.5 + pastille.height))
        return SparkleLayout(mot: mot, police: police,
                             étoile: étoile, pastille: pastille, taille: taille)
    }

    @MainActor
    static func sparkleSize(metrics: StickerTemplateMetrics) -> CGSize {
        sparkleLayout(metrics: metrics).taille
    }

    @MainActor
    static func sparkleImage(metrics: StickerTemplateMetrics,
                             screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = sparkleLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let milieu = l.taille.width / 2
            let cadreÉtoile = CGRect(x: milieu - l.étoile / 2, y: 0, width: l.étoile, height: l.étoile)
                .insetBy(dx: bord, dy: bord)
            let grande = StickerTemplateDrawing.starPath(in: cadreÉtoile, points: 4, innerRatio: 0.34)
            StickerTemplateDrawing.fill(grande,
                                        gradientFrom: StickerTemplatePalette.warmBulb,
                                        to: StickerTemplatePalette.pin,
                                        in: cadreÉtoile)
            StickerTemplatePalette.surface.setStroke()
            grande.lineWidth = bord
            grande.lineJoinStyle = .round
            grande.stroke()

            // Deux étincelles satellites, l'une ciel, l'autre indigo : sans
            // elles l'étoile est un logo, avec elles c'est un scintillement.
            let petit = l.étoile * 0.28
            let satellites: [(CGPoint, UIColor)] = [
                (CGPoint(x: milieu + l.étoile * 0.50, y: l.étoile * 0.12), StickerTemplatePalette.sky),
                (CGPoint(x: milieu - l.étoile * 0.50, y: l.étoile * 0.62), StickerTemplatePalette.accent),
            ]
            for (centre, couleur) in satellites {
                let cadre = CGRect(x: centre.x - petit / 2, y: centre.y - petit / 2,
                                   width: petit, height: petit)
                couleur.setFill()
                StickerTemplateDrawing.starPath(in: cadre, points: 4, innerRatio: 0.34).fill()
            }

            let cadrePastille = CGRect(x: milieu - l.pastille.width / 2,
                                       y: l.étoile + metrics.gap * 0.5,
                                       width: l.pastille.width, height: l.pastille.height)
            let pastille = StickerTemplateDrawing.pillPath(in: cadrePastille.insetBy(dx: bord / 2, dy: bord / 2))
            StickerTemplatePalette.accent.setFill()
            pastille.fill()
            StickerTemplatePalette.surface.setStroke()
            pastille.lineWidth = bord
            pastille.stroke()
            StickerTemplateDrawing.drawCentered(l.mot, font: l.police,
                                                color: StickerTemplatePalette.surface,
                                                in: cadrePastille)
        }
    }

    // MARK: - joy.happyCloud — le nuage qui sourit

    @MainActor
    private static var happyCloudWord: String {
        String(localized: "sticker.template.joy.happyCloud", defaultValue: "Sur un nuage", bundle: .module)
    }

    private struct CloudLayout {
        let mot: String
        let police: UIFont
        let taille: CGSize
    }

    @MainActor
    private static func happyCloudLayout(metrics: StickerTemplateMetrics) -> CloudLayout {
        let mot = happyCloudWord
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.72, weight: .heavy)
        let tailleMot = StickerTemplateDrawing.measure(mot, font: police)
        // `cloudPath` taille ses bosses sur la LARGEUR : un nuage trop plat
        // verrait sa grosse bosse sortir du cadre. La hauteur suit donc la
        // largeur d'au moins 0,56 — et le mot vit dans le socle, sous les
        // bosses.
        let largeur = ceil(max(tailleMot.width + metrics.horizontalPadding * 2.4,
                               metrics.fontSize * 3.2))
        let hauteur = ceil(max(tailleMot.height + metrics.verticalPadding * 2 + metrics.fontSize * 1.1,
                               largeur * 0.56))
        return CloudLayout(mot: mot, police: police,
                           taille: CGSize(width: largeur, height: hauteur))
    }

    @MainActor
    static func happyCloudSize(metrics: StickerTemplateMetrics) -> CGSize {
        happyCloudLayout(metrics: metrics).taille
    }

    @MainActor
    static func happyCloudImage(metrics: StickerTemplateMetrics,
                                screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = happyCloudLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            StickerTemplateDrawing.fillWithOutline(StickerTemplateDrawing.cloudPath(in: cadre),
                                                   fill: StickerTemplatePalette.surface,
                                                   outline: StickerTemplatePalette.hairline,
                                                   width: bord)

            // Le petit visage loge dans la grosse bosse du milieu (x de 0,38
            // à 0,88 de la largeur, sommet en haut).
            let l2 = cadre.width
            let visage = CGPoint(x: cadre.minX + l2 * 0.63, y: cadre.minY)
            StickerTemplatePalette.night.setFill()
            let œil = l2 * 0.025
            for côté in [CGFloat(-1), 1] {
                UIBezierPath(ovalIn: CGRect(x: visage.x + l2 * 0.08 * côté - œil,
                                            y: visage.y + l2 * 0.14 - œil * 1.3,
                                            width: œil * 2, height: œil * 2.6)).fill()
            }
            let sourire = UIBezierPath(arcCenter: CGPoint(x: visage.x, y: visage.y + l2 * 0.17),
                                       radius: l2 * 0.075,
                                       startAngle: .pi * 0.15, endAngle: .pi * 0.85, clockwise: true)
            sourire.lineWidth = max(1, l2 * 0.018)
            sourire.lineCapStyle = .round
            StickerTemplatePalette.night.setStroke()
            sourire.stroke()

            let socle = CGRect(x: cadre.minX, y: cadre.minY + cadre.height * 0.45,
                               width: cadre.width, height: cadre.height * 0.55)
            StickerTemplateDrawing.drawCentered(l.mot, font: l.police,
                                                color: StickerTemplatePalette.label, in: socle)
        }
    }

    // MARK: - joy.laugh — la bulle qui rit

    /// La bulle ne dessine PAS son nom : « Fou rire » nomme le gabarit, la
    /// bulle contient l'onomatopée — d'où la seconde clé `.caption`.
    @MainActor
    private static var laughCaption: String {
        String(localized: "sticker.template.joy.laugh.caption", defaultValue: "HA HA HA", bundle: .module)
    }

    private struct LaughLayout {
        let mot: String
        let police: UIFont
        let queue: CGFloat
        let taille: CGSize
    }

    @MainActor
    private static func laughLayout(metrics: StickerTemplateMetrics) -> LaughLayout {
        let mot = laughCaption
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.82, weight: .black)
        let tailleMot = StickerTemplateDrawing.measure(mot, font: police)
        let queue = metrics.fontSize * 0.55
        let taille = CGSize(width: ceil(tailleMot.width + metrics.horizontalPadding * 2.2),
                            height: ceil(tailleMot.height + metrics.verticalPadding * 2.2 + queue))
        return LaughLayout(mot: mot, police: police, queue: queue, taille: taille)
    }

    @MainActor
    static func laughSize(metrics: StickerTemplateMetrics) -> CGSize {
        laughLayout(metrics: metrics).taille
    }

    @MainActor
    static func laughImage(metrics: StickerTemplateMetrics,
                           screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = laughLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.07)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord, dy: bord)
            let bulle = StickerTemplateDrawing.speechBubblePath(in: cadre, tail: l.queue)
            StickerTemplateDrawing.fillWithOutline(bulle,
                                                   gradientFrom: StickerTemplatePalette.accent,
                                                   to: StickerTemplatePalette.loveCool,
                                                   in: cadre,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: bord)
            let corps = CGRect(x: cadre.minX, y: cadre.minY,
                               width: cadre.width, height: cadre.height - l.queue)
            StickerTemplateDrawing.drawCentered(l.mot, font: l.police,
                                                color: StickerTemplatePalette.warmBulb, in: corps)
        }
    }

    // MARK: - Les trois cartouches — soleil, danse, bonnes ondes

    /// Un cartouche à légende dont la FORME et l'icône font la différence :
    /// une carte pour le soleil, une pastille pour la danse, un rectangle
    /// arrondi pour les ondes. Même patron que la météo, une forme de plus.
    private struct JoyCard {
        let id: String
        /// Une clé LITTÉRALE par carte : une clé construite serait invisible
        /// au catalogue de chaînes, donc jamais traduite.
        let name: @MainActor () -> String
        let glyph: StickerTemplateDrawing.Glyph
        let forme: @MainActor (CGRect) -> UIBezierPath
        let haut: UIColor
        let bas: UIColor
        let texte: UIColor
        let glyphe: UIColor
        /// Le dessin d'une icône `.custom` ; vide pour un symbole SF.
        let icône: @MainActor (CGRect) -> Void
    }

    @MainActor
    private static func joyCardSize(_ carte: JoyCard, metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: carte.name(), glyph: carte.glyph,
                                             metrics: metrics).taille
    }

    @MainActor
    private static func joyCardImage(_ carte: JoyCard, metrics: StickerTemplateMetrics,
                                     screenScale: CGFloat) -> (UIImage?, CGSize) {
        let légende = carte.name()
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: carte.glyph,
                                                     metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let bord = max(1, metrics.fontSize * 0.05)
            let forme = carte.forme(cadre.insetBy(dx: bord / 2, dy: bord / 2))
            StickerTemplateDrawing.fill(forme, gradientFrom: carte.haut, to: carte.bas, in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.6).setStroke()
            forme.lineWidth = bord
            forme.stroke()
            carte.icône(CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                               width: l.glyphe, height: l.glyphe))
            StickerTemplateDrawing.drawCaptionContent(l, caption: légende, glyph: carte.glyph,
                                                      metrics: metrics, in: cadre,
                                                      textColor: carte.texte, glyphColor: carte.glyphe)
        }
    }

    private static func joyCardDrawer(_ carte: JoyCard) -> StickerTemplateDrawer {
        StickerTemplateDrawer(
            id: carte.id,
            name: { carte.name() },
            measure: { _, m in Self.joyCardSize(carte, metrics: m) },
            draw: { _, m, échelle in Self.joyCardImage(carte, metrics: m, screenScale: échelle) })
    }

    /// Un soleil à douze rayons, disque en dégradé ambre→corail.
    @MainActor
    private static func sunburst(in r: CGRect) {
        let disque = r.insetBy(dx: r.width * 0.28, dy: r.height * 0.28)
        StickerTemplateDrawing.drawRays(center: CGPoint(x: r.midX, y: r.midY),
                                        inner: disque.width * 0.72, outer: r.width * 0.5,
                                        count: 12, width: max(1, r.width * 0.06),
                                        color: StickerTemplatePalette.warmBulb)
        StickerTemplateDrawing.fill(UIBezierPath(ovalIn: disque),
                                    gradientFrom: StickerTemplatePalette.warmBulb,
                                    to: StickerTemplatePalette.pin,
                                    in: disque)
    }

    /// Trois vaguelettes superposées — une bosse puis un creux, en deux
    /// courbes de Bézier, jamais un glyphe.
    @MainActor
    private static func waves(in r: CGRect) {
        let couleurs = [StickerTemplatePalette.surface,
                        StickerTemplatePalette.warmBulb,
                        StickerTemplatePalette.surface.withAlphaComponent(0.7)]
        let épaisseur = max(1, r.height * 0.09)
        let amplitude = r.height * 0.20
        for (index, couleur) in couleurs.enumerated() {
            let y = r.minY + r.height * (0.25 + 0.25 * CGFloat(index))
            let vague = UIBezierPath()
            vague.move(to: CGPoint(x: r.minX, y: y))
            vague.addCurve(to: CGPoint(x: r.midX, y: y),
                           controlPoint1: CGPoint(x: r.minX + r.width * 0.15, y: y - amplitude),
                           controlPoint2: CGPoint(x: r.minX + r.width * 0.35, y: y - amplitude))
            vague.addCurve(to: CGPoint(x: r.maxX, y: y),
                           controlPoint1: CGPoint(x: r.minX + r.width * 0.65, y: y + amplitude),
                           controlPoint2: CGPoint(x: r.minX + r.width * 0.85, y: y + amplitude))
            vague.lineWidth = épaisseur
            vague.lineCapStyle = .round
            couleur.setStroke()
            vague.stroke()
        }
    }

    private static let joyCards: [JoyCard] = [
        JoyCard(id: StickerTemplateCatalog.ID.joySunshine,
                name: { String(localized: "sticker.template.joy.sunshine", defaultValue: "Rayon de soleil", bundle: .module) },
                glyph: .custom,
                forme: { r in UIBezierPath(roundedRect: r, cornerRadius: r.height * 0.30) },
                haut: StickerTemplatePalette.surface, bas: StickerTemplatePalette.indigoLight,
                texte: StickerTemplatePalette.label, glyphe: StickerTemplatePalette.warmBulb,
                icône: { r in Self.sunburst(in: r) }),
        JoyCard(id: StickerTemplateCatalog.ID.joyDance,
                name: { String(localized: "sticker.template.joy.dance", defaultValue: "Danse de joie", bundle: .module) },
                glyph: .symbol("figure.dance"),
                forme: { r in StickerTemplateDrawing.pillPath(in: r) },
                haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.loveCool,
                texte: StickerTemplatePalette.surface, glyphe: StickerTemplatePalette.warmBulb,
                icône: { _ in }),
        JoyCard(id: StickerTemplateCatalog.ID.joyGoodVibes,
                name: { String(localized: "sticker.template.joy.goodVibes", defaultValue: "Bonnes ondes", bundle: .module) },
                glyph: .custom,
                forme: { r in UIBezierPath(roundedRect: r, cornerRadius: r.height * 0.42) },
                haut: StickerTemplatePalette.accent, bas: StickerTemplatePalette.sky,
                texte: StickerTemplatePalette.surface, glyphe: StickerTemplatePalette.surface,
                icône: { r in Self.waves(in: r) }),
    ]

    // MARK: - Le registre de la famille JOIE

    static let joyDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.joyBigSmile,
            name: { String(localized: "sticker.template.joy.bigSmile", defaultValue: "Grand sourire", bundle: .module) },
            measure: { _, m in Self.bigSmileSize(metrics: m) },
            draw: { _, m, échelle in Self.bigSmileImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.joyYay,
            name: { Self.yayWord },
            measure: { _, m in Self.yaySize(metrics: m) },
            draw: { _, m, échelle in Self.yayImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.joyHeartEyes,
            name: { String(localized: "sticker.template.joy.heartEyes", defaultValue: "Yeux en cœur", bundle: .module) },
            measure: { _, m in Self.heartEyesSize(metrics: m) },
            draw: { _, m, échelle in Self.heartEyesImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.joySparkle,
            name: { Self.sparkleWord },
            measure: { _, m in Self.sparkleSize(metrics: m) },
            draw: { _, m, échelle in Self.sparkleImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.joyHappyCloud,
            name: { Self.happyCloudWord },
            measure: { _, m in Self.happyCloudSize(metrics: m) },
            draw: { _, m, échelle in Self.happyCloudImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.joyLaugh,
            name: { String(localized: "sticker.template.joy.laugh", defaultValue: "Fou rire", bundle: .module) },
            measure: { _, m in Self.laughSize(metrics: m) },
            draw: { _, m, échelle in Self.laughImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.joyStarGrin,
            name: { String(localized: "sticker.template.joy.starGrin", defaultValue: "Étoiles plein les yeux", bundle: .module) },
            measure: { _, m in Self.starGrinSize(metrics: m) },
            draw: { _, m, échelle in Self.starGrinImage(metrics: m, screenScale: échelle) }),
    ] + joyCards.map { Self.joyCardDrawer($0) }
}
