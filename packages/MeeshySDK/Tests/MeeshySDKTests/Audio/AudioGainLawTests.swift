import Foundation
import AVFoundation
import Testing
@testable import MeeshySDK

/// **Un vocal s'entend à 120 %, sans jamais déborder** (#18526).
@Suite("AudioGainLaw")
struct AudioGainLawTests {

    @Test("le gain de lecture est 120 %")
    func playbackGain_isOneHundredTwentyPercent() {
        #expect(AudioGainLaw.playbackGain == 1.2)
    }

    @Test("les échantillons sont multipliés, et bornés à ±1")
    func amplified_scalesAndClips() {
        let out = AudioGainLaw.amplified([0.5, -0.5, 0.9, -0.9, 0], gain: 1.2)
        #expect(abs(out[0] - 0.6) < 0.0001)
        #expect(abs(out[1] + 0.6) < 0.0001)
        #expect(out[2] == 1)
        #expect(out[3] == -1)
        #expect(out[4] == 0)
    }

    @Test("un gain neutre ou invalide ne touche à rien")
    func identityGain_isUntouched() {
        let samples: [Float] = [0.25, -0.75]
        #expect(AudioGainLaw.amplified(samples, gain: 1) == samples)
        #expect(AudioGainLaw.amplified(samples, gain: 0) == samples)
        #expect(AudioGainLaw.amplified(samples, gain: .nan) == samples)
        #expect(AudioGainLaw.amplified([], gain: 1.2).isEmpty)
        #expect(AudioGainLaw.isIdentity(1.00001))
        #expect(!AudioGainLaw.isIdentity(1.2))
    }

    @Test("le tampon C suit la même règle")
    func amplifyPointer_matchesArrayLaw() {
        var buffer: [Float] = [0.5, -0.9, 0.1]
        buffer.withUnsafeMutableBufferPointer { ptr in
            AudioGainLaw.amplify(ptr.baseAddress!, count: ptr.count, gain: 1.2)
        }
        #expect(abs(buffer[0] - 0.6) < 0.0001)
        #expect(buffer[1] == -1)
        #expect(abs(buffer[2] - 0.12) < 0.0001)
    }

    @Test("un fichier de plus de trois minutes, ou hors plafonds de format, joue sans gain")
    func mayAmplify_isBoundedByDurationAndFormat() {
        #expect(AudioGainLaw.mayAmplify(frameCount: 48_000 * 60, sampleRate: 48_000, channelCount: 2))
        #expect(!AudioGainLaw.mayAmplify(frameCount: 48_000 * 181, sampleRate: 48_000, channelCount: 1))
        #expect(!AudioGainLaw.mayAmplify(frameCount: 0, sampleRate: 48_000, channelCount: 1))
        #expect(!AudioGainLaw.mayAmplify(frameCount: 10, sampleRate: 0, channelCount: 1))
        #expect(!AudioGainLaw.mayAmplify(frameCount: 10, sampleRate: 192_000, channelCount: 1), "96 kHz au plus")
        #expect(!AudioGainLaw.mayAmplify(frameCount: 10, sampleRate: 48_000, channelCount: 8), "stéréo au plus")
        #expect(!AudioGainLaw.mayAmplify(frameCount: Int64(UInt32.max) + 1, sampleRate: 1, channelCount: 1))
    }

    @Test("la mémoire du rendu est celle d'un tronçon, pas du fichier")
    func chunk_isBounded() {
        let bytesPerChunk = Int(AudioGainLaw.chunkFrames) * Int(AudioGainLaw.maxChannels) * 4
        #expect(bytesPerChunk <= 1 << 20, "un tronçon tient sous 1 Mo")
    }
}

/// Le rendu amplifié : un fichier réel entre, un fichier plus fort sort.
@Suite("AudioGainRenderer")
struct AudioGainRendererTests {

    /// Une seconde de sinusoïde mono à l'amplitude donnée, en WAV 16 bits.
    private func sineWAV(amplitude: Float, sampleRate: Double = 8_000) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("gain-\(UUID().uuidString).wav")
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let frames = AVAudioFrameCount(sampleRate)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        for i in 0..<Int(frames) {
            buffer.floatChannelData![0][i] = amplitude * sinf(Float(i) * 2 * .pi * 440 / Float(sampleRate))
        }
        let file = try AVAudioFile(forWriting: url, settings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false,
        ], commonFormat: .pcmFormatFloat32, interleaved: false)
        try file.write(from: buffer)
        return url
    }

    private func peak(of url: URL) throws -> Float {
        let file = try AVAudioFile(forReading: url)
        let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
        try file.read(into: buffer)
        let samples = Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: Int(buffer.frameLength)))
        return samples.map { abs($0) }.max() ?? 0
    }

    @Test("une sinusoïde à 0,5 ressort à 0,6, même durée — sur plusieurs tronçons")
    func amplified_raisesThePeakByTwentyPercent() throws {
        let source = try sineWAV(amplitude: 0.5, sampleRate: 44_100)
        defer { try? FileManager.default.removeItem(at: source) }
        let output = try #require(AudioGainRenderer.amplified(url: source, gain: 1.2))
        defer { try? FileManager.default.removeItem(at: output) }
        #expect(abs(try peak(of: output) - 0.6) < 0.01)
        #expect(try AVAudioFile(forReading: output).length == 44_100, "44 100 images > un tronçon de 32 768 : rien ne se perd")
    }

    @Test("un pic déjà plein écrête à 1, ne déborde pas")
    func amplified_clipsFullScale() throws {
        let source = try sineWAV(amplitude: 0.95)
        defer { try? FileManager.default.removeItem(at: source) }
        let output = try #require(AudioGainRenderer.amplified(url: source, gain: 1.2))
        defer { try? FileManager.default.removeItem(at: output) }
        #expect(try peak(of: output) <= 1)
        #expect(try peak(of: output) > 0.99)
    }

    @Test("les octets amplifiés se relisent par AVAudioPlayer ; des octets illisibles rendent nil")
    func amplifiedData_roundTrips() throws {
        let source = try sineWAV(amplitude: 0.5)
        defer { try? FileManager.default.removeItem(at: source) }
        let data = try Data(contentsOf: source)
        let louder = try #require(AudioGainRenderer.amplified(data: data, gain: 1.2))
        let player = try AVAudioPlayer(data: louder)
        #expect(abs(player.duration - 1) < 0.05)
        #expect(AudioGainRenderer.amplified(data: Data([1, 2, 3, 4]), gain: 1.2) == nil)
        #expect(AudioGainRenderer.amplified(data: data, gain: 1) == nil)
    }
}
