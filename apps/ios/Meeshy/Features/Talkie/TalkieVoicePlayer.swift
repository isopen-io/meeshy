import AVFoundation
import Foundation
import MeeshySDK

/// La voix d'un talkie, fragment par fragment (#16673). Chaque fragment AAC ADTS est autonome (ses trames portent leur
/// en-tête) : il se décode seul et se planifie À LA SUITE du précédent sur le nœud de sa prise de parole, derrière un
/// court tampon de gigue. Le lecteur des vocaux lit des fichiers entiers ; celui-ci joue dès le premier fragment.
///
/// - Sur la sortie intégrée, la voix sort sur le HAUT-PARLEUR avec un gain ×2 ; avec des écouteurs, un casque ou des
///   AirPods, ni redirection ni gain (#17087, `TalkieOutputPlan`). Un changement de sortie en pleine prise de parole
///   réapplique la règle aussitôt.
/// - Le bouton silencieux est RESPECTÉ : quand rien d'autre ne joue dans l'app, la session passe en `.ambient`, qui se
///   tait en mode silencieux et se mêle à la musique d'une autre app sans la couper. Quand l'app joue déjà (un vocal,
///   une story), sa catégorie est gardée : le talkie ne casse pas ce qui sonne.
/// - Pendant un appel, rien ne sort : la passerelle coupe déjà (`cut`), et la session reste à l'appel.
@MainActor
final class TalkieVoicePlayer: TalkieSink {

    /// Le tampon de gigue avant le premier fragment : assez pour que le second arrive avant la fin du premier.
    private static let jitter: TimeInterval = 0.08

    private struct Voice {
        let node: AVAudioPlayerNode
        var pending = 0
        /// Rien de plus n'arrivera : la file finit de sonner, puis se libère.
        var released = false
    }

    private let engine = AVAudioEngine()
    private let voicesMixer = AVAudioMixerNode()
    private let booster = AVAudioUnitEQ(numberOfBands: 0)
    private var voices: [String: Voice] = [:]
    private var observers: [NSObjectProtocol] = []
    private let isInCall: () -> Bool

    nonisolated deinit {}

    init(isInCall: @escaping () -> Bool = { CallManager.isCallActiveFlag }) {
        self.isInCall = isInCall
        engine.attach(voicesMixer)
        engine.attach(booster)
        engine.connect(voicesMixer, to: booster, format: nil)
        engine.connect(booster, to: engine.mainMixerNode, format: nil)
    }

    func play(_ talkieId: String, _ data: Data) {
        guard !isInCall(), let buffer = TalkieAdtsDecoder.pcm(data) else { return }
        if voices.isEmpty { prepareOutput() }
        var voice = voices[talkieId] ?? attachVoice(format: buffer.format)
        guard !voice.released, startEngineIfNeeded() else { return }
        voice.pending += 1
        voices[talkieId] = voice
        let finished: @Sendable (AVAudioPlayerNodeCompletionCallbackType) -> Void = { [weak self] _ in
            Task { @MainActor in self?.finished(talkieId) }
        }
        voice.node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack, completionHandler: finished)
        if !voice.node.isPlaying {
            voice.node.play(at: AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: Self.jitter)))
        }
    }

    func silence(_ talkieId: String) {
        guard let voice = voices.removeValue(forKey: talkieId) else { return }
        detach(voice)
        releaseOutputIfIdle()
    }

    func release(_ talkieId: String) {
        guard var voice = voices[talkieId] else { return }
        voice.released = true
        voices[talkieId] = voice
        if voice.pending == 0 { drain(talkieId) }
    }

    // MARK: - Voix

    private func attachVoice(format: AVAudioFormat) -> Voice {
        let node = AVAudioPlayerNode()
        engine.attach(node)
        engine.connect(node, to: voicesMixer, format: format)
        return Voice(node: node)
    }

    private func finished(_ talkieId: String) {
        guard var voice = voices[talkieId] else { return }
        voice.pending = max(0, voice.pending - 1)
        voices[talkieId] = voice
        if voice.released, voice.pending == 0 { drain(talkieId) }
    }

    private func drain(_ talkieId: String) {
        guard let voice = voices.removeValue(forKey: talkieId) else { return }
        detach(voice)
        releaseOutputIfIdle()
    }

    private func detach(_ voice: Voice) {
        voice.node.stop()
        engine.detach(voice.node)
    }

    // MARK: - Sortie

    private func prepareOutput() {
        let session = AVAudioSession.sharedInstance()
        if session.category == .soloAmbient {
            try? session.setCategory(.ambient)
        }
        try? session.setActive(true)
        applyOutputPlan()
        observeOutputChanges()
    }

    private func applyOutputPlan() {
        let session = AVAudioSession.sharedInstance()
        let plan = TalkieOutputPlan.decide(outputs: session.currentRoute.outputs.map(\.portType))
        if plan.routesToSpeaker, session.category == .playAndRecord {
            try? session.overrideOutputAudioPort(.speaker)
        }
        booster.globalGain = plan.gainDecibels
    }

    private func startEngineIfNeeded() -> Bool {
        guard !engine.isRunning else { return true }
        engine.prepare()
        return (try? engine.start()) != nil
    }

    private func observeOutputChanges() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        let reapply: @Sendable (Notification) -> Void = { [weak self] _ in
            Task { @MainActor in self?.outputChanged() }
        }
        observers = [
            center.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil, using: reapply),
            center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil, using: reapply),
        ]
    }

    private func outputChanged() {
        guard !voices.isEmpty else { return }
        applyOutputPlan()
        _ = startEngineIfNeeded()
    }

    private func releaseOutputIfIdle() {
        guard voices.isEmpty else { return }
        engine.stop()
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        guard AVAudioSession.sharedInstance().category == .ambient else { return }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

/// Un fragment AAC ADTS décodé en PCM : écrit le temps de sa lecture, lu par `AVAudioFile`, qui reconnaît l'ADTS.
nonisolated enum TalkieAdtsDecoder {
    static func pcm(_ data: Data) -> AVAudioPCMBuffer? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("talkie-\(UUID().uuidString).aac")
        defer { try? FileManager.default.removeItem(at: url) }
        guard (try? data.write(to: url)) != nil,
              let file = try? AVAudioFile(forReading: url),
              file.length > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length)),
              (try? file.read(into: buffer)) != nil else { return nil }
        return buffer
    }
}
