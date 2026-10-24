import CoreGraphics
import Foundation
import ImageIO

/// D'où viennent les illustrations d'un cadre : une couche `image` nomme son fichier
/// (`assets/call-frames/<nom>.webp`) ; une marque les livre dans son pack, le catalogue de base
/// les embarque dans l'app.
protocol CallFrameSceneImageProviding: Sendable {
    nonisolated func image(for src: String, maxPixelSize: CGFloat) -> CGImage?
}

/// Les illustrations embarquées (`Resources/CallFrames/`, copiées à l'octet par le générateur des
/// cadres), décodées à la taille où elles se peignent : une vignette ne décode jamais l'image entière.
/// Les couches qui les portent sont déjà gardées par le cache du peintre : rien n'est gardé ici.
nonisolated struct CallFrameBundleImages: CallFrameSceneImageProviding {
    /// Le fichier d'une couche (image, boucle vidéo) dans le bundle, par son nom.
    static func url(for src: String) -> URL? {
        let name = (src as NSString).lastPathComponent as NSString
        return Bundle.main.url(forResource: name.deletingPathExtension, withExtension: name.pathExtension)
    }

    func image(for src: String, maxPixelSize: CGFloat) -> CGImage? {
        guard let url = Self.url(for: src), let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true,
            kCGImageSourceThumbnailMaxPixelSize: max(1, maxPixelSize.rounded(.up)),
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}

/// **LES ILLUSTRATIONS D'UN CADRE** (#12683) — les couches `image` de sa scène : la MATIÈRE du fond
/// (`back`, posée sur le fond, sous les visages) et la MOULURE de bordure (`front`, sur les traits
/// des cases, sous les ornements et les textes). Peintes avec les couches fixes, une fois : le direct
/// ne les recompose qu'avec la vidéo, sans rien redessiner. Une image absente ne retire que sa couche.
nonisolated enum CallFrameSceneImagePainter {
    static func paint(_ context: CGContext, stage: CallFrameStage, depth: CallFrameSceneDepth,
                      images: any CallFrameSceneImageProviding = CallFrameBundleImages()) {
        stage.look.scene
            .filter { $0.kind == .image && $0.depth == depth }
            .forEach { layer in
                guard let src = layer.src, let image = images.image(for: src, maxPixelSize: max(stage.size.width, stage.size.height)) else { return }
                context.saveGState()
                context.setAlpha(CGFloat(layer.amount ?? 1))
                if let slice = layer.slice {
                    drawNineSlice(context, image, in: stage.bounds, slice: CGFloat(slice))
                } else {
                    CallMontageRenderer.drawImage(context, image, aspectFill: stage.bounds)
                }
                context.restoreGState()
            }
    }

    /// Les neuf morceaux : coins intacts (`slice` du plus petit côté, à la source comme à la
    /// destination), bords étirés dans leur longueur, centre étiré.
    static func nineSlicePieces(source: CGSize, target: CGRect, slice: CGFloat) -> [(source: CGRect, target: CGRect)] {
        let from = min(source.width, source.height) * slice
        let to = min(target.width, target.height) * slice
        let sourceColumns: [CGFloat] = [0, from, source.width - from, source.width]
        let sourceRows: [CGFloat] = [0, from, source.height - from, source.height]
        let targetColumns: [CGFloat] = [target.minX, target.minX + to, target.maxX - to, target.maxX]
        let targetRows: [CGFloat] = [target.minY, target.minY + to, target.maxY - to, target.maxY]
        func cell(_ columns: [CGFloat], _ rows: [CGFloat], column: Int, row: Int) -> CGRect {
            CGRect(x: columns[column], y: rows[row],
                   width: columns[column + 1] - columns[column], height: rows[row + 1] - rows[row])
        }
        return (0 ..< 3).flatMap { row -> [(source: CGRect, target: CGRect)] in
            (0 ..< 3).map { column in
                (source: cell(sourceColumns, sourceRows, column: column, row: row),
                 target: cell(targetColumns, targetRows, column: column, row: row))
            }
        }
    }

    private static func drawNineSlice(_ context: CGContext, _ image: CGImage, in target: CGRect, slice: CGFloat) {
        context.interpolationQuality = .high
        nineSlicePieces(source: CGSize(width: image.width, height: image.height), target: target, slice: slice).forEach { piece in
            guard piece.source.width >= 1, piece.source.height >= 1, piece.target.width > 0, piece.target.height > 0,
                  let cropped = image.cropping(to: piece.source.integral) else { return }
            context.saveGState()
            context.translateBy(x: piece.target.minX, y: piece.target.maxY)
            context.scaleBy(x: 1, y: -1)
            context.draw(cropped, in: CGRect(origin: .zero, size: piece.target.size))
            context.restoreGState()
        }
    }
}
