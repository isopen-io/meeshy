import CoreGraphics
import Foundation
import MeeshySDK

/// Ce qu'une image remet aux déclencheurs : le visage suivi, un toucher reçu
/// depuis l'image précédente, le niveau de la voix (0 à 1), l'horloge de la lens
/// (secondes depuis qu'elle est posée).
public nonisolated struct LensSignals: Sendable, Equatable {
    public let face: LensFaceFrame?
    public let tapped: Bool
    public let voiceLevel: Double
    public let seconds: Double

    public init(face: LensFaceFrame?, tapped: Bool = false, voiceLevel: Double = 0, seconds: Double) {
        self.face = face
        self.tapped = tapped
        self.voiceLevel = voiceLevel
        self.seconds = seconds
    }
}

public nonisolated enum LensGesture: String, Sendable, CaseIterable {
    case mouthOpen
    case blink
    case smile
    case browRaise
    case speaking
}

/// Un seuil à deux bords : le geste ENTRE au-delà de `enter` et ne SORT qu'en
/// deçà de `exit`. Entre les deux, il garde son état — une gigue au seuil ne
/// déclenche qu'une fois.
public nonisolated struct LensHysteresis: Sendable, Equatable {
    public let enter: Double
    public let exit: Double

    func holds(_ value: Double?, wasActive: Bool, rising: Bool) -> Bool {
        guard let value else { return false }
        let threshold = wasActive ? exit : enter
        return rising ? value > threshold : value < threshold
    }
}

/// **LES GESTES, LUS SUR DES RATIOS DE REPÈRES** (#11301). Tout se mesure dans la
/// boîte du visage, donc à toute distance de l'objectif. Seuils argumentés, non
/// mesurés : à calibrer sur appareil.
public nonisolated enum LensGestureReader {
    /// Hauteur / largeur des lèvres intérieures : closes vers 0,05, la parole sous 0,33.
    public static let mouthOpen = LensHysteresis(enter: LensFaceTriggers.mouthOpenRatio, exit: 0.25)
    /// Hauteur / largeur de CHAQUE œil : ouvert vers 0,3.
    public static let eyesClosed = LensHysteresis(enter: LensFaceTriggers.eyeClosedRatio, exit: 0.22)
    /// Largeur de la bouche / largeur du visage : neutre vers 0,40.
    public static let smile = LensHysteresis(enter: 0.50, exit: 0.44)
    /// Écart vertical sourcils – yeux / hauteur du visage : neutre vers 0,10.
    public static let browRaise = LensHysteresis(enter: 0.16, exit: 0.12)
    /// Niveau de la voix.
    public static let speaking = LensHysteresis(enter: 0.12, exit: 0.05)

    public static func read(_ signals: LensSignals, previous: Set<LensGesture>) -> Set<LensGesture> {
        let voice = speaking.holds(signals.voiceLevel, wasActive: previous.contains(.speaking), rising: true)
        let face = signals.face.map { faceGestures($0, previous: previous) } ?? []
        return voice ? face.union([.speaking]) : face
    }

    /// De profil, les ratios mentent : tête tournée, aucun geste du visage.
    private static func faceGestures(_ face: LensFaceFrame, previous: Set<LensGesture>) -> Set<LensGesture> {
        guard abs(face.yaw ?? 0) <= LensFaceTriggers.turnRadians else { return [] }
        let eyes = [LensFaceTriggers.opening(of: face.leftEye), LensFaceTriggers.opening(of: face.rightEye)]
        let blinking = previous.contains(.blink)
        let closed = eyes.allSatisfy { eyesClosed.holds($0, wasActive: blinking, rising: false) }
        let lus: [(LensGesture, Bool)] = [
            (.mouthOpen, mouthOpen.holds(LensFaceTriggers.opening(of: face.innerLips), wasActive: previous.contains(.mouthOpen), rising: true)),
            (.blink, closed),
            (.smile, smile.holds(width(of: face.outerLips), wasActive: previous.contains(.smile), rising: true)),
            (.browRaise, browRaise.holds(browGap(face), wasActive: previous.contains(.browRaise), rising: true)),
        ]
        return Set(lus.filter { $0.1 }.map { $0.0 })
    }

    /// Largeur d'une région, en largeurs de visage (les repères sont normalisés à la boîte).
    static func width(of region: [CGPoint]) -> Double? {
        guard let left = region.map(\.x).min(), let right = region.map(\.x).max(), right > left else { return nil }
        return Double(right - left)
    }

    /// L'écart moyen des sourcils au-dessus des yeux, en hauteurs de visage (repère de Vision, y vers le haut).
    static func browGap(_ face: LensFaceFrame) -> Double? {
        let brows = face.leftEyebrow + face.rightEyebrow
        let eyes = face.leftEye + face.rightEye
        guard !brows.isEmpty, !eyes.isEmpty else { return nil }
        let mean = { (points: [CGPoint]) in Double(points.map(\.y).reduce(0, +)) / Double(points.count) }
        return mean(brows) - mean(eyes)
    }
}

/// Une action qui attend son heure (`delay` d'un déclencheur).
public nonisolated struct LensPendingAction: Sendable, Equatable {
    public let at: Double
    public let action: LensTriggerAction
    public let target: String
}

/// **L'ÉTAT DES DÉCLENCHEURS D'UNE LENS** — une valeur, remplacée à chaque image.
public nonisolated struct LensTriggerState: Sendable, Equatable {
    public let gestures: Set<LensGesture>
    public let hidden: Set<String>
    /// Le début de la dernière rafale de chaque couche.
    public let bursts: [String: Double]
    public let pending: [LensPendingAction]
    /// Les déclencheurs `onTime` déjà partis, par rang.
    public let firedTimers: Set<Int>

    /// Une couche qu'un déclencheur MONTRE, fait JAILLIR ou JOUE attend son
    /// déclencheur ; une couche qu'il cache est visible d'abord.
    public static func initial(for lens: LensDocument) -> LensTriggerState {
        let revealed = lens.triggers.filter { [.show, .burst, .play].contains($0.action) }.map(\.target)
        return LensTriggerState(gestures: [], hidden: Set(revealed), bursts: [:], pending: [], firedTimers: [])
    }
}

/// **LES DÉCLENCHEURS SIMPLES** (#11301) — `onTap`, `onTime`, et le FRONT MONTANT
/// de chaque geste (`onSmile`, `onMouthOpen`, `onBrowRaise`, `onBlink`,
/// `onSpeaking`) : un sourire qui dure ne relance rien. `show`/`play` montrent
/// leur couche, `hide`/`stop` la cachent, `burst` la fait jaillir le temps d'une
/// rafale. Pur : l'hôte garde l'état d'une image à l'autre.
public nonisolated enum LensTriggerEngine {
    public static let burstDuration = 1.5

    public static func step(_ state: LensTriggerState, lens: LensDocument, signals: LensSignals) -> LensTriggerState {
        let gestures = LensGestureReader.read(signals, previous: state.gestures)
        let risen = gestures.subtracting(state.gestures)
        let now = signals.seconds
        let timers = lens.triggers.indices.filter { index in
            lens.triggers[index].on == .onTime && !state.firedTimers.contains(index) && now >= (lens.triggers[index].delay ?? 0)
        }
        let fired = lens.triggers.filter { fires($0, risen: risen, tapped: signals.tapped) }
            .map { LensPendingAction(at: now + ($0.delay ?? 0), action: $0.action, target: $0.target) }
            + timers.map { LensPendingAction(at: now, action: lens.triggers[$0].action, target: lens.triggers[$0].target) }
        let queue = state.pending + fired
        let due = queue.filter { $0.at <= now }
        let applied = due.reduce((hidden: state.hidden, bursts: state.bursts)) { result, pending in
            apply(pending, to: result)
        }
        return LensTriggerState(gestures: gestures, hidden: applied.hidden, bursts: applied.bursts,
                                pending: queue.filter { $0.at > now }, firedTimers: state.firedTimers.union(timers))
    }

    /// Les couches que le plan ne pose pas à cet instant (`LensPlanInput.hidden`).
    public static func hiddenLayers(_ state: LensTriggerState, at seconds: Double) -> Set<String> {
        let bursting = state.bursts.filter { seconds >= $0.value && seconds < $0.value + burstDuration }.map(\.key)
        return state.hidden.subtracting(bursting)
    }

    private static func fires(_ trigger: LensTrigger, risen: Set<LensGesture>, tapped: Bool) -> Bool {
        switch trigger.on {
        case .onTap: return tapped
        case .onTime: return false
        case .onSmile: return risen.contains(.smile)
        case .onMouthOpen: return risen.contains(.mouthOpen)
        case .onBrowRaise: return risen.contains(.browRaise)
        case .onBlink: return risen.contains(.blink)
        case .onSpeaking: return risen.contains(.speaking)
        }
    }

    private static func apply(_ pending: LensPendingAction,
                              to state: (hidden: Set<String>, bursts: [String: Double])) -> (hidden: Set<String>, bursts: [String: Double]) {
        switch pending.action {
        case .show, .play:
            return (state.hidden.subtracting([pending.target]), state.bursts)
        case .hide, .stop:
            return (state.hidden.union([pending.target]), state.bursts.filter { $0.key != pending.target })
        case .burst:
            return (state.hidden, state.bursts.merging([pending.target: pending.at]) { _, new in new })
        }
    }
}
