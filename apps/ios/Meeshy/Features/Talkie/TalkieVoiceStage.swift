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
/// Le fil audio écrit des trames DATÉES (`push`, une par fenêtre de 1024 échantillons, à l'heure de l'horloge hôte où
/// elle sonne) dans un anneau de huit trames par voix ; plein, l'anneau lisse la plus ancienne puis l'écrase. Le lissage s'applique
/// dans l'ordre du temps, à mesure que les trames deviennent dues : la bulle lit à chaque image (`bands(for:now:)`)
/// les bandes lissées de la dernière trame dont l'heure est passée, sans rien publier. Rien n'alloue en régime établi,
/// côté fil audio. Seuls
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
        static let capacity = 8
        static let width = TalkieSpectrumAnalyzer.bandCount

        let startedAt: Date
        private(set) var smoothed: [Float]
        private(set) var received = 0
        private var frames: [Float]
        private var times: [TimeInterval]
        private var head = 0
        private var count = 0

        init(startedAt: Date) {
            self.startedAt = startedAt
            smoothed = [Float](repeating: 0, count: Self.width)
            frames = [Float](repeating: 0, count: Self.width * Self.capacity)
            times = [TimeInterval](repeating: 0, count: Self.capacity)
        }

        var pendingTimes: [TimeInterval] {
            (0..<count).map { times[(head + $0) % Self.capacity] }
        }

        /// Anneau plein : la trame la plus ancienne est lissée d'avance avant d'être écrasée — une rafale du tap
        /// (plus de huit fenêtres livrées d'un coup) ne perd aucun spectre, elle n'en avance que le lissage.
        mutating func push(_ bands: [Float], at time: TimeInterval) {
            if count == Self.capacity { consumeOldest() }
            let slot = (head + count) % Self.capacity
            count += 1
            let base = slot * Self.width
            for index in 0..<Self.width {
                frames[base + index] = index < bands.count ? bands[index] : 0
            }
            times[slot] = time
            received += 1
        }

        mutating func advance(to now: TimeInterval) {
            while count > 0, times[head] <= now { consumeOldest() }
        }

        private mutating func consumeOldest() {
            let base = head * Self.width
            for index in 0..<Self.width {
                smoothed[index] = TalkieWaveLaw.smoothed(previous: smoothed[index], target: frames[base + index])
            }
            head = (head + 1) % Self.capacity
            count -= 1
        }
    }

    private nonisolated struct State: Sendable {
        var voices: [TalkieVoiceKey: Voice] = [:]
        var version = 0

        var cast: Cast { Cast(version: version, voices: Set(voices.keys)) }

        func voice(_ userId: String, _ direction: TalkieVoiceDirection) -> Voice? {
            voices[TalkieVoiceKey(userId: userId, direction: direction)]
        }

        mutating func advance(_ userId: String, _ direction: TalkieVoiceDirection, to now: TimeInterval) -> [Float]? {
            let key = TalkieVoiceKey(userId: userId, direction: direction)
            voices[key]?.advance(to: now)
            return voices[key]?.smoothed
        }
    }

    private static var silence: [Float] { [Float](repeating: 0, count: TalkieSpectrumAnalyzer.bandCount) }

    /// L'horloge hôte en secondes, celle des `AVAudioTime` des taps.
    static func hostNow() -> TimeInterval {
        AVAudioTime.seconds(forHostTime: mach_absolute_time())
    }

    /// L'heure d'un tampon de tap ; sans heure hôte valide, l'instant présent.
    static func seconds(of time: AVAudioTime) -> TimeInterval {
        time.isHostTimeValid ? AVAudioTime.seconds(forHostTime: time.hostTime) : hostNow()
    }

    private let state = Locked(State())
    private let listeners = Locked<[UUID: @Sendable (Cast) -> Void]>([:])

    init() {}

    func begin(userId: String, direction: TalkieVoiceDirection, at startedAt: Date) {
        let key = TalkieVoiceKey(userId: userId, direction: direction)
        let cast = state.mutate { state in
            state.voices[key] = Voice(startedAt: startedAt)
            state.version += 1
            return state.cast
        }
        announce(cast)
    }

    /// Une trame qui sonne à `time` (horloge hôte, secondes) rejoint l'anneau de la voix ; le tableau reçu est
    /// recopié, jamais gardé.
    func push(userId: String, direction: TalkieVoiceDirection, bands: [Float], at time: TimeInterval = TalkieVoiceStage.hostNow()) {
        let key = TalkieVoiceKey(userId: userId, direction: direction)
        state.mutate { $0.voices[key]?.push(bands, at: time) }
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

    /// Le maximum des deux sens de la personne, bande par bande, à l'instant `now` ; une copie propre au lecteur,
    /// que le fil audio n'a jamais à recopier.
    func bands(for userId: String, now: TimeInterval = TalkieVoiceStage.hostNow()) -> [Float] {
        let silent = Self.silence
        return state.mutate { state in
            let outgoing = state.advance(userId, .outgoing, to: now)
            let incoming = state.advance(userId, .incoming, to: now)
            switch (outgoing, incoming) {
            case let (out?, inc?): return zip(out, inc).map { max($0, $1) }
            case let (out?, nil): return out.map { $0 }
            case let (nil, inc?): return inc.map { $0 }
            case (nil, nil): return silent
            }
        }
    }

    func bands(for userId: String, direction: TalkieVoiceDirection, now: TimeInterval = TalkieVoiceStage.hostNow()) -> [Float] {
        let silent = Self.silence
        return state.mutate { $0.advance(userId, direction, to: now)?.map { $0 } ?? silent }
    }

    /// Les heures des trames pas encore dues, de la plus ancienne à la plus récente.
    func frameTimes(for userId: String, direction: TalkieVoiceDirection) -> [TimeInterval] {
        state.read { $0.voice(userId, direction)?.pendingTimes ?? [] }
    }

    /// Le nombre de trames reçues depuis le début de la voix, écrasées comprises.
    func receivedFrames(for userId: String, direction: TalkieVoiceDirection) -> Int {
        state.read { $0.voice(userId, direction)?.received ?? 0 }
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

/// Les deux briques d'UNE voix (#20531) : le gain qui la normalise (`TalkieVoiceLeveler`), puis l'analyse qui pousse
/// ses trames datées au registre sous `userId` et `direction`. Un changement de fréquence (route Bluetooth…) recale le
/// gain sans le remettre à zéro, et reconstruit l'analyseur.
///
/// `level` normalise un tampon sur place, tous ses canaux d'un même gain. `publish` découpe le premier canal en
/// fenêtres de 1024 échantillons (`TalkieSpectrumWindows`, reste reporté au tampon suivant), date chacune depuis
/// l'heure du tampon, la pousse au registre une fois le verrou de l'analyse rendu, et rend la moyenne quadratique du
/// tampon. Gain et analyse ont chacun leur verrou : au lecteur, le gain tourne sur l'acteur principal et l'analyse
/// sur le fil du tap, sans s'attendre.
nonisolated final class TalkieVoiceProcessor: Sendable {
    private nonisolated struct Gain {
        var sampleRate: Double
        let leveler: TalkieVoiceLeveler
    }

    private let gain: Locked<Gain>
    private let analysis: Locked<TalkieSpectrumWindows>
    private let userId: String
    private let direction: TalkieVoiceDirection
    private let stage: TalkieVoiceStage

    init(userId: String, direction: TalkieVoiceDirection, sampleRate: Double, stage: TalkieVoiceStage = .shared) {
        gain = Locked(uncheckedState: Gain(sampleRate: sampleRate, leveler: TalkieVoiceLeveler(sampleRate: sampleRate)))
        analysis = Locked(uncheckedState: TalkieSpectrumWindows(sampleRate: sampleRate))
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
            if rate.isFinite, rate > 0, rate != gain.sampleRate {
                gain.sampleRate = rate
                gain.leveler.updateSampleRate(rate)
            }
            gain.leveler.process(channels: channels, channelCount: channelCount, frameCount: frameCount)
        }
    }

    /// `time` : l'heure hôte, en secondes, du premier échantillon du tampon (`TalkieVoiceStage.seconds(of:)`).
    @discardableResult
    func publish(_ buffer: AVAudioPCMBuffer, at time: TimeInterval) -> Float {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let samples = UnsafeBufferPointer(start: channel, count: Int(buffer.frameLength))
        let rate = buffer.format.sampleRate
        analysis.mutateUnchecked { $0.feed(samples, sampleRate: rate, at: time) }
        while let window = analysis.mutateUnchecked({ $0.next() }) {
            stage.push(userId: userId, direction: direction, bands: window.bands, at: window.time)
        }
        return TalkieWaveLaw.rms(samples)
    }
}
