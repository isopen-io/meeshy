import AVFoundation
import Combine
import Foundation
import MeeshySDK

/// Le sens d'une voix du talkie : la mienne qui part, ou celle d'un pair qui arrive.
nonisolated enum TalkieVoiceDirection: Sendable, Equatable {
    case outgoing
    case incoming
}

/// LE REGISTRE DES VOIX DU TALKIE, par personne (#20531) : qui parle, dans quel sens, depuis quand, et les 120 bandes
/// de sa voix, lissées bande par bande (montée rapide, retombée lente : `TalkieWaveLaw.smoothed`).
///
/// Le fil audio écrit les bandes (`push`), la bulle les lit à chaque image (`bands(for:)`), sans rien publier. Seuls
/// le début et la fin d'une voix se publient, par `TalkieVoiceStageObserver`. Une poussée pour une personne sans voix
/// en cours est ignorée : un dernier tampon du fil audio ne rouvre pas une voix close.
nonisolated final class TalkieVoiceStage: Sendable {
    static let shared = TalkieVoiceStage()

    /// Qui parle et dans quel sens, numéroté : un observateur ne revient jamais à un état plus ancien.
    nonisolated struct Cast: Equatable, Sendable {
        let version: Int
        let voices: [String: TalkieVoiceDirection]
    }

    private nonisolated struct Voice: Sendable {
        let direction: TalkieVoiceDirection
        let startedAt: Date
        var bands: [Float]

        mutating func blend(_ targets: [Float]) {
            for index in bands.indices where index < targets.count {
                bands[index] = TalkieWaveLaw.smoothed(previous: bands[index], target: targets[index])
            }
        }
    }

    private nonisolated struct State: Sendable {
        var voices: [String: Voice] = [:]
        var version = 0

        var cast: Cast { Cast(version: version, voices: voices.mapValues(\.direction)) }
    }

    private let state = Locked(State())
    private let listeners = Locked<[UUID: @Sendable (Cast) -> Void]>([:])

    init() {}

    func begin(userId: String, direction: TalkieVoiceDirection, at startedAt: Date) {
        let silent = [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount)
        let cast = state.mutate { state in
            state.voices[userId] = Voice(direction: direction, startedAt: startedAt, bands: silent)
            state.version += 1
            return state.cast
        }
        announce(cast)
    }

    /// Les bandes d'une trame se fondent dans celles de la voix ; le tableau reçu n'est pas gardé.
    func push(userId: String, bands: [Float]) {
        state.mutate { $0.voices[userId]?.blend(bands) }
    }

    func end(userId: String) {
        let cast = state.mutate { state -> Cast? in
            guard state.voices.removeValue(forKey: userId) != nil else { return nil }
            state.version += 1
            return state.cast
        }
        guard let cast else { return }
        announce(cast)
    }

    /// Une copie propre au lecteur : le fil audio n'a jamais à recopier ce qu'un lecteur tient encore.
    func bands(for userId: String) -> [Float] {
        state.read { state in
            state.voices[userId].map { $0.bands.map { $0 } }
        } ?? [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount)
    }

    func startedAt(for userId: String) -> Date? {
        state.read { $0.voices[userId]?.startedAt }
    }

    func direction(for userId: String) -> TalkieVoiceDirection? {
        state.read { $0.voices[userId]?.direction }
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

/// Qui parle en ce moment, et dans quel sens : publié au début et à la fin d'une voix, jamais à chaque trame.
@MainActor
final class TalkieVoiceStageObserver: ObservableObject {
    @Published private(set) var voices: [String: TalkieVoiceDirection]

    private let stage: TalkieVoiceStage
    private let subscription = UUID()
    private var version: Int

    init(stage: TalkieVoiceStage = .shared) {
        let current = stage.cast()
        self.stage = stage
        voices = current.voices
        version = current.version
        stage.subscribe(subscription) { [weak self] cast in
            guard Thread.isMainThread else {
                Task { @MainActor in self?.apply(cast) }
                return
            }
            MainActor.assumeIsolated { self?.apply(cast) }
        }
    }

    nonisolated deinit {
        stage.unsubscribe(subscription)
    }

    private func apply(_ cast: Cast) {
        guard cast.version > version else { return }
        version = cast.version
        if voices != cast.voices { voices = cast.voices }
    }

    typealias Cast = TalkieVoiceStage.Cast
}

/// Les deux briques d'UNE voix, sur son fil audio (#20531) : le gain qui la normalise (`TalkieVoiceLeveler`), puis
/// l'analyseur qui pousse ses bandes au registre sous `userId`. Un changement de fréquence (route Bluetooth…) recale
/// le gain sans le remettre à zéro et reconstruit l'analyseur.
///
/// Un tampon passe par `level` (sur place), puis, une fois parti vers l'encodeur ou le nœud de lecture, par
/// `publish`, qui rend sa moyenne quadratique. Seul le premier canal est traité.
nonisolated final class TalkieVoiceProcessor: Sendable {
    private nonisolated struct Bricks {
        var sampleRate: Double
        let leveler: TalkieVoiceLeveler
        var analyzer: TalkieSpectrumAnalyzer
    }

    private let bricks: Locked<Bricks>
    private let userId: String
    private let stage: TalkieVoiceStage

    init(userId: String, sampleRate: Double, stage: TalkieVoiceStage = .shared) {
        bricks = Locked(uncheckedState: Bricks(
            sampleRate: sampleRate,
            leveler: TalkieVoiceLeveler(sampleRate: sampleRate),
            analyzer: TalkieSpectrumAnalyzer(sampleRate: sampleRate)
        ))
        self.userId = userId
        self.stage = stage
    }

    func level(_ buffer: AVAudioPCMBuffer) {
        guard let channel = buffer.floatChannelData?[0] else { return }
        let samples = UnsafeMutableBufferPointer(start: channel, count: Int(buffer.frameLength))
        let rate = buffer.format.sampleRate
        bricks.mutateUnchecked { bricks in
            if rate.isFinite, rate > 0, rate != bricks.sampleRate {
                bricks.sampleRate = rate
                bricks.leveler.updateSampleRate(rate)
                bricks.analyzer = TalkieSpectrumAnalyzer(sampleRate: rate)
            }
            bricks.leveler.process(samples)
        }
    }

    @discardableResult
    func publish(_ buffer: AVAudioPCMBuffer) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let samples = UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength))
        let userId = self.userId
        let stage = self.stage
        bricks.mutateUnchecked { bricks in
            stage.push(userId: userId, bands: bricks.analyzer.bands(samples))
        }
        return TalkieWaveLaw.rms(samples)
    }
}
