import CoreGraphics
import Foundation
import MeeshySDK

/// La voix qui occupe l'en-tête d'un direct (#17310) : la mienne qui part, celle du pair qui arrive, ou aucune.
nonisolated enum TalkieHeaderVoice: Equatable, Sendable {
    case none
    case outgoing
    case incoming

    /// La voix qui part l'emporte : on ne parle pas par-dessus sans le voir. Un doigt posé dont la voix n'est pas
    /// encore partie laisse l'en-tête au repos — un simple toucher ne fait pas clignoter la barre.
    static func resolve(look: TalkieHoldLook, peerSpeaking: Bool) -> TalkieHeaderVoice {
        if look == .live { return .outgoing }
        return peerSpeaking ? .incoming : .none
    }
}

/// Ce que la voix devient pendant qu’on parle (#17337) — visible AVANT la fin : entendue à l'instant, ou gardée
/// pour plus tard parce que l'autre est hors ligne.
nonisolated enum TalkieHeaderDelivery: Equatable, Sendable {
    /// L'autre écoute en ce moment : l'onde montre ce qui se dit, sur place.
    case live
    /// L'autre est hors ligne : la passerelle le réveille et lui rejouera la voix.
    case relayed
    /// Le talkie n'a pas pu passer : la voix s'enregistre et partira en message vocal.
    case recorded

    var isRealtime: Bool { self == .live }

    /// Une voix qui arrive s'entend toujours en direct ; celle qui part suit ce que la passerelle a répondu.
    static func resolve(voice: TalkieHeaderVoice, phase: TalkieSender.Phase, waking: Bool) -> TalkieHeaderDelivery {
        guard voice == .outgoing else { return .live }
        if case .recordingCopy = phase { return .recorded }
        return waking ? .relayed : .live
    }
}

/// Ce que l'en-tête montre selon la voix du talkie (#17310) : au repos, tout ; une voix en cours, le talkie prend
/// toute la barre — retour, identité et actions lui cèdent la place. Le (i) du talkie ne vit que sur la fiche.
nonisolated struct ConversationHeaderTalkieChrome: Equatable, Sendable {
    let showsBackButton: Bool
    let showsIdentity: Bool
    let showsActions: Bool
    let talkieSpansBar: Bool

    static func resolve(voice: TalkieHeaderVoice) -> ConversationHeaderTalkieChrome {
        let rest = voice == .none
        return ConversationHeaderTalkieChrome(
            showsBackButton: rest, showsIdentity: rest, showsActions: rest, talkieSpansBar: !rest
        )
    }
}

/// Niveau mesuré → hauteur des barres de l'onde (#17310), borné et lissé.
nonisolated enum TalkieWaveLaw {
    /// En deçà, c'est le silence ; 0 dBFS est le plafond.
    static let floorDecibels: Float = -50
    /// Montée rapide, descente lente : l'onde suit l'attaque d'une syllabe sans trembler entre deux.
    static let attack: Float = 0.55
    static let release: Float = 0.12

    /// La moyenne quadratique d'un tampon PCM, appelée sur le fil audio.
    static func rms(_ samples: UnsafeBufferPointer<Float>) -> Float {
        guard !samples.isEmpty else { return 0 }
        let energy = samples.reduce(Float(0)) { $0 + $1 * $1 }
        return (energy / Float(samples.count)).squareRoot()
    }

    /// 0 au plancher, 1 à pleine échelle, linéaire en décibels.
    static func normalized(rms: Float) -> Float {
        guard !rms.isNaN, rms > 0 else { return 0 }
        let decibels = 20 * log10(rms)
        return clamp((decibels - floorDecibels) / -floorDecibels)
    }

    static func smoothed(previous: Float, target: Float) -> Float {
        let goal = clamp(target)
        let from = clamp(previous)
        let rate = goal > from ? attack : release
        return clamp(from + (goal - from) * rate)
    }

    static func barCount(width: CGFloat, barWidth: CGFloat, gap: CGFloat) -> Int {
        let pitch = max(barWidth + gap, 1)
        let fitting = Int(((width + gap) / pitch).rounded(.down))
        return min(max(fitting, 1), TalkieWaveTrail.capacity)
    }

    /// Les `barCount` derniers niveaux, le plus récent à droite ; ce qui manque à gauche est du silence.
    static func barHeights(levels: [Float], barCount: Int, minHeight: CGFloat, maxHeight: CGFloat) -> [CGFloat] {
        let count = max(barCount, 0)
        let recent = Array(levels.suffix(count))
        let padded = Array(repeating: Float(0), count: count - recent.count) + recent
        return padded.map { minHeight + (maxHeight - minHeight) * CGFloat(clamp($0)) }
    }

    /// L'onde du direct : un spectre miroir centré sur la voix de l'instant. Le centre mène, les bords suivent, et une
    /// houle propre à chaque distance au centre l'anime sans briser la symétrie. Le silence pose toutes les barres au
    /// plancher.
    static func mirroredBarHeights(level: Float, barCount: Int, time: TimeInterval, minHeight: CGFloat, maxHeight: CGFloat) -> [CGFloat] {
        let count = max(barCount, 0)
        guard count > 0 else { return [] }
        let voice = Double(clamp(level))
        let centre = Double(count - 1) / 2
        let reach = max(centre, 1)
        return (0..<count).map { index in
            let distance = abs(Double(index) - centre)
            let envelope = 0.3 + 0.7 * pow(cos(distance / reach * .pi / 2), 2)
            let swell = 0.78 + 0.22 * sin(time * 8.3 + distance * 1.9) * cos(time * 4.7 - distance * 0.8)
            let fill = min(max(voice * envelope * swell, 0), 1)
            return minHeight + (maxHeight - minHeight) * CGFloat(fill)
        }
    }

    private static func clamp(_ value: Float) -> Float {
        guard !value.isNaN else { return 0 }
        return min(max(value, 0), 1)
    }
}

/// La traîne de l'onde : le niveau lissé à chaque image, et un pas d'histoire à cadence fixe — l'onde défile au
/// même rythme à 60 comme à 120 Hz. Bornée.
nonisolated struct TalkieWaveTrail: Equatable, Sendable {
    static let capacity = 72
    static let step: TimeInterval = 1.0 / 30

    private(set) var levels: [Float] = []
    private var smoothed: Float = 0
    private var lastStep: Date?

    mutating func advance(to date: Date, level: Float) {
        smoothed = TalkieWaveLaw.smoothed(previous: smoothed, target: level)
        if let lastStep, date.timeIntervalSince(lastStep) < Self.step { return }
        lastStep = date
        levels = Array((levels + [smoothed]).suffix(Self.capacity))
    }
}

/// Lit le niveau d'une voix, normalisé entre 0 et 1, depuis n'importe quel fil.
nonisolated protocol TalkieLevelReading: Sendable {
    var level: Float { get }
}

/// Publie le niveau d'une voix depuis le fil audio (micro qui capte, mixeur qui joue).
nonisolated protocol TalkieLevelMetering: TalkieLevelReading {
    func push(rms: Float)
    func reset()
}

/// Le niveau d'une voix du talkie, écrit par le fil audio et lu par l'onde à chaque image, sans rien publier :
/// l'en-tête ne se re-rend pas pour lui.
nonisolated final class TalkieLevelMeter: TalkieLevelMetering {
    static let outgoing = TalkieLevelMeter()
    static let incoming = TalkieLevelMeter()

    private let state = Locked<Float>(0)

    var level: Float { state.read { $0 } }

    func push(rms: Float) {
        let normalized = TalkieWaveLaw.normalized(rms: rms)
        state.mutate { $0 = normalized }
    }

    func reset() {
        state.mutate { $0 = 0 }
    }
}
