import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Bout-en-bout du MP4 livré à l'extérieur : `StoryExporter` bake la story,
/// puis `StoryExportIntro.prepend` la coiffe de l'interlude d'identité et de la
/// signature sonore. C'est EXACTEMENT la séquence de
/// `StoryVideoExportService.prepareExport(slide:languages:intro:…)`.
///
/// Les autres suites d'export couvrent chaque maillon isolément ; celle-ci
/// vérifie le fichier réellement produit — durée, gabarit, et surtout la
/// PRÉSENCE SONORE du jingle sur l'interlude et son SILENCE ensuite. Une
/// concaténation qui compilerait mais poserait un jingle muet passerait toutes
/// les autres assertions.
///
/// Honore `MEESHY_SKIP_EXPORT_TESTS` comme le reste de la pipeline (Metal /
/// AVFoundation pas toujours fiables en CI).
@MainActor
final class StoryExportBrandedEndToEndTests: XCTestCase {

    private static let storyDuration: TimeInterval = 3.0
    /// Fréquence imposée au décodage PCM des mesures ci-dessous.
    private static let decodeSampleRate: Double = 48_000

    // MARK: - Fixture

    private func makeSlide() -> StorySlide {
        let text = StoryTextObject(id: UUID().uuidString,
                                   text: "Bonjour Meeshy",
                                   x: 0.5, y: 0.5,
                                   fontSize: 64,
                                   startTime: 0,
                                   duration: Self.storyDuration)
        var effects = StoryEffects()
        effects.textObjects = [text]
        effects.timelineDuration = Self.storyDuration
        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: Self.storyDuration,
                          order: 0)
    }

    private func makeIntro() -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: "J. Charles N. M.",
                                username: "jcnm",
                                accentColorHex: "6366F1")
    }

    /// Rejoue la séquence du service : bake, puis préambule.
    private func bakeBrandedExport() async throws -> URL {
        let slide = makeSlide()
        let storyURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-e2e-story-\(UUID().uuidString).mp4")
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: storyURL)
        }.value
        defer { try? FileManager.default.removeItem(at: storyURL) }

        return try await StoryExportIntro.prepend(
            to: storyURL,
            content: makeIntro(),
            renderSize: StoryExportIntroSizing.renderSize(for: slide)
        )
    }

    // MARK: - Le fichier livré

    /// Un seul bake, toutes les assertions : l'export réel coûte plusieurs
    /// secondes, le refaire par assertion multiplierait la durée de la suite
    /// sans rien prouver de plus.
    func test_brandedExport_carriesTheIntroThenTheStory() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let url = try await bakeBrandedExport()
        defer { try? FileManager.default.removeItem(at: url) }

        // Le MP4 réel part dans le .xcresult : c'est ce qui permet de
        // l'inspecter hors simulateur (ffprobe, extraction d'images) au lieu de
        // se contenter des assertions ci-dessous.
        let attachment = XCTAttachment(data: try Data(contentsOf: url), uniformTypeIdentifier: "public.mpeg-4")
        attachment.name = "branded-export.mp4"
        attachment.lifetime = .keepAlways
        add(attachment)

        let asset = AVURLAsset(url: url)

        // 1. Durée = interlude + story. C'est la preuve que la story n'a PAS
        //    été écrasée par l'interlude ni tronquée par lui.
        let duration = try await asset.load(.duration)
        let expected = StoryExportIntro.duration + Self.storyDuration
        XCTAssertEqual(CMTimeGetSeconds(duration), expected, accuracy: 0.25,
                       "le MP4 livré doit durer l'interlude PUIS la story")

        // 2. Gabarit constant : une concaténation de tailles différentes
        //    produirait un MP4 qui change de dimensions en cours de route.
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let videoTrack = try XCTUnwrap(videoTracks.first,
                                       "le MP4 livré doit porter une piste vidéo")
        let natural = try await videoTrack.load(.naturalSize)
        XCTAssertEqual(natural.width, CanvasGeometry.designSize.width, accuracy: 1)
        XCTAssertEqual(natural.height, CanvasGeometry.designSize.height, accuracy: 1)

        // 3. L'image de l'interlude est bien en tête : au quart de sa durée,
        //    l'écran est dominé par l'indigo de marque.
        let introPixel = try await averageColour(of: asset, atSeconds: StoryExportIntro.duration * 0.25)
        XCTAssertGreaterThan(introPixel.blue, introPixel.red,
                             "l'interlude doit montrer l'indigo de marque (mesuré \(introPixel))")
        XCTAssertGreaterThan(introPixel.blue, 40,
                             "le voile de lisibilité ne doit pas tout éteindre (mesuré \(introPixel))")

        // 4. La story suit : au milieu de la story, l'image n'est plus
        //    l'interlude — sinon celui-ci aurait mangé toute la vidéo.
        let storyPixel = try await averageColour(of: asset,
                                                 atSeconds: StoryExportIntro.duration + Self.storyDuration / 2)
        XCTAssertLessThan(storyPixel.blue, introPixel.blue / 2,
                          "passé l'interlude, l'image doit avoir changé (interlude \(introPixel) vs story \(storyPixel))")
    }

    /// Le jingle DOIT s'entendre sur l'interlude et se taire ensuite. Mesuré en
    /// amplitude sur le fichier final, pas sur le synthétiseur : c'est le seul
    /// moyen de prouver que la signature sonore a survécu au ré-encodage de la
    /// concaténation.
    func test_brandedExport_soundsTheJingleOverTheIntroOnly() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let url = try await bakeBrandedExport()
        defer { try? FileManager.default.removeItem(at: url) }

        let asset = AVURLAsset(url: url)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        XCTAssertFalse(audioTracks.isEmpty, "le MP4 livré doit porter une piste audio")

        let samples = try await decodeMonoSamples(from: asset)
        // Garde AVANT tout calcul de fenêtre : sur une piste vide, les bornes
        // ci-dessous deviennent négatives et font tomber le process au lieu
        // d'échouer proprement.
        try XCTSkipIf(samples.isEmpty, "piste audio non décodable — mesure impossible")

        let totalSeconds = CMTimeGetSeconds(try await asset.load(.duration))
        // Fréquence RÉELLE de décodage, celle demandée au reader — surtout pas
        // `samples.count / durée vidéo` : la piste audio est plus courte que la
        // vidéo (la story est muette), et cette division décalerait toutes les
        // fenêtres vers l'arrière, jusqu'à mesurer le jingle en croyant mesurer
        // la story.
        let rate = Self.decodeSampleRate
        let audioSeconds = Double(samples.count) / rate

        // Fenêtre intérieure à l'interlude : on évite l'attaque et l'extinction
        // du jingle, dont l'enveloppe est volontairement douce.
        let introRMS = rms(window(samples, from: 0.2, to: min(StoryExportIntro.duration, 1.8), rate: rate))
        // Fenêtre intérieure à la story, qui est muette. Vide si la piste
        // s'arrête avec le jingle — c'est alors du silence, donc conforme.
        let storyRMS = rms(window(samples, from: StoryExportIntro.duration + 0.4,
                                  to: totalSeconds, rate: rate))

        XCTAssertGreaterThan(introRMS, 0.01,
                             "le jingle doit être AUDIBLE sur l'interlude (RMS mesuré \(introRMS))")
        XCTAssertLessThan(storyRMS, introRMS / 4,
                          "le jingle ne doit pas déborder sur la story (intro \(introRMS) vs story \(storyRMS))")
        // La signature sonore ne doit pas non plus s'étaler sur toute la vidéo :
        // elle habille l'interlude, elle ne l'accompagne pas jusqu'au bout.
        XCTAssertLessThan(audioSeconds, totalSeconds,
                          "la piste audio (\(audioSeconds)s) ne doit pas couvrir toute la vidéo (\(totalSeconds)s)")
    }

    // MARK: - Outils de mesure

    /// Fenêtre temporelle bornée aux limites réelles du tableau — une borne
    /// calculée hors bornes ferait tomber le process au lieu d'échouer.
    private func window(_ samples: [Float],
                        from start: TimeInterval,
                        to end: TimeInterval,
                        rate: Double) -> ArraySlice<Float> {
        let lower = max(0, min(Int(start * rate), samples.count))
        let upper = max(lower, min(Int(end * rate), samples.count))
        return samples[lower..<upper]
    }

    private func rms(_ slice: ArraySlice<Float>) -> Double {
        guard !slice.isEmpty else { return 0 }
        let sum = slice.reduce(0.0) { $0 + Double($1) * Double($1) }
        return (sum / Double(slice.count)).squareRoot()
    }

    private func decodeMonoSamples(from asset: AVURLAsset) async throws -> [Float] {
        let reader = try AVAssetReader(asset: asset)
        let tracks = try await asset.loadTracks(withMediaType: .audio)
        let track = try XCTUnwrap(tracks.first)
        let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVLinearPCMBitDepthKey: 32,
            AVLinearPCMIsFloatKey: true,
            AVLinearPCMIsNonInterleaved: false,
            AVNumberOfChannelsKey: 1,
            AVSampleRateKey: Self.decodeSampleRate
        ])
        reader.add(output)
        reader.startReading()

        var samples: [Float] = []
        while let buffer = output.copyNextSampleBuffer() {
            guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
            let length = CMBlockBufferGetDataLength(block)
            guard length >= MemoryLayout<Float>.size else { continue }
            // COPIE plutôt que réinterprétation du pointeur interne : le buffer
            // de CoreMedia n'est ni garanti contigu ni aligné sur 4 octets, et
            // le relire en place fait tomber le process (SIGSEGV constaté).
            var chunk = [Float](repeating: 0, count: length / MemoryLayout<Float>.size)
            let copied = chunk.withUnsafeMutableBytes { destination -> OSStatus in
                guard let base = destination.baseAddress else { return -1 }
                return CMBlockBufferCopyDataBytes(block, atOffset: 0,
                                                  dataLength: length, destination: base)
            }
            guard copied == kCMBlockBufferNoErr else { continue }
            samples.append(contentsOf: chunk)
        }
        return samples
    }

    private struct Pixel { let red: Int; let green: Int; let blue: Int }

    /// Couleur MOYENNE de l'image à `seconds` — l'image entière réduite à un
    /// pixel. Discriminant net entre l'interlude (aplat indigo, moyenne claire)
    /// et la story (fond noir, moyenne quasi nulle), et insensible au cadrage
    /// contrairement à un pixel isolé.
    ///
    /// Le tampon est alloué explicitement : passer `&tableau` à `CGContext` ne
    /// garantit le pointeur que le temps de l'appel, et tout dessin ultérieur
    /// écrirait dans une mémoire libérée — les valeurs relues n'auraient alors
    /// aucun sens, et les assertions passeraient sur du bruit.
    private func averageColour(of asset: AVURLAsset, atSeconds seconds: TimeInterval) async throws -> Pixel {
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        let (image, _) = try await generator.image(at: CMTime(seconds: seconds, preferredTimescale: 600))

        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: 4)
        buffer.initialize(repeating: 0, count: 4)
        defer { buffer.deallocate() }
        let context = try XCTUnwrap(CGContext(data: buffer, width: 1, height: 1,
                                              bitsPerComponent: 8, bytesPerRow: 4,
                                              space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.interpolationQuality = .medium
        context.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        return Pixel(red: Int(buffer[0]), green: Int(buffer[1]), blue: Int(buffer[2]))
    }
}
