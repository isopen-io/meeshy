import AVFoundation
import CoreImage
import CoreMedia
import QuartzCore
import UIKit
import MeeshySDK

// MARK: - StoryAVCompositor + ImageResolution

extension StoryAVCompositor {
    /// Dernier bitmap de fond décodé, mémoïsé par adresse.
    ///
    /// `resolveBackgroundImage` est appelé à CHAQUE frame ; sans mémo, une story
    /// de 10 s re-décode 300 fois le même JPEG plein cadre. Une seule entrée
    /// suffit : une slide n'a qu'un fond, et l'entrée se remplace d'elle-même dès
    /// que l'adresse change. Isolé `@MainActor` comme `renderFrame`, son unique
    /// lecteur.
    ///
    /// Contrepartie assumée : un bitmap (≈ 8 Mo en 1080×1920) reste retenu après
    /// le dernier export, jusqu'à ce que l'export suivant le remplace. C'est le
    /// prix d'un slot unique sans `deinit` — un `deinit` isolé sur ce type ferait
    /// courir le risque de double-libération documenté par SE-0466 sur iOS < 26.
    @MainActor
    private static var backgroundImageMemo: (key: String, image: UIImage)?

    /// Bitmaps des stickers IMAGE, décodés une fois par jeu d'adresses — et,
    /// pour un fichier ANIMÉ (GIF, APNG…), ses octets (#8610).
    ///
    /// Même contrat que `backgroundImageMemo` : appelé à CHAQUE frame, mémoïsé
    /// sur son entrée — le jeu d'adresses est constant pour toute la session
    /// d'export, donc une seule entrée suffit, remplacée dès que l'entrée change.
    /// Même contrepartie assumée : le dernier jeu de bitmaps reste retenu
    /// jusqu'à l'export suivant.
    @MainActor
    private static var stickerImagesMemo: (urls: [String: URL], files: StickerFiles)?

    private struct StickerFiles {
        let images: [String: UIImage]
        let animations: [String: Data]
    }

    /// Le lecteur SYNCHRONE des bitmaps de stickers pour une session d'export.
    ///
    /// Les adresses sont attendues LOCALES, keyées par `postMediaId` — la voie
    /// du fond (`resolveBackgroundImage`) : `StoryExporter` rapatrie les assets
    /// AVANT la composition, parce qu'ici on est sur le main actor, en
    /// synchrone, une fois par frame. Un fichier qui ne charge pas est omis :
    /// la couche peint alors son repli 🖼️, jamais un trou. `nil` quand la
    /// story n'adresse aucun sticker image, pour que le rendu des autres
    /// stories reste celui d'avant.
    ///
    /// Les octets ANIMÉS voyagent à côté des bitmaps (#8610) : ceux d'un
    /// fichier publié qui est un GIF, et ceux que le composer tient en mémoire
    /// (`animations`, qui priment comme `images`).
    @MainActor
    internal static func stickerImageCache(for stickerImageURLs: [String: URL],
                                           images: [String: UIImage] = [:],
                                           animations: [String: Data] = [:]) -> ImageCacheReader? {
        guard !stickerImageURLs.isEmpty || !images.isEmpty || !animations.isEmpty else { return nil }
        let files = decodedStickerFiles(for: stickerImageURLs)
        // Les bitmaps en mémoire PRIMENT (#8599) : c'est la version que
        // l'auteur voit, retouches comprises. La fusion n'est pas mémoïsée —
        // quelques entrées par frame, et aucune rétention au-delà de l'export.
        return ComposerImageCacheReader(images: files.images.merging(images) { _, memoire in memoire },
                                        animations: files.animations.merging(animations) { _, memoire in memoire },
                                        version: 0)
    }

    @MainActor
    private static func decodedStickerFiles(for stickerImageURLs: [String: URL]) -> StickerFiles {
        guard !stickerImageURLs.isEmpty else { return StickerFiles(images: [:], animations: [:]) }
        if let memo = stickerImagesMemo, memo.urls == stickerImageURLs { return memo.files }
        var images: [String: UIImage] = [:]
        var animations: [String: Data] = [:]
        for (key, url) in stickerImageURLs {
            guard let bytes = try? Data(contentsOf: url), let image = UIImage(data: bytes) else { continue }
            images[key] = image
            if AnimatedImageDecoder.animates(bytes) { animations[key] = bytes }
        }
        let files = StickerFiles(images: images, animations: animations)
        stickerImagesMemo = (stickerImageURLs, files)
        return files
    }

    /// Resolves the bitmap for a slide whose background is an image.
    ///
    /// Priorité IDENTIQUE à celle de `StoryRenderer.renderBackground` : l'entrée
    /// `mediaObjects` marquée `isBackground && kind == .image` d'abord, puis le
    /// fond legacy porté par `StorySlide.mediaURL` (stories d'avant les
    /// mediaObjects, et backdrop statique d'une story moderne — cf.
    /// `StoryItem.toRenderableSlide`). Ce second cas n'était pas couvert : le
    /// renderer annonçait `.image`, le compositor ne trouvait rien, et le fond
    /// sortait noir du MP4.
    ///
    /// L'adresse est attendue LOCALE — `StoryExporter.hydratingLocalMedia` a
    /// rapatrié les URLs distantes avant que la composition ne commence, parce
    /// qu'ici on est sur le main actor, en synchrone, une fois par frame.
    /// Retourne `nil` si l'image ne charge pas — l'appelant laisse alors le
    /// substrat intact.
    @MainActor
    static func resolveBackgroundImage(for slide: StorySlide,
                                               images: [String: UIImage] = [:]) -> UIImage? {
        let candidate: String?
        if let bg = slide.effects.mediaObjects?.first(where: {
            $0.isBackground && $0.kind == .image
        }) {
            // Le bitmap en mémoire du composer prime (#8599) — même clé que
            // `StoryMediaLayer` : `postMediaId`, sinon l'id de l'élément.
            if let inMemory = [bg.postMediaId, bg.id].lazy.compactMap({ images[$0] }).first {
                let key = "memory:\(ObjectIdentifier(inMemory).hashValue)"
                if let memo = backgroundImageMemo, memo.key == key { return memo.image }
                guard let redressee = upright(inMemory) else { return nil }
                backgroundImageMemo = (key, redressee)
                return redressee
            }
            candidate = bg.mediaURL
        } else {
            candidate = slide.mediaURL
        }
        guard let candidate, !candidate.isEmpty else { return nil }

        if let memo = backgroundImageMemo, memo.key == candidate { return memo.image }

        let loaded: UIImage?
        if let url = URL(string: candidate), url.isFileURL {
            loaded = UIImage(contentsOfFile: url.path)
        } else {
            loaded = UIImage(contentsOfFile: candidate)
        }
        // Redressée UNE fois ici plutôt qu'à chaque frame par les peintres : un
        // fond EXIF tourné coûterait sinon une passe de dessin plein cadre par
        // frame exportée.
        guard let image = loaded.flatMap(Self.upright) else { return nil }
        backgroundImageMemo = (candidate, image)
        return image
    }

    /// Le bitmap tel qu'il s'affiche, orientation `.up` — voir
    /// `CanvasImageOrientation.displayCGImage` (#8600).
    @MainActor
    static func upright(_ image: UIImage) -> UIImage? {
        guard image.imageOrientation != .up else { return image }
        guard let cgImage = CanvasImageOrientation.displayCGImage(image) else { return nil }
        return UIImage(cgImage: cgImage, scale: image.scale, orientation: .up)
    }

    /// Paints `image` in `cg` to fill `size`, preserving aspect ratio
    /// (`UIView.ContentMode.scaleAspectFill`). Used by `renderFrame` to bake
    /// the slide's background image before the foreground tree renders on top.
    @MainActor
    static func paintAspectFill(image: UIImage, in cg: CGContext, size: CGSize) {
        guard let cgImage = CanvasImageOrientation.displayCGImage(image) else { return }
        let imageSize = CGSize(width: cgImage.width, height: cgImage.height)
        let imageAspect = imageSize.width / imageSize.height
        let targetAspect = size.width / size.height
        let drawRect: CGRect
        if imageAspect > targetAspect {
            // image is wider — match height, crop horizontally
            let scaledWidth = size.height * imageAspect
            drawRect = CGRect(x: (size.width - scaledWidth) / 2,
                              y: 0,
                              width: scaledWidth,
                              height: size.height)
        } else {
            // image is taller — match width, crop vertically
            let scaledHeight = size.width / imageAspect
            drawRect = CGRect(x: 0,
                              y: (size.height - scaledHeight) / 2,
                              width: size.width,
                              height: scaledHeight)
        }
        cg.saveGState()
        // The caller flipped the context so CALayer.render(in:) consumes
        // a UIKit-style top-down space. `CGContext.draw(_:in:)` draws
        // bottom-up natively, so we re-flip locally around `drawRect`
        // before drawing the CGImage — otherwise the background appears
        // upside-down vs. the live canvas.
        cg.translateBy(x: drawRect.origin.x, y: drawRect.origin.y + drawRect.size.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(cgImage, in: CGRect(origin: .zero, size: drawRect.size))
        cg.restoreGState()
    }

    /// Paints `image` in `cg` to FIT entirely inside `size`, preserving aspect
    /// ratio (`UIView.ContentMode.scaleAspectFit`). Letterbox bands appear if
    /// the image aspect ratio differs from the canvas. Caller paints the
    /// background color first so bands are coloured, not transparent.
    @MainActor
    static func paintAspectFit(image: UIImage, in cg: CGContext, size: CGSize) {
        guard let cgImage = CanvasImageOrientation.displayCGImage(image) else { return }
        let imageSize = CGSize(width: cgImage.width, height: cgImage.height)
        guard imageSize.width > 0, imageSize.height > 0 else { return }
        let scale = min(size.width / imageSize.width, size.height / imageSize.height)
        let drawSize = CGSize(width: imageSize.width * scale,
                              height: imageSize.height * scale)
        let drawRect = CGRect(x: (size.width - drawSize.width) / 2,
                              y: (size.height - drawSize.height) / 2,
                              width: drawSize.width,
                              height: drawSize.height)
        cg.saveGState()
        // Same UIKit top-down compensation as paintAspectFill — flip locally.
        cg.translateBy(x: drawRect.origin.x, y: drawRect.origin.y + drawRect.size.height)
        cg.scaleBy(x: 1, y: -1)
        cg.draw(cgImage, in: CGRect(origin: .zero, size: drawRect.size))
        cg.restoreGState()
    }

    /// Draws the decoded frame of the background video track into `cg`,
    /// honouring the track's `preferredTransform` (camera clips are commonly
    /// stored rotated) and the slide's `videoFitMode` — a direct mirror of the
    /// `.image` background case. `paintAspectFill` / `paintAspectFit` apply the
    /// same UIKit top-down flip the image path relies on.
    @MainActor
    static func paintVideoFrame(_ pixelBuffer: CVPixelBuffer,
                                        transform: CGAffineTransform,
                                        slide: StorySlide,
                                        in cg: CGContext,
                                        size: CGSize) {
        // Les réglages du fond vidéo (#9496), par la chaîne de ses trames lues.
        let ciImage = StoryBackgroundLook.videoFrame(
            orientedFrame(CIImage(cvPixelBuffer: pixelBuffer), preferredTransform: transform),
            effects: slide.effects)
        guard let cgImage = StoryRenderingContext.shared.ciContext.createCGImage(
            ciImage, from: ciImage.extent) else { return }

        let image = UIImage(cgImage: cgImage)
        let gravity = StoryBackgroundLayer.resolveImageGravity(
            naturalSize: image.size,
            canvasSize: size,
            override: slide.effects.backgroundTransform?.videoFitMode)
        if gravity == .resizeAspect {
            if let bgHex = slide.effects.background, let color = HexColor(hex: bgHex)?.uiColor {
                cg.saveGState()
                cg.setFillColor(color.cgColor)
                cg.fill(CGRect(origin: .zero, size: size))
                cg.restoreGState()
            }
            paintAspectFit(image: image, in: cg, size: size)
        } else {
            paintAspectFill(image: image, in: cg, size: size)
        }
    }

    /// **La frame redressée — `preferredTransform` appliquée dans SON repère**
    /// (#8600).
    ///
    /// La transformation d'une piste est exprimée en repère IMAGE, Y vers le
    /// BAS. Une `CIImage` vit en Y vers le HAUT : la poser telle quelle y
    /// inverse le sens de chaque quart de tour, et un clip tourné en portrait
    /// sortait retourné de 180°. On la conjugue donc par le retournement
    /// vertical — vers le repère image avec la hauteur de STOCKAGE, retour
    /// avec la hauteur AFFICHÉE — puis on reloge l'étendue à l'origine.
    nonisolated static func orientedFrame(_ image: CIImage,
                                          preferredTransform transform: CGAffineTransform) -> CIImage {
        guard !transform.isIdentity else { return image }
        let stored = image.extent
        let displayed = stored.applying(transform)
        let toImageSpace = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: stored.height)
        let backToCoreImage = CGAffineTransform(a: 1, b: 0, c: 0, d: -1, tx: 0, ty: displayed.height)
        let oriented = image.transformed(by: toImageSpace
            .concatenating(transform)
            .concatenating(backToCoreImage))
        return oriented.transformed(by: CGAffineTransform(translationX: -oriented.extent.origin.x,
                                                          y: -oriented.extent.origin.y))
    }
}
