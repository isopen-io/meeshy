import AVFoundation
import os

#if canImport(WebRTC)
import WebRTC
#endif

// MARK: - Audio Processing Module

/// Custom audio processing module that intercepts WebRTC's audio capture pipeline
/// to apply real-time effects while maintaining a clean stream for transcription.
///
/// Dual-stream architecture:
/// ```
/// Microphone → WebRTC ADM capture → MeeshyAudioProcessingModule
///     ├─ [CLEAN PATH] → onCleanAudioBuffer callback → SFSpeechRecognizer
///     └─ [EFFECTS PATH] → CallAudioEffectsService → processed buffer → WebRTC send
/// ```
final class MeeshyAudioProcessingModule: NSObject {

    // MARK: - Properties

    let effectsService: CallAudioEffectsServiceProviding

    /// Callback for clean (unprocessed) audio buffers — used for transcription
    var onCleanAudioBuffer: ((AVAudioPCMBuffer) -> Void)?

    var isEffectsActive: Bool { effectsService.isEffectsActive }

    private var sampleRate: Int = 48000
    private var channelCount: Int = 1

    // MARK: - Init

    init(effectsService: CallAudioEffectsServiceProviding) {
        self.effectsService = effectsService
        super.init()
        Logger.audioEffects.info("MeeshyAudioProcessingModule initialized")
    }

    deinit {
        Logger.audioEffects.info("MeeshyAudioProcessingModule deinit")
    }

    // MARK: - Process Audio

    /// Process an audio buffer through the effects chain.
    /// Always feeds the clean (original) buffer to the transcription callback first.
    /// If effects are active, replaces the buffer contents with processed audio.
    func processAudioBuffer(_ buffer: AVAudioPCMBuffer) {
        let hasEffects = effectsService.isEffectsActive

        // CLEAN PATH: Send original audio to transcription
        // Only copy when effects will modify the buffer; otherwise pass original directly
        if let callback = onCleanAudioBuffer {
            if hasEffects {
                let cleanCopy = copyBuffer(buffer)
                callback(cleanCopy)
            } else {
                callback(buffer)
            }
        }

        // EFFECTS PATH: Process through effect chain if active
        guard hasEffects else { return }

        let processed = effectsService.processAudioBuffer(buffer)

        // Copy processed samples back into the original buffer (in-place modification)
        if processed !== buffer {
            copyBufferContents(from: processed, to: buffer)
        }
    }

    // MARK: - Private — Buffer Utilities

    private func copyBuffer(_ source: AVAudioPCMBuffer) -> AVAudioPCMBuffer {
        let copy = AVAudioPCMBuffer(pcmFormat: source.format, frameCapacity: source.frameCapacity)!
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

        // Copy RTCAudioBuffer data into AVAudioPCMBuffer
        if let floatData = pcmBuffer.floatChannelData {
            for ch in 0..<channels {
                let rawChannel = audioBuffer.rawBuffer(forChannel: ch)
                for i in 0..<frames {
                    floatData[ch][i] = rawChannel[i]
                }
            }
        }

        processAudioBuffer(pcmBuffer)

        // Copy processed data back into RTCAudioBuffer
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
