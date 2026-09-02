import XCTest
import AVFoundation
import CoreMedia
import UIKit
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

// MARK: - StoryVideoExportServiceTests
//
// Covers the orchestration responsibilities of `StoryVideoExportService`
// in the author-only "Export to share" flow :
//   1. Drive    — every slide (static or animated) triggers the injected
//                  exporter, propagates progress / phase callbacks, and
//                  threads the chosen `languages` array to the bake. The
//                  compositor synthesises a transparent video track when
//                  no background video exists (see StoryExporter B1).
//   2. Fallback — exporter throws → service returns `nil` so the share UI
//                  surfaces a friendly error to the user.
//   3. Cleanup  — `cleanupExport(at:)` removes the temp MP4 deterministically.

@MainActor
final class StoryVideoExportServiceTests: XCTestCase {

    // MARK: - Factories

    private func makeSUT(
        exporterBehavior: MockStoryExporter.Behavior = .success
    ) -> (sut: StoryVideoExportService, exporter: MockStoryExporter) {
        let exporter = MockStoryExporter(behavior: exporterBehavior)
        let sut = StoryVideoExportService(exporter: exporter)
        return (sut, exporter)
    }

    private func makeStaticSlide() -> StorySlide {
        StorySlide(id: "static-\(UUID().uuidString)",
                   effects: StoryEffects())
    }

    private func makeVideoSlide() -> StorySlide {
        let media = StoryMediaObject(kind: .video, aspectRatio: 1.0)
        return StorySlide(id: "video-\(UUID().uuidString)",
                          effects: StoryEffects(mediaObjects: [media]))
    }

    // MARK: - 1. Drive

    func test_prepareExport_staticSlide_triggersExport_returnsURL() async {
        // Universal export — static slides bake via the same path as
        // animated ones. The synthetic transparent track in
        // StoryExporter (B1) provides a substrate so the compositor can
        // still render text/sticker/image overlays into an MP4.
        let (sut, exporter) = makeSUT()

        let result = await sut.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNotNil(result)
        XCTAssertEqual(exporter.exportCallCount, 1,
                       "Static slide must still invoke the exporter.")
        XCTAssertEqual(result?.pathExtension, "mp4")
        XCTAssertEqual(result, exporter.lastOutputURL)

        if let url = result {
            sut.cleanupExport(at: url)
        }
    }

    func test_prepareExport_staticSlide_emitsExportingPhase() async {
        // The phase callback fires for every export — the share UI relies
        // on `.exporting` to render its progress feedback regardless of
        // the slide's animated content.
        let (sut, _) = makeSUT()
        var phases: [StoryExportPhase] = []

        let url = await sut.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting])

        if let url { sut.cleanupExport(at: url) }
    }

    func test_prepareExport_videoSlide_triggersExport_returnsURL() async {
        let (sut, exporter) = makeSUT(exporterBehavior: .success)

        let result = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNotNil(result)
        XCTAssertEqual(exporter.exportCallCount, 1)
        XCTAssertEqual(result?.pathExtension, "mp4")
        XCTAssertEqual(result, exporter.lastOutputURL)

        if let url = result {
            sut.cleanupExport(at: url)
        }
    }

    func test_prepareExport_videoSlide_emitsExportingPhase() async {
        let (sut, _) = makeSUT(exporterBehavior: .success)
        var phases: [StoryExportPhase] = []

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting])

        if let url { sut.cleanupExport(at: url) }
    }

    func test_prepareExport_progress_propagatesToCallback() async {
        let stubFractions: [Double] = [0.1, 0.45, 0.9, 1.0]
        let (sut, _) = makeSUT(exporterBehavior: .successEmittingProgress(stubFractions))
        let collector = ProgressCollector()

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: { collector.append($0) },
            onPhaseChange: nil
        )

        await Task.yield()
        await Task.yield()

        XCTAssertEqual(collector.collected, stubFractions)

        if let url { sut.cleanupExport(at: url) }
    }

    /// Threads the caller's preferred languages to the exporter so the
    /// baked MP4 reflects the author's chosen export language (Prisme
    /// Linguistique).
    func test_prepareExport_videoSlide_threadsLanguagesToExporter() async {
        let (sut, exporter) = makeSUT(exporterBehavior: .success)

        let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: ["fr", "en"],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertEqual(exporter.lastLanguages, ["fr", "en"])

        if let url { sut.cleanupExport(at: url) }
    }

    /// #4852 — l'index des images de stickers traverse le service jusqu'au
    /// bake, sans quoi le compositor n'a rien à décoder et peint 🖼️.
    func test_prepareExport_threadsStickerImageSourcesToExporter() async {
        let (sut, exporter) = makeSUT(exporterBehavior: .success)
        let sources = ["pm-sticker": "https://cdn.meeshy.test/sticker.png"]

        let url = await sut.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            stickerImageSources: sources,
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertEqual(exporter.lastStickerImageSources, sources)

        if let url { sut.cleanupExport(at: url) }
    }

    /// Le relais SANS index (forme courte du protocole, celle de « Enregistrer
    /// dans Photos ») part avec un index vide — jamais avec un index périmé.
    func test_prepareExport_withoutStickerImageSources_threadsEmptyIndex() async {
        let (sut, exporter) = makeSUT(exporterBehavior: .success)
        let service: StoryVideoExportServiceProviding = sut

        let url = await service.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            watermark: nil,
            intro: nil,
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertEqual(exporter.exportCallCount, 1)
        XCTAssertTrue(exporter.lastStickerImageSources.isEmpty)

        if let url { sut.cleanupExport(at: url) }
    }

    // MARK: - 2. Fallback

    func test_prepareExport_exportFailure_returnsNil() async {
        let (sut, exporter) = makeSUT(
            exporterBehavior: .failure(StoryExporterError.exportFailed("simulated"))
        )

        let result = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        )

        XCTAssertNil(result)
        XCTAssertEqual(exporter.exportCallCount, 1)
        if let attemptedURL = exporter.lastOutputURL {
            XCTAssertFalse(
                FileManager.default.fileExists(atPath: attemptedURL.path),
                "Failed export must not leave an orphan temp file on disk."
            )
        }
    }

    func test_prepareExport_exportFailure_stillEmitsExportingPhase() async {
        let (sut, _) = makeSUT(
            exporterBehavior: .failure(StoryExporterError.sessionCreationFailed)
        )
        var phases: [StoryExportPhase] = []

        _ = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: { phases.append($0) }
        )

        XCTAssertEqual(phases, [.exporting])
    }

    // MARK: - 3. Cleanup

    func test_cleanupExport_existingFile_removesIt() throws {
        let (sut, _) = makeSUT()
        let tmpURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-test-cleanup-\(UUID().uuidString).mp4")
        try Data([0x00, 0x01]).write(to: tmpURL)
        XCTAssertTrue(FileManager.default.fileExists(atPath: tmpURL.path))

        sut.cleanupExport(at: tmpURL)

        XCTAssertFalse(FileManager.default.fileExists(atPath: tmpURL.path))
    }

    func test_cleanupExport_missingFile_isNoop() {
        let (sut, _) = makeSUT()
        let nonexistent = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-test-missing-\(UUID().uuidString).mp4")
        XCTAssertFalse(FileManager.default.fileExists(atPath: nonexistent.path))

        sut.cleanupExport(at: nonexistent)
    }

    func test_prepareExport_successfulExport_leavesFileForCaller() async throws {
        let (sut, _) = makeSUT(exporterBehavior: .success)

        guard let url = await sut.prepareExport(
            slide: makeVideoSlide(),
            languages: [],
            onProgress: nil,
            onPhaseChange: nil
        ) else {
            XCTFail("Expected a non-nil URL for a successful export.")
            return
        }

        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))

        sut.cleanupExport(at: url)
    }

    // MARK: - 4. Emballage de marque — interlude ET carte de fin

    /// Durée du MP4 factice produit par `RealMP4StubExporter`.
    private static let stubStoryDuration: TimeInterval = 2.0

    /// Allongement net apporté par la carte de fin **logo-seule** (aucune
    /// identité d'auteur) : 2 s de carte dont 1,5 s en crossfade par-dessus la
    /// fin de la story (cf.
    /// `StoryExportOutroTests.test_append_extendsStoryByHalfSecond`).
    private static let outroTail: TimeInterval = 0.5

    /// Allongement net de la carte de fin **d'auteur**, en 2 temps depuis la
    /// « carte de fin d'auteur » (Part D, 2026-07-26) : `StoryExportOutro`
    /// insère `logoPhase` (1,5 s) + `identityPhase` (2 s) à `fin − overlap`, et
    /// `overlap` vaut exactement `logoPhase` — la phase logo se superpose donc
    /// entièrement au crossfade et seule la phase d'identité rallonge la vidéo.
    ///
    /// Miroir local de `StoryExportOutro.identityPhase`, `internal` à MeeshyUI
    /// donc invisible ici — même parti pris que `outroTail` juste au-dessus.
    private static let outroAuthorTail: TimeInterval = 2.0

    /// **Régression amplifiée par ce lot.** L'appel à `StoryExportOutro.append`
    /// vivait IMBRIQUÉ dans `guard let intro else { return outputURL }` : une
    /// identité non résolue faisait donc perdre l'interlude ET la carte de fin.
    /// Tant que `intro == nil` voulait dire « pas de session » (cas de bord),
    /// la conséquence restait théorique ; depuis que ce lot borne la résolution
    /// d'identité à 4 s, `intro == nil` est devenu un résultat de course
    /// routinier (première installation, réseau lent) — le branding devenait
    /// non déterministe d'un export à l'autre, sans aucun signal utilisateur.
    ///
    /// La carte de fin ne dépend d'AUCUNE identité : elle doit survivre à
    /// `intro == nil`.
    func test_prepareExport_withoutIntro_stillAppendsTheBrandOutro() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let exporter = RealMP4StubExporter(duration: Self.stubStoryDuration)
        let sut = StoryVideoExportService(exporter: exporter)

        let produced = await sut.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            watermark: nil,
            intro: nil,
            onProgress: nil,
            onPhaseChange: nil
        )
        let url = try XCTUnwrap(produced)
        defer { sut.cleanupExport(at: url) }

        let duration = CMTimeGetSeconds(try await AVURLAsset(url: url).load(.duration))
        XCTAssertEqual(duration, Self.stubStoryDuration + Self.outroTail, accuracy: 0.35,
                       "sans interlude, la carte de fin de marque doit tout de même allonger la vidéo")
        XCTAssertGreaterThan(duration, Self.stubStoryDuration + 0.15,
                             "une vidéo à la durée EXACTE de la story prouve que la carte de fin est retombée sous la dépendance de l'interlude")

        // La story factice est MUETTE : la seule piste audio possible dans le
        // fichier livré est la signature sonore de fermeture de la carte de fin.
        let audio = try await AVURLAsset(url: url).loadTracks(withMediaType: .audio)
        XCTAssertGreaterThanOrEqual(audio.count, 1,
                                    "la carte de fin apporte la signature sonore de fermeture — absente, elle n'a pas été appliquée")
    }

    /// Le pendant : avec une identité résolue, le MP4 porte les DEUX bouts de
    /// l'emballage — interlude en tête, carte de fin en queue.
    func test_prepareExport_withIntro_carriesBothInterludeAndOutro() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let exporter = RealMP4StubExporter(duration: Self.stubStoryDuration)
        let sut = StoryVideoExportService(exporter: exporter)

        let produced = await sut.prepareExport(
            slide: makeStaticSlide(),
            languages: [],
            watermark: nil,
            intro: StoryExportIntroContent(displayName: "Alice", username: "alice",
                                           accentColorHex: "4ECDC4"),
            onProgress: nil,
            onPhaseChange: nil
        )
        let url = try XCTUnwrap(produced)
        defer { sut.cleanupExport(at: url) }

        let duration = CMTimeGetSeconds(try await AVURLAsset(url: url).load(.duration))
        // Une identité d'auteur est fournie ci-dessus, donc la fermeture est
        // celle en 2 temps : c'est `outroAuthorTail` qui s'applique, pas le
        // `outroTail` de la carte logo-seule.
        let expected = StoryExportIntro.duration + Self.stubStoryDuration + Self.outroAuthorTail
        XCTAssertEqual(duration, expected, accuracy: 0.35,
                       "l'export doit porter l'interlude ET la carte de fin")
    }
}

// MARK: - RealMP4StubExporter

/// Exporteur factice qui écrit un VRAI MP4 lisible par AVFoundation (aplat de
/// couleur, muet) plutôt qu'un fichier vide.
///
/// `MockStoryExporter` écrit `Data()` : `StoryExportIntro.prepend` /
/// `StoryExportOutro.append` échouent alors sur un asset invalide et
/// retomberaient silencieusement sur la dégradation gracieuse — un test de
/// l'emballage de marque bâti dessus serait vert quoi qu'il arrive.
final class RealMP4StubExporter: StoryExporting, @unchecked Sendable {

    private let duration: TimeInterval
    private let size: CGSize

    init(duration: TimeInterval, size: CGSize = CGSize(width: 180, height: 320)) {
        self.duration = duration
        self.size = size
    }

    /// `branding` est volontairement ignoré : ce double produit la piste
    /// vidéo BRUTE, et c'est `StoryVideoExportService` qui pose ensuite
    /// l'emballage de marque. Le consommer ici masquerait le fait que
    /// l'emballage est bien appliqué EN AVAL de l'exporteur.
    func export(
        slide: StorySlide,
        to outputURL: URL,
        languages: [String],
        watermark: StoryExportWatermark?,
        branding: StoryExportBranding.Plan?,
        stickerImageSources: [String: String],
        progress: (@Sendable (Double) -> Void)?
    ) async throws {
        let image = UIGraphicsImageRenderer(size: size, format: {
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            return format
        }()).image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(origin: .zero, size: size))
        }.cgImage!
        let clip = try await StoryExportIntro.makeClip(image: image, duration: duration, size: size)
        try? FileManager.default.removeItem(at: outputURL)
        try FileManager.default.moveItem(at: clip, to: outputURL)
        progress?(1.0)
    }
}

// MARK: - ProgressCollector

final class ProgressCollector: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [Double] = []

    func append(_ value: Double) {
        lock.lock()
        storage.append(value)
        lock.unlock()
    }

    var collected: [Double] {
        lock.lock()
        defer { lock.unlock() }
        return storage
    }
}

// MARK: - MockStoryExporter

final class MockStoryExporter: StoryExporting, @unchecked Sendable {

    enum Behavior: Sendable {
        case success
        case successEmittingProgress([Double])
        case failure(Error)
    }

    private let lock = NSLock()
    private var _exportCallCount = 0
    private var _lastOutputURL: URL?
    private var _lastLanguages: [String] = []
    /// Plan d'emballage de marque reçu au dernier appel. Enregistré plutôt
    /// qu'ignoré : sans lui, un test ne pourrait pas distinguer « le plan est
    /// transmis à l'exporteur » de « le plan est perdu en route ».
    private var _lastBranding: StoryExportBranding.Plan?
    /// Index `postMediaId → adresse` des stickers image reçu au dernier appel
    /// (#4852) — enregistré pour la même raison que `_lastBranding`.
    private var _lastStickerImageSources: [String: String] = [:]
    let behavior: Behavior

    init(behavior: Behavior) {
        self.behavior = behavior
    }

    var exportCallCount: Int {
        lock.lock(); defer { lock.unlock() }
        return _exportCallCount
    }

    var lastOutputURL: URL? {
        lock.lock(); defer { lock.unlock() }
        return _lastOutputURL
    }

    var lastLanguages: [String] {
        lock.lock(); defer { lock.unlock() }
        return _lastLanguages
    }

    var lastBranding: StoryExportBranding.Plan? {
        lock.lock(); defer { lock.unlock() }
        return _lastBranding
    }

    var lastStickerImageSources: [String: String] {
        lock.lock(); defer { lock.unlock() }
        return _lastStickerImageSources
    }

    func export(
        slide: StorySlide,
        to outputURL: URL,
        languages: [String],
        watermark: StoryExportWatermark?,
        branding: StoryExportBranding.Plan?,
        stickerImageSources: [String: String],
        progress: (@Sendable (Double) -> Void)?
    ) async throws {
        lock.withLock {
            _exportCallCount += 1
            _lastOutputURL = outputURL
            _lastLanguages = languages
            _lastBranding = branding
            _lastStickerImageSources = stickerImageSources
        }

        switch behavior {
        case .success:
            try Data().write(to: outputURL)

        case .successEmittingProgress(let fractions):
            try Data().write(to: outputURL)
            for fraction in fractions {
                progress?(fraction)
            }

        case .failure(let error):
            throw error
        }
    }
}
