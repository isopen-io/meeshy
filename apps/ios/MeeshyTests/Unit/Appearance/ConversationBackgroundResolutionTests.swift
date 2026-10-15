import XCTest
import MeeshySDK
@testable import Meeshy

/// #10631 — quel fond peindre : ce qui ne se lit pas retombe sur Signature, la photo
/// se retrouve sans réseau, « Réduire la transparence » force un voile ≥ 0,6.
@MainActor
final class ConversationBackgroundResolutionTests: XCTestCase {

    func test_resolve_withoutAppearance_isSignature() {
        XCTAssertEqual(ConversationBackgroundResolution.resolve(nil, isDark: false), .signature)
        XCTAssertEqual(ConversationBackgroundResolution.resolve(.default, isDark: true), .signature)
    }

    func test_resolve_knownDesign_returnsTheBundledModel() {
        let appearance = ConversationAppearance(background: .design(pack: "heritages", design: "zellige"))
        guard case .design(let design) = ConversationBackgroundResolution.resolve(appearance, isDark: false) else {
            return XCTFail("un modèle du catalogue embarqué doit se résoudre sans réseau")
        }
        XCTAssertEqual(design.key, "zellige")
    }

    func test_resolve_unknownDesignOrPack_fallsBackToSignature() {
        XCTAssertEqual(ConversationBackgroundResolution.resolve(ConversationAppearance(background: .design(pack: "heritages", design: "futur")), isDark: false), .signature)
        XCTAssertEqual(ConversationBackgroundResolution.resolve(ConversationAppearance(background: .design(pack: "inconnu", design: "zellige")), isDark: false), .signature)
    }

    func test_resolve_solid_followsTheColorScheme() {
        let appearance = ConversationAppearance(background: .solid(color: "indigo"))
        XCTAssertEqual(ConversationBackgroundResolution.resolve(appearance, isDark: false), .solid(hex: "#EEF0FF"))
        XCTAssertEqual(ConversationBackgroundResolution.resolve(appearance, isDark: true), .solid(hex: "#14152E"))
        XCTAssertEqual(ConversationBackgroundResolution.resolve(ConversationAppearance(background: .solid(color: "fuchsia")), isDark: false), .signature)
    }

    func test_resolve_photo_keepsAttachmentVeilAndBlur() {
        let appearance = ConversationAppearance(background: .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.4, blur: 6))
        XCTAssertEqual(ConversationBackgroundResolution.resolve(appearance, isDark: false), .photo(attachmentId: "64b7f0c2a1b2c3d4e5f60718", veil: 0.4, blur: 6))
    }

    func test_effectiveVeil_underReducedTransparency_isAtLeastSixTenths() {
        XCTAssertEqual(ConversationBackgroundResolution.effectiveVeil(0.2, reduceTransparency: true), 0.6)
        XCTAssertEqual(ConversationBackgroundResolution.effectiveVeil(0.7, reduceTransparency: true), 0.7)
        XCTAssertEqual(ConversationBackgroundResolution.effectiveVeil(0.2, reduceTransparency: false), 0.2)
    }

    func test_effectiveAccent_personalWins_otherwiseTheComputedOne() {
        let chosen = ConversationAppearance(accent: "corail")
        XCTAssertEqual(ConversationBackgroundResolution.effectiveAccentHex(chosen, computedHex: "#123456", isDark: false), "#E0604E")
        XCTAssertEqual(ConversationBackgroundResolution.effectiveAccentHex(chosen, computedHex: "#123456", isDark: true), "#F38B7B")
        XCTAssertEqual(ConversationBackgroundResolution.effectiveAccentHex(.default, computedHex: "#123456", isDark: false), "#123456")
        XCTAssertEqual(ConversationBackgroundResolution.effectiveAccentHex(nil, computedHex: "#123456", isDark: false), "#123456")
    }

    // MARK: Photo

    func test_photo_knownAttachmentWinsOverMemoryAndFallback() throws {
        let remembered = ConversationBackgroundPhoto(thumbnailUrl: "t-old", fullUrl: "f-old", thumbHash: nil)
        let attachment = MeeshyMessageAttachment.image()
        let photo = ConversationBackgroundPhoto.resolve(attachmentId: attachment.id, known: attachment, remembered: remembered, serverOrigin: "https://gate.test")
        XCTAssertEqual(photo.fullUrl, attachment.fileUrl)
    }

    func test_photo_memoryBeatsTheDownloadRoute() {
        let remembered = ConversationBackgroundPhoto(thumbnailUrl: "t", fullUrl: "f", thumbHash: "h")
        XCTAssertEqual(ConversationBackgroundPhoto.resolve(attachmentId: "a1", known: nil, remembered: remembered, serverOrigin: "https://gate.test"), remembered)
    }

    func test_photo_unknownAttachment_usesTheDownloadRouteWhichChecksMembership() {
        let photo = ConversationBackgroundPhoto.resolve(attachmentId: "64b7f0c2a1b2c3d4e5f60718", known: nil, remembered: nil, serverOrigin: "https://gate.test")
        XCTAssertEqual(photo.fullUrl, "https://gate.test/api/v1/attachments/64b7f0c2a1b2c3d4e5f60718")
        XCTAssertNil(photo.thumbnailUrl)
    }

    func test_photoMemory_roundTrips_andIsBounded() throws {
        let suite = "appearance-memory-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let memory = ConversationBackgroundPhotoMemory(defaults: defaults)
        XCTAssertNil(memory.photo(for: "a0"))
        for index in 0..<30 {
            memory.remember(ConversationBackgroundPhoto(thumbnailUrl: nil, fullUrl: "f\(index)", thumbHash: nil), for: "a\(index)")
        }
        XCTAssertNil(memory.photo(for: "a0"), "la plus ancienne sort quand la mémoire est pleine")
        XCTAssertEqual(memory.photo(for: "a29")?.fullUrl, "f29")
    }

    // MARK: - La couche Lottie du fond (#10638) : quand animer est une décision de l'app

    func test_animatesLottieLayer_followsTheConversationChoice_andStopsInLowPowerMode() {
        XCTAssertTrue(ConversationBackgroundResolution.animatesLottieLayer(ConversationAppearance(animate: true), lowPowerMode: false))
        XCTAssertTrue(ConversationBackgroundResolution.animatesLottieLayer(nil, lowPowerMode: false), "sans choix, le défaut anime")
        XCTAssertFalse(ConversationBackgroundResolution.animatesLottieLayer(ConversationAppearance(animate: false), lowPowerMode: false))
        XCTAssertFalse(ConversationBackgroundResolution.animatesLottieLayer(ConversationAppearance(animate: true), lowPowerMode: true))
    }
}
