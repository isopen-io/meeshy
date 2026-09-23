import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK
import MeeshyUI

/// **Une vue unique non ouverte ne laisse rien lire** (#7618) — un témoin par
/// mode de lecture.
///
/// Recette staging du 2026-09-23 : la légende d'une photo à vue unique se lisait
/// en clair sous le voile en Focal ; VoiceOver lisait le texte d'une vue unique
/// jamais ouverte en Bulles, Focal et Script ; l'ouverture du fil téléchargeait
/// le fichier d'un sticker à vue unique. Les témoins interrogent ce que chaque
/// mode REÇOIT, parce qu'un contenu absent du modèle ne peut ni se peindre, ni
/// se dire, ni se télécharger.
@MainActor
final class ViewOnceSealedRenderingTests: XCTestCase {

    private let secret = "SECRET-VU-DIRECT texte"
    private let caption = "SECRET-VU-PHOTO"

    // MARK: - Fabriques

    private func viewOnceText(isRevealed: Bool = false, isMe: Bool = false) -> Message {
        var message = Message(
            id: "vu1", conversationId: "c1", senderId: "u2", content: secret,
            senderName: "Demo", isMe: isMe
        )
        message.isViewOnce = true
        message.isViewOnceRevealed = isRevealed
        return message
    }

    private func viewOncePhotoWithCaption() -> Message {
        let photo = MessageAttachment(
            id: "a1", messageId: "vu2", fileName: "p.jpg", originalName: "p.jpg",
            mimeType: "image/jpeg", fileSize: 10, fileUrl: "https://staging.meeshy.me/p.jpg",
            caption: caption, isViewOnce: true
        )
        return Message(
            id: "vu2", conversationId: "c1", senderId: "u2", content: caption,
            attachments: [photo], senderName: "Demo"
        )
    }

    private func content(for message: Message) -> BubbleContent {
        BubbleContent(
            message: message,
            translations: [],
            preferredTranslation: nil,
            currentUserId: "me",
            timeString: "16:48"
        )
    }

    // MARK: - Le modèle commun (Bulles, Focal, Script)

    func test_bubbleContent_sealedViewOnceText_carriesNoText() {
        let sealed = content(for: viewOnceText())

        XCTAssertEqual(sealed.kind, .viewOnceSealed)
        XCTAssertNil(sealed.text, "le texte d'une vue unique non ouverte n'entre pas dans le modèle")
        XCTAssertNil(sealed.translation)
    }

    func test_bubbleContent_sealedViewOncePhoto_carriesNeitherCaptionNorMedia() {
        let sealed = content(for: viewOncePhotoWithCaption())

        XCTAssertEqual(sealed.kind, .viewOnceSealed)
        XCTAssertNil(sealed.text, "la légende d'une photo à vue unique se lisait sous le voile en Focal")
        XCTAssertEqual(sealed.attachments, .none, "aucune pièce : rien à charger avant l'ouverture")
        XCTAssertNil(sealed.sticker)
    }

    func test_bubbleContent_authorsOwnViewOnce_isSealedToo() {
        XCTAssertEqual(content(for: viewOnceText(isMe: true)).kind, .viewOnceSealed,
                       "l'auteur ouvre sa vue unique une fois, comme les autres")
    }

    func test_bubbleContent_revealedViewOnceText_readsInPlaceWithoutSecondVeil() {
        let revealed = content(for: viewOnceText(isRevealed: true))

        XCTAssertEqual(revealed.kind, .standard)
        XCTAssertEqual(revealed.text?.raw, secret)
        XCTAssertFalse(revealed.requiresVeil, "la puce a recueilli le geste : pas de second voile")
    }

    func test_chromeProtection_sealed_doesNotRepeatViewOnce() {
        XCTAssertFalse(content(for: viewOnceText()).chromeProtection.isViewOnce,
                       "la puce dit la vue unique : le chrome ne la répète pas (#7619)")
    }

    // MARK: - Focal et Script — le lecteur d'écran

    func test_accessibilityLabel_sealedViewOnce_neverSpeaksTheSecret() {
        let label = MessageAccessibilityLabelComposer.compose(content(for: viewOnceText()))

        XCTAssertFalse(label.contains(secret), "VoiceOver lisait « \(secret) » sans consommer la vue")
        XCTAssertTrue(label.contains(ViewOnceChip.accessibilityLabel(for: .sealed)))
    }

    func test_accessibilityLabel_sealedViewOncePhoto_neverSpeaksTheCaption() {
        let label = MessageAccessibilityLabelComposer.compose(content(for: viewOncePhotoWithCaption()))

        XCTAssertFalse(label.contains(caption))
    }

    // MARK: - Rivière

    func test_riverContents_sealedViewOnce_carriesNoText() {
        let messages = [viewOnceText()]
        let geometry = RiverConversationMapping.resolveGeometry(messages: messages, viewerId: "me")
        let bubbles = RiverConversationMapping.contents(
            geometry: geometry, messages: messages, viewerId: "me",
            text: { $0.content }, time: { _ in "16:48" }
        )

        XCTAssertEqual(bubbles.first?.text, "", "la rivière rendait le texte sous un voile")
        XCTAssertEqual(bubbles.first?.viewOnceChip, .sealed)
    }

    func test_riverContentsKey_changesWhenTheViewOnceIsOpened() {
        let sealed = [viewOnceText()]
        let opened = [viewOnceText(isRevealed: true)]
        let geometry = RiverConversationMapping.resolveGeometry(messages: sealed, viewerId: "me")

        XCTAssertNotEqual(
            RiverConversationMapping.contentsKey(geometry: geometry, messages: sealed, viewerId: "me", text: { $0.content }),
            RiverConversationMapping.contentsKey(geometry: geometry, messages: opened, viewerId: "me", text: { $0.content }),
            "sans cela l'ouverture ne recomposerait pas la bulle mémoïsée"
        )
    }

    // MARK: - Rien ne se télécharge avant l'ouverture

    func test_prefetchCandidates_skipViewOnceMedia() {
        let ordinary = Message(
            id: "p1", conversationId: "c1", content: "",
            attachments: [MessageAttachment(id: "a9", mimeType: "image/png", fileUrl: "https://x/p.png")]
        )
        let candidates = ConversationMediaHandler.prefetchCandidates([ordinary, viewOncePhotoWithCaption()])

        XCTAssertEqual(candidates.map(\.id), ["p1"], "le fichier d'un sticker à vue unique partait à l'ouverture du fil")
    }

    func test_galleryAttachments_viewOnceStart_isShownAlone() {
        let viewOncePhoto = viewOncePhotoWithCaption().attachments[0]
        let other = MessageAttachment(id: "a9", mimeType: "image/png", fileUrl: "https://x/p.png")

        XCTAssertEqual(
            ConversationMediaGalleryLayer.galleryAttachments(start: viewOncePhoto, all: [other]).map(\.id),
            ["a1"]
        )
        XCTAssertEqual(
            ConversationMediaGalleryLayer.galleryAttachments(start: other, all: [other]).map(\.id),
            ["a9"]
        )
    }

    // MARK: - L'ouverture, par le ViewModel

    func test_openViewOnce_text_revealsInPlace() throws {
        let sut = try makeSUT()
        sut.messages = [viewOnceText()]

        guard case .inPlace = sut.openViewOnce(messageId: "vu1") else {
            return XCTFail("un texte à vue unique se lit sur place")
        }
        XCTAssertEqual(sut.revealedViewOnceIds["vu1"], true)
        XCTAssertTrue(sut.messages[0].isViewOnceRevealed)
    }

    func test_openViewOnce_photo_opensFullscreenWithoutRevealingTheBubble() throws {
        let sut = try makeSUT()
        sut.messages = [viewOncePhotoWithCaption()]

        guard case .fullscreen(let attachment) = sut.openViewOnce(messageId: "vu2") else {
            return XCTFail("un média à vue unique s'ouvre en plein écran")
        }
        XCTAssertEqual(attachment.id, "a1")
        XCTAssertNil(sut.revealedViewOnceIds["vu2"], "le média ne se révèle jamais dans la bulle")
    }

    func test_applyingViewOnceReveals_keepsAnOpenedTextOpenAcrossAStoreRefresh() throws {
        let sut = try makeSUT()
        sut.messages = [viewOnceText()]
        _ = sut.openViewOnce(messageId: "vu1")

        let refreshed = sut.applyingViewOnceReveals([viewOnceText()])

        XCTAssertTrue(refreshed[0].isViewOnceRevealed, "une écriture GRDB ne referme pas un texte en cours de lecture")
    }

    func test_allVisualAttachments_excludeViewOnceMedia() throws {
        let sut = try makeSUT()
        sut.messages = [viewOncePhotoWithCaption()]

        XCTAssertTrue(sut.allVisualAttachments.isEmpty, "on n'atteint pas une vue unique en balayant le plein écran")
    }

    private func makeSUT() throws -> ConversationViewModel {
        let authManager = MockAuthManager()
        authManager.simulateLoggedIn(user: MeeshyUser(id: "me", username: "me", displayName: "Me"))
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        return ConversationViewModel(
            conversationId: "c1",
            unreadCount: 0,
            isDirect: false,
            participantUserId: nil,
            anonymousSession: nil,
            authManager: authManager,
            messageService: MockMessageService(),
            conversationService: MockConversationService(),
            reactionService: MockReactionService(),
            reportService: MockReportService(),
            messageSocket: MockMessageSocket(),
            dependencies: ConversationDependencies(
                dbPool: pool,
                persistence: MessagePersistenceActor(dbWriter: pool)
            )
        )
    }
}
