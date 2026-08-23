import Foundation
import AVFoundation
import UIKit
import ImageIO

/// Extraction de la forme d'onde d'un fichier audio pour les lanes de la
/// timeline. `StoryAudioPlayerObject.waveformSamples` n'est rempli qu'à la
/// composition fraîche — un draft restauré ou un repost arrive avec un
/// tableau vide et la lane affichait un aplat.
///
/// Atome pur : URL locale → N buckets RMS **absolus** (plus normalisés sur le
/// pic : deux pistes de niveaux différents doivent se distinguer, sinon régler
/// un volume ne change rien au tracé). L'échelle d'affichage est portée par
/// `displayHeight(rms:)`, la résolution par `bucketCount(forWidth:scale:)`.
/// Cache à deux niveaux, mémoire puis disque, keyé URL+count.
enum AudioWaveform {

    private nonisolated(unsafe) static let cache = NSCache<NSString, NSArray>()

    /// Paliers de résolution.
    ///
    /// Un `count` variant continûment avec le zoom multiplierait les entrées de
    /// cache et relancerait une analyse complète à chaque image de pincement :
    /// la quantification est ce qui rend le cache utile.
    nonisolated static let bucketTiers: [Int] = [128, 256, 512, 1024, 2048]

    /// Palier couvrant une barre de `width` points à l'échelle écran `scale`.
    nonisolated static func bucketCount(forWidth width: CGFloat, scale: CGFloat) -> Int {
        let target = Int((width * max(1, scale)).rounded())
        return bucketTiers.first(where: { $0 >= target }) ?? bucketTiers.last!
    }

    /// Hauteur d'affichage `0...1` pour un RMS absolu, en échelle décibel.
    ///
    /// Un RMS linéaire est visuellement plat — la plupart des contenus vivent
    /// entre 0,05 et 0,3, et la bande paraîtrait vide alors que la mesure est
    /// juste. L'échelle dB restitue la dynamique sans mentir sur les niveaux ;
    /// plancher à -60 dB, sous lequel on considère le silence.
    nonisolated static func displayHeight(rms: Float) -> Float {
        guard rms > 0.0001 else { return 0 }
        let floorDb: Float = -60
        let db = 20 * log10f(min(1, rms))
        return max(0, min(1, (db - floorDb) / -floorDb))
    }

    static func samples(url: URL, count: Int = 80) async -> [Float] {
        let key = "\(url.absoluteString)|\(count)"
        if let cached = cache.object(forKey: key as NSString) as? [Float] { return cached }

        // Second niveau : disque. Le NSCache seul est évincé sous pression et
        // perdu à chaque lancement — un fichier était donc ré-analysé bien plus
        // souvent que nécessaire.
        if let restored = diskCached(key: key), !restored.isEmpty {
            cache.setObject(restored as NSArray, forKey: key as NSString)
            return restored
        }

        let computed: [Float] = await Task.detached(priority: .utility) {
            Self.computeRMSBuckets(url: url, count: count)
        }.value

        if !computed.isEmpty {
            cache.setObject(computed as NSArray, forKey: key as NSString)
            storeOnDisk(computed, key: key)
        }
        return computed
    }

    // MARK: - Cache disque

    /// Dossier de persistance. `Library/Caches` : le système peut le purger
    /// sous pression disque, ce qui convient à une donnée recalculable.
    nonisolated static var diskCacheDirectory: URL? {
        guard let base = FileManager.default.urls(for: .cachesDirectory,
                                                  in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("story-waveforms", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    /// Nom de fichier dérivé de la clé — hachage stable, sans caractère
    /// interdit et de longueur bornée quelle que soit l'URL d'origine.
    nonisolated static func diskFileName(for key: String) -> String {
        var hash: UInt64 = 5381
        for byte in Array(key.utf8) {
            hash = (hash &* 33) &+ UInt64(byte)
        }
        return String(format: "wf-%016llx.bin", hash)
    }

    nonisolated static func diskCached(key: String) -> [Float]? {
        guard let dir = diskCacheDirectory else { return nil }
        let file = dir.appendingPathComponent(diskFileName(for: key))
        guard let data = try? Data(contentsOf: file), !data.isEmpty,
              data.count % MemoryLayout<Float>.size == 0 else { return nil }
        return data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    }

    nonisolated static func storeOnDisk(_ samples: [Float], key: String) {
        guard let dir = diskCacheDirectory else { return }
        let file = dir.appendingPathComponent(diskFileName(for: key))
        samples.withUnsafeBufferPointer { buffer in
            try? Data(buffer: buffer).write(to: file, options: .atomic)
        }
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
        // Amplitude ABSOLUE. `normalize` divisait par le pic, si bien qu'une
        // piste douce et une piste forte se dessinaient à la même hauteur et
        // que baisser un clip ne changeait rien à son tracé — inexploitable
        // pour régler des volumes. La fonction reste disponible pour un
        // affichage volontairement relatif ; l'échelle d'affichage est portée
        // par `displayHeight(rms:)`.
        return rms
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

    private nonisolated(unsafe) static let cache: NSCache<NSString, UIImage> = {
        let cache = NSCache<NSString, UIImage>()
        // Borne le nombre de vignettes décodées résidentes (une par média ×
        // hauteur) — sans elle le cache ne rendait jamais rien au système.
        cache.countLimit = 64
        return cache
    }()

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
