import AVFoundation
import Foundation
import MeeshySDK
import os

private extension Logger {
    nonisolated static let talkiePlayer = MeeshyLog.logger(.audioPlayback)
}

/// La voix d'un talkie, fragment par fragment (#16673). Chaque fragment AAC ADTS se décode EN MÉMOIRE par le décodeur
/// de sa prise de parole (`TalkieAdtsStreamDecoder`), qui garde son état d'un fragment à l'autre, et se planifie À LA
/// SUITE du précédent sur le nœud de sa prise de parole, derrière un court tampon de gigue. Le lecteur des vocaux lit
/// des fichiers entiers ; celui-ci joue dès le premier fragment.
///
/// - La sortie se prépare dès l'ANNONCE (`prepare`, #17094) : session et moteur sont prêts quand le premier fragment
///   arrive, au lieu de se lever devant lui. Rien n'enregistre : c'est la sortie seule.
/// - Sur la sortie intégrée, la voix sort sur le HAUT-PARLEUR avec un gain ×2 ; avec des écouteurs, un casque ou des
///   AirPods, ni redirection ni gain (#17087, `TalkieOutputPlan`). Un changement de sortie en pleine prise de parole
///   réapplique la règle aussitôt.
/// - Le bouton silencieux est RESPECTÉ : quand rien d'autre ne joue dans l'app, la session passe en `.ambient`, qui se
///   tait en mode silencieux et se mêle à la musique d'une autre app sans la couper. Quand l'app joue déjà (un vocal,
///   une story), sa catégorie est gardée : le talkie ne casse pas ce qui sonne.
/// - Pendant un appel, rien ne sort : la passerelle coupe déjà (`cut`), et la session reste à l'appel.
@MainActor
final class TalkieVoicePlayer: TalkieSink {

    /// PushToTalk (#17143) : iOS a activé lui-même la session audio pour une voix qui réveille l'app. Le lecteur ne la
    /// reconfigure ni ne la relâche : il joue dedans, puis le dit au canal (`onSystemSessionIdle`) une fois silencieux.
    static var systemActivatedSession = false
    static var onSystemSessionIdle: (() -> Void)?

    /// Le tampon de gigue avant le premier fragment : assez pour que le second arrive avant la fin du premier.
    private static let jitter: TimeInterval = 0.08

    private struct Voice {
        let node: AVAudioPlayerNode
        let decoder: TalkieAdtsStreamDecoder
        let format: AVAudioFormat
        var pending = 0
        /// Rien de plus n'arrivera : la file finit de sonner, puis se libère.
        var released = false
    }

    private let engine = AVAudioEngine()
    private let voicesMixer = AVAudioMixerNode()
    private let booster = AVAudioUnitEQ(numberOfBands: 0)
    private var voices: [String: Voice] = [:]
    /// Les prises de parole annoncées dont aucun fragment n'a encore sonné : elles tiennent la sortie prête.
    private var announced: Set<String> = []
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

    func prepare(_ talkieId: String) {
        guard !isInCall() else { return }
        if isIdle { prepareOutput() }
        announced.insert(talkieId)
        _ = startEngineIfNeeded()
    }

    func play(_ talkieId: String, _ data: Data) {
        guard !isInCall() else { return }
        let startedAt = Date()
        let pristine = voices[talkieId] == nil
        let decoder = voices[talkieId]?.decoder ?? TalkieAdtsStreamDecoder()
        guard let buffer = decoder.pcm(data) else { return }
        let wasWarm = !isIdle && engine.isRunning
        if isIdle { prepareOutput() }
        var voice = voices[talkieId] ?? attachVoice(format: buffer.format, decoder: decoder)
        guard !voice.released, Self.mayPlay(buffer.format, on: voice.format), startEngineIfNeeded() else { return }
        voice.pending += 1
        voices[talkieId] = voice
        announced.remove(talkieId)
        let finished: @Sendable (AVAudioPlayerNodeCompletionCallbackType) -> Void = { [weak self] _ in
            Task { @MainActor in self?.finished(talkieId) }
        }
        voice.node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack, completionHandler: finished)
        if !voice.node.isPlaying {
            voice.node.play(at: AVAudioTime(hostTime: mach_absolute_time() + AVAudioTime.hostTime(forSeconds: Self.jitter)))
        }
        guard pristine else { return }
        let elapsed = Int((Date().timeIntervalSince(startedAt) * 1000).rounded())
        Logger.talkiePlayer.info("talkie · réception · premier fragment planifié en \(elapsed) ms, sortie \(wasWarm ? "prête" : "levée", privacy: .public)")
    }

    func silence(_ talkieId: String) {
        announced.remove(talkieId)
        if let voice = voices.removeValue(forKey: talkieId) { detach(voice) }
        releaseOutputIfIdle()
    }

    func release(_ talkieId: String) {
        guard var voice = voices[talkieId] else {
            announced.remove(talkieId)
            releaseOutputIfIdle()
            return
        }
        voice.released = true
        voices[talkieId] = voice
        if voice.pending == 0 { drain(talkieId) }
    }

    // MARK: - Voix

    private func attachVoice(format: AVAudioFormat, decoder: TalkieAdtsStreamDecoder) -> Voice {
        let node = AVAudioPlayerNode()
        engine.attach(node)
        engine.connect(node, to: voicesMixer, format: format)
        return Voice(node: node, decoder: decoder, format: format)
    }

    /// Un nœud ne joue que le format auquel il est relié : un fragment qui change de format en pleine prise de parole
    /// lèverait une exception d'AVAudioPlayerNode — il est ignoré.
    nonisolated static func mayPlay(_ format: AVAudioFormat, on connected: AVAudioFormat) -> Bool {
        format == connected
    }

    private func finished(_ talkieId: String) {
        guard var voice = voices[talkieId] else { return }
        voice.pending = max(0, voice.pending - 1)
        voices[talkieId] = voice
        if voice.released, voice.pending == 0 { drain(talkieId) }
    }

    private var isIdle: Bool { voices.isEmpty && announced.isEmpty }

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
        if !Self.systemActivatedSession { MediaSessionCoordinator.shared.activateMixableVoicePlayback() }
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
        guard !isIdle else { return }
        applyOutputPlan()
        _ = startEngineIfNeeded()
    }

    private func releaseOutputIfIdle() {
        guard isIdle, engine.isRunning || !observers.isEmpty else { return }
        engine.stop()
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        guard !Self.systemActivatedSession else {
            Self.onSystemSessionIdle?()
            return
        }
        MediaSessionCoordinator.shared.releaseMixableVoicePlayback()
    }
}

/// Le décodeur d'UNE prise de parole (#17094) : les trames ADTS de chaque fragment entrent, en mémoire, dans un même
/// convertisseur AAC → PCM qui garde son état d'un fragment à l'autre. Un fragment décodé seul repartait d'un décodeur
/// vierge — un creux à chaque jointure — et passait par un fichier temporaire.
nonisolated final class TalkieAdtsStreamDecoder {

    private struct Stream {
        let converter: AVAudioConverter
        let input: AVAudioFormat
        let output: AVAudioFormat
        let layout: TalkieAdtsLayout
    }

    private static let framesPerPacket: AVAudioFrameCount = 1024
    private var stream: Stream?

    nonisolated deinit {}

    func pcm(_ data: Data) -> AVAudioPCMBuffer? {
        let frames = TalkieAdtsFrame.split(data)
        guard let layout = frames.first?.layout, let stream = stream(for: layout) else { return nil }
        let packets = frames.filter { $0.layout == layout }.map(\.payload)
        guard let compressed = Self.compressed(packets, format: stream.input),
              let out = AVAudioPCMBuffer(pcmFormat: stream.output, frameCapacity: Self.framesPerPacket * AVAudioFrameCount(packets.count))
        else { return nil }
        var fed = false
        var error: NSError?
        _ = stream.converter.convert(to: out, error: &error) { _, status in
            guard !fed else {
                status.pointee = .noDataNow
                return nil
            }
            fed = true
            status.pointee = .haveData
            return compressed
        }
        return error == nil && out.frameLength > 0 ? out : nil
    }

    private func stream(for layout: TalkieAdtsLayout) -> Stream? {
        if let stream, stream.layout == layout { return stream }
        var description = AudioStreamBasicDescription(
            mSampleRate: layout.sampleRate,
            mFormatID: kAudioFormatMPEG4AAC,
            mFormatFlags: UInt32(MPEG4ObjectID.AAC_LC.rawValue),
            mBytesPerPacket: 0,
            mFramesPerPacket: Self.framesPerPacket,
            mBytesPerFrame: 0,
            mChannelsPerFrame: UInt32(layout.channels),
            mBitsPerChannel: 0,
            mReserved: 0
        )
        guard let input = AVAudioFormat(streamDescription: &description),
              let output = AVAudioFormat(standardFormatWithSampleRate: layout.sampleRate, channels: AVAudioChannelCount(layout.channels)),
              let converter = AVAudioConverter(from: input, to: output) else { return nil }
        let fresh = Stream(converter: converter, input: input, output: output, layout: layout)
        stream = fresh
        return fresh
    }

    private static func compressed(_ packets: [Data], format: AVAudioFormat) -> AVAudioCompressedBuffer? {
        guard let largest = packets.map(\.count).max(), largest > 0 else { return nil }
        let buffer = AVAudioCompressedBuffer(format: format, packetCapacity: AVAudioPacketCount(packets.count), maximumPacketSize: largest)
        guard let descriptions = buffer.packetDescriptions else { return nil }
        var offset = 0
        for (index, packet) in packets.enumerated() {
            packet.withUnsafeBytes { bytes in
                guard let base = bytes.baseAddress else { return }
                buffer.data.advanced(by: offset).copyMemory(from: base, byteCount: packet.count)
            }
            descriptions[index] = AudioStreamPacketDescription(mStartOffset: Int64(offset), mVariableFramesInPacket: 0, mDataByteSize: UInt32(packet.count))
            offset += packet.count
        }
        buffer.packetCount = AVAudioPacketCount(packets.count)
        buffer.byteLength = UInt32(offset)
        return buffer
    }
}

/// Ce qu'un en-tête ADTS dit de son flux : sa fréquence et ses canaux.
nonisolated struct TalkieAdtsLayout: Equatable, Sendable {
    let sampleRate: Double
    let channels: Int
}

/// Une trame ADTS lue dans un fragment : son flux et sa charge AAC, en-tête retiré.
nonisolated struct TalkieAdtsFrame: Sendable {
    private static let sampleRates: [Double] = [
        96_000, 88_200, 64_000, 48_000, 44_100, 32_000, 24_000, 22_050, 16_000, 12_000, 11_025, 8_000, 7_350,
    ]

    let layout: TalkieAdtsLayout
    let payload: Data

    /// Les trames bout à bout d'un fragment ; la lecture s'arrête à la première trame illisible ou tronquée.
    static func split(_ data: Data) -> [TalkieAdtsFrame] {
        let bytes = [UInt8](data)
        var frames: [TalkieAdtsFrame] = []
        var offset = 0
        while let frame = read(bytes, at: offset) {
            frames.append(frame.frame)
            offset += frame.length
        }
        return frames
    }

    private static func read(_ bytes: [UInt8], at offset: Int) -> (frame: TalkieAdtsFrame, length: Int)? {
        guard offset + 7 <= bytes.count, bytes[offset] == 0xFF, bytes[offset + 1] & 0xF0 == 0xF0 else { return nil }
        let headerLength = bytes[offset + 1] & 0x01 == 1 ? 7 : 9
        let rateIndex = Int((bytes[offset + 2] >> 2) & 0x0F)
        let channels = Int((bytes[offset + 2] & 0x01) << 2 | bytes[offset + 3] >> 6)
        let length = Int(bytes[offset + 3] & 0x03) << 11 | Int(bytes[offset + 4]) << 3 | Int(bytes[offset + 5] >> 5)
        guard rateIndex < sampleRates.count, channels > 0, length > headerLength, offset + length <= bytes.count else { return nil }
        let payload = Data(bytes[(offset + headerLength)..<(offset + length)])
        return (TalkieAdtsFrame(layout: TalkieAdtsLayout(sampleRate: sampleRates[rateIndex], channels: channels), payload: payload), length)
    }
}
