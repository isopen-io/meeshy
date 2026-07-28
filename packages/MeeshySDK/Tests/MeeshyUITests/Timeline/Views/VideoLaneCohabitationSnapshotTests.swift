import XCTest
import SwiftUI
import UIKit
import AVFoundation
@testable import MeeshyUI
@testable import MeeshySDK

/// La cohabitation filmstrip + forme d'onde + courbe de volume dans une piste
/// de 52 pt était le point que le plan renvoyait à une vérification sur
/// appareil : « ne se juge pas au test ».
///
/// Elle se juge en fait très bien, à condition de monter la VRAIE barre avec
/// une vidéo qui a réellement du son. `loadedWaveform` est un `@State` alimenté
/// par une `.task` : un rendu hors fenêtre (`ImageRenderer`) ne la déclencherait
/// jamais et on photographierait une piste sans onde, ce qui ne prouverait
/// rien. On monte donc dans une fenêtre et on laisse la tâche aboutir.
@MainActor
final class VideoLaneCohabitationSnapshotTests: XCTestCase {

    /// Hauteur réelle d'une piste de la timeline.
    private static let laneHeight: CGFloat = 52

    func test_snapshot_videoLane_filmstripWaveformAndCurve() async throws {
        let tone = try Self.makeTremoloFile(seconds: 4)
        defer { try? FileManager.default.removeItem(at: tone) }

        // Préchauffe le cache : la `.task` de la barre relira la même clé et
        // aboutira sans attendre un second décodage.
        let warm = await AudioWaveform.samples(url: tone, count: 128)
        XCTAssertFalse(warm.isEmpty, "Le fixture doit porter une piste audio lisible")

        let bar = VideoClipBar(
            clipId: "clip-1",
            title: "prise_02.mp4",
            startTime: 0,
            duration: 6,
            fadeIn: 0,
            fadeOut: 0,
            isSelected: false,
            isLocked: false,
            isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: Self.laneHeight,
            frames: Self.filmstrip(),
            videoURL: tone,
            keyframes: [
                StoryKeyframe(time: 0, volume: 1.0, easing: .linear),
                StoryKeyframe(time: 2, volume: 0.15, easing: .linear),
                StoryKeyframe(time: 4, volume: 0.9, easing: .linear),
                StoryKeyframe(time: 6, volume: 0.35, easing: .linear)
            ],
            onTap: {}, onDoubleTap: {},
            onTrimStartDelta: { _ in }, onTrimEndDelta: { _ in }, onMoveDelta: { _ in }
        )

        let image = try await Self.renderMounted(
            bar.frame(width: 360, height: Self.laneHeight, alignment: .leading),
            size: CGSize(width: 360, height: Self.laneHeight)
        )

        // La preuve que la bande d'onde est bien montée : le bas de la piste
        // porte des pixels CLAIRS (l'onde est blanche à 70 %) que le fond vert
        // du clip ne produit pas. Sans elle, le test photographierait une piste
        // sans onde et le rendu ne prouverait rien.
        let waveBandIsLit = Self.hasBrightPixels(image,
                                                 in: CGRect(x: 20, y: 36, width: 320, height: 14))
        XCTAssertTrue(waveBandIsLit, "La bande de forme d'onde n'est pas rendue")

        Self.attach(image, named: "video-lane-52pt", to: self)
    }

    /// Le cas qui a motivé les trois bandes : une courbe PLATE à mi-course.
    /// Superposée, elle barrait le titre ; le niveau nominal, lui, se collait
    /// en haut — aucune position n'était sûre tant que les deux calques
    /// partageaient la même hauteur.
    func test_snapshot_videoLane_flatCurveStaysOutOfTheTitleBand() async throws {
        let tone = try Self.makeTremoloFile(seconds: 4)
        defer { try? FileManager.default.removeItem(at: tone) }
        _ = await AudioWaveform.samples(url: tone, count: 128)

        let bar = VideoClipBar(
            clipId: "clip-2",
            title: "plan_serré_final.mp4",
            startTime: 0, duration: 6, fadeIn: 0, fadeOut: 0,
            isSelected: false, isLocked: false, isDark: false,
            geometry: TimelineGeometry(zoomScale: 1.0),
            laneHeight: Self.laneHeight,
            frames: Self.filmstrip(),
            videoURL: tone,
            keyframes: [StoryKeyframe(time: 0, volume: 0.5, easing: .linear),
                        StoryKeyframe(time: 6, volume: 0.5, easing: .linear)],
            onTap: {}, onDoubleTap: {},
            onTrimStartDelta: { _ in }, onTrimEndDelta: { _ in }, onMoveDelta: { _ in }
        )

        let image = try await Self.renderMounted(
            bar.frame(width: 360, height: Self.laneHeight, alignment: .leading),
            size: CGSize(width: 360, height: Self.laneHeight)
        )

        // La courbe vit dans SA bande, entre le titre et la forme d'onde.
        let titleBand = CGRect(x: 30, y: 1, width: 300,
                               height: VideoClipBar.titleBandHeight - 3)
        XCTAssertFalse(Self.hasWarmPixels(image, in: titleBand),
                       "La courbe entre dans la bande du titre et le barre")

        let curveBand = CGRect(x: 30, y: VideoClipBar.titleBandHeight + 1, width: 300,
                               height: Self.laneHeight - 4
                                   - VideoClipBar.titleBandHeight
                                   - VideoClipBar.waveformBandHeight - 2)
        XCTAssertTrue(Self.hasWarmPixels(image, in: curveBand),
                      "La courbe n'est pas tracée dans sa bande")

        Self.attach(image, named: "video-lane-52pt-flat", to: self)
    }

    // MARK: - Rendu monté

    /// Monte la vue dans une vraie fenêtre, laisse ses `.task` s'exécuter, puis
    /// photographie la couche.
    private static func renderMounted<V: View>(_ view: V, size: CGSize) async throws -> UIImage {
        let host = UIHostingController(rootView: view)
        // Sans cette ligne, la fenêtre impose ses marges de sécurité et pousse
        // la piste vers le bas : on photographierait un cadrage qui n'existe
        // nulle part dans l'application.
        if #available(iOS 16.4, *) { host.safeAreaRegions = [] }
        host.view.frame = CGRect(origin: .zero, size: size)
        host.view.backgroundColor = .white

        let window = UIWindow(frame: CGRect(origin: .zero, size: size))
        window.rootViewController = host
        window.isHidden = false
        window.layoutIfNeeded()

        // Les `.task` de SwiftUI démarrent à l'apparition et rendent la main au
        // run loop. Une seule respiration ne suffit pas : on en accorde
        // plusieurs, bornées, plutôt qu'un `sleep` unique choisi au hasard.
        for _ in 0..<40 {
            await Task.yield()
            try await Task.sleep(nanoseconds: 20_000_000)
            host.view.setNeedsLayout()
            host.view.layoutIfNeeded()
        }

        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            host.view.layer.render(in: ctx.cgContext)
        }
    }

    // MARK: - Fixtures

    /// Vignettes de filmstrip contrastées — des aplats unis suffisent : on juge
    /// la COHABITATION des trois calques, pas la fidélité des images.
    private static func filmstrip() -> [UIImage] {
        [UIColor.systemBlue, .systemTeal, .systemIndigo,
         .systemPurple, .systemBrown, .systemGreen].map { color in
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: 60, height: 48))
            return renderer.image { ctx in
                color.setFill()
                ctx.fill(CGRect(x: 0, y: 0, width: 60, height: 48))
            }
        }
    }

    /// Sinus à 440 Hz dont l'amplitude respire : une onde d'enveloppe PLATE ne
    /// dirait rien de sa lisibilité — c'est le relief qu'on cherche à voir.
    private static func makeTremoloFile(seconds: Double) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("lane-tone-\(UUID().uuidString).caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
        let file = try AVAudioFile(forWriting: url, settings: format.settings)
        let frames = AVAudioFrameCount(44100 * seconds)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        let samples = buffer.floatChannelData![0]
        for i in 0..<Int(frames) {
            let t = Float(i) / 44100
            let envelope = 0.15 + 0.8 * abs(sinf(2 * .pi * 0.7 * t))
            samples[i] = envelope * sinf(2 * .pi * 440 * t)
        }
        try file.write(from: buffer)
        return url
    }

    // MARK: - Lecture de pixels

    /// `true` si la zone contient des pixels ORANGES — la teinte de la courbe
    /// de volume, qu'aucune vignette du filmstrip de test ne produit.
    private static func hasWarmPixels(_ image: UIImage, in rect: CGRect) -> Bool {
        pixelCount(image, in: rect) { r, g, b in
            r > 200 && g > 120 && g < 200 && b < 110
        } > 20
    }

    /// `true` si la zone contient des pixels nettement plus clairs que le fond
    /// vert du clip.
    private static func hasBrightPixels(_ image: UIImage, in rect: CGRect) -> Bool {
        pixelCount(image, in: rect) { r, g, b in
            let luma: Double = 0.299 * Double(r) + 0.587 * Double(g) + 0.114 * Double(b)
            return luma > 200
        } > 50
    }

    private static func pixelCount(_ image: UIImage, in rect: CGRect,
                                   matching predicate: (UInt8, UInt8, UInt8) -> Bool) -> Int {
        guard let cg = image.cgImage else { return 0 }
        let scale = image.scale
        let crop = CGRect(x: rect.minX * scale, y: rect.minY * scale,
                          width: rect.width * scale, height: rect.height * scale)
        guard let region = cg.cropping(to: crop) else { return 0 }

        let width = region.width, height = region.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let ctx = CGContext(data: &pixels, width: width, height: height,
                                  bitsPerComponent: 8, bytesPerRow: width * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
        else { return 0 }
        ctx.draw(region, in: CGRect(x: 0, y: 0, width: width, height: height))

        var matches = 0
        for p in stride(from: 0, to: pixels.count, by: 4)
        where predicate(pixels[p], pixels[p + 1], pixels[p + 2]) {
            matches += 1
        }
        return matches
    }

    /// Joint l'image au rapport de test ET l'écrit sur disque, pour qu'elle
    /// puisse être REGARDÉE — c'est tout l'objet de ce test.
    private static func attach(_ image: UIImage, named name: String, to testCase: XCTestCase) {
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        testCase.add(attachment)

        guard let data = image.pngData() else { return }
        let out = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("\(name).png")
        try? data.write(to: out)
        print("LANE_SNAPSHOT_PATH=\(out.path)")
    }
}
