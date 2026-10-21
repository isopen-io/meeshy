import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'écran de conversation garde son identité de TYPE** (LOT-10).
///
/// Un `AnyView` détruit l'identité d'une vue entre deux rendus (l'AttributeGraph
/// ne sait plus ce qui est la même vue) et ne borne rien au démangleur : le
/// getter qui le pose matérialise quand même le type de son argument à sa propre
/// profondeur de pile. Seule une frontière NOMINALE coupe — une struct `View` ou
/// `ViewModifier` obtient son propre nœud d'attribut. Ces gardes lisent la
/// SIGNATURE, parce que la grandeur qu'elles protègent en est une ; elles ne
/// remplacent ni `ConversationViewBodyTypeDepthTests` ni la sonde sur appareil.
@MainActor
final class ConversationScreenTypeIdentityGuardTests: XCTestCase {

    private static let viewsDirectory = "Meeshy/Features/Main/Views/"

    private static let screenFiles = [
        "ConversationView.swift",
        "ConversationView+Header.swift",
        "ConversationView+Composer.swift",
        "ConversationView+ComposerBanners.swift",
        "ConversationView+MessageListLayer.swift",
        "ConversationExpandedHeaderBand.swift",
        "ConversationView+HeaderControls.swift",
        "ConversationView+Presentations.swift",
        "ConversationView+GuestAttachments.swift",
        "ComposerAudioHost.swift",
    ]

    private static let layerFiles = [
        "ConversationLayers/CallHeaderSnapshot.swift",
        "ConversationLayers/ConversationHeaderCallButton.swift",
        "ConversationLayers/ConversationBodyStage.swift",
        "ConversationLayers/ConversationBodyLifecycle.swift",
        "ConversationLayers/ConversationBodyPresentations.swift",
        "ConversationLayers/ConversationComposerLayers.swift",
    ]

    private static let erasureFile = "ConversationLayers/ComposerBarSlot.swift"

    private func source(_ relativeToViews: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(Self.viewsDirectory + relativeToViews)
        let text = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(text.isEmpty, "\(relativeToViews) est vide ou introuvable")
        return AppSourceGuard.stripComments(text)
    }

    func test_screenFiles_containNoAnyView() throws {
        for file in Self.screenFiles + Self.layerFiles {
            XCTAssertFalse(
                try source(file).contains("AnyView"),
                "\(file) contient `AnyView` : une frontière de l'écran de conversation est une struct nominale (`View` ou `ViewModifier`), jamais un effacement."
            )
        }
    }

    func test_composerBarSlot_isTheOnlyErasure() throws {
        let slot = try source(Self.erasureFile)
        XCTAssertTrue(slot.contains("static func erase<V: View>(_ view: V) -> AnyView"))
        XCTAssertEqual(slot.components(separatedBy: "AnyView(").count - 1, 1,
                       "UN seul effacement, à la frontière de `UniversalComposerBar`.")
    }

    func test_bodyTrunk_isNominalModifiers() throws {
        let host = try source("ConversationView.swift")
        let trunk = [
            ".modifier(ConversationBodyLifecycle(",
            ".modifier(ConversationRouterWatch(",
            ".modifier(ConversationDraftPersistenceWatch(",
            ".modifier(ConversationBodyCovers(",
            ".modifier(ConversationBodySheets(",
            ".modifier(ConversationBodyOverlayMenu(",
        ]
        var cursor = host.startIndex
        for link in trunk {
            guard let found = host.range(of: link, range: cursor..<host.endIndex) else {
                XCTFail("`\(link)` doit figurer dans le tronc de `body`, après les maillons qui le précèdent.")
                return
            }
            cursor = found.upperBound
        }
        XCTAssertTrue(host.contains("var body: some View {\n        bodyStage"), "le tronc part de la scène nominale")
    }

    func test_noViewExtensionAddedByTheScreen() throws {
        for file in Self.screenFiles + Self.layerFiles {
            XCTAssertFalse(
                try source(file).contains("extension View"),
                "\(file) ajoute une `extension View` : l'unité `Meeshy::View` est figée à 1691 lignes — utiliser `.modifier(X(...))`."
            )
        }
    }

    func test_composerChain_isNominalModifiers() throws {
        let composer = try source("ConversationView+Composer.swift")
        let chain = [
            "ConversationComposerCore(",
            ".modifier(ConversationComposerPickers(",
            ".modifier(ConversationComposerGuestSheet(",
            ".modifier(ConversationComposerStickerSheet(",
            ".modifier(ConversationComposerEditingCovers(",
        ]
        var cursor = composer.startIndex
        for link in chain {
            guard let found = composer.range(of: link, range: cursor..<composer.endIndex) else {
                XCTFail("`\(link)` doit figurer dans `themedComposer`, dans l'ordre de la chaîne.")
                return
            }
            cursor = found.upperBound
        }
    }

    func test_draftKeys_changeOnEveryPersistedField() {
        func keys(
            reply: String? = "m1", language: String = "fr", effects: UInt32 = 0,
            blur: Bool = false, ephemeral: Int? = nil
        ) -> ConversationDraftKeys {
            ConversationDraftKeys(replyMessageId: reply, language: language, effectsRaw: effects, blur: blur, ephemeral: ephemeral)
        }
        let base = keys()
        XCTAssertEqual(base, keys())
        XCTAssertNotEqual(base, keys(reply: "m2"))
        XCTAssertNotEqual(base, keys(reply: nil))
        XCTAssertNotEqual(base, keys(language: "en"))
        XCTAssertNotEqual(base, keys(effects: 4))
        XCTAssertNotEqual(base, keys(blur: true))
        XCTAssertNotEqual(base, keys(ephemeral: 60))
    }

    func test_quotedMediaTarget_resolvesOnlyANonEmptyThumbnail() {
        XCTAssertNil(ComposerQuotedMediaTarget.preview(thumbUrl: nil, type: "image"))
        XCTAssertNil(ComposerQuotedMediaTarget.preview(thumbUrl: "", type: "image"))
        let target = ComposerQuotedMediaTarget.preview(thumbUrl: "https://gate.meeshy.me/u/t.jpg", type: "video")
        XCTAssertEqual(target?.type, "video")
        XCTAssertEqual(target?.url.absoluteString, "https://gate.meeshy.me/u/t.jpg")
    }

    func test_quotedMediaPlayback_opensTheFileNotTheThumbnail() throws {
        let video = ReplyReference(messageId: "m1", authorName: "Bob", previewText: "", attachmentType: "video",
                                   attachmentThumbnailUrl: "https://gate.meeshy.me/u/t.jpg",
                                   attachmentFileUrl: "https://gate.meeshy.me/u/v.mp4")
        let target = try XCTUnwrap(ComposerQuotedMediaTarget.playback(reply: video))
        XCTAssertEqual(target.type, "video")
        XCTAssertEqual(target.url.absoluteString, "https://gate.meeshy.me/u/v.mp4")
        XCTAssertEqual(target.attachment?.fileUrl, "https://gate.meeshy.me/u/v.mp4")

        let audio = ReplyReference(messageId: "m2", authorName: "Bob", previewText: "", attachmentType: "audio",
                                   attachmentFileUrl: "https://gate.meeshy.me/u/a.m4a")
        XCTAssertEqual(ComposerQuotedMediaTarget.playback(reply: audio)?.type, "audio")
    }

    func test_quotedMediaPlayback_reportsOnlyAnAnchoredVideo() {
        let video = ReplyReference(messageId: "m1", authorName: "Bob", previewText: "", attachmentType: "video",
                                   attachmentId: "att1", attachmentFileUrl: "https://gate.meeshy.me/u/v.mp4")
        let audio = ReplyReference(messageId: "m2", authorName: "Bob", previewText: "", attachmentType: "audio",
                                   attachmentId: "att2", attachmentFileUrl: "https://gate.meeshy.me/u/a.m4a")
        XCTAssertEqual(ComposerQuotedMediaTarget.playback(reply: video)?.reportsConsumption, true)
        XCTAssertEqual(ComposerQuotedMediaTarget.playback(reply: audio)?.reportsConsumption, false,
                       "un son joue par le moteur video serait rapporte « vu » sur sa piece audio")
    }

    func test_quotedMediaPlayback_opensNothingDishonest() {
        let protected = ReplyReference(messageId: "m3", authorName: "Bob", previewText: "", attachmentType: "video",
                                       attachmentFileUrl: "https://gate.meeshy.me/u/v.mp4", attachmentIsProtected: true)
        let withoutFile = ReplyReference(messageId: "m4", authorName: "Bob", previewText: "", attachmentType: "audio")
        XCTAssertNil(ComposerQuotedMediaTarget.playback(reply: protected))
        XCTAssertNil(ComposerQuotedMediaTarget.playback(reply: withoutFile))
    }

    func test_quotedMediaThumbnails_areButtonsWithTheTranslatedLabel() throws {
        let banners = try source("ConversationView+ComposerBanners.swift")
        guard let start = banners.range(of: "func composerReplyAttachmentPreview("),
              let end = banners.range(of: "private func replyAudioBadge(", range: start.upperBound..<banners.endIndex) else {
            XCTFail("composerReplyAttachmentPreview introuvable"); return
        }
        let preview = String(banners[start.lowerBound..<end.lowerBound])
        XCTAssertFalse(preview.contains(".onTapGesture"),
                       "A11Y-11 : une vignette citée est un `Button`, annoncé et activable par VoiceOver.")
        XCTAssertEqual(preview.components(separatedBy: "ComposerQuotedMediaButton(").count - 1, 3,
                       "image, vidéo et son citent chacun leur média par le même bouton")
        let layers = try source("ConversationLayers/ConversationComposerLayers.swift")
        XCTAssertTrue(layers.contains("bubble.reply.open_media"), "la clé existante et traduite — aucune clé neuve")
    }
}
