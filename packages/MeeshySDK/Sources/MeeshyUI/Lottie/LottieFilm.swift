import Foundation
import QuartzCore
import UIKit
import os
import MeeshySDK
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
/// - Le rendu passe par une `LottieAnimationView` hors écran, jamais par un
///   `LottieAnimationLayer` nu : seule la vue PLACE le calque d'animation
///   (`layoutAnimation()`). Un calque nu le laisse centré sur son origine, et
///   l'image ne montrait qu'un quart du sticker (7 % de pixels opaques contre
///   20 % au web, mesuré le 2026-10-15).
nonisolated public enum LottieFilm {

    /// Le rythme des images rasterisées : celui des films WebP qu'elles
    /// remplacent. Un `LottieView` joue, lui, à la cadence de l'écran.
    public static let rasterFramesPerSecond: Double = 15

    private static let yieldEvery = 4

    // MARK: Lecture

    /// Lit un `.lottie` hors du fil principal, à son tour dans la file de
    /// lecture.
    @concurrent
    public static func load(url: URL) async -> LottieFilmSource? {
        await withCheckedContinuation { continuation in
            reading.async { continuation.resume(returning: read(url)) }
        }
    }

    /// Lit un `.lottie` depuis un appel SYNCHRONE : la lecture part dans la
    /// file de lecture et l'appelant attend — quelques millisecondes pour un
    /// sticker, que lottie-ios refuse de faire sur le fil principal.
    public static func loadNow(url: URL) -> LottieFilmSource? {
        let pending = Pending()
        let done = DispatchSemaphore(value: 0)
        reading.async {
            pending.value = read(url)
            done.signal()
        }
        done.wait()
        return pending.value
    }

    private final class Pending: @unchecked Sendable {
        var value: LottieFilmSource?

        nonisolated deinit {}
    }

    /// Une lecture à la fois : `DotLottieFile` échoue quand plusieurs fichiers
    /// se décompressent en même temps — sur iPhone, 15 lectures simultanées
    /// sur 17 rendaient une erreur et les cases de la feuille restaient vides
    /// (recette du 2026-10-15). Une file série, et non un verrou : les tâches
    /// en attente n'immobilisent aucun fil du pool coopératif. Une lecture
    /// coûte quelques millisecondes ; le cache de lottie-ios sert ensuite les
    /// suivantes sans décompresser.
    private static let reading = DispatchQueue(label: "me.meeshy.lottie-film.reading", qos: .userInitiated)

    private static func read(_ url: URL) -> LottieFilmSource? {
        switch DotLottieFile.SynchronouslyBlockingCurrentThread.loadedFrom(filepath: url.path) {
        case .success(let file):
            return file.animations.first.map { LottieFilmSource($0.animation) }
        case .failure(let error):
            MeeshyLog.logger(.lottieFilm).error("[LottieFilm] lecture de \(url.lastPathComponent, privacy: .public) impossible : \(String(describing: error), privacy: .public)")
            return nil
        }
    }

    // MARK: Rendu

    /// Plafond d'images d'un film : une animation d'un pack tiers peut annoncer
    /// une durée démesurée, et chaque image est une `CGImage` en mémoire.
    public static let maxFrames = 600

    /// Le nombre d'images d'une boucle à `framesPerSecond` (au moins une, au plus
    /// `maxFrames`). Un `fr` à 0 dans le fichier donne une durée infinie ou NaN :
    /// `Int(_:)` y plantait.
    public static func frameCount(duration: TimeInterval, framesPerSecond: Double) -> Int {
        let raw = (duration * framesPerSecond).rounded()
        guard raw.isFinite, raw > 0 else { return 1 }
        return min(maxFrames, max(1, Int(raw)))
    }

    /// La première image, carrée, de `pixelSize` de côté.
    @MainActor
    public static func still(_ source: LottieFilmSource, pixelSize: Int) -> CGImage? {
        Renderer(source, pixelSize: pixelSize)?.image(at: source.animation.startFrame)
    }

    /// Toutes les images d'une boucle, d'un coup — pour un appel synchrone.
    @MainActor
    public static func decodedNow(_ source: LottieFilmSource, pixelSize: Int,
                                  framesPerSecond: Double = rasterFramesPerSecond) -> AnimatedImageDecoder.Decoded? {
        guard let renderer = Renderer(source, pixelSize: pixelSize) else { return nil }
        let times = frameTimes(source, framesPerSecond: framesPerSecond)
        let frames = times.compactMap { renderer.image(at: $0) }
        return decoded(frames, expected: times.count, framesPerSecond: framesPerSecond)
    }

    /// Toutes les images d'une boucle, en rendant la main au fil principal
    /// toutes les `yieldEvery` images. Annulable entre deux lots.
    @MainActor
    public static func decoded(_ source: LottieFilmSource, pixelSize: Int,
                               framesPerSecond: Double = rasterFramesPerSecond) async -> AnimatedImageDecoder.Decoded? {
        guard let renderer = Renderer(source, pixelSize: pixelSize) else { return nil }
        let times = frameTimes(source, framesPerSecond: framesPerSecond)
        var frames: [CGImage] = []
        frames.reserveCapacity(times.count)
        for (index, time) in times.enumerated() {
            if index > 0, index % yieldEvery == 0 {
                await Task.yield()
                if Task.isCancelled { return nil }
            }
            guard let frame = renderer.image(at: time) else { return nil }
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

    /// Une vue Lottie hors écran, à la taille de l'image, réutilisée pour
    /// toutes les images d'un rendu.
    @MainActor
    private struct Renderer {
        let view: LottieAnimationView
        let side: CGFloat

        init?(_ source: LottieFilmSource, pixelSize: Int) {
            guard pixelSize > 0 else { return nil }
            side = CGFloat(pixelSize)
            view = LottieAnimationView(animation: source.animation,
                                       configuration: LottieConfiguration(renderingEngine: .mainThread))
            view.frame = CGRect(x: 0, y: 0, width: side, height: side)
            view.contentMode = .scaleToFill
            view.backgroundColor = .clear
            view.layoutIfNeeded()
        }

        func image(at time: AnimationFrameTime) -> CGImage? {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            view.currentFrame = time
            view.forceDisplayUpdate()
            CATransaction.commit()
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            format.opaque = false
            return UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).image { context in
                view.layer.render(in: context.cgContext)
            }.cgImage
        }
    }
}
