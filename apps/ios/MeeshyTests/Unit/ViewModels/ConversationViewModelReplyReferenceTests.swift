import XCTest
import GRDB
@testable import Meeshy
import MeeshySDK

/// La citation OPTIMISTE — celle que porte la bulle avant l'écho serveur et
/// la bannière de réponse du composeur — sert ce que le lecteur a SOUS LES
/// YEUX, avec les mêmes faits que l'écho servira (#4945, seconde moitié :
/// « qui AFFICHE ce qu'il élit ? »).
///
/// Avant ce lot, `makeReplyReference` (bulle optimiste) et `triggerReply`
/// (bannière au balayage) recopiaient chacun trois champs pauvres : la
/// citation naissait sans miniature ThumbHash, sans dimensions ni durée, en
/// langue d'ORIGINE, et republiait le texte d'un message protégé — puis tout
/// cela « sautait » à l'écho serveur. Une seule fabrique désormais,
/// `optimisticReplyReference(quoting:)`, exercée ici par les deux chemins.
///
/// Le témoin de rang s'écrit sur un rang AUTRE que le premier (leçon 261) :
/// au rang 1, un court-circuit et la règle juste rendent le même verdict.
@MainActor
final class ConversationViewModelReplyReferenceTests: XCTestCase {

    private let conversationId = "000000000000000000000001"
    private let myUserId = "000000000000000000000099"
    private let otherUserId = "000000000000000000000002"

    override func setUp() async throws {
        try await super.setUp()
        MessageSocketManager.shared.isConnected = false
        APIClient.shared.anonymousSessionToken = nil
    }

    override func tearDown() async throws {
        APIClient.shared.anonymousSessionToken = nil
        try await super.tearDown()
    }

    // MARK: - Fabriques

    /// `systemLanguage`/`regionalLanguage` composent le prisme du lecteur
    /// (`ConversationLanguagePreferences.resolved`, rangs 1 et 2).
    ///
    /// **`deviceLocale` est FIXÉE, jamais laissée à `Locale.current`.** Sans
    /// elle, l'init `ConversationLanguagePreferences(user:)` retombe sur la
    /// locale du RUNNER au rang 4 : sur un simulateur espagnol, le prisme
    /// `["fr"]` devient `["fr","es"]` et le témoin « aucune traduction dans le
    /// prisme ⇒ l'original » sert « Hola » — rouge sans qu'aucun défaut
    /// n'existe. Elle duplique le rang 1 pour ne jamais introduire de langue
    /// tierce ; `deviceLocale:` explicite quand un témoin VEUT exercer le
    /// rang 4.
    private func makeSUT(
        systemLanguage: String? = "fr",
        regionalLanguage: String? = nil,
        deviceLocale: String? = nil
    ) -> ConversationViewModel {
        let authManager = MockAuthManager()
        let currentUser = MeeshyUser(
            id: myUserId, username: "me", displayName: "Me",
            systemLanguage: systemLanguage, regionalLanguage: regionalLanguage,
            deviceLocale: deviceLocale ?? systemLanguage ?? "fr"
        )
        authManager.simulateLoggedIn(user: currentUser)

        let pool = try! makeInMemoryPool()
        let sut = ConversationViewModel(
            conversationId: conversationId,
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
        sut.start()
        return sut
    }

    private func makeInMemoryPool() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    private func makeQuoted(
        id: String = "q1",
        content: String = "Hello",
        originalLanguage: String = "en",
        attachments: [MessageAttachment] = [],
        effects: MessageEffects = .none,
        isEncrypted: Bool = false,
        isMe: Bool = false
    ) -> Message {
        Message(
            id: id,
            conversationId: conversationId,
            senderId: isMe ? myUserId : otherUserId,
            content: content,
            originalLanguage: originalLanguage,
            effects: effects,
            isEncrypted: isEncrypted,
            attachments: attachments,
            senderName: "Bob",
            senderColor: "FF8800",
            senderAvatarURL: "https://cdn.meeshy.me/bob.jpg",
            isMe: isMe
        )
    }

    private func makePhoto(isViewOnce: Bool = false, isBlurred: Bool = false) -> MessageAttachment {
        MessageAttachment(
            id: "a-photo",
            mimeType: "image/jpeg",
            fileSize: 204_800,
            fileUrl: "https://cdn.meeshy.me/a-photo.jpg",
            isViewOnce: isViewOnce,
            isBlurred: isBlurred,
            width: 1024,
            height: 768,
            thumbnailUrl: "https://cdn.meeshy.me/a-photo-t.jpg",
            thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI"
        )
    }

    private func makeVoice() -> MessageAttachment {
        MessageAttachment(
            id: "a-voice",
            mimeType: "audio/m4a",
            fileSize: 61_440,
            fileUrl: "https://cdn.meeshy.me/a-voice.m4a",
            duration: 42_000
        )
    }

    private func makeTranslation(of messageId: String, to language: String, text: String) -> MessageTranslation {
        MessageTranslation(
            id: "\(messageId)-\(language)",
            messageId: messageId,
            sourceLanguage: "en",
            targetLanguage: language,
            translatedContent: text,
            translationModel: "nllb",
            confidenceScore: nil
        )
    }

    // MARK: - Les sept faits du média cité

    func test_optimisticReplyReference_photo_carriesThumbHashDimensionsAndSize() {
        let sut = makeSUT()
        let quoted = makeQuoted(content: "", attachments: [makePhoto()])
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.attachmentType, "image")
        XCTAssertEqual(reference.attachmentThumbnailUrl, "https://cdn.meeshy.me/a-photo-t.jpg")
        XCTAssertEqual(reference.attachmentThumbHash, "1QcSHQRnh493V4dIh4eXh1h4kJUI",
                       "sans le ThumbHash, la citation optimiste naît plate puis gagne son flou à l'écho serveur — un saut")
        XCTAssertEqual(reference.attachmentWidth, 1024)
        XCTAssertEqual(reference.attachmentHeight, 768)
        XCTAssertEqual(reference.attachmentFileSize, 204_800)
        XCTAssertEqual(reference.attachmentMimeType, "image/jpeg")
        XCTAssertEqual(reference.attachmentIsProtected, false)
        XCTAssertEqual(reference.previewText, MediaKindLabel.summary(.photo),
                       "un message sans texte est résumé par la nature de son média représentatif")
    }

    func test_optimisticReplyReference_voice_carriesDuration() {
        let sut = makeSUT()
        let quoted = makeQuoted(content: "", attachments: [makeVoice()])
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.attachmentType, "audio")
        XCTAssertEqual(reference.attachmentDurationMs, 42_000)
        XCTAssertEqual(reference.attachmentFileSize, 61_440)
        XCTAssertEqual(reference.previewText, MediaKindLabel.summary(.audio))
    }

    func test_optimisticReplyReference_photoWithoutThumbnail_fallsBackToTheFileUrl() {
        let sut = makeSUT()
        let fresh = MessageAttachment(
            id: "a-fresh", mimeType: "image/jpeg", fileUrl: "https://cdn.meeshy.me/a-fresh.jpg"
        )
        let quoted = makeQuoted(content: "", attachments: [fresh])
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.attachmentThumbnailUrl, "https://cdn.meeshy.me/a-fresh.jpg",
                       "une photo tout juste envoyée n'a pas encore de vignette serveur : la citation montre le fichier")
    }

    func test_optimisticReplyReference_localisationBeforePhoto_quotesThePhoto() {
        let sut = makeSUT()
        let place = MessageAttachment(id: "a-place", mimeType: "application/x-location", latitude: 48.85, longitude: 2.35)
        let quoted = makeQuoted(content: "", attachments: [place, makePhoto()])
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.attachmentType, "image",
                       "le média REPRÉSENTATIF est le premier hors localisation — la même règle que l'ouverture plein écran")
        XCTAssertEqual(reference.attachmentThumbHash, "1QcSHQRnh493V4dIh4eXh1h4kJUI")
    }

    // MARK: - Le Prisme du lecteur

    func test_optimisticReplyReference_translatedMessage_servesTheRankTwoTranslation_neverTranslationsFirst() {
        let sut = makeSUT(systemLanguage: "de", regionalLanguage: "fr")
        let quoted = makeQuoted(content: "Hello", originalLanguage: "en")
        sut.messages = [quoted]
        sut.messageTranslations[quoted.id] = [
            makeTranslation(of: quoted.id, to: "es", text: "Hola"),
            makeTranslation(of: quoted.id, to: "fr", text: "Bonjour"),
        ]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, "Bonjour",
                       "le rang 2 est servi quand le rang 1 manque ; « Hola » (translations.first) serait pire que l'original")
    }

    func test_optimisticReplyReference_noTranslationInThePrism_servesTheOriginal() {
        let sut = makeSUT(systemLanguage: "fr")
        let quoted = makeQuoted(content: "Hello", originalLanguage: "en")
        sut.messages = [quoted]
        sut.messageTranslations[quoted.id] = [
            makeTranslation(of: quoted.id, to: "es", text: "Hola"),
        ]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, "Hello", "nil ⇒ l'original, jamais `translations.first`")
    }

    /// Le rang 4 EXERCÉ, et non seulement neutralisé : la locale appareil sert
    /// quand aucun rang applicatif ne matche. Un témoin qui se contente de la
    /// fixer prouve seulement qu'elle ne nuit pas.
    func test_optimisticReplyReference_deviceLocaleRank_servesItsTranslation() {
        let sut = makeSUT(systemLanguage: "fr", deviceLocale: "es")
        let quoted = makeQuoted(content: "Hello", originalLanguage: "en")
        sut.messages = [quoted]
        sut.messageTranslations[quoted.id] = [
            makeTranslation(of: quoted.id, to: "es", text: "Hola"),
        ]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, "Hola",
                       "la locale appareil concourt au rang 4 — servie quand aucun rang applicatif ne matche")
    }

    func test_optimisticReplyReference_servesWhatTheBubbleDisplays() {
        let sut = makeSUT(systemLanguage: "fr")
        let quoted = makeQuoted(content: "Hello", originalLanguage: "en")
        sut.messages = [quoted]
        sut.messageTranslations[quoted.id] = [
            makeTranslation(of: quoted.id, to: "fr", text: "Bonjour"),
        ]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, sut.preferredTranslation(for: quoted.id)?.translatedContent,
                       "UNE règle : la citation cite le texte que la bulle rend, résolu par `preferredTranslation(for:)`")
    }

    // MARK: - Protection du contenu cité

    func test_optimisticReplyReference_viewOncePhoto_servesPlaceholderAndNoThumbnailFact() {
        let sut = makeSUT()
        let quoted = makeQuoted(
            content: "secret", attachments: [makePhoto(isViewOnce: true)],
            effects: MessageEffects(flags: [.viewOnce])
        )
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, "👁️ 🖼️", "même vocabulaire que `APIMessageReplyTo` et `protectedPreview` côté passerelle")
        XCTAssertEqual(reference.attachmentIsProtected, true)
        XCTAssertTrue(reference.quotedMediaIsProtected)
        XCTAssertNil(reference.attachmentThumbnailUrl, "aucune vignette ne part avec un média à vue unique")
        XCTAssertNil(reference.attachmentThumbHash, "ni son ThumbHash : un flou reste une image")
        XCTAssertFalse(reference.previewText.contains("secret"))
    }

    func test_optimisticReplyReference_blurredText_servesBlurredPlaceholder() {
        let sut = makeSUT()
        let quoted = makeQuoted(content: "secret", effects: MessageEffects(flags: [.blurred]))
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, "🌫️ 💬")
        XCTAssertEqual(reference.attachmentIsProtected, true)
    }

    func test_optimisticReplyReference_encryptedVoice_servesLockedPlaceholder() {
        let sut = makeSUT()
        let quoted = makeQuoted(content: "", attachments: [makeVoice()], isEncrypted: true)
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, "🔒 🎵")
        XCTAssertEqual(reference.attachmentDurationMs, 42_000, "la durée n'est pas un secret : la ligne de détails la garde")
    }

    func test_optimisticReplyReference_viewOnceAttachmentOnPlainMessage_keepsTextButHidesThumbnail() {
        let sut = makeSUT()
        let quoted = makeQuoted(content: "regarde", attachments: [makePhoto(isViewOnce: true)])
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.previewText, "regarde", "la protection posée sur la PIÈCE JOINTE seule ne masque pas le texte du message")
        XCTAssertEqual(reference.attachmentIsProtected, true)
        XCTAssertNil(reference.attachmentThumbnailUrl)
        XCTAssertNil(reference.attachmentThumbHash)
    }

    // MARK: - Identité de l'auteur cité

    func test_optimisticReplyReference_carriesAuthorIdentityAndIsMe() {
        let sut = makeSUT()
        let quoted = makeQuoted(isMe: true)
        sut.messages = [quoted]

        let reference = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(reference.messageId, "q1")
        XCTAssertEqual(reference.authorName, "Bob")
        XCTAssertEqual(reference.authorColor, "FF8800")
        XCTAssertEqual(reference.authorAvatarUrl, "https://cdn.meeshy.me/bob.jpg",
                       "gravé à la composition : la citation est une feuille `Equatable` à `==` manuel")
        XCTAssertTrue(reference.isMe)
        XCTAssertFalse(reference.isStoryReply)
    }

    // MARK: - Les deux producteurs partagent la fabrique

    func test_makeReplyReference_withReplyToId_isTheOptimisticFactory() {
        let sut = makeSUT(systemLanguage: "fr")
        let quoted = makeQuoted(content: "Hello", originalLanguage: "en", attachments: [makePhoto()])
        sut.messages = [quoted]
        sut.messageTranslations[quoted.id] = [makeTranslation(of: quoted.id, to: "fr", text: "Bonjour")]

        let viaSend = sut.makeReplyReference(storyReplyReference: nil, replyToId: quoted.id)
        let viaFactory = sut.optimisticReplyReference(quoting: quoted)

        XCTAssertEqual(viaSend?.previewText, viaFactory.previewText)
        XCTAssertEqual(viaSend?.attachmentThumbHash, viaFactory.attachmentThumbHash)
        XCTAssertEqual(viaSend?.attachmentWidth, viaFactory.attachmentWidth)
        XCTAssertEqual(viaSend?.authorAvatarUrl, viaFactory.authorAvatarUrl)
    }

    func test_makeReplyReference_withStoryReference_returnsItUntouched() {
        let sut = makeSUT()
        let story = ReplyReference(messageId: "story_1", authorName: "Story", previewText: "📷 Story", isStoryReply: true)

        let reference = sut.makeReplyReference(storyReplyReference: story, replyToId: "q1")

        XCTAssertEqual(reference?.messageId, "story_1")
        XCTAssertEqual(reference?.isStoryReply, true)
    }

    func test_makeReplyReference_unknownMessage_returnsNil() {
        let sut = makeSUT()
        sut.messages = []

        XCTAssertNil(sut.makeReplyReference(storyReplyReference: nil, replyToId: "absent"))
    }

    // MARK: - Garde de source : la bannière du composeur passe par la fabrique

    /// `triggerReply` est une méthode d'extension de `ConversationView` : aucun
    /// test d'exécution ne peut l'appeler sans monter la vue. Garde de SOURCE
    /// ancrée, comme `ConversationReplyContextTests` : la bannière au balayage
    /// ne compose plus sa propre citation, elle demande la fabrique unique —
    /// sinon les deux producteurs redivergent au premier champ ajouté.
    func test_triggerReply_callsTheOptimisticFactory() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/ViewModels
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+MessageRow.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))

        XCTAssertTrue(code.contains("func triggerReply(for msg: Message)"),
                      "Ancrage perdu : ni fichier tronqué ni fonction renommée ne doit laisser cette garde passer à vide.")
        XCTAssertTrue(code.contains("viewModel.optimisticReplyReference(quoting: msg)"),
                      "La bannière de réponse doit naître de la fabrique unique, pas d'un `ReplyReference(` composé à la main.")
        XCTAssertFalse(code.contains("= ReplyReference("),
                      "Aucune citation composée à la main ne doit subsister dans le geste « Répondre ».")
    }
}
