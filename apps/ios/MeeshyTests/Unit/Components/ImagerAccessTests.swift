import XCTest
import MeeshySDK
@testable import Meeshy

/// **« Imager » (#8692)** — où l'action se trouve : l'appui long, « Plus… »,
/// le double tap (qui la met à la place de « Composer ») et le (>) qui déplie
/// « Composer » ET « Imager ». Messages et commentaires.
@MainActor
final class ImagerAccessTests: XCTestCase {

    private func ctx(hasText: Bool = true, hasMedia: Bool = false, paintable: Bool = false, isBlurred: Bool = false, isViewOnce: Bool = false) -> MessageMenuContext {
        var context = MessageMenuContext(isMine: false, canEdit: false, canDelete: false,
                                         hasText: hasText, hasMedia: hasMedia, hasTimebasedMedia: false,
                                         isPinned: false, isStarred: false, isEdited: false, hasEditRevisions: false,
                                         isViewOnce: isViewOnce, isBlurred: isBlurred)
        context.hasPaintableMedia = paintable
        return context
    }

    private func actionItems(_ sections: [MoreSection]) -> [MoreItem] {
        sections.flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
    }

    // MARK: - Appui long et « Plus… »

    func test_primaryActions_aMediaOnlyMessage_offersImager() {
        XCTAssertTrue(MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, paintable: true)).contains(.exportImage))
        XCTAssertFalse(MessageActionResolver.primaryActions(ctx(hasText: false, hasMedia: true, paintable: false)).contains(.exportImage),
                       "un document seul n'a rien à peindre")
    }

    func test_moreSections_offersImagerNextToShare() {
        let items = actionItems(MessageActionResolver.moreSections(ctx()))
        guard let share = items.firstIndex(of: .share), let imager = items.firstIndex(of: .imager) else {
            return XCTFail("« Imager » doit figurer dans « Plus… »")
        }
        XCTAssertEqual(imager, share + 1)
    }

    func test_moreSections_aProtectedMessageNeverOffersImager() {
        XCTAssertFalse(actionItems(MessageActionResolver.moreSections(ctx(isBlurred: true))).contains(.imager))
        XCTAssertFalse(actionItems(MessageActionResolver.moreSections(ctx(isViewOnce: true))).contains(.imager))
        XCTAssertFalse(actionItems(MessageActionResolver.moreSections(ctx(hasText: false, hasMedia: true))).contains(.imager))
    }

    // MARK: - Double tap et (>)

    private func primaires(composer: Bool, imager: Bool) -> [MessageEditMenuAction] {
        MessageEditMenuAction.primaires(
            messageId: "m1",
            peutEditer: false,
            editer: nil,
            selectionner: { _ in },
            composer: composer ? { _ in } : nil,
            imager: imager ? { _ in } : nil,
            repondre: { _ in },
            transferer: { _ in },
            plus: { _ in }
        )
    }

    func test_doubleTap_imagerTakesTheThirdPlace_andTheChevronUnfoldsComposeAndImagine() {
        let actions = primaires(composer: true, imager: true)
        XCTAssertEqual(actions.map(\.id), ["select", "imagine", "reply", "forward", "create", "more"])
        let create = actions.first { $0.id == "create" }
        XCTAssertEqual(create?.children.map(\.id), ["compose", "imagine"])
        XCTAssertTrue(actions.filter { $0.id != "create" }.allSatisfy(\.children.isEmpty))
    }

    func test_doubleTap_aMessageThatCannotBeImaged_keepsComposerThird_withoutChevron() {
        let actions = primaires(composer: true, imager: false)
        XCTAssertEqual(actions.map(\.id), ["select", "compose", "reply", "forward", "more"])
    }

    func test_doubleTap_withoutComposer_imagerStaysThird_withoutChevron() {
        let actions = primaires(composer: false, imager: true)
        XCTAssertEqual(actions.map(\.id), ["select", "imagine", "reply", "forward", "more"])
    }

    func test_doubleTap_theChevronEntriesDoWhatTheirNamesSay() {
        var composed: [String] = []
        var imagined: [String] = []
        let actions = MessageEditMenuAction.primaires(
            messageId: "m9", peutEditer: false, editer: nil, selectionner: nil,
            composer: { composed.append($0) }, imager: { imagined.append($0) },
            repondre: nil, transferer: nil, plus: nil
        )
        actions.first { $0.id == "create" }?.children.forEach { $0.perform() }
        XCTAssertEqual(composed, ["m9"])
        XCTAssertEqual(imagined, ["m9"])
    }

    // MARK: - Commentaires

    private func viewer() -> MessageCardSubject.Viewer {
        MessageCardSubject.Viewer(id: "u-me", displayName: "Moi", username: "moi")
    }

    func test_message_imagesTheTextThePrismServes_andOffersItsOriginal() throws {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "u-giulia", content: "Ciao a tutti", originalLanguage: "it", senderName: "Giulia", senderUsername: "giulia.r")
        let francais = MessageTranslation(id: "t1", messageId: "m1", sourceLanguage: "it", targetLanguage: "FR", translatedContent: "Salut tout le monde", translationModel: nil, confidenceScore: nil)
        let request = try XCTUnwrap(MessageCardExportMenu.request(
            message: message, translations: [francais], servedText: "Salut tout le monde", viewer: viewer(), handle: "moi",
            quotedMessage: nil, conversationTitle: "Pizza Night 🍕", accentColor: "#6366F1", quick: false
        ))
        XCTAssertEqual(request.subject.reply.text, "Salut tout le monde")
        XCTAssertEqual(request.languages.first, "it")
        XCTAssertTrue(request.languages.contains("fr"), "La traduction se range sous son code en minuscules.")
        XCTAssertEqual(request.subjectIn("it")?.reply.text, "Ciao a tutti")
        XCTAssertEqual(request.conversationTitle, "Pizza Night 🍕")
        XCTAssertEqual(request.handle, "moi")
        XCTAssertFalse(request.quick)
    }

    /// Un vocal part dans la piste que la bulle fait entendre — et une langue
    /// d'export choisie fait partir SA piste traduite, sinon l'original (#8979).
    func test_message_aVoiceLeavesInTheTrackTheReaderHears_orInTheExportLanguage() throws {
        let voice = MeeshyMessageAttachment(
            id: "snd", mimeType: "audio/mp4", fileUrl: "https://x/fr.m4a", duration: 12_000,
            transcription: .init(text: "Bonjour à tous.", language: "fr"),
            audioTranslations: ["en": .init(url: "https://x/en.m4a", transcription: "Hello everyone.", durationMs: 9_000)]
        )
        let message = MeeshyMessage(id: "m3", conversationId: "c1", senderId: "u-awa", content: "", originalLanguage: "fr",
                                    attachments: [voice], senderName: "Awa")
        let request = try XCTUnwrap(MessageCardExportMenu.request(
            message: message, translations: [], servedText: nil, viewer: viewer(), handle: "moi",
            quotedMessage: nil, conversationTitle: nil, accentColor: "#6366F1", quick: false,
            audioPrism: ["en", "fr"]
        ))
        XCTAssertEqual(request.subject.media.first?.fileURL, "https://x/en.m4a", "le Prisme du lecteur sert la piste anglaise")
        XCTAssertEqual(request.subject.media.first?.media.transcript?.cues.first?.text, "Hello everyone.")
        XCTAssertEqual(request.subjectIn("fr")?.media.first?.fileURL, "https://x/fr.m4a", "la langue d'origine fait partir l'original")
        XCTAssertEqual(request.subjectIn("en")?.media.first?.media.duration, 9)

        let flipped = try XCTUnwrap(MessageCardExportMenu.request(
            message: message, translations: [], servedText: nil, viewer: viewer(), handle: nil,
            quotedMessage: nil, conversationTitle: nil, accentColor: "#6366F1", quick: false,
            audioPrism: ["en", "fr"], audioOverride: "fr"
        ))
        XCTAssertEqual(flipped.subject.media.first?.fileURL, "https://x/fr.m4a", "la bascule du drapeau vers l'original est respectée")
    }

    func test_message_withNothingToPaint_isNeverImaged() {
        let vide = MeeshyMessage(id: "m2", conversationId: "c1", senderId: "u-x", content: "", originalLanguage: "fr")
        XCTAssertNil(MessageCardExportMenu.request(
            message: vide, translations: [], servedText: nil, viewer: viewer(), handle: nil,
            quotedMessage: nil, conversationTitle: nil, accentColor: "#6366F1", quick: false
        ))
    }

    func test_comment_imagesTheServedText() {
        let comment = FeedComment(author: "Awa", authorId: "u-awa", authorUsername: "awa", content: "Bonjour", originalLanguage: "fr", translatedContent: "Hello")
        let request = MessageCardExportMenu.request(comment: comment, showOriginal: false, accentColor: "#6366F1", viewer: viewer(), handle: "moi")
        XCTAssertEqual(request?.subject.reply.text, "Hello")
        XCTAssertEqual(request?.handle, "moi")
        XCTAssertEqual(MessageCardExportMenu.request(comment: comment, showOriginal: true, accentColor: "#6366F1", viewer: viewer(), handle: nil)?.subject.reply.text, "Bonjour")
    }

    func test_comment_aProtectedCommentIsNeverImaged() {
        let protections: [MessageEffectFlags] = [.blurred, .viewOnce, .ephemeral]
        for flag in protections {
            let comment = FeedComment(author: "Awa", content: "Secret", effectFlags: Int(flag.rawValue))
            XCTAssertNil(MessageCardExportMenu.request(comment: comment, showOriginal: false, accentColor: "#6366F1", viewer: viewer(), handle: nil), "\(flag)")
        }
    }
}
