import Foundation
import UIKit
import MeeshySDK

// MARK: - Sept décorations d'AMOUR de plus (#4820)

/// Le premier lot tenait trois cœurs ; celui-ci varie les SILHOUETTES — une
/// flèche, une enveloppe, des lèvres, un ballon, une lemniscate, une pastille,
/// une pluie — pour qu'on les distingue du coin de l'œil dans la palette.
///
/// Fichier séparé de `StickerTemplates+Love` : sept dessins de plus l'auraient
/// poussé hors budget pour un gain de cohésion nul — ce sont sept formes
/// indépendantes qui ne partagent que le cœur.
extension StickerTemplateRenderer {

    // MARK: Les gestes partagés

    /// Un cœur en dégradé avec le liseré clair qui le détache d'une photo
    /// sombre — le geste du premier lot, écrit une fois pour les sept.
    @MainActor
    private static func loveHeart(in cadre: CGRect, from haut: UIColor, to bas: UIColor,
                                  outline: CGFloat, alpha: CGFloat = 1) {
        let cœur = StickerTemplateDrawing.heartPath(in: cadre)
        StickerTemplateDrawing.fill(cœur,
                                    gradientFrom: haut.withAlphaComponent(alpha),
                                    to: bas.withAlphaComponent(alpha),
                                    in: cadre)
        StickerTemplatePalette.surface.withAlphaComponent(alpha).setStroke()
        cœur.lineWidth = outline
        cœur.stroke()
    }

    /// Le vecteur unitaire de `a` vers `b` et sa normale — pour poser une
    /// pointe et des plumes sur une flèche quelle que soit son inclinaison.
    private static func direction(from a: CGPoint, to b: CGPoint) -> (u: CGPoint, n: CGPoint) {
        let dx = b.x - a.x, dy = b.y - a.y
        let longueur = max(1, hypot(dx, dy))
        let u = CGPoint(x: dx / longueur, y: dy / longueur)
        return (u, CGPoint(x: -u.y, y: u.x))
    }

    // MARK: - love.arrowHeart — le cœur flèché

    @MainActor
    static func arrowHeartSize(metrics: StickerTemplateMetrics) -> CGSize {
        let côté = ceil(metrics.fontSize * 3.4)
        return CGSize(width: côté, height: ceil(côté * 0.88))
    }

    @MainActor
    static func arrowHeartImage(metrics: StickerTemplateMetrics,
                                screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = arrowHeartSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.09)
            let largeurCœur = taille.width * 0.64
            let cadreCœur = CGRect(x: (taille.width - largeurCœur) / 2,
                                   y: (taille.height - largeurCœur * 0.92) / 2,
                                   width: largeurCœur, height: largeurCœur * 0.92)
            // La flèche entre en bas à gauche et ressort en haut à droite. Sa
            // queue est dessinée AVANT le cœur, sa pointe APRÈS : c'est l'ordre
            // de dessin qui la fait TRANSPERCER au lieu de se poser dessus.
            let marge = metrics.fontSize * 0.55
            let queue = CGPoint(x: marge, y: taille.height - marge)
            let pointe = CGPoint(x: taille.width - marge * 0.5, y: marge * 0.5)
            let centre = CGPoint(x: cadreCœur.midX, y: cadreCœur.midY)
            let trait = max(2, metrics.fontSize * 0.11)
            Self.arrowShaft(from: queue, to: centre, width: trait)
            Self.arrowFletching(at: queue, toward: pointe, size: metrics.fontSize * 0.42, width: trait)
            Self.loveHeart(in: cadreCœur, from: StickerTemplatePalette.loveWarm,
                           to: StickerTemplatePalette.loveCool, outline: bord)
            Self.arrowShaft(from: centre, to: pointe, width: trait)
            Self.arrowHead(at: pointe, from: queue, size: metrics.fontSize * 0.5)
        }
    }

    /// La flèche est DORÉE — celle de Cupidon — sur un halo clair qui la
    /// garde lisible devant le cœur comme devant une photo.
    @MainActor
    private static func arrowShaft(from a: CGPoint, to b: CGPoint, width: CGFloat) {
        let trait = UIBezierPath()
        trait.move(to: a)
        trait.addLine(to: b)
        trait.lineCapStyle = .round
        StickerTemplatePalette.surface.setStroke()
        trait.lineWidth = width * 1.8
        trait.stroke()
        StickerTemplatePalette.warmBulb.setStroke()
        trait.lineWidth = width
        trait.stroke()
    }

    @MainActor
    private static func arrowHead(at pointe: CGPoint, from queue: CGPoint, size: CGFloat) {
        let (u, n) = direction(from: queue, to: pointe)
        let base = CGPoint(x: pointe.x - u.x * size, y: pointe.y - u.y * size)
        let tête = UIBezierPath()
        tête.move(to: pointe)
        tête.addLine(to: CGPoint(x: base.x + n.x * size * 0.5, y: base.y + n.y * size * 0.5))
        tête.addLine(to: CGPoint(x: base.x - n.x * size * 0.5, y: base.y - n.y * size * 0.5))
        tête.close()
        StickerTemplateDrawing.fillWithOutline(tête, fill: StickerTemplatePalette.warmBulb,
                                               outline: StickerTemplatePalette.surface,
                                               width: max(1, size * 0.12))
    }

    /// L'empennage : deux paires de plumes qui partent de la hampe vers
    /// l'arrière, dans le rose du cœur.
    @MainActor
    private static func arrowFletching(at queue: CGPoint, toward pointe: CGPoint,
                                       size: CGFloat, width: CGFloat) {
        let (u, n) = direction(from: queue, to: pointe)
        StickerTemplatePalette.loveWarm.setStroke()
        for pas in [0.6, 1.15] as [CGFloat] {
            let origine = CGPoint(x: queue.x + u.x * size * pas, y: queue.y + u.y * size * pas)
            for côté in [1.0, -1.0] as [CGFloat] {
                let plume = UIBezierPath()
                plume.move(to: origine)
                plume.addLine(to: CGPoint(x: origine.x - u.x * size * 0.6 + n.x * size * 0.5 * côté,
                                          y: origine.y - u.y * size * 0.6 + n.y * size * 0.5 * côté))
                plume.lineWidth = width * 0.8
                plume.lineCapStyle = .round
                plume.stroke()
            }
        }
    }

    // MARK: - love.loveLetter — l'enveloppe scellée d'un cœur

    /// Localisée, donc dans `MeeshyUI` — `MeeshySDK` n'a aucune ressource de
    /// localisation (cf. `Package.swift`).
    @MainActor
    static var loveLetterCaption: String {
        String(localized: "sticker.template.love.loveLetter",
               defaultValue: "Lettre d'amour", bundle: .module)
    }

    @MainActor
    static func loveLetterSize(metrics: StickerTemplateMetrics) -> CGSize {
        StickerTemplateDrawing.captionLayout(caption: loveLetterCaption, glyph: .custom,
                                             metrics: metrics).taille
    }

    @MainActor
    static func loveLetterImage(metrics: StickerTemplateMetrics,
                                screenScale: CGFloat) -> (UIImage?, CGSize) {
        let légende = loveLetterCaption
        let l = StickerTemplateDrawing.captionLayout(caption: légende, glyph: .custom,
                                                     metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let cadre = CGRect(origin: .zero, size: l.taille)
            let carte = UIBezierPath(roundedRect: cadre, cornerRadius: metrics.fontSize * 0.30)
            StickerTemplateDrawing.fill(carte,
                                        gradientFrom: StickerTemplatePalette.loveCool,
                                        to: StickerTemplatePalette.accent,
                                        in: cadre)
            StickerTemplatePalette.surface.withAlphaComponent(0.55).setStroke()
            carte.lineWidth = max(1, metrics.fontSize * 0.05)
            carte.stroke()
            Self.envelope(in: CGRect(x: metrics.horizontalPadding, y: cadre.midY - l.glyphe / 2,
                                     width: l.glyphe, height: l.glyphe))
            StickerTemplateDrawing.drawCaptionContent(l, caption: légende, glyph: .custom,
                                                      metrics: metrics, in: cadre,
                                                      textColor: StickerTemplatePalette.surface,
                                                      glyphColor: StickerTemplatePalette.surface)
        }
    }

    /// Une enveloppe fermée : le corps clair, le rabat en V dans le violet
    /// du fond, et un petit cœur à la place du sceau de cire.
    @MainActor
    private static func envelope(in r: CGRect) {
        let corps = CGRect(x: r.minX, y: r.minY + r.height * 0.18,
                           width: r.width, height: r.height * 0.64)
        StickerTemplatePalette.surface.setFill()
        UIBezierPath(roundedRect: corps, cornerRadius: r.width * 0.08).fill()

        let retrait = r.width * 0.05
        let sceau = CGPoint(x: corps.midX, y: corps.minY + corps.height * 0.58)
        let rabat = UIBezierPath()
        rabat.move(to: CGPoint(x: corps.minX + retrait, y: corps.minY + retrait))
        rabat.addLine(to: sceau)
        rabat.addLine(to: CGPoint(x: corps.maxX - retrait, y: corps.minY + retrait))
        rabat.lineWidth = max(1, r.width * 0.06)
        rabat.lineJoinStyle = .round
        rabat.lineCapStyle = .round
        StickerTemplatePalette.loveCool.setStroke()
        rabat.stroke()

        let côté = r.width * 0.30
        StickerTemplatePalette.loveWarm.setFill()
        StickerTemplateDrawing.heartPath(in: CGRect(x: sceau.x - côté / 2, y: sceau.y - côté * 0.40,
                                                    width: côté, height: côté * 0.92)).fill()
    }

    // MARK: - love.kissMark — la marque de lèvres

    @MainActor
    static func kissMarkSize(metrics: StickerTemplateMetrics) -> CGSize {
        let largeur = ceil(metrics.fontSize * 3.2)
        return CGSize(width: largeur, height: ceil(largeur * 0.62))
    }

    /// Deux lèvres SÉPARÉES par la ligne de la bouche, laissée transparente :
    /// c'est ce vide qui fait la marque de rouge à lèvres plutôt qu'une bouche
    /// dessinée. La lèvre haute porte l'arc de Cupidon — deux lobes.
    @MainActor
    static func kissMarkImage(metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = kissMarkSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let r = CGRect(origin: .zero, size: taille).insetBy(dx: bord, dy: bord)
            let l = r.width, h = r.height, x = r.minX, y = r.minY
            let gauche = CGPoint(x: x, y: y + h * 0.46)
            let droite = CGPoint(x: x + l, y: y + h * 0.46)

            let haute = UIBezierPath()
            haute.move(to: gauche)
            haute.addCurve(to: CGPoint(x: x + l * 0.5, y: y + h * 0.22),
                           controlPoint1: CGPoint(x: x + l * 0.10, y: y + h * 0.04),
                           controlPoint2: CGPoint(x: x + l * 0.36, y: y))
            haute.addCurve(to: droite,
                           controlPoint1: CGPoint(x: x + l * 0.64, y: y),
                           controlPoint2: CGPoint(x: x + l * 0.90, y: y + h * 0.04))
            haute.addCurve(to: gauche,
                           controlPoint1: CGPoint(x: x + l * 0.70, y: y + h * 0.40),
                           controlPoint2: CGPoint(x: x + l * 0.30, y: y + h * 0.40))
            haute.close()

            let basse = UIBezierPath()
            basse.move(to: gauche)
            basse.addCurve(to: droite,
                           controlPoint1: CGPoint(x: x + l * 0.14, y: y + h * 1.02),
                           controlPoint2: CGPoint(x: x + l * 0.86, y: y + h * 1.02))
            basse.addCurve(to: gauche,
                           controlPoint1: CGPoint(x: x + l * 0.70, y: y + h * 0.56),
                           controlPoint2: CGPoint(x: x + l * 0.30, y: y + h * 0.56))
            basse.close()

            for lèvre in [haute, basse] {
                StickerTemplateDrawing.fillWithOutline(lèvre, fill: StickerTemplatePalette.loveWarm,
                                                       outline: StickerTemplatePalette.surface,
                                                       width: bord)
            }
        }
    }

    // MARK: - love.heartBalloon — le ballon en cœur

    @MainActor
    static func heartBalloonSize(metrics: StickerTemplateMetrics) -> CGSize {
        let largeur = ceil(metrics.fontSize * 2.6)
        return CGSize(width: largeur, height: ceil(largeur * 1.65))
    }

    @MainActor
    static func heartBalloonImage(metrics: StickerTemplateMetrics,
                                  screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = heartBalloonSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.09)
            let largeurCœur = taille.width - bord * 2
            let cadreCœur = CGRect(x: bord, y: bord, width: largeurCœur, height: largeurCœur * 0.92)

            // La ficelle d'abord : elle naît sous la pointe, et le nœud la
            // recouvre là où elle part.
            let départ = CGPoint(x: cadreCœur.midX, y: cadreCœur.maxY)
            let reste = taille.height - bord - départ.y
            let ficelle = UIBezierPath()
            ficelle.move(to: départ)
            ficelle.addCurve(to: CGPoint(x: départ.x, y: taille.height - bord),
                             controlPoint1: CGPoint(x: départ.x - taille.width * 0.32, y: départ.y + reste * 0.35),
                             controlPoint2: CGPoint(x: départ.x + taille.width * 0.32, y: départ.y + reste * 0.65))
            ficelle.lineWidth = max(1, metrics.fontSize * 0.06)
            ficelle.lineCapStyle = .round
            StickerTemplatePalette.surface.setStroke()
            ficelle.stroke()

            Self.loveHeart(in: cadreCœur, from: StickerTemplatePalette.loveWarm,
                           to: StickerTemplatePalette.loveCool, outline: bord)

            let k = metrics.fontSize * 0.14
            let nœud = UIBezierPath()
            nœud.move(to: CGPoint(x: départ.x, y: départ.y - k * 0.6))
            nœud.addLine(to: CGPoint(x: départ.x - k, y: départ.y + k * 1.2))
            nœud.addLine(to: CGPoint(x: départ.x + k, y: départ.y + k * 1.2))
            nœud.close()
            StickerTemplateDrawing.fillWithOutline(nœud, fill: StickerTemplatePalette.loveCool,
                                                   outline: StickerTemplatePalette.surface,
                                                   width: max(1, k * 0.2))

            // Le reflet — un petit ovale clair, incliné sur le lobe gauche.
            // C'est lui qui fait le BALLON : sans lui, ce n'est qu'un cœur à
            // ficelle.
            let reflet = CGRect(x: cadreCœur.minX + cadreCœur.width * 0.16,
                                y: cadreCœur.minY + cadreCœur.height * 0.14,
                                width: cadreCœur.width * 0.15, height: cadreCœur.height * 0.26)
            let ovale = UIBezierPath(ovalIn: reflet)
            ovale.apply(CGAffineTransform(translationX: reflet.midX, y: reflet.midY)
                            .rotated(by: .pi / 7)
                            .translatedBy(x: -reflet.midX, y: -reflet.midY))
            StickerTemplatePalette.surface.withAlphaComponent(0.78).setFill()
            ovale.fill()
        }
    }

    // MARK: - love.infinity — la lemniscate aux deux cœurs

    @MainActor
    static func infinitySize(metrics: StickerTemplateMetrics) -> CGSize {
        let largeur = ceil(metrics.fontSize * 3.8)
        return CGSize(width: largeur, height: ceil(largeur * 0.52))
    }

    /// La lemniscate de Bernoulli, en segments — tracée à la main plutôt que
    /// par le symbole SF `infinity` : un dégradé sur un symbole exige un masque,
    /// et le ruban doit devenir un CHEMIN PLEIN (`copy(strokingWithWidth:)`)
    /// pour le recevoir. Le tracé à la main donne les deux d'un coup, et rend
    /// pareil sur iOS 16 et sur iOS 26.
    private static func lemniscatePath(in r: CGRect) -> UIBezierPath {
        let chemin = UIBezierPath()
        let a = r.width / 2
        let centre = CGPoint(x: r.midX, y: r.midY)
        let segments = 96
        for index in 0...segments {
            let t = CGFloat(index) / CGFloat(segments) * 2 * .pi
            let d = 1 + sin(t) * sin(t)
            let point = CGPoint(x: centre.x + a * cos(t) / d,
                                y: centre.y + a * sin(t) * cos(t) / d)
            if index == 0 { chemin.move(to: point) } else { chemin.addLine(to: point) }
        }
        chemin.close()
        return chemin
    }

    @MainActor
    static func infinityImage(metrics: StickerTemplateMetrics,
                              screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = infinitySize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let épaisseur = metrics.fontSize * 0.26
            let halo = max(1.5, metrics.fontSize * 0.07)
            let cadre = CGRect(origin: .zero, size: taille)
                .insetBy(dx: épaisseur / 2 + halo, dy: épaisseur / 2 + halo)
            let courbe = Self.lemniscatePath(in: cadre)

            // Le halo trace la COURBE, plus large ; le ruban rempli s'y pose.
            // Tracer le ruban lui-même dessinerait aussi ses bords intérieurs
            // au croisement.
            courbe.lineWidth = épaisseur + halo * 2
            courbe.lineCapStyle = .round
            courbe.lineJoinStyle = .round
            StickerTemplatePalette.surface.setStroke()
            courbe.stroke()

            let ruban = UIBezierPath(cgPath: courbe.cgPath.copy(
                strokingWithWidth: épaisseur, lineCap: .round, lineJoin: .round, miterLimit: 10))
            StickerTemplateDrawing.fill(ruban,
                                        gradientFrom: StickerTemplatePalette.loveWarm,
                                        to: StickerTemplatePalette.loveCool,
                                        in: ruban.bounds)

            // Un cœur miniature au creux de chaque boucle.
            let côté = metrics.fontSize * 0.46
            for signe in [-1.0, 1.0] as [CGFloat] {
                let cx = cadre.midX + signe * cadre.width * 0.31
                Self.loveHeart(in: CGRect(x: cx - côté / 2, y: cadre.midY - côté * 0.46,
                                          width: côté, height: côté * 0.92),
                               from: StickerTemplatePalette.loveCool,
                               to: StickerTemplatePalette.accent,
                               outline: max(1, côté * 0.10))
            }
        }
    }

    // MARK: - love.loveBadge — la pastille « LOVE »

    /// Capitales : une pastille ne se lit pas en bas-de-casse. Chaque « O »
    /// est dessiné en CŒUR, pour toute langue qui en garde un.
    @MainActor
    static var loveBadgeCaption: String {
        String(localized: "sticker.template.love.loveBadge",
               defaultValue: "LOVE", bundle: .module).uppercased()
    }

    @MainActor
    private static func loveBadgeLayout(metrics: StickerTemplateMetrics)
        -> (lettres: [String], largeurs: [CGFloat], police: UIFont,
            hauteur: CGFloat, espace: CGFloat, taille: CGSize) {
        let lettres = loveBadgeCaption.map { String($0) }
        let police = StickerTemplateDrawing.font(size: metrics.fontSize * 0.82, weight: .black)
        let hauteur = StickerTemplateDrawing.measure("L", font: police).height
        // L'espacement entre lettres — ce qui fait la pastille GRAVÉE plutôt
        // qu'un mot posé. Le cœur prend la chasse d'un O.
        let espace = metrics.fontSize * 0.12
        let largeurs = lettres.map { lettre -> CGFloat in
            lettre == "O" ? hauteur * 0.78 : StickerTemplateDrawing.measure(lettre, font: police).width
        }
        let contenu = largeurs.reduce(0, +) + espace * CGFloat(max(0, lettres.count - 1))
        let taille = CGSize(
            width: ceil(metrics.horizontalPadding * 2 + contenu),
            height: ceil(metrics.verticalPadding * 2 + hauteur)
        )
        return (lettres, largeurs, police, hauteur, espace, taille)
    }

    @MainActor
    static func loveBadgeSize(metrics: StickerTemplateMetrics) -> CGSize {
        loveBadgeLayout(metrics: metrics).taille
    }

    @MainActor
    static func loveBadgeImage(metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let l = loveBadgeLayout(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: l.taille, screenScale: screenScale) {
            let bord = max(1.5, metrics.fontSize * 0.08)
            let cadre = CGRect(origin: .zero, size: l.taille).insetBy(dx: bord / 2, dy: bord / 2)
            let pastille = StickerTemplateDrawing.pillPath(in: cadre)
            StickerTemplateDrawing.fill(pastille,
                                        gradientFrom: StickerTemplatePalette.loveWarm,
                                        to: StickerTemplatePalette.loveCool,
                                        in: cadre)
            StickerTemplatePalette.surface.setStroke()
            pastille.lineWidth = bord
            pastille.stroke()

            var x = metrics.horizontalPadding
            for (lettre, largeur) in zip(l.lettres, l.largeurs) {
                if lettre == "O" {
                    let hauteurCœur = largeur * 0.92
                    StickerTemplatePalette.surface.setFill()
                    StickerTemplateDrawing.heartPath(in: CGRect(x: x, y: cadre.midY - hauteurCœur / 2,
                                                                width: largeur, height: hauteurCœur)).fill()
                } else {
                    StickerTemplateDrawing.draw(lettre, font: l.police,
                                                color: StickerTemplatePalette.surface,
                                                at: CGPoint(x: x, y: cadre.midY - l.hauteur / 2))
                }
                x += largeur + l.espace
            }
        }
    }

    // MARK: - love.heartRain — la pluie de cœurs

    @MainActor
    static func heartRainSize(metrics: StickerTemplateMetrics) -> CGSize {
        let côté = ceil(metrics.fontSize * 3.4)
        return CGSize(width: côté, height: côté)
    }

    /// Cinq cœurs de tailles et d'opacités différentes, en fractions du cadre
    /// carré : c'est la VARIÉTÉ qui fait la pluie — cinq cœurs égaux feraient
    /// un motif de papier peint.
    private static let rainDrops: [(x: CGFloat, y: CGFloat, côté: CGFloat, alpha: CGFloat)] = [
        (0.06, 0.04, 0.34, 1.00),
        (0.58, 0.00, 0.26, 0.85),
        (0.36, 0.36, 0.42, 1.00),
        (0.02, 0.62, 0.24, 0.70),
        (0.66, 0.60, 0.32, 0.90),
    ]

    @MainActor
    static func heartRainImage(metrics: StickerTemplateMetrics,
                               screenScale: CGFloat) -> (UIImage?, CGSize) {
        let taille = heartRainSize(metrics: metrics)
        return StickerTemplateDrawing.rasterize(size: taille, screenScale: screenScale) {
            let bord = max(1, metrics.fontSize * 0.06)
            let côtéCadre = taille.width - bord * 2
            let teintes = [
                (StickerTemplatePalette.loveWarm, StickerTemplatePalette.loveCool),
                (StickerTemplatePalette.loveCool, StickerTemplatePalette.accent),
                (StickerTemplatePalette.loveWarm, StickerTemplatePalette.loveCool),
                (StickerTemplatePalette.accent, StickerTemplatePalette.loveCool),
                (StickerTemplatePalette.loveWarm, StickerTemplatePalette.loveCool),
            ]
            for (goutte, teinte) in zip(Self.rainDrops, teintes) {
                let côté = côtéCadre * goutte.côté
                Self.loveHeart(in: CGRect(x: bord + côtéCadre * goutte.x, y: bord + côtéCadre * goutte.y,
                                          width: côté, height: côté * 0.92),
                               from: teinte.0, to: teinte.1,
                               outline: max(1, côté * 0.08), alpha: goutte.alpha)
            }
        }
    }

    // MARK: - Le registre des sept

    static let loveExtraDrawers: [StickerTemplateDrawer] = [
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveArrowHeart,
            name: { String(localized: "sticker.template.love.arrowHeart", defaultValue: "Cœur flèché", bundle: .module) },
            measure: { _, m in Self.arrowHeartSize(metrics: m) },
            draw: { _, m, échelle in Self.arrowHeartImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveLoveLetter,
            name: { Self.loveLetterCaption },
            measure: { _, m in Self.loveLetterSize(metrics: m) },
            draw: { _, m, échelle in Self.loveLetterImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveKissMark,
            name: { String(localized: "sticker.template.love.kissMark", defaultValue: "Bisou", bundle: .module) },
            measure: { _, m in Self.kissMarkSize(metrics: m) },
            draw: { _, m, échelle in Self.kissMarkImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveHeartBalloon,
            name: { String(localized: "sticker.template.love.heartBalloon", defaultValue: "Ballon cœur", bundle: .module) },
            measure: { _, m in Self.heartBalloonSize(metrics: m) },
            draw: { _, m, échelle in Self.heartBalloonImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveInfinity,
            name: { String(localized: "sticker.template.love.infinity", defaultValue: "Infini", bundle: .module) },
            measure: { _, m in Self.infinitySize(metrics: m) },
            draw: { _, m, échelle in Self.infinityImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveLoveBadge,
            name: { String(localized: "sticker.template.love.loveBadge", defaultValue: "LOVE", bundle: .module) },
            measure: { _, m in Self.loveBadgeSize(metrics: m) },
            draw: { _, m, échelle in Self.loveBadgeImage(metrics: m, screenScale: échelle) }),
        StickerTemplateDrawer(
            id: StickerTemplateCatalog.ID.loveHeartRain,
            name: { String(localized: "sticker.template.love.heartRain", defaultValue: "Pluie de cœurs", bundle: .module) },
            measure: { _, m in Self.heartRainSize(metrics: m) },
            draw: { _, m, échelle in Self.heartRainImage(metrics: m, screenScale: échelle) }),
    ]
}
