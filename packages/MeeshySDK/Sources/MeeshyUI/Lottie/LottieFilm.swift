import Foundation
import QuartzCore
import UIKit
@preconcurrency import Lottie

// MARK: - Un film Lottie, chargé et rasterisé (#10638)

/// **Une animation Lottie chargée**, passée d'un acteur à l'autre.
///
/// `LottieAnimation` vient d'un module compilé en Swift 5 : elle n'est pas
/// `Sendable`. Elle est pourtant IMMUABLE une fois décodée — c'est le modèle
/// que lottie-ios partage lui-même entre ses vues via `DotLottieCache` —, ce
/// qui rend sûr de la porter du fil de lecture au fil principal.
nonisolated public final class LottieFilmSource: @unchecked Sendable {
    public let animation: LottieAnimation

    init(_ animation: LottieAnimation) { self.animation = animation }

    nonisolated deinit {}

    /// Durée d'une boucle, en secondes.
    public var duration: TimeInterval { animation.duration }
}

/// **Le moteur Lottie partagé, côté images** (#10638) — le pendant de
/// `LottieView` pour tout ce qui a besoin de PIXELS : le PNG joint à l'envoi
/// d'un sticker, une vignette, les images d'un canevas de story, une image
/// animée à publier.
///
/// Building block agnostique : il prend une URL de fichier `.lottie` et une
/// définition, sans rien savoir de ce que le film représente.
///
/// - Lecture : hors du fil principal (`DotLottieFile` l'exige), avec le cache
///   de lottie-ios (`DotLottieCache.sharedCache`).
/// - Rendu : moteur « main thread » de lottie-ios, le seul qui dessine dans un
///   `CGContext` (`render(in:)`) ; son `display()` ne fait rien hors du fil
///   principal, d'où `@MainActor`. Le rendu asynchrone rend la main toutes
///   les quelques images pour ne jamais figer un geste.
nonisolated public enum LottieFilm {

    /// Le rythme des images rasterisées : celui des films WebP qu'elles
    /// remplacent. Un `LottieView` joue, lui, à la cadence de l'écran.
    public static let rasterFramesPerSecond: Double = 15

    private static let yieldEvery = 4

    // MARK: Lecture

    /// Lit un `.lottie` hors du fil principal.
    @concurrent
    public static func load(url: URL) async -> LottieFilmSource? {
        read(url)
    }

    /// Lit un `.lottie` depuis un appel SYNCHRONE. Sur le fil principal, la
    /// lecture part sur une file de fond et le fil attend — quelques
    /// millisecondes pour un sticker, que lottie-ios refuse de faire sur le
    /// fil principal lui-même.
    public static func loadNow(url: URL) -> LottieFilmSource? {
        guard Thread.isMainThread else { return read(url) }
        let pending = Pending()
        let done = DispatchSemaphore(value: 0)
        DispatchQueue.global(qos: .userInitiated).async {
            pending.value = read(url)
            done.signal()
        }
        done.wait()
        return pending.value
    }

    private final class Pending: @unchecked Sendable {
        var value: LottieFilmSource?
    }

    private static func read(_ url: URL) -> LottieFilmSource? {
        switch DotLottieFile.SynchronouslyBlockingCurrentThread.loadedFrom(filepath: url.path) {
        case .success(let file):
            return file.animations.first.map { LottieFilmSource($0.animation) }
        case .failure:
            return nil
        }
    }

    // MARK: Rendu

    /// Le nombre d'images d'une boucle à `framesPerSecond` (au moins une).
    public static func frameCount(duration: TimeInterval, framesPerSecond: Double) -> Int {
        max(1, Int((duration * framesPerSecond).rounded()))
    }

    /// La première image, carrée, de `pixelSize` de côté.
    @MainActor
    public static func still(_ source: LottieFilmSource, pixelSize: Int) -> CGImage? {
        let renderer = Renderer(source)
        return renderer.image(at: source.animation.startFrame, pixelSize: pixelSize)
    }

    /// Toutes les images d'une boucle, d'un coup — pour un appel synchrone.
    @MainActor
    public static func decodedNow(_ source: LottieFilmSource, pixelSize: Int,
                                  framesPerSecond: Double = rasterFramesPerSecond) -> AnimatedImageDecoder.Decoded? {
        let renderer = Renderer(source)
        let times = frameTimes(source, framesPerSecond: framesPerSecond)
        let frames = times.compactMap { renderer.image(at: $0, pixelSize: pixelSize) }
        return decoded(frames, expected: times.count, framesPerSecond: framesPerSecond)
    }

    /// Toutes les images d'une boucle, en rendant la main au fil principal
    /// toutes les `yieldEvery` images. Annulable entre deux lots.
    @MainActor
    public static func decoded(_ source: LottieFilmSource, pixelSize: Int,
                               framesPerSecond: Double = rasterFramesPerSecond) async -> AnimatedImageDecoder.Decoded? {
        let renderer = Renderer(source)
        let times = frameTimes(source, framesPerSecond: framesPerSecond)
        var frames: [CGImage] = []
        frames.reserveCapacity(times.count)
        for (index, time) in times.enumerated() {
            if index > 0, index % yieldEvery == 0 {
                await Task.yield()
                if Task.isCancelled { return nil }
            }
            guard let frame = renderer.image(at: time, pixelSize: pixelSize) else { return nil }
            frames.append(frame)
        }
        return decoded(frames, expected: times.count, framesPerSecond: framesPerSecond)
    }

    private static func frameTimes(_ source: LottieFilmSource, framesPerSecond: Double) -> [AnimationFrameTime] {
        let animation = source.animation
        let count = frameCount(duration: animation.duration, framesPerSecond: framesPerSecond)
        let step = animation.framerate / framesPerSecond
        return (0..<count).map { animation.startFrame + CGFloat(Double($0) * step) }
    }

    private static func decoded(_ frames: [CGImage], expected: Int, framesPerSecond: Double) -> AnimatedImageDecoder.Decoded? {
        guard !frames.isEmpty, frames.count == expected else { return nil }
        return AnimatedImageDecoder.Decoded(frames: frames, duration: Double(frames.count) / framesPerSecond, loopCount: 0)
    }

    /// Un calque Lottie hors écran, réutilisé pour toutes les images d'un rendu.
    @MainActor
    private struct Renderer {
        let layer: LottieAnimationLayer
        let bounds: CGRect

        init(_ source: LottieFilmSource) {
            layer = LottieAnimationLayer(animation: source.animation,
                                         configuration: LottieConfiguration(renderingEngine: .mainThread))
            bounds = source.animation.bounds
            layer.frame = bounds
        }

        func image(at time: AnimationFrameTime, pixelSize: Int) -> CGImage? {
            guard pixelSize > 0, bounds.width > 0, bounds.height > 0 else { return nil }
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.currentFrame = time
            layer.forceDisplayUpdate()
            CATransaction.commit()
            let side = CGFloat(pixelSize)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            format.opaque = false
            let image = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
                context.cgContext.scaleBy(x: side / bounds.width, y: side / bounds.height)
                layer.render(in: context.cgContext)
            }
            return image.cgImage
        }
    }
}
