import XCTest
import AVFoundation
import CoreGraphics
import Foundation
@testable import MeeshyUI
@testable import MeeshySDK

/// Les artefacts de marque d'un export — la carte de fin animée et les deux
/// signatures sonores — ne dépendent PAS de la story. Ils étaient pourtant
/// régénérés à chaque export : 105 frames CoreGraphics ré-encodées en H.264
/// pour la carte de fin (mesuré 1,8 s), plus la synthèse PCM des deux jingles,
/// soit ~30 % du temps total d'un export de 10 s.
///
/// Ils sont désormais mis en cache. Le contrat testé ici est l'IDENTITÉ du
/// résultat : deux demandes équivalentes rendent le même fichier (rien n'a été
/// réencodé), deux demandes distinctes rendent des fichiers distincts (aucune
/// carte périmée n'est servie à la place d'une autre).
@MainActor
final class StoryExportBrandCacheTests: XCTestCase {

    private let size = CGSize(width: 1080, height: 1920)

    private func makeIdentity(username: String,
                              mood: String? = nil,
                              presence: StoryExportPresence? = nil,
                              relationLogo: String? = nil) -> StoryExportIntroContent {
        StoryExportIntroContent(displayName: "J. Charles N. M.",
                                username: username,
                                moodEmoji: mood,
                                accentColorHex: "6366F1",
                                presence: presence,
                                relationLogo: relationLogo)
    }

    func test_outroClip_logoOnly_isEncodedOnce() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let first = try await StoryExportBranding.brandOutroClip(size: size, content: nil)
        let second = try await StoryExportBranding.brandOutroClip(size: size, content: nil)

        XCTAssertEqual(first, second,
                       "la carte de fin logo-seule ne dépend que du gabarit — un seul encodage")
        XCTAssertTrue(FileManager.default.fileExists(atPath: second.path))
    }

    func test_outroClip_differentIdentity_yieldsDifferentClip() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let alice = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "alice"))
        let bob = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "bob"))

        XCTAssertNotEqual(alice, bob,
                          "deux auteurs distincts ne doivent jamais partager une carte de fin")
    }

    /// Le mood fait partie de la carte peinte : le changer doit invalider
    /// l'entrée, sinon l'auteur verrait son ancienne humeur dans l'export.
    func test_outroClip_identityMoodChange_invalidatesTheCachedClip() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let happy = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "carol", mood: "😀"))
        let sad = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "carol", mood: "😢"))

        XCTAssertNotEqual(happy, sad, "un changement d'humeur doit repeindre la carte")
    }

    /// La présence et le logo de cercle sont peints sur la carte d'identité (#13997) : un
    /// auteur repassé hors ligne, ou promu Proche, ne doit pas ressortir avec l'ancienne carte.
    func test_outroClip_presenceChange_invalidatesTheCachedClip() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let online = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "dora", presence: .online))
        let nobody = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "dora"))

        XCTAssertNotEqual(online, nobody, "un changement de présence doit repeindre la carte")
    }

    func test_outroClip_relationLogoChange_invalidatesTheCachedClip() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let close = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "erin", relationLogo: "🔥"))
        let friend = try await StoryExportBranding.brandOutroClip(
            size: size, content: makeIdentity(username: "erin"))

        XCTAssertNotEqual(close, friend, "un changement de cercle doit repeindre la carte")
    }

    func test_brandJingles_areSynthesisedOnce() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )
        let intro1 = try await StoryExportBranding.brandJingle(.intro)
        let intro2 = try await StoryExportBranding.brandJingle(.intro)
        let outro = try await StoryExportBranding.brandJingle(.outro)

        XCTAssertEqual(intro1, intro2, "le jingle est déterministe — une seule synthèse")
        XCTAssertNotEqual(intro1, outro, "ouverture et fermeture sont deux signatures distinctes")
        XCTAssertTrue(FileManager.default.fileExists(atPath: outro.path))
    }
}
