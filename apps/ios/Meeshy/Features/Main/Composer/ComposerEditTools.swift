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

/// **Les outils du mode édition — chacun affiche ou masque SA surface**
/// (#9754, directive porteur 2026-10-09).
///
/// > « Crop : un outil qui fait apparaître ou disparaître les équerres autour de
/// > l'image. Mute : fait apparaître en couleur le spectre vocal et une ligne de
/// > volume […] plus un bouton à DROITE de la barre de trim pour couper
/// > totalement le son ou le réactiver. Trim : affiche ou masque la barre de
/// > coupure de la prise. »
///
/// Un outil à la fois, et une famille de looks ouverte replie l'outil : un
/// seul panneau vit sous la scène. Rien n'est ouvert à l'entrée en retouche —
/// l'écran respire, et le premier toucher dit ce qu'on veut régler.
nonisolated enum ComposerEditTools {

    /// Ce qu'une prise offre : la photo se recadre ; la vidéo se recadre et se
    /// coupe ; son son se règle si elle en a un.
    static func offered(isVideo: Bool, hasAudio: Bool) -> [ComposerEditTool] {
        guard isVideo else { return [.crop] }
        return hasAudio ? [.crop, .trim, .sound] : [.crop, .trim]
    }

    /// Toucher un outil l'ouvre ; toucher l'outil ouvert le referme.
    static func toggled(_ open: ComposerEditTool?, tapping tool: ComposerEditTool) -> ComposerEditTool? {
        open == tool ? nil : tool
    }

    /// Le panneau sous la scène : la bande d'une famille ouverte, sinon celui de
    /// l'outil ouvert.
    static func panel(familyOpen: Bool, tool: ComposerEditTool?) -> ComposerEditPanel {
        if familyOpen { return .band }
        switch tool {
        case .crop: return .presets
        case .trim: return .trim
        case .sound: return .sound
        case nil: return .none
        }
    }

    /// Les équerres n'existent que Crop ouvert.
    static func showsBrackets(tool: ComposerEditTool?, familyOpen: Bool) -> Bool {
        tool == .crop && !familyOpen
    }

    /// Le bouton muet se pose à DROITE de la piste — celle de la coupe comme
    /// celle du son — dès que la prise a un son.
    static func offersMuteSwitch(panel: ComposerEditPanel, hasAudio: Bool) -> Bool {
        hasAudio && (panel == .trim || panel == .sound)
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
