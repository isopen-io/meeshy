import CoreGraphics
import CoreMedia
import Foundation

/// Un outil du mode édition d'une prise, au-delà des familles de looks.
nonisolated enum ComposerEditTool: Equatable, Hashable, Sendable, CaseIterable {
    /// Les équerres autour de l'image, et les proportions par presets.
    case crop
    /// Du texte posé sur l'image, avec les outils de texte du composer (#12591).
    case text
    /// La barre de coupe de la prise.
    case trim
    /// Le spectre vocal en couleur et la ligne de volume.
    case sound
}

/// Ce que la retouche retouche, vu par ses outils.
nonisolated enum ComposerEditTake: Equatable, Sendable {
    case photo
    case video(hasAudio: Bool)
    /// Une prise sans image : elle se coupe et son son se règle.
    case audio
}

/// **Les outils du mode édition — COMPOSABLES et actifs d'office** (#9754,
/// directives porteur 2026-10-09).
///
/// > « Pour la vidéo, permettre la barre de coupe avec la gestion du volume
/// > activée, le crop aussi — certaines fonctions sont composites si on ne les
/// > désactive pas. »
///
/// À l'entrée en retouche, chaque outil que la prise offre est ACTIF : une
/// vidéo montre ensemble ses équerres, son spectre et sa barre de coupe ; une
/// photo ses équerres blanches ; un son sa coupe et son spectre. Un toucher
/// retire UN outil sans fermer les autres, le suivant le rend.
///
/// Une famille de looks ouverte replie les PANNEAUX sous la scène sans éteindre
/// leurs outils — la bande prend leur place, et ils reviennent quand elle se
/// replie. Les équerres, posées sur la scène, ne coûtent aucune place : elles
/// restent.
nonisolated enum ComposerEditTools {

    /// Ce qu'une prise offre : la photo se recadre ; la vidéo se recadre et se
    /// coupe, et son son se règle si elle en a un ; un son se coupe et se règle.
    static func offered(_ take: ComposerEditTake) -> [ComposerEditTool] {
        switch take {
        case .photo: return [.crop, .text]
        case .video(let son): return son ? [.crop, .text, .trim, .sound] : [.crop, .text, .trim]
        case .audio: return [.trim, .sound]
        }
    }

    /// **Aucun outil ouvert à l'entrée** (porteur 2026-10-20 : « afficher
    /// immédiatement les touches d'édition »). Le rail est là, la prise remplit
    /// le viewport, (x) et « Terminé » restent visibles tant qu'aucun élément
    /// d'édition ne s'affiche.
    static func initial(_ take: ComposerEditTake) -> Set<ComposerEditTool> {
        []
    }

    /// **(x) et « Terminé » cèdent la place aux éléments d'édition** (porteur
    /// 2026-10-20 : « on ne doit pas afficher (X) et Terminé en même temps que
    /// les éléments d'édition ») : une famille ouverte ou un outil montré les
    /// cache ; refermés, ils reviennent.
    static func showsTopRow(familyOpen: Bool, shownTools: Set<ComposerEditTool>) -> Bool {
        !familyOpen && shownTools.isEmpty
    }

    /// **Seul le recadrage réduit la prise** (#10930 : « seul le recadrage
    /// réduit la vidéo pour coper avec les bords ») — et seulement quand le
    /// chrome est montré. Tout le reste se pose PAR-DESSUS une prise qui garde
    /// le viewport entier.
    static func framesScene(active: Set<ComposerEditTool>, chromeShown: Bool) -> Bool {
        chromeShown && active.contains(.crop)
    }

    /// Ce qu'un outil actif montre : les équerres restent sur la scène sous une
    /// bande, les pistes s'y replient.
    static func isShown(_ tool: ComposerEditTool, active: Set<ComposerEditTool>, familyOpen: Bool) -> Bool {
        guard active.contains(tool) else { return false }
        return tool == .crop || !familyOpen
    }

    /// **Toucher un outil ne touche que lui** : montré, il se retire ; replié
    /// sous une bande ou éteint, il se montre. Les autres ne bougent pas.
    static func toggled(_ active: Set<ComposerEditTool>, tapping tool: ComposerEditTool,
                        familyOpen: Bool) -> Set<ComposerEditTool> {
        guard !isShown(tool, active: active, familyOpen: familyOpen) else { return active.subtracting([tool]) }
        return active.union([tool]).subtracting(excluded(by: tool))
    }

    /// **Texte et Recadrer s'excluent** (#12591) : tous deux prennent la scène — l'un pour ses
    /// crochets, l'autre pour sa saisie. Montrer l'un range l'autre.
    static func excluded(by tool: ComposerEditTool) -> Set<ComposerEditTool> {
        switch tool {
        case .crop: return [.text]
        case .text: return [.crop]
        case .trim, .sound: return []
        }
    }

    /// L'ordre des panneaux sous la scène, de haut en bas : les proportions,
    /// le spectre, puis la coupe, au plus près des outils. Les proportions
    /// retiennent leur bande SOUS la scène (porteur 2026-10-20 : « les rails
    /// d'outils doivent être le moins coupés possible ») : aucun crochet ne
    /// les coupe, et elles défilent jusqu'aux bords de l'écran.
    static let panelOrder: [ComposerEditTool] = [.crop, .sound, .trim]

    /// Les panneaux sous la scène : la bande d'une famille ouverte, sinon un par
    /// outil actif — **sauf le son quand la coupe est montrée** (#10356) : il se
    /// pose alors PAR-DESSUS la bande vidéo (#10341) et ne prend aucune place à
    /// lui. La scène ne rétrécit plus pour une place vide.
    static func panels(familyOpen: Bool, active: Set<ComposerEditTool>) -> [ComposerEditPanel] {
        guard !familyOpen else { return [.band] }
        return panelOrder
            .filter { active.contains($0) && !(overlaysTrim($0) && active.contains(.trim)) }
            .map(panel(for:))
    }

    /// Le son se peint sur la bande vidéo tant qu'elle est montrée (#10341).
    static func overlaysTrim(_ tool: ComposerEditTool) -> Bool {
        tool == .sound
    }

    static func panel(for tool: ComposerEditTool) -> ComposerEditPanel {
        switch tool {
        case .crop: return .presets
        case .text: return .none
        case .trim: return .trim
        case .sound: return .sound
        }
    }

    /// Les équerres suivent Crop, et lui seul.
    static func showsBrackets(active: Set<ComposerEditTool>) -> Bool {
        active.contains(.crop)
    }
}

/// **Le son de la prise** (#9754) : un gain réglé à la ligne de volume, et un
/// muet qui le coupe tout à fait sans l'oublier — réactiver rend le gain d'avant.
/// L'aperçu l'entend et le rendu final le grave (`videoRender`, une seule recette).
///
/// Le gain va de 0 à 200 % : `AVAudioMix` et `AVPlayer` ne savent pas amplifier
/// au-delà du niveau enregistré — la part au-dessus de 100 % passe par
/// `ComposerTakeGain`, la même loi dans l'aperçu et dans le rendu (#10360).
nonisolated struct ComposerTakeSound: Equatable, Sendable {
    /// **100 % au MILIEU de la piste, de 0 à 200 %** (porteur 2026-10-12, #10341).
    static let range: ClosedRange<Double> = 0...2
    /// Le pas d'un balayage VoiceOver.
    static let accessibilityStep: Double = 0.1

    var gain: Double = 1
    var muted = false

    /// Ce que l'oreille entend et ce que le rendu grave.
    var effectiveGain: Float {
        muted ? 0 : Float(Self.clamped(gain))
    }

    /// Rien n'a été touché : le rendu garde la piste telle qu'elle est.
    var isUntouched: Bool { effectiveGain == 1 }

    static func clamped(_ gain: Double) -> Double {
        guard gain.isFinite else { return 1 }
        return min(range.upperBound, max(range.lowerBound, gain))
    }

    /// Le doigt posé à `y` sur une piste de `height` points : en haut 200 %, au
    /// milieu le son tel quel, en bas le silence.
    static func gain(atY y: CGFloat, height: CGFloat) -> Double {
        guard height > 0 else { return 1 }
        return clamped(range.upperBound * (1 - Double(min(max(y / height, 0), 1))))
    }

    /// Où se trace la ligne de volume, depuis le haut de la piste.
    static func lineY(gain: Double, height: CGFloat) -> CGFloat {
        CGFloat(1 - clamped(gain) / range.upperBound) * max(0, height)
    }

    static func stepped(_ gain: Double, up: Bool) -> Double {
        clamped(gain + (up ? accessibilityStep : -accessibilityStep))
    }

    static func percent(_ gain: Double) -> Int {
        Int((clamped(gain) * 100).rounded())
    }
}

/// **Le gain qu'on entend est celui qui part** (#10360) : un gain se sépare en
/// une ATTÉNUATION (0…1, le volume que `AVPlayer` et `AVAudioMix` savent poser)
/// et une AMPLIFICATION (1…2, que seul un tap sur les échantillons sait faire,
/// `ComposerTakeBoostTap`). L'aperçu et le rendu servent cette loi, et elle seule.
///
/// L'amplification s'écrête en DOUCEUR : linéaire jusqu'au genou, puis une
/// tangente hyperbolique qui tend vers la pleine échelle sans jamais l'atteindre —
/// un cri amplifié sature avec rondeur au lieu de craquer.
nonisolated enum ComposerTakeGain {
    /// Au-dessous du genou, l'échantillon amplifié reste tel quel.
    static let knee: Float = 0.8

    /// La part que le volume du lecteur ou du mixage pose : 0…1.
    static func volume(_ gain: Float) -> Float {
        guard gain.isFinite else { return 1 }
        return min(1, max(0, gain))
    }

    /// La part que le tap pose : 1 (rien) … 2.
    static func boost(_ gain: Float) -> Float {
        guard gain.isFinite else { return 1 }
        return max(1, min(Float(ComposerTakeSound.range.upperBound), gain))
    }

    /// Un échantillon amplifié, écrêté en douceur au-delà du genou. Sans
    /// amplification, l'échantillon passe intact.
    static func amplified(_ sample: Float, boost: Float) -> Float {
        guard boost > 1, sample.isFinite else { return sample }
        let porte = sample * boost
        let amplitude = abs(porte)
        guard amplitude > knee else { return porte }
        let marge = 1 - knee
        let doux = knee + marge * tanh((amplitude - knee) / marge)
        return porte < 0 ? -doux : doux
    }
}

/// **La frame EXACTE sous la règle, sans bégaiement** (#9754 : « en bougeant la
/// règle, l'aperçu montre la frame exacte où l'on se trouve »).
///
/// Une recherche à tolérance nulle décode jusqu'à l'image demandée ; en lancer
/// une à chaque image du glissé les ferait s'annuler l'une l'autre et l'aperçu
/// resterait figé. Une seule recherche vole à la fois ; pendant son vol, seule
/// la DERNIÈRE cible demandée attend, et part dès que la précédente aboutit —
/// l'aperçu suit le doigt au rythme du décodeur et finit toujours sur sa
/// dernière position.
nonisolated struct ComposerSeekChase: Equatable, Sendable {
    /// La tolérance de la recherche : aucune — l'image montrée est celle de l'instant.
    static let tolerance = CMTime.zero

    private(set) var inFlight: TimeInterval?
    private(set) var pending: TimeInterval?

    /// Une cible demandée : rend l'instant à chercher MAINTENANT, `nil` si une
    /// recherche vole déjà (la cible attend son tour, en remplaçant la précédente).
    mutating func request(_ time: TimeInterval) -> TimeInterval? {
        guard inFlight == nil else {
            pending = time
            return nil
        }
        inFlight = time
        return time
    }

    /// La recherche en vol a abouti : rend la cible suivante, s'il y en a une.
    mutating func completed() -> TimeInterval? {
        inFlight = nil
        guard let suivante = pending else { return nil }
        pending = nil
        inFlight = suivante
        return suivante
    }

    mutating func reset() {
        inFlight = nil
        pending = nil
    }
}

/// **Le glissé vertical de la retouche montre et cache son chrome** (#10930,
/// porteur 2026-10-18 : « swipe vers le haut : afficher par-dessus la vidéo ou
/// l'image les contrôleurs »). Le doigt cadrait le média dans tous les sens ;
/// il garde le cadrage là où il a un sens — à l'horizontale, sur un média
/// agrandi, et pendant le recadrage, où les bords sont l'objet même du geste.
nonisolated enum ComposerEditSwipe {

    /// La course qui décide ; en deçà, une hésitation ne change rien.
    static let threshold: CGFloat = 48

    enum Mode: Equatable, Sendable {
        case swipe
        case reframe
    }

    enum Outcome: Equatable, Sendable {
        case none
        case reveal
        case hide
    }

    /// Ce que le glissé EST, fixé à son premier pas.
    static func mode(translation: CGSize, zoomed: Bool, cropping: Bool) -> Mode {
        guard !zoomed, !cropping, abs(translation.height) > abs(translation.width) else { return .reframe }
        return .swipe
    }

    /// Ce qu'un glissé de chrome décide à sa levée : le haut montre, le bas cache.
    static func outcome(translationY: CGFloat) -> Outcome {
        if translationY <= -threshold { return .reveal }
        if translationY >= threshold { return .hide }
        return .none
    }
}
