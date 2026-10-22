import UIKit
import MeeshySDK

/// Extraction de vignettes filmstrip pour les clips vidéo de la timeline.
/// Atome pur : URL locale → N frames réparties sur la durée, par le générateur
/// unique (`VideoThumbnailGenerator`, #11844) : en lot, et en cache borné keyé
/// URL + nombre + taille, pour que les rebuilds de lanes ne relancent jamais
/// une extraction déjà faite.
enum VideoFilmstrip {

    static func request(url: URL, count: Int, maxHeight: CGFloat, scale: CGFloat) -> VideoThumbnailRequest {
        // Tolérance large : le filmstrip est un repère visuel, pas un montage
        // frame-accurate — les seeks précis coûtent une décompression GOP par frame.
        VideoThumbnailRequest(url: url,
                              instants: .evenlySpaced(count: count, atMostOnePerSecond: false),
                              maximumSize: maximumSize(maxHeight: maxHeight, scale: scale),
                              tolerance: .seconds(0.5))
    }

    static func maximumSize(maxHeight: CGFloat, scale: CGFloat) -> CGSize {
        CGSize(width: maxHeight * 4, height: maxHeight * scale)
    }

    static func frames(url: URL, count: Int, maxHeight: CGFloat, scale: CGFloat) async -> [UIImage] {
        await VideoThumbnailGenerator.shared.images(for: request(url: url, count: count, maxHeight: maxHeight, scale: scale))
    }
}
