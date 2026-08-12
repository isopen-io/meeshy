import XCTest
import AVFoundation
import CoreMedia
@testable import MeeshyUI
@testable import MeeshySDK

/// Plafond de POIDS du MP4 exporté.
///
/// Signalement user (2026-07-30) : « ça crée une vidéo de 314 Mo ».
/// Racine : `AVAssetExportSession` n'expose aucun réglage d'encodage — ses
/// presets bornent la DÉFINITION, jamais le débit. Mesuré sur source à forte
/// entropie, `HighestQuality` et `1920x1080` produisaient **le même** 58,8 Mbps,
/// soit 441 Mo la minute. Le pipeline encode désormais via
/// `AVAssetReader` + `AVAssetWriter` avec un `AVVideoAverageBitRateKey` explicite
/// (`StoryExportVideoSettings`).
///
/// ## Le choix de la fixture est LE piège de ce test
/// Un débit ne se mesure ni sur un aplat ni sur du bruit :
/// - **aplat de couleur** → ~0,1 Mbps : un pipeline produisant 300 Mo passerait
///   le test haut la main (première version de cette sonde, inutile) ;
/// - **bruit blanc par pixel** → incompressible ; l'encodeur défonce toute cible
///   (mesuré : cible 2 Mbps → 42,7 Mbps réels) parce que le contrôle de débit
///   H.264 a un plancher de qualité. Aucune caméra ne produit ça.
///
/// La fixture ci-dessous est un **dégradé animé** : contenu structuré et
/// compressible, le régime dans lequel vit une vraie vidéo. Contrôle de la
/// méthode sur ce même contenu : cible 2 Mbps → 2,1 réels ; cible 7,5 → 7,4.
final class StoryExportCompressionTests: XCTestCase {

    /// Un export de contenu détaillé DOIT rester sous le plafond de débit visé.
    ///
    /// Sans plafond, la même fixture montait à plusieurs dizaines de Mbps — c'est
    /// tout l'écart entre un fichier partageable et les 314 Mo signalés.
    @MainActor
    func test_export_detailedContent_staysUnderBitrateCeiling() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let sourceURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("compress_src_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: sourceURL) }
        try await CompressionFixture.makeStructuredVideo(
            duration: 4.0, size: CGSize(width: 1080, height: 1920), at: sourceURL)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("compress_out_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = BackgroundVideoFixture.videoOnlySlide(backgroundURL: sourceURL,
                                                          videoDurationSec: 4.0,
                                                          slideDuration: 4.0,
                                                          loop: false)
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        let measured = try await CompressionFixture.bitrateMbps(of: outputURL)
        let ceiling = Double(StoryExportVideoSettings.averageBitRate(
            for: CanvasGeometry.designSize)) / 1_000_000

        // Marge de 60 % : le contrôle de débit H.264 vise une MOYENNE et dépasse
        // transitoirement sur les premières images-clés d'un clip court. Le test
        // discrimine « plafonné » de « libre » (qui donnait 6 à 8× la cible), pas
        // le pourcentage près.
        XCTAssertLessThan(measured, ceiling * 1.6,
                          "L'export doit rester proche du plafond \(String(format: "%.1f", ceiling)) Mbps — mesuré \(String(format: "%.1f", measured)) Mbps. Un preset sans plafond remonterait à plusieurs dizaines de Mbps.")
    }

    /// Le débit visé se dérive de la surface : un gabarit paysage ne doit pas
    /// hériter d'un débit calibré pour le portrait, et les bornes tiennent.
    func test_averageBitRate_scalesWithSurfaceAndClamps() {
        let portrait = StoryExportVideoSettings.averageBitRate(for: CGSize(width: 1080, height: 1920))
        let landscape = StoryExportVideoSettings.averageBitRate(for: CGSize(width: 1920, height: 1080))
        XCTAssertEqual(portrait, landscape,
                       "Même surface ⇒ même débit, quelle que soit l'orientation")

        let tiny = StoryExportVideoSettings.averageBitRate(for: CGSize(width: 64, height: 64))
        XCTAssertEqual(tiny, StoryExportVideoSettings.minimumBitRate,
                       "Un gabarit minuscule est relevé au plancher de lisibilité")

        let huge = StoryExportVideoSettings.averageBitRate(for: CGSize(width: 7680, height: 4320))
        XCTAssertEqual(huge, StoryExportVideoSettings.maximumBitRate,
                       "Un gabarit géant est ramené au plafond — sinon le problème d'origine revient")
    }

    /// Les réglages remis à `AVAssetWriter` portent réellement le débit calculé :
    /// une clé mal nichée (hors de `AVVideoCompressionPropertiesKey`) serait
    /// ignorée EN SILENCE par AVFoundation.
    func test_videoSettings_carryAverageBitRateInCompressionProperties() throws {
        let size = CanvasGeometry.designSize
        let settings = StoryExportVideoSettings.video(for: size)
        let compression = try XCTUnwrap(
            settings[AVVideoCompressionPropertiesKey] as? [String: any Sendable],
            "Les propriétés de compression doivent être présentes")
        XCTAssertEqual(compression[AVVideoAverageBitRateKey] as? Int,
                       StoryExportVideoSettings.averageBitRate(for: size))
        XCTAssertEqual(settings[AVVideoCodecKey] as? AVVideoCodecType, .h264,
                       "H.264 : l'export part vers Photos / WhatsApp / Android — HEVC n'y est pas universel")
    }
}

// MARK: - Fixture

enum CompressionFixture {

    /// Vidéo à contenu STRUCTURÉ (dégradé animé) — la seule forme qui mesure
    /// honnêtement un débit. Cf. l'en-tête de la suite pour les deux fixtures
    /// qui ne le font pas.
    static func makeStructuredVideo(duration: TimeInterval,
                                    size: CGSize,
                                    at url: URL) async throws {
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        let writer = try AVAssetWriter(url: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
            // Source volontairement encodée haut : le test doit prouver que
            // c'est bien la SORTIE qui est plafonnée, pas l'entrée qui était
            // déjà légère.
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 40_000_000]
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
                kCVPixelBufferWidthKey as String: Int(size.width),
                kCVPixelBufferHeightKey as String: Int(size.height)
            ])
        guard writer.canAdd(input) else {
            throw NSError(domain: "CompressionFixture", code: 1)
        }
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "CompressionFixture", code: 2) }
        writer.startSession(atSourceTime: .zero)

        let fps: Int32 = 30
        for i in 0..<max(1, Int(duration * Double(fps))) {
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 1_000_000)
            }
            guard let pool = adaptor.pixelBufferPool else {
                throw NSError(domain: "CompressionFixture", code: 3)
            }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pb)
            guard let buffer = pb else { throw NSError(domain: "CompressionFixture", code: 4) }
            CVPixelBufferLockBaseAddress(buffer, [])
            if let base = CVPixelBufferGetBaseAddress(buffer) {
                let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
                let height = CVPixelBufferGetHeight(buffer)
                let width = CVPixelBufferGetWidth(buffer)
                let ptr = base.assumingMemoryBound(to: UInt8.self)
                for y in 0..<height {
                    let row = y * bytesPerRow
                    for x in 0..<width {
                        let o = row + x * 4
                        ptr[o] = UInt8((x &+ i &* 3) % 256)
                        ptr[o + 1] = UInt8((y &+ i &* 2) % 256)
                        ptr[o + 2] = UInt8((x &+ y &+ i) % 256)
                        ptr[o + 3] = 255
                    }
                }
            }
            CVPixelBufferUnlockBaseAddress(buffer, [])
            adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps))
        }
        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else {
            throw writer.error ?? NSError(domain: "CompressionFixture", code: 5)
        }
    }

    static func bitrateMbps(of url: URL) async throws -> Double {
        let bytes = (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
        let seconds = CMTimeGetSeconds(try await AVURLAsset(url: url).load(.duration))
        guard seconds > 0 else { return 0 }
        return Double(bytes) * 8 / seconds / 1_000_000
    }
}
