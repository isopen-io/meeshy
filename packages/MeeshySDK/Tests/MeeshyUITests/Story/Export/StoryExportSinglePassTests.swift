import XCTest
import AVFoundation
import CoreMedia
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

/// L'emballage de marque est désormais composé DANS le bake
/// (`StoryExporter.export(branding:)`), au lieu d'être posé par une seconde
/// passe d'encodage (`StoryExportBranding.wrap`).
///
/// Cette seconde passe ré-encodait la story ENTIÈRE pour n'ajouter que ~3 s de
/// marque — 2,5 s mesurées sur une story de 10 s. `wrap` reste en place et sert
/// ici de RÉFÉRENCE : le chemin intégré doit produire un fichier équivalent.
@MainActor
final class StoryExportSinglePassTests: XCTestCase {

    private static let storyDuration: TimeInterval = 4.0

    private func makeSlide() -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = [
            StoryTextObject(id: UUID().uuidString, text: "Passe unique",
                            x: 0.5, y: 0.5, fontSize: 56,
                            startTime: 0, duration: Self.storyDuration)
        ]
        effects.timelineDuration = Self.storyDuration
        return StorySlide(id: UUID().uuidString, effects: effects,
                          duration: Self.storyDuration, order: 0)
    }

    private func makeIdentity() -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: "J. Charles N. M.",
                                username: "jcnm", accentColorHex: "6366F1")
    }

    private func inspect(_ url: URL) async throws -> (duration: Double, size: CGSize, hasAudio: Bool) {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        let video = try await asset.loadTracks(withMediaType: .video)
        let audio = try await asset.loadTracks(withMediaType: .audio)
        let size = try await video.first?.load(.naturalSize) ?? .zero
        return (duration, size, !audio.isEmpty)
    }

    private func exportSinglePass(_ slide: StorySlide,
                                  intro: StoryExportIntroContent?,
                                  outro: StoryExportIntroContent?,
                                  renderSize: CGSize) async throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("singlepass-\(UUID().uuidString).mp4")
        let plan = try await StoryExportBranding.makePlan(
            intro: intro, outro: outro, renderSize: renderSize)
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: url, branding: plan)
        }.value
        return url
    }

    private func exportLegacyWrap(_ slide: StorySlide,
                                  intro: StoryExportIntroContent?,
                                  outro: StoryExportIntroContent?,
                                  renderSize: CGSize) async throws -> URL {
        let bare = FileManager.default.temporaryDirectory
            .appendingPathComponent("legacy-\(UUID().uuidString).mp4")
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: bare)
        }.value
        defer { try? FileManager.default.removeItem(at: bare) }
        return try await StoryExportBranding.wrap(
            storyURL: bare, intro: intro, outro: outro, renderSize: renderSize)
    }

    /// Chemin partage / Photos : identité en ouverture ET en fermeture.
    func test_singlePass_withIdentity_matchesWrappedOutput() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let slide = makeSlide()
        let renderSize = StoryExportIntroSizing.renderSize(for: slide)
        let identity = makeIdentity()

        let reference = try await exportLegacyWrap(slide, intro: identity,
                                                   outro: identity, renderSize: renderSize)
        let produced = try await exportSinglePass(slide, intro: identity,
                                                  outro: identity, renderSize: renderSize)
        defer {
            [reference, produced].forEach { try? FileManager.default.removeItem(at: $0) }
        }

        let ref = try await inspect(reference)
        let got = try await inspect(produced)

        XCTAssertEqual(got.duration, ref.duration, accuracy: 0.15,
                       "la passe unique doit livrer la même durée que la chaîne bake + wrap")
        XCTAssertEqual(got.size, ref.size, "gabarit identique")
        XCTAssertTrue(got.hasAudio, "les signatures sonores doivent survivre à l'intégration")
    }

    /// Chemin composer timeline : interlude d'identité, fermeture logo-seule.
    func test_singlePass_logoOnlyOutro_matchesWrappedOutput() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let slide = makeSlide()
        let renderSize = StoryExportIntroSizing.renderSize(for: slide)
        let identity = makeIdentity()

        let reference = try await exportLegacyWrap(slide, intro: identity,
                                                   outro: nil, renderSize: renderSize)
        let produced = try await exportSinglePass(slide, intro: identity,
                                                  outro: nil, renderSize: renderSize)
        defer {
            [reference, produced].forEach { try? FileManager.default.removeItem(at: $0) }
        }

        let ref = try await inspect(reference)
        let got = try await inspect(produced)

        XCTAssertEqual(got.duration, ref.duration, accuracy: 0.15)
        XCTAssertEqual(got.size, ref.size)
    }

    /// Sans identité résolue : pas d'interlude, mais la carte de fin reste due.
    func test_singlePass_withoutIdentity_stillCarriesTheOutro() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let slide = makeSlide()
        let renderSize = StoryExportIntroSizing.renderSize(for: slide)

        let produced = try await exportSinglePass(slide, intro: nil,
                                                  outro: nil, renderSize: renderSize)
        defer { try? FileManager.default.removeItem(at: produced) }

        let got = try await inspect(produced)
        XCTAssertGreaterThan(got.duration, Self.storyDuration,
                             "la carte de fin allonge la story même sans identité")
        XCTAssertEqual(got.size, renderSize)
    }

    /// Garde de non-régression : sans plan, l'export reste la story nue.
    func test_export_withoutBranding_isUnchanged() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let slide = makeSlide()
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("bare-\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: url) }

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: url)
        }.value

        let got = try await inspect(url)
        XCTAssertEqual(got.duration, Self.storyDuration, accuracy: 0.15,
                       "sans emballage, la durée reste celle de la story")
    }
}
