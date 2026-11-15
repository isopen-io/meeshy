import XCTest
import AVFoundation
import CoreMedia
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

/// `StoryExportBranding.wrap` remplace l'enchaînement
/// `StoryExportIntro.prepend` → `StoryExportOutro.append` par UNE seule passe.
///
/// Les deux passes historiques ne posaient chacune que quelques secondes de
/// marque, mais chacune ré-encodait la story ENTIÈRE — leur
/// `AVMutableVideoCompositionInstruction` couvre toute la timeline, ce qui
/// interdit tout passthrough. Un export payait donc trois encodages complets
/// pour un seul fichier livré.
///
/// Le contrat de ces tests est l'ÉQUIVALENCE OBSERVABLE : la passe unique doit
/// produire le même fichier que la chaîne qu'elle remplace — même durée, même
/// gabarit, mêmes pistes.
@MainActor
final class StoryExportBrandingTests: XCTestCase {

    /// 4 s : au-delà de `holdDuration + outroOverlap`, donc le fondu d'entrée et
    /// celui de la carte de fin ne se touchent pas. C'est le régime réel — une
    /// story fait au minimum 6 s (`StoryEffects.contentDerivedDuration`).
    private static let storyDuration: TimeInterval = 4.0

    private func makeSlide() -> StorySlide {
        let text = StoryTextObject(id: UUID().uuidString,
                                   text: "Marque",
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

    private func bakeStory(_ slide: StorySlide) async throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("branding-story-\(UUID().uuidString).mp4")
        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: url)
        }.value
        return url
    }

    private func inspect(_ url: URL) async throws -> (duration: Double, size: CGSize, hasAudio: Bool) {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        let size = try await videoTracks.first?.load(.naturalSize) ?? .zero
        return (duration, size, !audioTracks.isEmpty)
    }

    /// Avec identité : la passe unique doit rendre le même fichier que
    /// `prepend` suivi de `append`.
    @MainActor
    func test_wrap_withIntro_matchesLegacyTwoPassChain() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let slide = makeSlide()
        let renderSize = StoryExportIntroSizing.renderSize(for: slide)
        let intro = makeIntro()

        // Référence : la chaîne historique en deux passes.
        let storyA = try await bakeStory(slide)
        let prepended = try await StoryExportIntro.prepend(to: storyA, content: intro,
                                                           renderSize: renderSize)
        let legacy = try await StoryExportOutro.append(to: prepended, renderSize: renderSize,
                                                       content: intro)
        defer {
            [storyA, prepended, legacy].forEach { try? FileManager.default.removeItem(at: $0) }
        }

        // Passe unique.
        let storyB = try await bakeStory(slide)
        let merged = try await StoryExportBranding.wrap(storyURL: storyB, intro: intro,
                                                        outro: intro, renderSize: renderSize)
        defer {
            [storyB, merged].forEach { try? FileManager.default.removeItem(at: $0) }
        }

        let ref = try await inspect(legacy)
        let got = try await inspect(merged)

        XCTAssertEqual(got.duration, ref.duration, accuracy: 0.1,
                       "la passe unique doit livrer la même durée que la chaîne qu'elle remplace")
        XCTAssertEqual(got.size, ref.size, "gabarit identique")
        XCTAssertTrue(got.hasAudio, "les signatures sonores de marque doivent survivre à la fusion")
    }

    /// Sans identité résolue (course réseau, première installation) : pas
    /// d'interlude, mais la carte de fin logo-seule reste due — c'est
    /// l'invariant que la revue de 2026-07-26 avait justement rétabli.
    @MainActor
    func test_wrap_withoutIntro_stillAppendsBrandOutro() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let slide = makeSlide()
        let renderSize = StoryExportIntroSizing.renderSize(for: slide)

        let storyA = try await bakeStory(slide)
        let legacy = try await StoryExportOutro.append(to: storyA, renderSize: renderSize)
        let storyB = try await bakeStory(slide)
        let merged = try await StoryExportBranding.wrap(storyURL: storyB, intro: nil,
                                                        outro: nil, renderSize: renderSize)
        defer {
            [storyA, legacy, storyB, merged].forEach {
                try? FileManager.default.removeItem(at: $0)
            }
        }

        let ref = try await inspect(legacy)
        let got = try await inspect(merged)

        XCTAssertEqual(got.duration, ref.duration, accuracy: 0.1,
                       "sans identité, la sortie doit rester celle de la carte de fin seule")
        XCTAssertGreaterThan(got.duration, Self.storyDuration,
                             "la carte de fin allonge toujours la story")
        XCTAssertEqual(got.size, ref.size)
    }

    /// **L'ŒUVRE SEULE** (#7052) — le seul chemin qui retire la carte de fin.
    ///
    /// L'export d'une SCÈNE DE POST rend le document composé sans aucun
    /// habillage : ni interlude d'entrée, ni carte de fin, ni jingle. C'est la
    /// décision du porteur (#7043, tranchée sur #7052), et elle ne vaut QUE
    /// pour ce chemin : `appendsBrandOutro` vaut `true` par défaut, donc
    /// `test_wrap_withoutIntro_stillAppendsBrandOutro` juste au-dessus reste
    /// vert — c'est lui qui prouve qu'on n'a pas rejoué, en croyant servir ce
    /// lot, la régression que la revue du 2026-07-26 avait corrigée.
    ///
    /// Les deux témoins sont donc CONTRAIRES et doivent être verts ENSEMBLE :
    /// l'un exige la carte de fin quand personne ne l'a retirée, l'autre son
    /// absence quand on la retire explicitement.
    @MainActor
    func test_wrap_sansMarque_rendLaStorySeule() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let slide = makeSlide()
        let renderSize = StoryExportIntroSizing.renderSize(for: slide)

        let story = try await bakeStory(slide)
        let nu = try await StoryExportBranding.wrap(storyURL: story, intro: nil, outro: nil,
                                                    renderSize: renderSize,
                                                    appendsBrandOutro: false)
        defer {
            [story, nu].forEach { try? FileManager.default.removeItem(at: $0) }
        }

        let got = try await inspect(nu)

        // La durée EXACTE de la story : c'est la mesure que le témoin jumeau
        // interdit, et la seule qui distingue « la carte est retirée » de
        // « elle est raccourcie ».
        XCTAssertEqual(got.duration, Self.storyDuration, accuracy: 0.1,
                       "sans marque, la sortie dure exactement la scène — aucune carte de fin ajoutée")
        XCTAssertEqual(got.size, renderSize, "le gabarit ne dépend pas de l'habillage")
    }
}
