import AVFoundation
import CoreImage
import ImageIO
import MeeshyUI
import QuartzCore

/// L'orientation qu'une piste DÉCLARE (`preferredTransform`) — les tampons de
/// `AVPlayerItemVideoOutput` arrivent couchés comme ils ont été encodés. Les
/// quatre rotations ET leurs quatre miroirs : un clip de la caméra avant garde
/// le sien. Une rotation écrite par `cos` / `sin` n'est pas un entier exact :
/// les termes s'arrondissent avant de se lire.
nonisolated enum ComposerVideoOrientation {
    static func orientation(of transform: CGAffineTransform) -> CGImagePropertyOrientation {
        switch (transform.a.rounded(), transform.b.rounded(), transform.c.rounded(), transform.d.rounded()) {
        case (0, 1, -1, 0): return .right
        case (0, -1, 1, 0): return .left
        case (-1, 0, 0, -1): return .down
        case (-1, 0, 0, 1): return .upMirrored
        case (1, 0, 0, -1): return .downMirrored
        case (0, 1, 1, 0): return .leftMirrored
        case (0, -1, -1, 0): return .rightMirrored
        default: return .up
        }
    }
}

/// Ce que l'édition attend d'une vidéo en boucle. `configure` reçoit la cadence
/// du palier et l'espace colorimétrique de la CAMÉRA : la boucle et l'export
/// lisent la source dans le même espace, sinon ce qu'on retouche et ce qui part
/// divergent.
protocol ComposerLoopPlayerProviding: ComposerFrameSourcing {
    nonisolated var duration: TimeInterval { get }
    /// La taille de la vidéo DEBOUT, connue avant sa première trame.
    nonisolated var uprightSize: CGSize { get }
    /// La vidéo porte une piste de son (#9754).
    nonisolated var hasAudio: Bool { get }
    @MainActor func configure(fps: Int, declaredSpace: CGColorSpace?)
    @MainActor func play()
    @MainActor func stop()
    @MainActor func setRange(_ range: ClosedRange<TimeInterval>)
    @MainActor func seek(to time: TimeInterval)
    /// La boucle se suspend et l'aperçu montre l'image EXACTE de cet instant ;
    /// `setRange` relance la boucle (#9754).
    @MainActor func scrub(to time: TimeInterval)
    /// Le gain qu'on entend, de 0 (muet) à 1 (#9754).
    @MainActor func setVolume(_ gain: Float)
    @MainActor var currentTime: TimeInterval { get }
}

/// **La vidéo en boucle** (#9352, spec § 4.4) : `AVQueuePlayer` + `AVPlayerLooper`,
/// chaque élément de la boucle sort ses trames par un `AVPlayerItemVideoOutput`
/// (IOSurface, Metal) lu au rythme du palier ; le peintre les peint. Changer de
/// look ne touche pas la lecture ; la découpe reconstruit la boucle sur sa plage.
nonisolated final class ComposerLoopPlayer: NSObject, ComposerLoopPlayerProviding, @unchecked Sendable {
    let duration: TimeInterval
    let uprightSize: CGSize
    let hasAudio: Bool
    var declaredSpace: CGColorSpace? {
        lock.lock()
        defer { lock.unlock() }
        return space
    }

    private let asset: AVURLAsset
    private let whole: CMTimeRange
    private let orientation: CGImagePropertyOrientation
    private let player = AVQueuePlayer()
    private var looper: AVPlayerLooper?
    private var outputs: [ObjectIdentifier: AVPlayerItemVideoOutput] = [:]
    private var link: CADisplayLink?
    private var fps = 30
    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    private var space: CGColorSpace?
    private var handlers: [ObjectIdentifier: @Sendable (TimeInterval) -> Void] = [:]
    /// La règle bouge : une seule recherche vole à la fois (#9754).
    private var chase = ComposerSeekChase()
    private var scrubbing = false

    private static let attributes: [String: any Sendable] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferIOSurfacePropertiesKey as String: [String: String](),
        kCVPixelBufferMetalCompatibilityKey as String: true,
    ]

    nonisolated deinit {}

    private init(asset: AVURLAsset, whole: CMTimeRange, uprightSize: CGSize,
                 orientation: CGImagePropertyOrientation, hasAudio: Bool) {
        self.asset = asset
        self.whole = whole
        self.duration = whole.duration.seconds
        self.uprightSize = uprightSize
        self.orientation = orientation
        self.hasAudio = hasAudio
        super.init()
    }

    /// `nil` ⇒ le fichier ne porte aucune image qui se lise : l'édition ne
    /// s'ouvre pas sur lui.
    @MainActor
    static func load(url: URL) async -> ComposerLoopPlayer? {
        let asset = AVURLAsset(url: url)
        guard let piste = try? await asset.loadTracks(withMediaType: .video).first,
              let naturelle = try? await piste.load(.naturalSize),
              let transformation = try? await piste.load(.preferredTransform),
              let duree = try? await asset.load(.duration),
              duree.isNumeric, duree.seconds > 0 else { return nil }
        let son = (try? await asset.loadTracks(withMediaType: .audio))?.isEmpty == false
        return ComposerLoopPlayer(
            asset: asset, whole: CMTimeRange(start: .zero, duration: duree),
            uprightSize: MeeshyVideoWatermarkBaker.orientedSize(natural: naturelle, transform: transformation),
            orientation: ComposerVideoOrientation.orientation(of: transformation), hasAudio: son)
    }

    func latestImage() -> CIImage? {
        lock.lock()
        let tampon = latest
        lock.unlock()
        return tampon.map { CIImage(cvPixelBuffer: $0).oriented(orientation) }
    }

    /// Poser ou retirer le sien ne touche jamais celui d'un autre peintre.
    func setFrameHandler(_ handler: (@Sendable (_ presentedAt: TimeInterval) -> Void)?, for owner: ObjectIdentifier) {
        lock.lock()
        handlers[owner] = handler
        lock.unlock()
    }

    /// La cadence du palier thermique, et l'espace colorimétrique de la caméra
    /// qui a filmé — celui que l'export déclare aussi.
    @MainActor
    func configure(fps: Int, declaredSpace: CGColorSpace?) {
        self.fps = max(1, fps)
        link?.preferredFramesPerSecond = self.fps
        lock.lock()
        space = declaredSpace
        lock.unlock()
    }

    @MainActor
    func play() {
        if looper == nil { setRange(0...duration) }
        player.play()
        guard link == nil else { return }
        let lien = CADisplayLink(target: ComposerLoopPlayerTick(owner: self),
                                 selector: #selector(ComposerLoopPlayerTick.tick(_:)))
        lien.preferredFramesPerSecond = fps
        lien.add(to: .main, forMode: .common)
        link = lien
    }

    @MainActor
    func stop() {
        link?.invalidate()
        link = nil
        player.pause()
        looper?.disableLooping()
        looper = nil
        player.removeAllItems()
        outputs = [:]
        lock.lock()
        latest = nil
        lock.unlock()
    }

    /// La boucle se reconstruit sur sa plage, bornée au clip. Une plage vide —
    /// ou qui déborde du clip — ferait lever une exception à `AVPlayerLooper` :
    /// elle rejoue le clip entier. Une boucle ne tient pas l'écran allumé (#6221) :
    /// la veille du système reste celle d'un écran qu'on touche.
    @MainActor
    func setRange(_ range: ClosedRange<TimeInterval>) {
        scrubbing = false
        chase.reset()
        looper?.disableLooping()
        player.removeAllItems()
        player.preventsDisplaySleepDuringVideoPlayback = false
        let demandee = CMTimeRange(start: CMTime(seconds: range.lowerBound, preferredTimescale: 600),
                                   end: CMTime(seconds: range.upperBound, preferredTimescale: 600))
        let bornee = demandee.intersection(whole)
        let plage = bornee.isValid && !bornee.isEmpty ? bornee : CMTimeRange.invalid
        let boucle = AVPlayerLooper(player: player, templateItem: AVPlayerItem(asset: asset), timeRange: plage)
        outputs = boucle.loopingPlayerItems.reduce(into: [:]) { sorties, element in
            let sortie = AVPlayerItemVideoOutput(pixelBufferAttributes: Self.attributes)
            element.add(sortie)
            sorties[ObjectIdentifier(element)] = sortie
        }
        looper = boucle
        player.play()
    }

    @MainActor
    func seek(to time: TimeInterval) {
        player.seek(to: CMTime(seconds: time, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
    }

    /// **La frame exacte sous la règle** (#9754) : la boucle cède la place à un
    /// élément du clip ENTIER, en pause — la poignée peut sortir de la plage
    /// que la boucle jouait —, et chaque instant se cherche sans tolérance, une
    /// recherche à la fois (`ComposerSeekChase`).
    @MainActor
    func scrub(to time: TimeInterval) {
        if !scrubbing { beginScrub() }
        guard let cible = chase.request(time) else { return }
        seekExactly(cible)
    }

    @MainActor
    func setVolume(_ gain: Float) {
        player.volume = max(0, min(1, gain))
    }

    @MainActor
    private func beginScrub() {
        scrubbing = true
        chase.reset()
        looper?.disableLooping()
        looper = nil
        player.pause()
        player.removeAllItems()
        let element = AVPlayerItem(asset: asset)
        let sortie = AVPlayerItemVideoOutput(pixelBufferAttributes: Self.attributes)
        element.add(sortie)
        outputs = [ObjectIdentifier(element): sortie]
        player.insert(element, after: nil)
    }

    @MainActor
    private func seekExactly(_ time: TimeInterval) {
        player.seek(to: CMTime(seconds: time, preferredTimescale: 600),
                    toleranceBefore: ComposerSeekChase.tolerance,
                    toleranceAfter: ComposerSeekChase.tolerance) { [weak self] _ in
            guard let lecteur = self else { return }
            Task { @MainActor in lecteur.seekEnded() }
        }
    }

    @MainActor
    private func seekEnded() {
        guard scrubbing, let suivante = chase.completed() else { return }
        seekExactly(suivante)
    }

    @MainActor
    var currentTime: TimeInterval {
        let temps = player.currentTime()
        return temps.isNumeric ? temps.seconds : 0
    }

    /// Le lien d'affichage bat : une trame neuve remplace la dernière, et les
    /// peintres abonnés sont prévenus à l'instant où elle se présente.
    @MainActor
    fileprivate func tick() {
        guard let element = player.currentItem else { return }
        let sortie = outputs[ObjectIdentifier(element)] ?? attachOutput(to: element)
        let instant = CACurrentMediaTime()
        let temps = sortie.itemTime(forHostTime: instant)
        guard sortie.hasNewPixelBuffer(forItemTime: temps),
              let tampon = sortie.copyPixelBuffer(forItemTime: temps, itemTimeForDisplay: nil) else { return }
        lock.lock()
        latest = tampon
        let prevenir = Array(handlers.values)
        lock.unlock()
        prevenir.forEach { $0(instant) }
    }

    /// Filet : un élément de la boucle sans sortie (recréé par le looper) en reçoit une.
    @MainActor
    private func attachOutput(to element: AVPlayerItem) -> AVPlayerItemVideoOutput {
        let sortie = AVPlayerItemVideoOutput(pixelBufferAttributes: Self.attributes)
        element.add(sortie)
        outputs[ObjectIdentifier(element)] = sortie
        return sortie
    }
}

/// La cible du `CADisplayLink` — elle ne retient pas le lecteur, et coupe le lien
/// si le lecteur est parti sans `stop()` (un lien vivant tiendrait 30 réveils par
/// seconde pour rien).
private final class ComposerLoopPlayerTick: NSObject {
    weak var owner: ComposerLoopPlayer?

    nonisolated deinit {}

    init(owner: ComposerLoopPlayer) {
        self.owner = owner
        super.init()
    }

    @objc func tick(_ lien: CADisplayLink) {
        guard let owner else {
            lien.invalidate()
            return
        }
        owner.tick()
    }
}
