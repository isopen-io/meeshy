import AVFoundation
import Combine
import Foundation
import MeeshySDK

/// Le sens d'une voix du talkie : la mienne qui part, ou celle d'un pair qui arrive.
nonisolated enum TalkieVoiceDirection: Sendable, Equatable {
    case outgoing
    case incoming
}

/// Une voix du registre : une personne, dans un sens. Ma voix vers Bob et celle de Bob vers moi sont deux voix.
nonisolated struct TalkieVoiceKey: Hashable, Sendable {
    let userId: String
    let direction: TalkieVoiceDirection
}

/// LE REGISTRE DES VOIX DU TALKIE, par personne et par sens (#20531) : qui parle, dans quel sens, depuis quand, et
/// les 120 bandes de sa voix, lissées bande par bande (montée rapide, retombée lente : `TalkieWaveLaw.smoothed`).
///
/// Le fil audio écrit les bandes (`push`), la bulle les lit à chaque image (`bands(for:)`), sans rien publier. Seuls
/// le début et la fin d'une voix se publient, par `TalkieVoiceStageObserver`. Une poussée pour une voix qui n'est pas
/// en cours est ignorée : un dernier tampon du fil audio ne rouvre pas une voix close.
///
/// Lue par personne, la voix qui part l'emporte sur celle qui arrive (sens, début), et les bandes sont le maximum des
/// deux sens, bande par bande.
nonisolated final class TalkieVoiceStage: Sendable {
    static let shared = TalkieVoiceStage()

    /// Les voix en cours, numérotées : un observateur ne revient jamais à un état plus ancien.
    nonisolated struct Cast: Equatable, Sendable {
        let version: Int
        let voices: Set<TalkieVoiceKey>
    }

    private nonisolated struct Voice: Sendable {
        let startedAt: Date
        var bands: [Float]

        mutating func blend(_ targets: [Float]) {
            for index in bands.indices where index < targets.count {
                bands[index] = TalkieWaveLaw.smoothed(previous: bands[index], target: targets[index])
            }
        }
    }

    private nonisolated struct State: Sendable {
        var voices: [TalkieVoiceKey: Voice] = [:]
        var version = 0

        var cast: Cast { Cast(version: version, voices: Set(voices.keys)) }

        func voice(_ userId: String, _ direction: TalkieVoiceDirection) -> Voice? {
            voices[TalkieVoiceKey(userId: userId, direction: direction)]
        }
    }

    private static var silence: [Float] { [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount) }

    private let state = Locked(State())
    private let listeners = Locked<[UUID: @Sendable (Cast) -> Void]>([:])

    init() {}

    func begin(userId: String, direction: TalkieVoiceDirection, at startedAt: Date) {
        let key = TalkieVoiceKey(userId: userId, direction: direction)
        let silent = Self.silence
        let cast = state.mutate { state in
            state.voices[key] = Voice(startedAt: startedAt, bands: silent)
            state.version += 1
            return state.cast
        }
        announce(cast)
    }

    /// Les bandes d'une trame se fondent dans celles de la voix ; le tableau reçu n'est pas gardé.
    func push(userId: String, direction: TalkieVoiceDirection, bands: [Float]) {
        let key = TalkieVoiceKey(userId: userId, direction: direction)
        state.mutate { $0.voices[key]?.blend(bands) }
    }

    func end(userId: String, direction: TalkieVoiceDirection) {
        let key = TalkieVoiceKey(userId: userId, direction: direction)
        let cast = state.mutate { state -> Cast? in
            guard state.voices.removeValue(forKey: key) != nil else { return nil }
            state.version += 1
            return state.cast
        }
        guard let cast else { return }
        announce(cast)
    }

    /// Le maximum des deux sens de la personne, bande par bande ; une copie propre au lecteur, que le fil audio n'a
    /// jamais à recopier.
    func bands(for userId: String) -> [Float] {
        let silent = Self.silence
        return state.read { state in
            let outgoing = state.voice(userId, .outgoing)?.bands
            let incoming = state.voice(userId, .incoming)?.bands
            switch (outgoing, incoming) {
            case let (out?, inc?): return zip(out, inc).map { max($0, $1) }
            case let (out?, nil): return out.map { $0 }
            case let (nil, inc?): return inc.map { $0 }
            case (nil, nil): return silent
            }
        }
    }

    func bands(for userId: String, direction: TalkieVoiceDirection) -> [Float] {
        let silent = Self.silence
        return state.read { $0.voice(userId, direction)?.bands.map { $0 } ?? silent }
    }

    func startedAt(for userId: String) -> Date? {
        state.read { ($0.voice(userId, .outgoing) ?? $0.voice(userId, .incoming))?.startedAt }
    }

    func direction(for userId: String) -> TalkieVoiceDirection? {
        state.read { state in
            if state.voice(userId, .outgoing) != nil { return .outgoing }
            return state.voice(userId, .incoming) != nil ? .incoming : nil
        }
    }

    func cast() -> Cast {
        state.read { $0.cast }
    }

    func subscribe(_ id: UUID, _ listener: @escaping @Sendable (Cast) -> Void) {
        listeners.mutate { $0[id] = listener }
    }

    func unsubscribe(_ id: UUID) {
        listeners.mutate { $0[id] = nil }
    }

    private func announce(_ cast: Cast) {
        listeners.read { Array($0.values) }.forEach { $0(cast) }
    }
}

/// Les voix en cours — qui parle, et dans quel sens : publiées au début et à la fin d'une voix, jamais à chaque trame.
/// L'abonnement précède la lecture de l'état initial : une voix qui commence entre les deux n'est pas perdue.
@MainActor
final class TalkieVoiceStageObserver: ObservableObject {
    typealias Cast = TalkieVoiceStage.Cast

    @Published private(set) var voices: Set<TalkieVoiceKey> = []

    private let stage: TalkieVoiceStage
    private let subscription = UUID()
    private var version = -1

    init(stage: TalkieVoiceStage = .shared) {
        self.stage = stage
        stage.subscribe(subscription) { [weak self] cast in
            guard Thread.isMainThread else {
                Task { @MainActor in self?.apply(cast) }
                return
            }
            MainActor.assumeIsolated { self?.apply(cast) }
        }
        apply(stage.cast())
    }

    nonisolated deinit {
        stage.unsubscribe(subscription)
    }

    private func apply(_ cast: Cast) {
        guard cast.version > version else { return }
        version = cast.version
        if voices != cast.voices { voices = cast.voices }
    }
}

/// Les deux briques d'UNE voix (#20531) : le gain qui la normalise (`TalkieVoiceLeveler`), puis l'analyseur qui
/// pousse ses bandes au registre sous `userId` et `direction`. Un changement de fréquence (route Bluetooth…) recale
/// le gain sans le remettre à zéro, et reconstruit l'analyseur.
///
/// `level` normalise un tampon sur place, tous ses canaux d'un même gain. `publish` analyse le premier canal, pousse
/// au registre une fois le verrou de l'analyseur rendu, et rend la moyenne quadratique. Gain et analyseur ont chacun
/// leur verrou : au lecteur, le gain tourne sur l'acteur principal et l'analyse sur le fil du tap, sans s'attendre.
nonisolated final class TalkieVoiceProcessor: Sendable {
    private nonisolated struct Gain {
        var sampleRate: Double
        let leveler: TalkieVoiceLeveler
    }

    private nonisolated struct Analysis {
        var sampleRate: Double
        var analyzer: TalkieSpectrumAnalyzer
    }

    private let gain: Locked<Gain>
    private let analysis: Locked<Analysis>
    private let userId: String
    private let direction: TalkieVoiceDirection
    private let stage: TalkieVoiceStage

    init(userId: String, direction: TalkieVoiceDirection, sampleRate: Double, stage: TalkieVoiceStage = .shared) {
        gain = Locked(uncheckedState: Gain(sampleRate: sampleRate, leveler: TalkieVoiceLeveler(sampleRate: sampleRate)))
        analysis = Locked(uncheckedState: Analysis(sampleRate: sampleRate, analyzer: TalkieSpectrumAnalyzer(sampleRate: sampleRate)))
        self.userId = userId
        self.direction = direction
        self.stage = stage
    }

    var currentGainDecibels: Float {
        gain.mutateUnchecked { $0.leveler.currentGainDecibels }
    }

    func level(_ buffer: AVAudioPCMBuffer) {
        guard let channels = buffer.floatChannelData else { return }
        let interleaved = buffer.format.isInterleaved
        let channelCount = interleaved ? 1 : Int(buffer.format.channelCount)
        let frameCount = Int(buffer.frameLength) * (interleaved ? Int(buffer.format.channelCount) : 1)
        let rate = buffer.format.sampleRate
        gain.mutateUnchecked { gain in
            if Self.isUsable(rate), rate != gain.sampleRate {
                gain.sampleRate = rate
                gain.leveler.updateSampleRate(rate)
            }
            gain.leveler.process(channels: channels, channelCount: channelCount, frameCount: frameCount)
        }
    }

    @discardableResult
    func publish(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let samples = UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength))
        let rate = buffer.format.sampleRate
        let bands = analysis.mutateUnchecked { analysis in
            if Self.isUsable(rate), rate != analysis.sampleRate {
                analysis.sampleRate = rate
                analysis.analyzer = TalkieSpectrumAnalyzer(sampleRate: rate)
            }
            return analysis.analyzer.bands(samples)
        }
        stage.push(userId: userId, direction: direction, bands: bands)
        return TalkieWaveLaw.rms(samples)
    }

    private static func isUsable(_ rate: Double) -> Bool {
        rate.isFinite && rate > 0
    }
}
