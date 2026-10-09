import CoreGraphics
import CoreMedia
import Foundation

/// Un outil du mode édition d'une prise, au-delà des familles de looks.
nonisolated enum ComposerEditTool: Equatable, Hashable, Sendable, CaseIterable {
    /// Les équerres autour de l'image, et les proportions par presets.
    case crop
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
        case .photo: return [.crop]
        case .video(let son): return son ? [.crop, .trim, .sound] : [.crop, .trim]
        case .audio: return [.trim, .sound]
        }
    }

    /// Tout ce qui est offert est actif à l'entrée.
    static func initial(_ take: ComposerEditTake) -> Set<ComposerEditTool> {
        Set(offered(take))
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
        isShown(tool, active: active, familyOpen: familyOpen) ? active.subtracting([tool]) : active.union([tool])
    }

    /// L'ordre des panneaux sous la scène, de haut en bas : les proportions, le
    /// spectre, puis la coupe, au plus près des outils.
    static let panelOrder: [ComposerEditTool] = [.crop, .sound, .trim]

    /// Les panneaux sous la scène : la bande d'une famille ouverte, sinon un par
    /// outil actif.
    static func panels(familyOpen: Bool, active: Set<ComposerEditTool>) -> [ComposerEditPanel] {
        guard !familyOpen else { return [.band] }
        return panelOrder.filter(active.contains).map(panel(for:))
    }

    static func panel(for tool: ComposerEditTool) -> ComposerEditPanel {
        switch tool {
        case .crop: return .presets
        case .trim: return .trim
        case .sound: return .sound
        }
    }

    /// Les équerres suivent Crop, et lui seul.
    static func showsBrackets(active: Set<ComposerEditTool>) -> Bool {
        active.contains(.crop)
    }

    /// **Le bouton muet se pose à DROITE d'UNE piste** : celle du spectre si
    /// elle est montrée, sinon celle de la coupe — dès que la prise a un son.
    static func muteHost(panels: [ComposerEditPanel], hasAudio: Bool) -> ComposerEditPanel? {
        guard hasAudio else { return nil }
        return panels.first { $0 == .sound } ?? panels.first { $0 == .trim }
    }

    /// Les deux pistes du temps gardent la même largeur : celle qui ne porte pas
    /// le bouton muet réserve sa place, et leurs instants s'alignent.
    static func reservesMuteColumn(_ panel: ComposerEditPanel, panels: [ComposerEditPanel], hasAudio: Bool) -> Bool {
        guard panel == .trim || panel == .sound, let hote = muteHost(panels: panels, hasAudio: hasAudio) else {
            return false
        }
        return hote != panel
    }
}

/// **Le son de la prise** (#9754) : un gain réglé à la ligne de volume, et un
/// muet qui le coupe tout à fait sans l'oublier — réactiver rend le gain d'avant.
/// L'aperçu l'entend et le rendu final le grave (`videoRender`, une seule recette).
///
/// Le gain va de 0 à 100 % : `AVAudioMix` et `AVPlayer` ne savent pas amplifier
/// au-delà du niveau enregistré.
nonisolated struct ComposerTakeSound: Equatable, Sendable {
    static let range: ClosedRange<Double> = 0...1
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

    /// Le doigt posé à `y` sur une piste de `height` points : en haut le plein,
    /// en bas le silence.
    static func gain(atY y: CGFloat, height: CGFloat) -> Double {
        guard height > 0 else { return 1 }
        return clamped(1 - Double(min(max(y / height, 0), 1)))
    }

    /// Où se trace la ligne de volume, depuis le haut de la piste.
    static func lineY(gain: Double, height: CGFloat) -> CGFloat {
        CGFloat(1 - clamped(gain)) * max(0, height)
    }

    static func stepped(_ gain: Double, up: Bool) -> Double {
        clamped(gain + (up ? accessibilityStep : -accessibilityStep))
    }

    static func percent(_ gain: Double) -> Int {
        Int((clamped(gain) * 100).rounded())
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
