import Foundation
import AVFoundation
import UIKit
import MeeshySDK
import MeeshyUI

/// Un son lu par l'atelier : son onde RÉELLE (du début à la fin), sa durée
/// lue dans le fichier, et le fichier local — la piste d'une carte animée.
nonisolated struct MessageCardLoadedSound: Sendable {
    let samples: [Double]
    let duration: Double?
    let file: URL?
}

/// Ce que l'atelier a chargé pour peindre les médias d'une carte : les pixels
/// (photo, première image d'une vidéo) par média, et les sons par ADRESSE de
/// piste — une langue d'export qui sert une autre piste en fait lire une
/// autre (#8979), sans relire celles déjà là.
nonisolated struct MessageCardLoadedMedia: Sendable {
    let pictures: MessageCardPictures
    let sounds: [String: MessageCardLoadedSound]
    /// Les médias VISUELS dont les pixels ne sont pas arrivés — l'atelier le
    /// dit et offre de réessayer (#8901) : un cadre à sa couleur d'attente,
    /// muet, se lisait « pas de pièce ».
    var failed: [String] = []

    static let empty = MessageCardLoadedMedia(pictures: .none, sounds: [:])

    /// Une photo ou une vidéo sans pixels est en ÉCHEC ; un son n'a pas de pixels à attendre.
    static func failures(of items: [MessageCardSubjectMedia], painted: Set<String>) -> [String] {
        items.filter { $0.media.kind != .audio && !painted.contains($0.media.id) }.map(\.media.id)
    }

    /// Les médias tels qu'on les peint : chaque son avec l'onde et la durée de SA piste.
    func media(of items: [MessageCardSubjectMedia]) -> [MessageCardMedia] {
        items.map { item in
            guard item.media.kind == .audio, let sound = sounds[item.fileURL] else { return item.media }
            let timed = item.media.with(duration: item.media.duration ?? sound.duration)
            return sound.samples.isEmpty ? timed : timed.with(samples: sound.samples)
        }
    }

    /// Le fichier local du son PEINT — le premier son de la carte —, ou `nil` :
    /// jamais la voix d'un autre son sous sa transcription (revue #8979).
    func soundFile(of items: [MessageCardSubjectMedia]) -> URL? {
        items.first { $0.media.kind == .audio }.flatMap { sounds[$0.fileURL]?.file }
    }

    /// Ce qu'il reste à charger : les visuels sans pixels, les sons sans
    /// fichier — pas encore lus, ou en ÉCHEC : « Réessayer » les relit (revue #8979).
    func missing(_ items: [MessageCardSubjectMedia]) -> [MessageCardSubjectMedia] {
        items.filter { item in
            item.media.kind == .audio ? sounds[item.fileURL]?.file == nil : pictures.images[item.media.id] == nil
        }
    }

    /// Les pièces en ÉCHEC pour ce que l'atelier va produire : une photo ou
    /// une vidéo sans pixels ; en VIDÉO, le son peint dont le fichier n'a pas
    /// pu se lire — la vidéo partirait muette. L'atelier le dit et offre de
    /// réessayer, jamais une « Animation enregistrée » sans voix (revue #8979).
    func failures(of items: [MessageCardSubjectMedia], output: MessageCardOutput) -> [String] {
        guard output == .video, let sound = items.first(where: { $0.media.kind == .audio }),
              let read = sounds[sound.fileURL], read.file == nil else { return failed }
        return failed + [sound.media.id]
    }

    /// Une vidéo peut-elle partir avec sa voix ? Le son peint doit être LÀ —
    /// un son encore en chemin la retient, sans avis.
    func hearsThePaintedSound(of items: [MessageCardSubjectMedia]) -> Bool {
        !items.contains { $0.media.kind == .audio } || soundFile(of: items) != nil
    }

    /// Ce qui vient d'être chargé, ajouté à ce qui l'était — les échecs relus sur `items`.
    func merging(_ loaded: MessageCardLoadedMedia, for items: [MessageCardSubjectMedia]) -> MessageCardLoadedMedia {
        let images = pictures.images.merging(loaded.pictures.images) { _, new in new }
        return MessageCardLoadedMedia(
            pictures: MessageCardPictures(images),
            sounds: sounds.merging(loaded.sounds) { _, new in new },
            failed: Self.failures(of: items, painted: Set(images.keys))
        )
    }
}

/// **LE CHARGEMENT DES MÉDIAS D'UNE CARTE « IMAGINE »** (#8692) — côté
/// application : il parle aux caches nommés du produit (`CacheCoordinator`) et
/// résout les adresses (`MeeshyConfig`), ce que le SDK ne fait jamais.
///
/// Toujours appelé HORS du MainActor (`Task.detached`). Un média qui ne se
/// charge pas garde sa couleur d'attente et est NOMMÉ dans `failed` : l'atelier
/// le dit, offre de réessayer, et la carte reste enregistrable — jamais
/// d'écran bloqué sur le réseau.
nonisolated enum MessageCardMediaLoader {

    /// La finesse de l'onde lue : une vingtaine de valeurs par seconde — de
    /// quoi découper un extrait et faire danser le spectre (#8979).
    static let levelsPerSecond: Double = 24
    static let maxLevels = 2_400

    static func load(_ items: [MessageCardSubjectMedia]) async -> MessageCardLoadedMedia {
        var images: [String: CGImage] = [:]
        var sounds: [String: MessageCardLoadedSound] = [:]
        for item in items {
            switch item.media.kind {
            case .image, .video:
                if let image = await picture(item) { images[item.media.id] = image }
            case .audio:
                guard sounds[item.fileURL] == nil else { continue }
                let file = await localFile(item.fileURL, kind: .audio)
                sounds[item.fileURL] = await sound(file)
            }
        }
        return MessageCardLoadedMedia(
            pictures: MessageCardPictures(images), sounds: sounds,
            failed: MessageCardLoadedMedia.failures(of: items, painted: Set(images.keys))
        )
    }

    private static func sound(_ file: URL?) async -> MessageCardLoadedSound {
        guard let file else { return MessageCardLoadedSound(samples: [], duration: nil, file: nil) }
        let seconds = try? await AVURLAsset(url: file).load(.duration).seconds
        let duration = seconds.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
        return MessageCardLoadedSound(samples: await samples(of: file), duration: duration, file: file)
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
        let store = await (kind == .audio ? CacheCoordinator.shared.audio : CacheCoordinator.shared.video)
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

    /// L'onde RÉELLE d'un son : le volume moyen de chaque tranche d'un
    /// vingt-quatrième de seconde, normalisé à son pic — de quoi découper un
    /// extrait et faire danser le spectre. Vide si le fichier ne se lit pas.
    static func samples(of url: URL) async -> [Double] {
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
            let sampleCount = length / 2
            var pcm = [Int16](repeating: 0, count: sampleCount)
            let status = pcm.withUnsafeMutableBytes { raw -> OSStatus in
                guard let base = raw.baseAddress else { return kCMBlockBufferBadCustomBlockSourceErr }
                return CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: sampleCount * 2, destination: base)
            }
            guard status == kCMBlockBufferNoErr else { continue }
            let chunk = max(1, chunkLength(of: buffer))
            levels.append(contentsOf: stride(from: 0, to: pcm.count, by: chunk).map { start in
                let slice = pcm[start..<min(pcm.count, start + chunk)]
                return slice.reduce(0.0) { $0 + abs(Double($1)) } / Double(slice.count)
            })
        }
        guard let peak = levels.max(), peak > 0 else { return [] }
        let normalized = levels.map { $0 / peak }
        return normalized.count > maxLevels ? MessageCardMedia.resample(normalized, count: maxLevels) : normalized
    }

    /// Combien de valeurs PCM font une tranche de `1 / levelsPerSecond` seconde dans ce tampon.
    private static func chunkLength(of buffer: CMSampleBuffer) -> Int {
        guard let format = CMSampleBufferGetFormatDescription(buffer),
              let basic = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee,
              basic.mSampleRate > 0 else { return 2_048 }
        return Int(basic.mSampleRate / levelsPerSecond) * Int(max(1, basic.mChannelsPerFrame))
    }
}
