import AVFoundation
import Foundation
import UIKit

/// **Une vignette vidéo, demandée par ce qu'elle doit être** (#11844) : quel
/// fichier, quels instants, quelle taille, quelle tolérance de position.
public struct VideoThumbnailRequest: Equatable, Sendable {

    public enum Instants: Equatable, Sendable {
        /// La première image, ou l'instant `atMost` borné par la durée.
        case start(atMost: Double)
        /// `count` images, au milieu de `count` tranches égales ; au plus une
        /// par seconde de vidéo quand `atMostOnePerSecond`.
        case evenlySpaced(count: Int, atMostOnePerSecond: Bool)
    }

    /// L'écart toléré entre l'instant demandé et l'image rendue : une
    /// tolérance large laisse le décodeur rendre l'image-clé la plus proche,
    /// sans décompresser le groupe d'images qui la précède.
    public enum Tolerance: Equatable, Sendable {
        case exact
        case seconds(Double)
        case any
    }

    public let url: URL
    public let instants: Instants
    public let maximumSize: CGSize?
    public let tolerance: Tolerance
    /// `false` pour un fichier éphémère : sa clé ne servira plus.
    public let cachesResult: Bool

    public init(url: URL,
                instants: Instants = .start(atMost: 0),
                maximumSize: CGSize? = nil,
                tolerance: Tolerance = .any,
                cachesResult: Bool = true) {
        self.url = url
        self.instants = instants
        self.maximumSize = maximumSize
        self.tolerance = tolerance
        self.cachesResult = cachesResult
    }

    /// La première image de `url`, son plus grand côté borné par `maxDimension`.
    public static func firstFrame(of url: URL,
                                  maxDimension: CGFloat? = nil,
                                  tolerance: Tolerance = .any,
                                  cachesResult: Bool = true) -> VideoThumbnailRequest {
        VideoThumbnailRequest(url: url,
                              maximumSize: maxDimension.map { CGSize(width: $0, height: $0) },
                              tolerance: tolerance,
                              cachesResult: cachesResult)
    }

    var cacheKey: String {
        let size = maximumSize.map { "\($0.width)x\($0.height)" } ?? "full"
        return "\(url.absoluteString)|\(instants)|\(size)|\(tolerance)"
    }
}

/// La loi des instants : pure, testable sans vidéo.
public enum VideoThumbnailInstants {

    public static func seconds(for instants: VideoThumbnailRequest.Instants, duration: Double?) -> [Double] {
        let known = duration.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
        switch instants {
        case .start(let atMost):
            guard atMost > 0 else { return [0] }
            return known.map { [min(atMost, $0)] } ?? []
        case let .evenlySpaced(count, atMostOnePerSecond):
            guard let known else { return [] }
            let wanted = max(1, count)
            let slices = atMostOnePerSecond ? min(wanted, max(1, Int(known))) : wanted
            return (0..<slices).map { known * (Double($0) + 0.5) / Double(slices) }
        }
    }

    public static func needsDuration(_ instants: VideoThumbnailRequest.Instants) -> Bool {
        switch instants {
        case .start(let atMost): return atMost > 0
        case .evenlySpaced: return true
        }
    }
}

public enum VideoThumbnailError: Error, Sendable {
    case undecodable
}

/// **Le générateur de vignettes vidéo du dépôt** (#11844) : tous les instants
/// d'une demande partent EN LOT (`AVAssetImageGenerator.images(for:)`, décodage
/// matériel), le résultat est gardé dans un cache borné (`NSCache`, rendu sous
/// pression mémoire), et deux demandes identiques en vol n'en font qu'une.
public actor VideoThumbnailGenerator {

    public static let shared = VideoThumbnailGenerator()

    private let cache = NSCache<NSString, NSArray>()
    private var inFlight: [String: Task<[UIImage], Never>] = [:]

    public init(cacheLimit: Int = 64) {
        cache.countLimit = cacheLimit
    }

    /// Une image par instant demandé, dans l'ordre des instants ; un instant
    /// illisible est omis, un fichier illisible rend une liste vide.
    public func images(for request: VideoThumbnailRequest) async -> [UIImage] {
        let key = request.cacheKey
        if request.cachesResult, let cached = cache.object(forKey: key as NSString) as? [UIImage] {
            return cached
        }
        if let running = inFlight[key] { return await running.value }
        let task = Task { await VideoThumbnailDecoding.decode(request) }
        inFlight[key] = task
        let images = await task.value
        inFlight[key] = nil
        if request.cachesResult, !images.isEmpty {
            cache.setObject(images as NSArray, forKey: key as NSString)
        }
        return images
    }

    public func image(for request: VideoThumbnailRequest) async -> UIImage? {
        await images(for: request).first
    }
}

nonisolated enum VideoThumbnailDecoding {

    @concurrent
    static func decode(_ request: VideoThumbnailRequest) async -> [UIImage] {
        let asset = AVURLAsset(url: request.url)
        let duration: Double? = VideoThumbnailInstants.needsDuration(request.instants)
            ? (try? await asset.load(.duration)).map { CMTimeGetSeconds($0) }
            : nil
        let seconds = VideoThumbnailInstants.seconds(for: request.instants, duration: duration)
        guard !seconds.isEmpty else { return [] }

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        if let maximumSize = request.maximumSize { generator.maximumSize = maximumSize }
        let tolerance = time(of: request.tolerance)
        generator.requestedTimeToleranceBefore = tolerance
        generator.requestedTimeToleranceAfter = tolerance

        let times = seconds.map { CMTime(seconds: $0, preferredTimescale: 600) }
        var decoded: [(time: CMTime, image: CGImage)] = []
        for await result in generator.images(for: times) {
            if let image = try? result.image { decoded.append((time: result.requestedTime, image: image)) }
        }
        return decoded.sorted { $0.time < $1.time }.map { UIImage(cgImage: $0.image) }
    }

    private static func time(of tolerance: VideoThumbnailRequest.Tolerance) -> CMTime {
        switch tolerance {
        case .exact: return .zero
        case .seconds(let seconds): return CMTime(seconds: seconds, preferredTimescale: 600)
        case .any: return .positiveInfinity
        }
    }
}
