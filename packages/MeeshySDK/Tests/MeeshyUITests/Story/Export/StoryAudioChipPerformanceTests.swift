import XCTest
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le coût de la puce de son par image exportée** (#8611).
///
/// Une story de 15 s exportée à 30 i/s peint ses puces 450 fois. La première
/// version rasterisait la puce ENTIÈRE à chaque image — capsule, icône SF
/// Symbol, crédit mesuré puis dessiné. Le gabarit met en cache tout ce qui ne
/// varie pas ; il ne reste par image que la lecture du fond (verre), l'onde et
/// le déplacement du crédit.
///
/// Mesuré au SIMULATEUR : les chiffres imprimés (`[perf]`) ordonnent les deux
/// chemins, ils ne disent pas ce que coûte un appareil réel.
@MainActor
final class StoryAudioChipPerformanceTests: XCTestCase {

    private static let exportSize = CGSize(width: 1080, height: 1920)
    private static let frames = 60

    func test_paintPerFrame_cachedTemplates_measure() {
        let slide = Self.slide()
        let geometry = CanvasGeometry(renderSize: Self.exportSize)
        let canvas = ChipCanvas(size: Self.exportSize, fill: .darkGray)
        let painter = StoryAudioChipPainter()

        measure {
            for frame in 0..<Self.frames {
                painter.paint(slide: slide, into: geometry,
                              at: CMTime(value: CMTimeValue(frame), timescale: 30), in: canvas.context)
            }
        }

        XCTAssertEqual(painter.templateBuildCount, 2, "un gabarit par puce, pour toute la session")
    }

    func test_paintPerFrame_reportsCachedVersusRebuilt() {
        let slide = Self.slide()
        let geometry = CanvasGeometry(renderSize: Self.exportSize)
        let canvas = ChipCanvas(size: Self.exportSize, fill: .darkGray)
        let painter = StoryAudioChipPainter()
        painter.paint(slide: slide, into: geometry, at: .zero, in: canvas.context)

        let cached = Self.millisecondsPerFrame { frame in
            painter.paint(slide: slide, into: geometry, at: frame, in: canvas.context)
        }
        let rebuilt = Self.millisecondsPerFrame { frame in
            StoryAudioChipPainter().paint(slide: slide, into: geometry, at: frame, in: canvas.context)
        }

        print(String(format: "[perf] puces de son 1080×1920, 2 puces : %.3f ms/image avec gabarit, %.3f ms/image sans",
                     cached, rebuilt))
        XCTAssertLessThan(cached, rebuilt, "le gabarit doit coûter moins qu'une rasterisation par image")
    }

    private static func millisecondsPerFrame(_ body: (CMTime) -> Void) -> Double {
        let start = CFAbsoluteTimeGetCurrent()
        for frame in 0..<frames {
            body(CMTime(value: CMTimeValue(frame), timescale: 30))
        }
        return (CFAbsoluteTimeGetCurrent() - start) * 1000 / Double(frames)
    }

    private static func slide() -> StorySlide {
        var credit = StoryAudioPlayerObject(id: "credit", x: 0.5, y: 0.3)
        credit.soundId = "sound-1"
        credit.name = "Un crédit assez long pour défiler dans la puce exportée"
        credit.soundAuthorUsername = "auteur"
        let wave = StoryAudioPlayerObject(id: "wave", x: 0.5, y: 0.7)
        var effects = StoryEffects()
        effects.audioPlayerObjects = [credit, wave]
        return StorySlide(id: "perf", effects: effects, duration: 6, order: 0)
    }
}
