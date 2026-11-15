import Foundation

enum TranscriptionError: LocalizedError, Equatable {
    case permissionDenied
    case recognizerUnavailable(language: String)
    case onDeviceNotSupported(language: String)
    case recognitionFailed(underlying: Error)
    case audioEngineFailed(underlying: Error)
    /// Le micro n'a plus de format exploitable — route d'entrée disparue,
    /// session désactivée, matériel en cours de reconfiguration. Distincte
    /// d'`audioEngineFailed` : rien n'a échoué, on a REFUSÉ d'appeler
    /// AVAudioEngine, parce que l'appeler aurait levé une exception ObjC
    /// irrattrapable (voir `AudioTapFormatReadiness`, #7002).
    case tapFormatUnavailable(sampleRate: Double, channelCount: UInt32)

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Speech recognition permission denied"
        case .recognizerUnavailable(let language):
            return "Speech recognizer unavailable for language: \(language)"
        case .onDeviceNotSupported(let language):
            return "On-device recognition not supported for language: \(language)"
        case .recognitionFailed(let error):
            return "Recognition failed: \(error.localizedDescription)"
        case .audioEngineFailed(let error):
            return "Local audio capture failed: \(error.localizedDescription)"
        case .tapFormatUnavailable(let sampleRate, let channelCount):
            return "Microphone format unavailable: \(sampleRate) Hz / \(channelCount) ch"
        }
    }

    static func == (lhs: TranscriptionError, rhs: TranscriptionError) -> Bool {
        lhs.errorDescription == rhs.errorDescription
    }
}
