#if DEBUG
import AVFoundation
import CoreImage
import UIKit

/// **Une caméra de recette au simulateur** (#9351) — `-MeeshyCaptureFixture` au
/// lancement. Le simulateur n'a pas d'objectif : sans elle, ni le viseur, ni la
/// bande, ni l'édition ne se photographient. DEBUG et simulateur seulement.
nonisolated enum ComposerCaptureFixture {
    static let argument = "-MeeshyCaptureFixture"
    static let upright = CGRect(x: 0, y: 0, width: 1080, height: 1440)
    static let movieCanvas = CGRect(x: 0, y: 0, width: 1080, height: 1920)
    static let movieFrameRate: Int32 = 30
    static let movieFrameCount = 90

    static func isActive(arguments: [String] = ProcessInfo.processInfo.arguments) -> Bool {
        #if targetEnvironment(simulator)
        return arguments.contains(argument)
        #else
        return false
        #endif
    }

    /// Un ciel, un soleil qui se déplace avec `phase` (0…1), une silhouette.
    static func scene(phase: Double) -> CIImage {
        let ciel = CIFilter(name: "CILinearGradient", parameters: [
            "inputPoint0": CIVector(x: 0, y: 1440), "inputColor0": CIColor(red: 0.98, green: 0.62, blue: 0.35),
            "inputPoint1": CIVector(x: 0, y: 0), "inputColor1": CIColor(red: 0.20, green: 0.25, blue: 0.55),
        ])?.outputImage?.cropped(to: upright) ?? CIImage(color: .gray).cropped(to: upright)
        let soleil = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 540 + 260 * cos(phase * 2 * .pi), y: 980),
            "inputRadius0": 120, "inputRadius1": 170,
            "inputColor0": CIColor(red: 1, green: 0.95, blue: 0.7),
            "inputColor1": CIColor(red: 1, green: 0.95, blue: 0.7, alpha: 0),
        ])?.outputImage?.cropped(to: upright) ?? CIImage.empty()
        let silhouette = CIFilter(name: "CIRadialGradient", parameters: [
            "inputCenter": CIVector(x: 540, y: 420), "inputRadius0": 230, "inputRadius1": 236,
            "inputColor0": CIColor(red: 0.12, green: 0.10, blue: 0.16),
            "inputColor1": CIColor(red: 0, green: 0, blue: 0, alpha: 0),
        ])?.outputImage?.cropped(to: upright) ?? CIImage.empty()
        return silhouette.composited(over: soleil.composited(over: ciel))
    }

    /// La scène COUCHÉE, comme le capteur la sert : `ComposerCameraFeed` la redresse (`.right`).
    static func sensorBuffer(phase: Double) -> CVPixelBuffer? {
        let couchee = scene(phase: phase).oriented(.left)
        let image = couchee.transformed(by: CGAffineTransform(translationX: -couchee.extent.minX,
                                                              y: -couchee.extent.minY))
        return buffer(image)
    }

    static func photo() -> UIImage? {
        ComposerLookGPU.context.createCGImage(scene(phase: 0.15), from: upright).map { UIImage(cgImage: $0) }
    }

    /// Un film de 3 s, 30 i/s, 1080×1920 debout (la scène remplie dans le 9:16),
    /// écrit une fois puis relu : un film interrompu n'est jamais servi.
    @concurrent
    static func movie() async -> URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("capture-fixture.mov")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        let brouillon = FileManager.default.temporaryDirectory
            .appendingPathComponent("capture-fixture-\(UUID().uuidString).mov")
        guard await write(to: brouillon) else {
            try? FileManager.default.removeItem(at: brouillon)
            return nil
        }
        do {
            try FileManager.default.moveItem(at: brouillon, to: url)
        } catch {
            guard FileManager.default.fileExists(atPath: url.path) else { return nil }
            try? FileManager.default.removeItem(at: brouillon)
        }
        return url
    }

    @concurrent
    private static func write(to url: URL) async -> Bool {
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mov) else { return false }
        let entree = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(movieCanvas.width), AVVideoHeightKey: Int(movieCanvas.height),
        ])
        let adaptateur = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: entree, sourcePixelBufferAttributes: nil)
        guard writer.canAdd(entree) else { return false }
        writer.add(entree)
        guard writer.startWriting() else { return false }
        writer.startSession(atSourceTime: .zero)
        for index in 0..<movieFrameCount {
            while !entree.isReadyForMoreMediaData { try? await Task.sleep(nanoseconds: 2_000_000) }
            let image = ComposerLookPainter.filled(scene(phase: Double(index) / Double(movieFrameCount)),
                                                   framing: .identity, into: movieCanvas)
            guard let tampon = buffer(image),
                  adaptateur.append(tampon, withPresentationTime: CMTime(value: CMTimeValue(index),
                                                                         timescale: movieFrameRate))
            else {
                writer.cancelWriting()
                return false
            }
        }
        entree.markAsFinished()
        await writer.finishWriting()
        return writer.status == .completed
    }

    private static func buffer(_ image: CIImage) -> CVPixelBuffer? {
        var tampon: CVPixelBuffer?
        let attributs: [CFString: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey: [String: Any](),
            kCVPixelBufferMetalCompatibilityKey: true,
        ]
        guard CVPixelBufferCreate(kCFAllocatorDefault, Int(image.extent.width), Int(image.extent.height),
                                  kCVPixelFormatType_32BGRA, attributs as CFDictionary, &tampon) == kCVReturnSuccess,
              let tampon else { return nil }
        ComposerLookGPU.context.render(image, to: tampon)
        return tampon
    }
}

/// Le pilote de la caméra de recette : 30 trames par seconde dans le guetteur,
/// peintes hors du fil principal, une photo, une copie du film à chaque prise.
@MainActor
final class ComposerCaptureFixtureDriver {
    private var timer: Timer?
    private var phase = 0.0
    private var movie: URL?
    /// Une trame en cours de peinture : la suivante attend la prochaine
    /// échéance plutôt que de s'empiler.
    private var painting = false
    private let painter = DispatchQueue(label: "me.meeshy.composer.capture.fixture", qos: .userInteractive)

    nonisolated deinit {}

    func start(feeding feed: ComposerCameraFeed) {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0 / Double(ComposerCaptureFixture.movieFrameRate),
                                     repeats: true) { [weak self] minuterie in
            guard self != nil else {
                minuterie.invalidate()
                return
            }
            Task { @MainActor [weak self] in self?.tick(feed) }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func photo() -> UIImage? { ComposerCaptureFixture.photo() }

    func movieCopy() async -> URL? {
        if movie == nil { movie = await ComposerCaptureFixture.movie() }
        guard let movie else { return nil }
        let copie = FileManager.default.temporaryDirectory.appendingPathComponent("video_fixture_\(UUID().uuidString).mov")
        do {
            try FileManager.default.copyItem(at: movie, to: copie)
            return copie
        } catch {
            return nil
        }
    }

    private func tick(_ feed: ComposerCameraFeed) {
        guard timer != nil, !painting else { return }
        phase = (phase + 1.0 / 240).truncatingRemainder(dividingBy: 1)
        painting = true
        let instant = phase
        painter.async { [weak self] in
            if let tampon = ComposerCaptureFixture.sensorBuffer(phase: instant) { feed.inject(tampon) }
            guard let self else { return }
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self.painting = false }
            }
        }
    }
}

extension CameraModel {
    /// La photo de recette, publiée comme une vraie prise (aucun enregistrement en galerie).
    func deliverFixturePhoto(_ driver: ComposerCaptureFixtureDriver) {
        guard let image = driver.photo() else { return }
        capturedPhoto = image
        capturedPhotoData = image.jpegData(compressionQuality: 0.9)
        capturedPhotoId = UUID().uuidString
    }

    /// Le film de recette, publié comme un vrai segment.
    func deliverFixtureMovie(_ driver: ComposerCaptureFixtureDriver) {
        Task { @MainActor in
            guard let url = await driver.movieCopy() else { return }
            capturedVideoURL = url
            capturedVideoId = UUID().uuidString
        }
    }
}
#endif
