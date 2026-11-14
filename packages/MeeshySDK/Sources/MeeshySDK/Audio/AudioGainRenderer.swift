import Foundation
import AVFoundation

/// Rend une copie AMPLIFIÉE d'un fichier audio (#18526) : décodage PCM par
/// `AVAudioFile`, gain borné par `AudioGainLaw`, réécriture en LPCM 16 bits
/// dans un fichier temporaire. Tout échec rend `nil` : l'appelant joue alors
/// l'original — un vocal qui s'entend à 100 % vaut mieux qu'un vocal muet.
/// Travail HORS du fil principal : l'appelant est déjà dans une tâche détachée.
public enum AudioGainRenderer {

    /// Les octets amplifiés, ou `nil` si le gain est neutre, le fichier trop
    /// long ou indéchiffrable.
    public static func amplified(data: Data, gain: Float) -> Data? {
        guard !AudioGainLaw.isIdentity(gain) else { return nil }
        let source = temporaryURL(extension: "audio")
        defer { try? FileManager.default.removeItem(at: source) }
        guard (try? data.write(to: source)) != nil else { return nil }
        guard let output = amplified(url: source, gain: gain) else { return nil }
        defer { try? FileManager.default.removeItem(at: output) }
        return try? Data(contentsOf: output)
    }

    /// Le fichier amplifié (LPCM 16 bits, `.caf`), ou `nil`. Le fichier se
    /// traite par TRONÇONS (`AudioGainLaw.chunkFrames`) : la mémoire tenue ne
    /// dépend pas de sa longueur, et un format hors plafonds est refusé avant
    /// toute allocation.
    public static func amplified(url: URL, gain: Float) -> URL? {
        guard !AudioGainLaw.isIdentity(gain),
              let file = try? AVAudioFile(forReading: url) else { return nil }
        let format = file.processingFormat
        guard AudioGainLaw.mayAmplify(frameCount: file.length, sampleRate: format.sampleRate,
                                      channelCount: format.channelCount),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AudioGainLaw.chunkFrames) else { return nil }
        let output = temporaryURL(extension: "caf")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: format.sampleRate,
            AVNumberOfChannelsKey: format.channelCount,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ]
        guard let writer = try? AVAudioFile(forWriting: output, settings: settings,
                                            commonFormat: format.commonFormat, interleaved: format.isInterleaved)
        else { return nil }
        while file.framePosition < file.length {
            guard (try? file.read(into: buffer, frameCount: AudioGainLaw.chunkFrames)) != nil,
                  buffer.frameLength > 0,
                  let channels = buffer.floatChannelData else { break }
            let frames = Int(buffer.frameLength)
            for channel in 0..<Int(format.channelCount) {
                AudioGainLaw.amplify(channels[channel], count: frames, gain: gain)
            }
            guard (try? writer.write(from: buffer)) != nil else { break }
        }
        guard file.framePosition >= file.length else {
            try? FileManager.default.removeItem(at: output)
            return nil
        }
        return output
    }

    private static func temporaryURL(extension ext: String) -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-gain-\(UUID().uuidString)")
            .appendingPathExtension(ext)
    }
}
