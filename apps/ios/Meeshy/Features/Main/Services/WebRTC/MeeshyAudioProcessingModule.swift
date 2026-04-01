@preconcurrency import AVFAudio
import AVFoundation
import os

#if canImport(WebRTC)
import WebRTC
#endif

// MARK: - Audio Processing Module

/// Custom audio processing module that intercepts WebRTC's audio capture pipeline
/// to apply real-time effects while maintaining a clean stream for transcription.
///
/// Threading contract:
/// - `audioProcessingProcess` is called on WebRTC's real-time audio thread
/// - `onCleanAudioBuffer` callback is dispatched to a background queue (never audio thread)
/// - No locks are held during audio processing
///
/// Dual-stream architecture:
/// ```
/// Microphone → WebRTC ADM capture → MeeshyAudioProcessingModule
///     ├─ [CLEAN PATH] → background queue → SFSpeechRecognizer
///     └─ [EFFECTS PATH] → CallAudioEffectsService → processed buffer → WebRTC send
/// ```
final class MeeshyAudioProcessingModule: NSObject {

    // MARK: - Properties

    let effectsService: CallAudioEffectsServiceProviding

    /// Callback for clean (unprocessed) audio buffers — used for transcription.
    /// Called on `transcriptionQueue`, never on the real-time audio thread.
    var onCleanAudioBuffer: ((AVAudioPCMBuffer) -> Void)?

    var isEffectsActive: Bool { effectsService.isEffectsActive }

    private var sampleRate: Int = 48000
    private var channelCount: Int = 1

    /// Background queue for dispatching clean audio to transcription service.
    /// Avoids blocking the real-time audio thread with SFSpeech operations.
    private let transcriptionQueue = DispatchQueue(
        label: "me.meeshy.audioprocessing.transcription",
        qos: .userInitiated
    )

    // MARK: - Init

    init(effectsService: CallAudioEffectsServiceProviding) {
        self.effectsService = effectsService
        super.init()
        Logger.audioEffects.info("MeeshyAudioProcessingModule initialized")
    }

    deinit {
        Logger.audioEffects.info("MeeshyAudioProcessingModule deinit")
    }

    // MARK: - Process Audio (called on real-time audio thread)

    func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        let hasEffects = effectsService.isEffectsActive

        // CLEAN PATH: Send original audio to transcription
        if let callback = onCleanAudioBuffer {
            if hasEffects {
                // Effects will modify buffer — copy first, dispatch off audio thread
                guard let cleanCopy = copyBuffer(buffer) else { return }
                transcriptionQueue.async {
                    callback(cleanCopy)
                }
            } else {
                // No effects — buffer won't be modified, but still dispatch off audio thread
                // Copy needed because RTCAudioBuffer memory is only valid during this callback
                guard let cleanCopy = copyBuffer(buffer) else { return }
                transcriptionQueue.async {
                    callback(cleanCopy)
                }
            }
        }

        // EFFECTS PATH: Process through effect chain if active
        guard hasEffects else { return }

        let processed = effectsService.processAudioBuffer(buffer)

        if processed !== buffer {
            copyBufferContents(from: processed, to: buffer)
        }
    }

    // MARK: - Private — Buffer Utilities

    private func copyBuffer(_ source: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let copy = AVAudioPCMBuffer(
            pcmFormat: source.format,
            frameCapacity: source.frameCapacity
        ) else {
            Logger.audioEffects.error("Failed to allocate clean buffer copy")
            return nil
        }
        copy.frameLength = source.frameLength

        guard let srcData = source.floatChannelData, let dstData = copy.floatChannelData else {
            return copy
        }

        let frameCount = Int(source.frameLength)
        for ch in 0..<Int(source.format.channelCount) {
            dstData[ch].update(from: srcData[ch], count: frameCount)
        }
        return copy
    }

    private func copyBufferContents(from source: AVAudioPCMBuffer, to destination: AVAudioPCMBuffer) {
        guard let srcData = source.floatChannelData, let dstData = destination.floatChannelData else {
            return
        }

        let frameCount = Int(min(source.frameLength, destination.frameLength))
        let channels = Int(min(source.format.channelCount, destination.format.channelCount))
        for ch in 0..<channels {
            dstData[ch].update(from: srcData[ch], count: frameCount)
        }
    }
}

// MARK: - RTCAudioCustomProcessingDelegate

#if canImport(WebRTC)
extension MeeshyAudioProcessingModule: RTCAudioCustomProcessingDelegate {
    func audioProcessingInitialize(sampleRate sampleRateHz: Int, channels: Int) {
        self.sampleRate = sampleRateHz
        self.channelCount = channels
        Logger.audioEffects.info(
            "Audio processing initialized: \(sampleRateHz)Hz, \(channels)ch"
        )
    }

    func audioProcessingProcess(audioBuffer: RTCAudioBuffer) {
        let channels = audioBuffer.channels
        let frames = audioBuffer.frames

        guard let format = AVAudioFormat(
            standardFormatWithSampleRate: Double(sampleRate),
            channels: UInt32(channels)
        ) else { return }

        guard let pcmBuffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: AVAudioFrameCount(frames)
        ) else { return }

        pcmBuffer.frameLength = AVAudioFrameCount(frames)

        if let floatData = pcmBuffer.floatChannelData {
            for ch in 0..<channels {
                let rawChannel = audioBuffer.rawBuffer(forChannel: ch)
                for i in 0..<frames {
                    floatData[ch][i] = rawChannel[i]
                }
            }
        }

        processAudioBuffer(pcmBuffer)

        if effectsService.isEffectsActive, let floatData = pcmBuffer.floatChannelData {
            for ch in 0..<channels {
                let rawChannel = audioBuffer.rawBuffer(forChannel: ch)
                for i in 0..<frames {
                    rawChannel[i] = floatData[ch][i]
                }
            }
        }
    }

    func audioProcessingRelease() {
        Logger.audioEffects.info("Audio processing released")
    }
}
#endif
