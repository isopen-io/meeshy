import SwiftUI
import MeeshyUI

/// **La règle graduée de la frise** (#14211) : un pas MAJEUR choisi sur une
/// échelle lisible (1 s → 1 h) pour que deux libellés gardent au moins 44 pt
/// entre eux et qu'il n'y en ait jamais plus de douze, et des graduations
/// mineures tant qu'elles restent à six points l'une de l'autre.
nonisolated enum ComposerSceneFriseRuler {
    struct Tick: Equatable {
        let time: Float
        let isMajor: Bool
        let label: String?
    }

    static let height: CGFloat = 22

    private static let echelle: [(pas: Float, divisions: Int)] = [
        (1, 5), (2, 4), (5, 5), (10, 5), (15, 3), (30, 3),
        (60, 4), (120, 4), (300, 5), (600, 5), (900, 3), (1800, 3), (3600, 4),
    ]
    private static let ecartLibelles: CGFloat = 44
    private static let libellesMax: Float = 12
    private static let ecartMineures: CGFloat = 6

    static func majorStep(duration: Float, width: CGFloat) -> Float {
        echelleChoisie(duration: duration, width: width).pas
    }

    /// Les traits et les libellés de la règle — la frise et la section Temps
    /// (#14257) en dessinent UNE, la même.
    @MainActor
    static func draw(_ graduations: [Tick], in vue: ComposerSceneFriseViewport,
                     context contexte: GraphicsContext, size taille: CGSize) {
        let couleur = Color.white
        for graduation in graduations {
            let x = CGFloat(vue.fraction(graduation.time)) * taille.width
            let hauteur: CGFloat = graduation.isMajor ? 7 : 4
            let trait = CGRect(x: min(max(0, x - 0.5), taille.width - 1), y: taille.height - hauteur,
                               width: 1, height: hauteur)
            contexte.fill(Path(trait), with: .color(couleur.opacity(graduation.isMajor ? 0.55 : 0.25)))
            guard let libelle = graduation.label else { continue }
            var texte = contexte.resolve(Text(libelle)
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .medium).monospacedDigit()))
            texte.shading = .color(couleur.opacity(0.6))
            let mesure = texte.measure(in: taille)
            let centre = min(max(mesure.width / 2, x), taille.width - mesure.width / 2)
            contexte.draw(texte, at: CGPoint(x: centre, y: mesure.height / 2), anchor: .center)
        }
    }

    static func ticks(duration: Float, width: CGFloat) -> [Tick] {
        ticks(in: .whole(duration), width: width)
    }

    /// Les graduations de la seule fenêtre VISIBLE (#14213) : zoomée sur une
    /// minute d'une scène de deux heures, la règle n'en dessine pas plus.
    static func ticks(in vue: ComposerSceneFriseViewport, width: CGFloat) -> [Tick] {
        guard vue.span > 0, vue.span.isFinite, vue.start.isFinite, width > 0 else { return [] }
        let choix = echelleChoisie(duration: vue.span, width: width)
        let mineur = choix.pas / Float(choix.divisions)
        let avecMineures = CGFloat(mineur / vue.span) * width >= ecartMineures
        let pas = avecMineures ? mineur : choix.pas
        let parMajeure = avecMineures ? choix.divisions : 1
        let premier = Int((vue.start / pas - 0.0001).rounded(.up))
        let dernier = Int((vue.end / pas + 0.0001).rounded(.down))
        guard premier <= dernier else { return [] }
        return (premier...dernier).map { rang in
            let temps = min(vue.end, Float(rang / parMajeure) * choix.pas + Float(rang % parMajeure) * mineur)
            let majeure = rang % parMajeure == 0
            return Tick(time: temps, isMajor: majeure, label: majeure ? label(temps) : nil)
        }
    }

    /// « 45 s », « 1:30 », « 1:00:00 ».
    static func label(_ secondes: Float) -> String {
        let total = Int(secondes.rounded())
        guard total >= 60 else { return "\(total) s" }
        return MediaFormat.duration(total, style: .clockPromotingHours)
    }

    /// La tête a-t-elle franchi une graduation majeure entre deux images ?
    static func crossesMajor(from depart: Float, to arrivee: Float, step pas: Float) -> Bool {
        guard pas > 0, depart.isFinite, arrivee.isFinite else { return false }
        return (depart / pas).rounded(.down) != (arrivee / pas).rounded(.down)
    }

    private static func echelleChoisie(duration: Float, width: CGFloat) -> (pas: Float, divisions: Int) {
        guard duration > 0, width > 0 else { return echelle[0] }
        return echelle.first { CGFloat($0.pas / duration) * width >= ecartLibelles && duration / $0.pas <= libellesMax }
            ?? echelle[echelle.count - 1]
    }
}

/// **La fenêtre VISIBLE de la frise** (#14213) : la portion du temps de la
/// slide que la largeur montre. Entière par défaut ; le pincement la resserre
/// jusqu'à `minimumSpan` (une scène de deux heures se règle alors à la
/// seconde, et au dixième), le
/// glissé du fond la fait défiler. Toujours dans la slide.
nonisolated struct ComposerSceneFriseViewport: Equatable {
    let start: Float
    let span: Float

    /// La fenêtre la plus étroite : trois secondes — une seconde y prend
    /// alors près de cent points.
    static let minimumSpan: Float = 3

    static func whole(_ duration: Float) -> ComposerSceneFriseViewport {
        ComposerSceneFriseViewport(start: 0, span: max(duration, 0))
    }

    var end: Float { start + span }

    /// La même fenêtre ramenée dans une slide de `duration` secondes (la
    /// slide a pu raccourcir pendant que la frise était zoomée).
    func clamped(to duration: Float) -> ComposerSceneFriseViewport {
        let total = max(duration, 0)
        let largeur = min(max(span.isFinite ? span : total, min(Self.minimumSpan, total)), total)
        let debut = min(max(start.isFinite ? start : 0, 0), total - largeur)
        return ComposerSceneFriseViewport(start: debut, span: largeur)
    }

    /// La position de `seconds` dans la fenêtre, 0 au bord gauche, 1 au bord
    /// droit — hors de [0, 1] quand l'instant n'est pas visible.
    func fraction(_ seconds: Float) -> Float {
        guard span > 0, seconds.isFinite else { return 0 }
        return (seconds - start) / span
    }

    func time(atFraction f: Float) -> Float {
        start + max(0, min(1, f.isFinite ? f : 0)) * span
    }

    /// **Pincer** : la fenêtre se resserre (`scale` > 1) ou s'élargit autour
    /// de l'instant `anchor`, qui garde sa place à l'écran.
    func zoomed(by scale: Float, around anchor: Float, duration: Float) -> ComposerSceneFriseViewport {
        guard scale.isFinite, scale > 0, span > 0 else { return clamped(to: duration) }
        let ancre = min(max(anchor, start), end)
        let place = (ancre - start) / span
        let largeur = ComposerSceneFriseViewport(start: 0, span: span / scale).clamped(to: duration).span
        return ComposerSceneFriseViewport(start: ancre - place * largeur, span: largeur).clamped(to: duration)
    }

    /// **Faire défiler** de `fraction` de largeur : un glissé vers la droite
    /// (fraction positive) montre ce qui précède.
    func panned(by fraction: Float, duration: Float) -> ComposerSceneFriseViewport {
        ComposerSceneFriseViewport(start: start - (fraction.isFinite ? fraction : 0) * span, span: span)
            .clamped(to: duration)
    }

    /// La fenêtre qui montre `seconds` : inchangée s'il est visible, sinon
    /// la page qui commence (ou finit) à lui.
    func showing(_ seconds: Float, duration: Float) -> ComposerSceneFriseViewport {
        guard seconds.isFinite, seconds < start || seconds > end else { return clamped(to: duration) }
        let debut = seconds < start ? seconds : seconds - span
        return ComposerSceneFriseViewport(start: debut, span: span).clamped(to: duration)
    }
}
