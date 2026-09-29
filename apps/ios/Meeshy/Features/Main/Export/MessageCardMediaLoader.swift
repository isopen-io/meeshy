import Foundation
import AVFoundation
import UIKit
import MeeshySDK
import MeeshyUI

/// Ce que l'atelier a chargé pour peindre les médias d'une carte : les pixels
/// (photo, première image d'une vidéo), l'onde RÉELLE des sons et leur fichier
/// local — la piste d'une carte animée.
struct MessageCardLoadedMedia: Sendable {
    let pictures: MessageCardPictures
    let media: [MessageCardMedia]
    let audioFile: URL?

    static let empty = MessageCardLoadedMedia(pictures: .none, media: [], audioFile: nil)
}

/// **LE CHARGEMENT DES MÉDIAS D'UNE CARTE « IMAGINE »** (#8692) — côté
/// application : il parle aux caches nommés du produit (`CacheCoordinator`) et
/// résout les adresses (`MeeshyConfig`), ce que le SDK ne fait jamais.
///
/// Toujours appelé HORS du MainActor (`Task.detached`). Un média qui ne se
/// charge pas garde sa couleur d'attente : la carte part quand même, jamais
/// d'écran bloqué sur le réseau.
nonisolated enum MessageCardMediaLoader {

    static let waveBars = 64

    static func load(_ items: [MessageCardSubjectMedia]) async -> MessageCardLoadedMedia {
        var images: [String: CGImage] = [:]
        var media: [MessageCardMedia] = []
        var audioFile: URL?
        for item in items {
            switch item.media.kind {
            case .image, .video:
                if let image = await picture(item) { images[item.media.id] = image }
                media.append(item.media)
            case .audio:
                let file = await localFile(item.fileURL, kind: .audio)
                if audioFile == nil { audioFile = file }
                let wave = await samplesOrNone(file, count: waveBars)
                media.append(wave.isEmpty ? item.media : item.media.with(samples: wave))
            }
        }
        return MessageCardLoadedMedia(pictures: MessageCardPictures(images), media: media, audioFile: audioFile)
    }

    private static func samplesOrNone(_ file: URL?, count: Int) async -> [Double] {
        guard let file else { return [] }
        return await samples(of: file, count: count)
    }

    static func resolved(_ string: String) -> String {
        MeeshyConfig.resolveMediaURL(string)?.absoluteString ?? string
    }

    /// La photo, ou la PREMIÈRE image d'une vidéo : son poster s'il existe, sinon l'image à 0 s.
    private static func picture(_ item: MessageCardSubjectMedia) async -> CGImage? {
        if item.media.kind == .image {
            return await CacheCoordinator.shared.images.image(for: resolved(item.fileURL), maxPixelSize: 1080)?.cgImage
        }
        if let poster = item.posterURL,
           let image = await CacheCoordinator.shared.images.image(for: resolved(poster), maxPixelSize: 1080)?.cgImage {
            return image
        }
        guard let url = URL(string: resolved(item.fileURL)) else { return nil }
        let generator = AVAssetImageGenerator(asset: AVURLAsset(url: url))
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(width: 1080, height: 1080)
        return try? await generator.image(at: .zero).image
    }

    /// Le fichier d'un son ou d'une vidéo, copié avec son EXTENSION : AVFoundation
    /// ne reconnaît pas un fichier de cache nommé par son empreinte.
    static func localFile(_ fileURL: String, kind: MessageCardMediaKind) async -> URL? {
        let key = resolved(fileURL)
        let store = kind == .audio ? await CacheCoordinator.shared.audio : await CacheCoordinator.shared.video
        guard let data = try? await store.data(for: key), !data.isEmpty else { return nil }
        let known = URL(string: key)?.pathExtension ?? ""
        let fallback = kind == .audio ? "m4a" : "mp4"
        let target = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-imagine-\(UUID().uuidString)")
            .appendingPathExtension(known.isEmpty ? fallback : known)
        do {
            try data.write(to: target, options: .atomic)
            return target
        } catch {
            return nil
        }
    }

    /// L'onde RÉELLE d'un son : le volume moyen de chaque tampon, ramené à
    /// `count` barres et normalisé à son pic. Vide si le fichier ne se lit pas.
    static func samples(of url: URL, count: Int) async -> [Double] {
        let asset = AVURLAsset(url: url)
        guard let track = try? await asset.loadTracks(withMediaType: .audio).first,
              let reader = try? AVAssetReader(asset: asset) else { return [] }
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 16,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ])
        guard reader.canAdd(output) else { return [] }
        reader.add(output)
        guard reader.startReading() else { return [] }
        var levels: [Double] = []
        while let buffer = output.copyNextSampleBuffer() {
            guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
            let length = CMBlockBufferGetDataLength(block)
            guard length >= 2 else { continue }
            let byteCount = (length / 2) * 2
            var pcm = [Int16](repeating: 0, count: length / 2)
            let status = pcm.withUnsafeMutableBytes { raw -> OSStatus in
                guard let base = raw.baseAddress else { return kCMBlockBufferBadCustomBlockSourceErr }
                return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: byteCount, destination: base)
            }
            guard status == kCMBlockBufferNoErr else { continue }
            levels.append(pcm.reduce(0.0) { $0 + abs(Double($1)) } / Double(pcm.count))
        }
        guard let peak = levels.max(), peak > 0 else { return [] }
        return MessageCardMedia.resample(levels.map { $0 / peak }, count: count)
    }
}
