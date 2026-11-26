import AVFoundation
import Foundation
import MeeshySDK
import os

private extension Logger {
    nonisolated static let talkieMic = MeeshyLog.logger(.audioRecorder)
}

/// Le micro du talkie (#16927) : `AVAudioEngine` capte, `AVAudioConverter` encode en AAC-LC mono 64 kb/s, chaque paquet
/// part en trame ADTS autonome (`TalkieAdts`) — l'encodage que lisent les trois récepteurs.
///
/// La session audio se prend par `MeeshyRecordingSession`, le chemin des vocaux : le son Meeshy qui joue baisse sans
/// s'arrêter, et pendant un appel rien ne se reconfigure (le micro ne s'ouvre pas). Une voix de talkie reçue qui sonne
/// se traite selon la sortie pendant qu'on parle, et retrouve sa propre session quand le micro s'arrête (#20579,
/// `TalkieMicSessionLaw`).
///
/// Chaque tampon du micro passe d'abord par le gain qui normalise la voix au réglage d'ENVOI (−22 / −7 dBFS : 6 dB
/// de marge pour les anciens récepteurs, `TalkieVoiceLeveler.Tuning`), puis part à l'encodeur, puis à l'analyseur
/// qui pousse ses bandes au registre des voix sous le destinataire, datées à l'heure de la capture (#20531,
/// `TalkieVoiceProcessor`).
///
/// Chaque ouverture écrit au journal ce que coûtent la permission, la session et le moteur, puis la taille du premier
/// tampon livré par le micro (#17094) : c'est elle qui dit à quel pas les trames arrivent.
@MainActor
final class TalkieMicCapture: TalkieCapturing {

    private var engine: AVAudioEngine?
    private var encoder: TalkieAacEncoder?
    private var holdsSession = false
    private var frameRelay: AsyncStream<[TalkieAacFrame]>.Continuation?
    private var frameDelivery: Task<Void, Never>?
    private let stage: TalkieVoiceStage

    init(stage: TalkieVoiceStage = .shared) {
        self.stage = stage
    }

    nonisolated deinit {}

    func start(toUserId: String, onFrame: @escaping @MainActor @Sendable (Data, TimeInterval) -> Void) async -> Bool {
        let startedAt = Date()
        guard engine == nil, await DevicePermissions.requestMicrophone().isUsable else { return false }
        let permittedAt = Date()
        let outputs = AVAudioSession.sharedInstance().currentRoute.outputs.map(\.portType)
        let alongside = TalkieMicSessionLaw.alongsidePlayback(outputs: outputs)
        guard await MeeshyRecordingSession.shared.begin(.voiceMessage, alongsidePlayback: alongside) else { return false }
        let sessionAt = Date()
        holdsSession = true
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard AudioTapFormatReadiness.mayInstall(sampleRate: format.sampleRate, channelCount: format.channelCount) else {
            releaseSession()
            return false
        }
        let (frames, relay) = AsyncStream.makeStream(of: [TalkieAacFrame].self)
        let deliver: @Sendable ([TalkieAacFrame]) -> Void = { relay.yield($0) }
        guard let encoder = TalkieAacEncoder(input: format, deliver: deliver) else {
            relay.finish()
            releaseSession()
            return false
        }
        let firstBuffer = OSAllocatedUnfairLock(initialState: true)
        let rate = Int(format.sampleRate)
        let voice = TalkieVoiceProcessor(userId: toUserId, direction: .outgoing, sampleRate: format.sampleRate, stage: stage)
        let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, when in
            if firstBuffer.withLock({ first in defer { first = false }; return first }) {
                Logger.talkieMic.info("talkie · micro · premier tampon \(buffer.frameLength) trames à \(rate) Hz")
            }
            voice.level(buffer)
            encoder.encode(buffer)
            voice.publish(buffer, at: TalkieVoiceStage.seconds(of: when))
        }
        input.installTap(onBus: 0, bufferSize: 1024, format: format, block: tapBlock)
        engine.prepare()
        do {
            try engine.start()
        } catch {
            input.removeTap(onBus: 0)
            relay.finish()
            releaseSession()
            return false
        }
        Logger.talkieMic.info("talkie · micro · permission \(Self.ms(startedAt, permittedAt)) ms · session \(Self.ms(permittedAt, sessionAt)) ms · moteur \(Self.ms(sessionAt, Date())) ms")
        self.engine = engine
        self.encoder = encoder
        frameRelay = relay
        frameDelivery = Task { @MainActor in
            for await batch in frames { batch.forEach { onFrame($0.data, $0.duration) } }
        }
        return true
    }

    func stop() async {
        guard let engine else { return }
        self.engine = nil
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        encoder?.drain()
        encoder = nil
        releaseSession()
        frameRelay?.finish()
        frameRelay = nil
        await frameDelivery?.value
        frameDelivery = nil
    }

    private static func ms(_ from: Date, _ to: Date) -> Int {
        Int((to.timeIntervalSince(from) * 1000).rounded())
    }

    /// Une voix reçue qui sonne encore retrouve SA session, qui garde le bouton silencieux : c'est elle qui la rendra à
    /// sa fin (#20579).
    private func releaseSession() {
        guard holdsSession else { return }
        holdsSession = false
        MeeshyRecordingSession.shared.finish(
            handingBackSession: true,
            alongsideInterruptingVoice: TalkieMicSessionLaw.alongsideIncoming(stage.cast().voices)
        )
    }
}

/// Une trame ADTS prête, et la durée qu'elle porte.
nonisolated struct TalkieAacFrame: Sendable {
    let data: Data
    let duration: TimeInterval
}

/// L'encodeur, appelé sur le fil du micro : il garde son convertisseur sous verrou et remet ses trames par lots.
nonisolated final class TalkieAacEncoder: Sendable {

    /// Les fréquences que l'encodeur AAC accepte ; une autre fréquence d'entrée est rééchantillonnée à 48 kHz.
    private static let encodableRates: Set<Double> = [48_000, 44_100, 32_000, 24_000, 22_050, 16_000]
    private static let bitRate = 64_000
    private static let framesPerPacket: Double = 1024

    nonisolated private struct State {
        let converter: AVAudioConverter
        let output: AVAudioFormat
    }

    private let state: OSAllocatedUnfairLock<State>
    private let sampleRate: Double
    private let deliver: @Sendable ([TalkieAacFrame]) -> Void

    init?(input: AVAudioFormat, deliver: @escaping @Sendable ([TalkieAacFrame]) -> Void) {
        guard input.sampleRate > 0, input.channelCount > 0 else { return nil }
        let rate = Self.encodableRates.contains(input.sampleRate) ? input.sampleRate : 48_000
        var description = AudioStreamBasicDescription(
            mSampleRate: rate,
            mFormatID: kAudioFormatMPEG4AAC,
            mFormatFlags: UInt32(MPEG4ObjectID.AAC_LC.rawValue),
            mBytesPerPacket: 0,
            mFramesPerPacket: UInt32(Self.framesPerPacket),
            mBytesPerFrame: 0,
            mChannelsPerFrame: 1,
            mBitsPerChannel: 0,
            mReserved: 0
        )
        guard let output = AVAudioFormat(streamDescription: &description),
              let converter = AVAudioConverter(from: input, to: output) else { return nil }
        converter.bitRate = Self.bitRate
        state = OSAllocatedUnfairLock(uncheckedState: State(converter: converter, output: output))
        sampleRate = rate
        self.deliver = deliver
    }

    func encode(_ buffer: AVAudioPCMBuffer) {
        let frames = state.withLockUnchecked { convert($0, feeding: buffer) }
        if !frames.isEmpty { deliver(frames) }
    }

    /// Le micro s'est arrêté : ce que le convertisseur gardait encore sort.
    func drain() {
        let frames = state.withLockUnchecked { convert($0, feeding: nil) }
        if !frames.isEmpty { deliver(frames) }
    }

    private func convert(_ state: State, feeding buffer: AVAudioPCMBuffer?) -> [TalkieAacFrame] {
        var fed = false
        var frames: [TalkieAacFrame] = []
        let packetSize = max(state.converter.maximumOutputPacketSize, 1)
        while true {
            let out = AVAudioCompressedBuffer(format: state.output, packetCapacity: 8, maximumPacketSize: packetSize)
            var error: NSError?
            let status = state.converter.convert(to: out, error: &error) { _, inputStatus in
                guard let buffer, !fed else {
                    inputStatus.pointee = buffer == nil ? .endOfStream : .noDataNow
                    return nil
                }
                fed = true
                inputStatus.pointee = .haveData
                return buffer
            }
            frames += packets(out)
            guard status == .haveData, error == nil else { break }
        }
        return frames
    }

    private func packets(_ buffer: AVAudioCompressedBuffer) -> [TalkieAacFrame] {
        guard let descriptions = buffer.packetDescriptions else { return [] }
        let duration = Self.framesPerPacket / sampleRate
        return (0..<Int(buffer.packetCount)).compactMap { index in
            let description = descriptions[index]
            let packet = Data(bytes: buffer.data.advanced(by: Int(description.mStartOffset)), count: Int(description.mDataByteSize))
            return TalkieAdts.frame(packet, sampleRate: sampleRate, channels: 1).map { TalkieAacFrame(data: $0, duration: duration) }
        }
    }
}
