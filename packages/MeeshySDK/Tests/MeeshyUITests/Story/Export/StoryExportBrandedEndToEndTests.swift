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

    /// Fabrique un MP4 « story » qui porte SA PROPRE piste audio, plus courte
    /// que sa vidéo — le cas courant d'une story dont la musique s'arrête avant
    /// la fin. Le chemin `prepend` qui réinsère l'audio de la story derrière
    /// l'interlude n'était exercé par aucun test.
    private func makeStoryWithShorterAudio(video: TimeInterval,
                                           audio: TimeInterval,
                                           size: CGSize) async throws -> URL {
        let frame = UIGraphicsImageRenderer(size: size, format: {
            let f = UIGraphicsImageRendererFormat.default(); f.scale = 1; return f
        }()).image { ctx in
            UIColor.systemOrange.setFill()
            ctx.fill(CGRect(origin: .zero, size: size))
        }.cgImage!
        let videoURL = try await StoryExportIntro.makeClip(image: frame, duration: video, size: size)
        let audioURL = try MeeshyBrandJingle.renderToTemporaryFile()
        defer {
            try? FileManager.default.removeItem(at: videoURL)
            try? FileManager.default.removeItem(at: audioURL)
        }

        let composition = AVMutableComposition()
        let videoAsset = AVURLAsset(url: videoURL)
        let audioAsset = AVURLAsset(url: audioURL)
        if let source = try await videoAsset.loadTracks(withMediaType: .video).first,
           let track = composition.addMutableTrack(withMediaType: .video,
                                                   preferredTrackID: kCMPersistentTrackID_Invalid) {
            try track.insertTimeRange(CMTimeRange(start: .zero,
                                                  duration: try await videoAsset.load(.duration)),
                                      of: source, at: .zero)
        }
        if let source = try await audioAsset.loadTracks(withMediaType: .audio).first,
           let track = composition.addMutableTrack(withMediaType: .audio,
                                                   preferredTrackID: kCMPersistentTrackID_Invalid) {
            let available = try await audioAsset.load(.duration)
            let wanted = CMTime(seconds: audio, preferredTimescale: 600)
            try track.insertTimeRange(CMTimeRange(start: .zero, duration: min(available, wanted)),
                                      of: source, at: .zero)
        }

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-e2e-storyaudio-\(UUID().uuidString).mp4")
        let session = try XCTUnwrap(AVAssetExportSession(asset: composition,
                                                         presetName: AVAssetExportPresetHighestQuality))
        session.outputURL = outputURL
        session.outputFileType = .mp4
        await session.export()
        guard session.status == .completed else {
            throw XCTSkip("fixture non encodable : \(String(describing: session.error))")
        }
        return outputURL
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
        // Fenêtre intérieure à la story, qui est muette — placée APRÈS la queue
        // de fondu du jingle (`duration + crossfadeDuration`), sinon elle
        // capterait l'extinction du jingle et croirait mesurer un débordement.
        let storyRMS = rms(window(samples, from: StoryExportIntro.duration + StoryExportIntro.crossfadeDuration + 0.2,
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

    /// Une story SONORE doit garder son son derrière l'interlude. Et son audio
    /// est très souvent plus court que sa vidéo (la musique s'arrête avant la
    /// fin) : réinsérer la durée VIDÉO sur une piste audio plus courte est
    /// exactement ce qui fait échouer `insertTimeRange`. En cas d'échec le
    /// service livre la story SANS interlude, silencieusement — d'où ce test.
    func test_brandedExport_keepsTheStoryOwnAudio_evenWhenShorterThanItsVideo() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let size = CGSize(width: 270, height: 480)
        let storyVideo: TimeInterval = 3.0
        let storyAudio: TimeInterval = 1.6
        let story = try await makeStoryWithShorterAudio(video: storyVideo, audio: storyAudio, size: size)
        defer { try? FileManager.default.removeItem(at: story) }

        let url = try await StoryExportIntro.prepend(to: story,
                                                     content: makeIntro(),
                                                     renderSize: size)
        defer { try? FileManager.default.removeItem(at: url) }

        let asset = AVURLAsset(url: url)
        let delivered = CMTimeGetSeconds(try await asset.load(.duration))
        XCTAssertEqual(delivered, StoryExportIntro.duration + storyVideo, accuracy: 0.25,
                       "la story sonore ne doit être ni tronquée ni allongée")

        let samples = try await decodeMonoSamples(from: asset)
        try XCTSkipIf(samples.isEmpty, "piste audio non décodable — mesure impossible")
        let rate = Self.decodeSampleRate

        // Le son PROPRE de la story, juste après l'interlude.
        let storyRMS = rms(window(samples, from: StoryExportIntro.duration + 0.2,
                                  to: StoryExportIntro.duration + storyAudio - 0.2, rate: rate))
        XCTAssertGreaterThan(storyRMS, 0.01,
                             "le son de la story doit survivre au préambule (RMS \(storyRMS))")

        // Et le jingle reste sur l'interlude.
        let introRMS = rms(window(samples, from: 0.2, to: 1.8, rate: rate))
        XCTAssertGreaterThan(introRMS, 0.01,
                             "le jingle doit rester audible sur l'interlude (RMS \(introRMS))")
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
