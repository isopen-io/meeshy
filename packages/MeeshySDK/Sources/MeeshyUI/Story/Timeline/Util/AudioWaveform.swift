import Foundation
import AVFoundation
import UIKit
import ImageIO

/// Extraction de la forme d'onde d'un fichier audio pour les lanes de la
/// timeline. `StoryAudioPlayerObject.waveformSamples` n'est rempli qu'à la
/// composition fraîche — un draft restauré ou un repost arrive avec un
/// tableau vide et la lane affichait un aplat. Atome pur : URL locale →
/// N buckets RMS normalisés [0, 1], cache mémoire keyé URL+count.
enum AudioWaveform {

    private nonisolated(unsafe) static let cache = NSCache<NSString, NSArray>()

    static func samples(url: URL, count: Int = 80) async -> [Float] {
        let key = "\(url.absoluteString)|\(count)" as NSString
        if let cached = cache.object(forKey: key) as? [Float] { return cached }

        let computed: [Float] = await Task.detached(priority: .utility) {
            Self.computeRMSBuckets(url: url, count: count)
        }.value

        if !computed.isEmpty {
            cache.setObject(computed as NSArray, forKey: key)
        }
        return computed
    }

    /// Lecture par blocs (64k frames) → somme des carrés par bucket → RMS
    /// normalisé sur le pic. Mono-isation par moyenne des canaux.
    nonisolated static func computeRMSBuckets(url: URL, count: Int) -> [Float] {
        guard count > 0, let file = try? AVAudioFile(forReading: url) else { return [] }
        let totalFrames = file.length
        guard totalFrames > 0 else { return [] }
        let format = file.processingFormat
        let chunkFrames: AVAudioFrameCount = 65536
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: chunkFrames) else { return [] }

        var sumSquares = [Double](repeating: 0, count: count)
        var frameCounts = [Int](repeating: 0, count: count)
        var frameIndex: Int64 = 0

        while frameIndex < totalFrames {
            buffer.frameLength = 0
            guard (try? file.read(into: buffer, frameCount: chunkFrames)) != nil,
                  buffer.frameLength > 0,
                  let channels = buffer.floatChannelData else { break }
            let channelCount = Int(format.channelCount)
            let frames = Int(buffer.frameLength)
            for f in 0..<frames {
                var mono: Float = 0
                for c in 0..<channelCount { mono += channels[c][f] }
                mono /= Float(channelCount)
                let bucket = min(count - 1, Int((frameIndex + Int64(f)) * Int64(count) / totalFrames))
                sumSquares[bucket] += Double(mono * mono)
                frameCounts[bucket] += 1
            }
            frameIndex += Int64(frames)
        }

        let rms = zip(sumSquares, frameCounts).map { sum, n -> Float in
            n > 0 ? Float((sum / Double(n)).squareRoot()) : 0
        }
        return normalize(rms)
    }

    /// Normalisation sur le pic — pure, testable. Un signal silencieux reste
    /// à zéro (pas de division par ~0 qui amplifierait le bruit de fond).
    nonisolated static func normalize(_ rms: [Float]) -> [Float] {
        guard let peak = rms.max(), peak > 0.0001 else {
            return rms.map { _ in 0 }
        }
        return rms.map { $0 / peak }
    }
}

/// Vignette FIXE (image) pour les lanes — pendant du filmstrip vidéo.
/// `CGImageSourceCreateThumbnailAtIndex` décode à la taille cible (jamais le
/// bitmap plein format en mémoire), cache keyé URL+hauteur.
enum ImageStill {

    private nonisolated(unsafe) static let cache = NSCache<NSString, UIImage>()

    static func thumbnail(url: URL, maxHeight: CGFloat) async -> UIImage? {
        let key = "\(url.absoluteString)|\(Int(maxHeight))" as NSString
        if let cached = cache.object(forKey: key) { return cached }
        let scale = UIScreen.main.scale
        let image: UIImage? = await Task.detached(priority: .utility) {
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
            let options: [CFString: Any] = [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: maxHeight * 4 * scale
            ]
            guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
                return nil
            }
            return UIImage(cgImage: cg)
        }.value
        if let image {
            cache.setObject(image, forKey: key)
        }
        return image
    }
}
