import AVFoundation
import os

// MARK: - Audio Effect Type

enum AudioEffectType: String, CaseIterable, Sendable, Equatable {
    case voiceCoder
    case babyVoice
    case demonVoice
    case backSound

    var isVoiceEffect: Bool {
        switch self {
        case .voiceCoder, .babyVoice, .demonVoice: true
        case .backSound: false
        }
    }
}

// MARK: - Musical Scale & Key

enum MusicalScale: String, CaseIterable, Sendable {
    case chromatic, major, minor, pentatonic
}

enum MusicalKey: String, CaseIterable, Sendable {
    case C, cSharp = "C#", D, dSharp = "D#", E, F, fSharp = "F#"
    case G, gSharp = "G#", A, aSharp = "A#", B
}

// MARK: - Loop Mode

enum BackSoundLoopMode: String, Sendable {
    case nTimes = "N_TIMES"
    case nMinutes = "N_MINUTES"
}

// MARK: - Effect Parameters

struct VoiceCoderParams: Equatable, Sendable {
    var pitch: Float              // -12 to +12 semitones
    var harmonization: Bool
    var strength: Float           // 0-100%
    var retuneSpeed: Float        // 0-100%
    var scale: MusicalScale
    var key: MusicalKey
    var naturalVibrato: Float     // 0-100%

    static let `default` = VoiceCoderParams(
        pitch: 0, harmonization: false, strength: 50,
        retuneSpeed: 50, scale: .chromatic, key: .C, naturalVibrato: 50
    )
}

struct BabyVoiceParams: Equatable, Sendable {
    var pitch: Float              // +6 to +12 semitones
    var formant: Float            // 1.2-1.5x
    var breathiness: Float        // 0-100%

    static let `default` = BabyVoiceParams(pitch: 8, formant: 1.3, breathiness: 20)
}

struct DemonVoiceParams: Equatable, Sendable {
    var pitch: Float              // -8 to -12 semitones
    var distortion: Float         // 0-100%
    var reverb: Float             // 0-100% (maps to 3-8s decay)

    static let `default` = DemonVoiceParams(pitch: -10, distortion: 50, reverb: 50)
}

struct BackSoundParams: Equatable, Sendable {
    var soundFile: String
    var volume: Float             // 0-100%
    var loopMode: BackSoundLoopMode
    var loopValue: Int

    static let `default` = BackSoundParams(
        soundFile: "", volume: 50, loopMode: .nTimes, loopValue: 1
    )
}

// MARK: - Audio Effect Configuration

enum AudioEffectConfig: Equatable, Sendable {
    case voiceCoder(VoiceCoderParams)
    case babyVoice(BabyVoiceParams)
    case demonVoice(DemonVoiceParams)
    case backSound(BackSoundParams)

    var effectType: AudioEffectType {
        switch self {
        case .voiceCoder: .voiceCoder
        case .babyVoice: .babyVoice
        case .demonVoice: .demonVoice
        case .backSound: .backSound
        }
    }

    var isVoiceEffect: Bool { effectType.isVoiceEffect }
}

// MARK: - Audio Effects Service Protocol

protocol CallAudioEffectsServiceProviding: AnyObject {
    var activeVoiceEffect: AudioEffectType? { get }
    var isBackSoundActive: Bool { get }
    var isAutoDegraded: Bool { get }
    var isEffectsActive: Bool { get }

    func setEffect(_ effect: AudioEffectConfig?) throws
    func updateParams(_ config: AudioEffectConfig) throws
    func processAudioBuffer(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer
    func reset()
}

// MARK: - Audio Effects Error

enum AudioEffectsError: Error, LocalizedError {
    case engineStartFailed(underlying: Error)
    case invalidParams(String)
    case soundFileNotFound(String)
    case engineNotRunning

    var errorDescription: String? {
        switch self {
        case .engineStartFailed(let error):
            "Audio engine failed to start: \(error.localizedDescription)"
        case .invalidParams(let detail):
            "Invalid effect parameters: \(detail)"
        case .soundFileNotFound(let file):
            "Sound file not found: \(file)"
        case .engineNotRunning:
            "Audio engine is not running"
        }
    }
}

// MARK: - Performance Constants

enum AudioEffectsConstants {
    static let maxProcessingTimeMs: Double = 5.0
    static let overBudgetThreshold: Int = 10
    static let underBudgetThreshold: Int = 30
    static let restoreBudgetMs: Double = 3.0
    static let defaultSampleRate: Double = 48000
    static let defaultBufferSize: AVAudioFrameCount = 1024
    static let backSoundDuckVolumeDb: Float = -12.0
    static let backSoundDuckResumeDelay: TimeInterval = 0.5
}

// MARK: - Logger Extension

extension Logger {
    static let audioEffects = Logger(subsystem: "me.meeshy.app", category: "audio-effects")
}
