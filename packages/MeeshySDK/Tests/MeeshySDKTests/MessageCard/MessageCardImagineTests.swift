import Foundation
import Testing
@testable import MeeshySDK

/// « Imagine » (#8692) — le format de l'image, les médias, l'onglet Frame et
/// ce qu'une carte animée produit. Des lois pures, mesurées avec une règle fixe.
struct MessageCardImagineTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static let photo = MessageCardMedia(id: "p1", kind: .image, aspect: 4.0 / 3.0)
    private static let clip = MessageCardMedia(id: "v1", kind: .video, aspect: 16.0 / 9.0, duration: 10)
    private static let voice = MessageCardMedia(id: "a1", kind: .audio, duration: 90, name: "Mémo")

    private static func input(
        quoted: MessageCardPart? = MessageCardPart(author: "Awa", text: "On se retrouve où ce soir ?"),
        reply: MessageCardPart = MessageCardPart(author: "Jacques", text: "Chez Lina, à 20 h !"),
        title: String? = nil,
        date: String? = nil,
        media: [MessageCardMedia] = [],
        disposition: MessageCardDisposition = .standard,
        replyTime: String? = nil,
        clip: MessageCardClip? = nil,
        time: Double? = nil
    ) -> MessageCardInput {
        MessageCardInput(quoted: quoted, reply: reply, template: MessageCardTemplates.defaultID, handle: "jacques",
                         title: title, date: date, media: media, disposition: disposition,
                         replyTime: replyTime, clip: clip, time: time)
    }

    private static func layout(_ input: MessageCardInput) -> MessageCardLayout { MessageCardLayout.make(input, measure: measure) }

    private static func flat(_ ops: [MessageCardOp]) -> [MessageCardOp] {
        ops.flatMap { op -> [MessageCardOp] in
            if case let .group(group) = op { return flat(group.ops) }
            return [op]
        }
    }

    private static func texts(_ ops: [MessageCardOp]) -> [MessageCardTextOp] {
        flat(ops).compactMap { if case let .text(text) = $0 { return text } else { return nil } }
    }

    private static func media(_ ops: [MessageCardOp]) -> [MessageCardMediaOp] {
        flat(ops).compactMap { if case let .media(media) = $0 { return media } else { return nil } }
    }

    private static func glyphs(_ ops: [MessageCardOp]) -> [MessageCardGlyphOp] {
        flat(ops).compactMap { if case let .glyph(glyph) = $0 { return glyph } else { return nil } }
    }

    private static func bars(_ ops: [MessageCardOp]) -> [MessageCardRectOp] {
        flat(ops).compactMap { if case let .bar(bar) = $0 { return bar } else { return nil } }
    }

    // MARK: - Format de l'image

    @Test func aspect_eachFormatFixesItsCanvas() {
        let sizes = MessageCardAspect.allCases.map { aspect -> [Double] in
            let card = Self.layout(Self.input(disposition: MessageCardDisposition(aspect: aspect)))
            return [card.width, card.height]
        }
        #expect(sizes == [[1080, 1080], [1080, 1920], [1080, 1350], [1080, 1080], [1920, 1080]])
        #expect(MessageCardAspect.allCases.compactMap(\.ratio) == ["9:16", "4:5", "1:1", "16:9"])
    }

    @Test func aspect_aFixedCanvasCentersItsContent_andNothingLeavesIt() throws {
        let card = Self.layout(Self.input(disposition: MessageCardDisposition(aspect: .story)))
        let reply = try #require(Self.texts(card.ops).first { $0.text == "Chez Lina, à 20 h !" })
        #expect(reply.y > 700 && reply.y < 1300)
        let landscape = Self.layout(Self.input(reply: MessageCardPart(author: "J", text: String(repeating: "mot ", count: 400)), disposition: MessageCardDisposition(aspect: .landscape)))
        #expect(Self.texts(landscape.ops).allSatisfy { $0.y <= landscape.height && $0.x + Self.measure($0.text, $0.font) <= landscape.width })
    }

    // MARK: - Médias

    @Test func media_aboveSitsBetweenTheLinkAndTheReply() throws {
        let card = Self.layout(Self.input(media: [Self.photo]))
        #expect(card.regions.map(\.part) == [.quote, .link, .media, .reply])
        let painted = try #require(Self.media(card.ops).first)
        #expect(painted.mediaID == "p1")
        #expect(painted.width == 1080 - 2 * 96)
        #expect(abs(painted.height - painted.width * 3 / 4) <= 1)
    }

    @Test func media_belowComesAfterTheReply() {
        let card = Self.layout(Self.input(media: [Self.photo], disposition: MessageCardDisposition(mediaLayout: .below)))
        #expect(card.regions.map(\.part) == [.quote, .link, .reply, .media])
    }

    @Test func media_mosaicLaysOutUpToFour_theOddOneFullWidth() {
        let four = (1...5).map { MessageCardMedia(id: "p\($0)", kind: .image) }
        let three = Self.media(Self.layout(Self.input(media: Array(four.prefix(3)), disposition: MessageCardDisposition(mediaLayout: .mosaic))).ops)
        #expect(three.count == 3)
        #expect(three[0].width == three[1].width && three[2].width > three[0].width)
        #expect(three[0].y == three[1].y && three[2].y > three[0].y)
        let capped = Self.media(Self.layout(Self.input(media: four, disposition: MessageCardDisposition(mediaLayout: .mosaic))).ops)
        #expect(capped.map(\.mediaID) == ["p1", "p2", "p3", "p4"])
    }

    @Test func media_backdropPaintsUnderTheWatermark_behindAVeil() throws {
        let card = Self.layout(Self.input(media: [Self.photo], disposition: MessageCardDisposition(mediaLayout: .backdrop)))
        #expect(Self.media(card.ops).isEmpty)
        let backdrop = try #require(Self.media(card.backdrop).first)
        #expect(backdrop.x == 0 && backdrop.y == 0 && backdrop.width == card.width && backdrop.height == card.height)
        #expect(card.backdrop.count == 2)
    }

    @Test func media_aStillVideoShowsItsPosterAndAPlayBadge_ananimatedOneDoesNot() {
        #expect(Self.glyphs(Self.layout(Self.input(media: [Self.clip])).ops).map(\.glyph) == [.play])
        #expect(Self.glyphs(Self.layout(Self.input(media: [Self.clip], time: 3)).ops).isEmpty)
        #expect(Self.media(Self.layout(Self.input(media: [Self.clip])).ops).first?.kind == .video)
    }

    @Test func media_aVisualNeverTakesMoreThanItsShareOfTheCard() throws {
        let tall = MessageCardMedia(id: "tall", kind: .image, aspect: 0.25)
        let painted = try #require(Self.media(Self.layout(Self.input(media: [tall])).ops).first)
        #expect(painted.height <= (1920 - 2 * 136) * MessageCardMediaPlan.visualShare)
    }

    @Test func media_aMediaOnlyMessageStillMakesACard() {
        let card = Self.layout(Self.input(quoted: nil, reply: MessageCardPart(author: "Jacques", text: ""), media: [Self.photo]))
        #expect(card.regions.map(\.part) == [.media, .reply])
        #expect(Self.texts(card.ops).map(\.text) == ["Jacques"])
    }

    // MARK: - Son

    @Test func audio_everyStyleRepresentsTheSoundInsideItsBlock() throws {
        for style in MessageCardAudioStyle.allCases {
            let card = Self.layout(Self.input(media: [Self.voice], disposition: MessageCardDisposition(audioStyle: style)))
            let zone = try #require(card.regions.first { $0.part == .media })
            #expect(zone.height == MessageCardMediaPlan.audioHeight(style), "\(style)")
            for bar in Self.bars(card.ops) where bar.y >= zone.y {
                #expect(bar.y + bar.height <= zone.y + zone.height + 0.5, "\(style)")
            }
        }
        let wave = Self.layout(Self.input(media: [Self.voice]))
        #expect(Self.bars(wave.ops).filter { $0.y >= 0 }.count >= 48)
        #expect(Self.texts(wave.ops).contains { $0.text == "1:30" })
        let ticket = Self.layout(Self.input(media: [Self.voice], disposition: MessageCardDisposition(audioStyle: .ticket)))
        #expect(Self.texts(ticket.ops).contains { $0.text == "Mémo" })
        #expect(Self.glyphs(ticket.ops).map(\.glyph) == [.note])
    }

    /// Un vocal de 90 s part en vidéo d'une minute : à t = 30 s, l'horloge dit
    /// 0:30 — le VRAI temps écoulé —, jamais 0:45 (la moitié du son entier), et
    /// la moitié des barres de l'extrait est allumée (#8979).
    @Test func audio_theClockAndTheBarsFollowTheRealElapsedTime() throws {
        let accent = MessageCardTemplates.defaultID.palette.palette.accent
        let plan = try #require(MessageCardMotionPlan.of(.video, media: [Self.voice]))
        let card = Self.layout(Self.input(quoted: nil, media: [Self.voice], clip: plan.clip, time: 30))
        let zone = try #require(card.regions.first { $0.part == .media })
        let bars = Self.bars(card.ops).filter { $0.y >= zone.y }
        let lit = bars.filter { $0.color == accent }.count
        #expect(abs(lit - bars.count / 2) <= 1, "\(lit) barres allumées sur \(bars.count)")
        let clocks = Self.texts(card.ops).map(\.text)
        #expect(clocks.contains("0:30 / 1:00"), "\(clocks)")
        #expect(!clocks.contains { $0.hasPrefix("0:45") })
    }

    @Test func audio_withoutSamplesTheWaveIsStable() {
        let first = MessageCardMedia.syntheticSamples(seed: "a1", count: 48)
        #expect(first == MessageCardMedia.syntheticSamples(seed: "a1", count: 48))
        #expect(first != MessageCardMedia.syntheticSamples(seed: "a2", count: 48))
        #expect(first.allSatisfy { $0 > 0 && $0 <= 1 })
        #expect(MessageCardMedia.resample([0, 1, 0, 1], count: 2) == [0.5, 0.5])
        #expect(MessageCardMedia.clock(65) == "1:05")
    }

    // MARK: - Temporel

    @Test func output_videoOffersImageGifAndVideo_audioOnlyImageAndVideo() {
        #expect(MessageCardOutput.offered(for: [.video]) == [.image, .gif, .video])
        #expect(MessageCardOutput.offered(for: [.image, .audio]) == [.image, .video])
        #expect(MessageCardOutput.offered(for: [.image]) == [.image])
        #expect(MessageCardOutput.offered(for: []) == [.image])
    }

    @Test func motion_plansAShortHalfSizeGif_andAFullVideo() throws {
        let gif = try #require(MessageCardMotionPlan.of(.gif, media: [Self.clip]))
        #expect(gif.duration == 6 && gif.fps == 10 && gif.frameCount == 60 && gif.scale == 0.5)
        let pixels = gif.pixelSize(width: 1080, height: 1255)
        #expect(pixels.width == 540 && pixels.height == 626)
        let video = try #require(MessageCardMotionPlan.of(.video, media: [Self.clip]))
        #expect(video.duration == 10 && video.frameCount == 150 && video.scale == 1)
        let sound = try #require(MessageCardMotionPlan.of(.video, media: [Self.voice]))
        #expect(sound.duration == 60 && sound.fps == 10 && sound.start == 0)
        // L'instant d'une image est celui où elle s'affiche — celui qu'on entend.
        #expect(sound.time(ofFrame: 0) == 0 && sound.time(ofFrame: 300) == 30)
        #expect(sound.clip == MessageCardClip(start: 0, duration: 60))
        #expect(MessageCardMotionPlan.of(.gif, media: [Self.voice]) == nil)
        #expect(MessageCardMotionPlan.of(.image, media: [Self.clip]) == nil)
    }

    // MARK: - Frame

    @Test func frame_aStackedHeaderWritesLetterByLetterInAColumn() {
        let card = Self.layout(Self.input(title: "Soirée", disposition: MessageCardDisposition(headerOrientation: .stacked)))
        let letters = Self.texts(card.ops).filter { $0.align == .center }
        #expect(letters.map(\.text) == ["S", "o", "i", "r", "é", "e"])
        #expect(zip(letters, letters.dropFirst()).allSatisfy { $0.y < $1.y && $0.x == $1.x })
        #expect(card.regions.first?.part == .header)
        let reply = Self.texts(card.ops).first { $0.text == "Chez Lina, à 20 h !" }
        #expect((reply?.x ?? 0) > 96 + 84)
    }

    @Test func frame_aRotatedHeaderReadsUpOrDown() {
        let up = Self.texts(Self.layout(Self.input(title: "Soirée", date: "28 sept.", disposition: MessageCardDisposition(headerOrientation: .rotatedUp))).ops)
        #expect(up.first { $0.text == "Soirée · 28 sept." }?.rotation == -Double.pi / 2)
        let down = Self.texts(Self.layout(Self.input(title: "Soirée", disposition: MessageCardDisposition(headerOrientation: .rotatedDown))).ops)
        #expect(down.first { $0.text == "Soirée" }?.rotation == Double.pi / 2)
        #expect(Self.layout(Self.input(disposition: MessageCardDisposition(headerOrientation: .stacked))).regions.first?.part == .quote)
    }

    @Test func frame_namesAtTheEndSignTheMessage() throws {
        let ops = Self.layout(Self.input(disposition: MessageCardDisposition(authorPlacement: .after), replyTime: "14:32")).ops
        let reply = try #require(Self.texts(ops).first { $0.text == "Chez Lina, à 20 h !" })
        let signature = try #require(Self.texts(ops).first { $0.text == "— Jacques · 14:32" })
        #expect(signature.y > reply.y)
        #expect(signature.align == .right)
    }

    @Test func frame_theTimeSitsOnTheNameLine() throws {
        let ops = Self.layout(Self.input(replyTime: "14:32")).ops
        let name = try #require(Self.texts(ops).first { $0.text == "Jacques" })
        let time = try #require(Self.texts(ops).first { $0.text == "14:32" })
        #expect(name.y == time.y && time.align == .right)
    }

    @Test func frame_aTiltedMessageTurnsAsOneBlock_theHeaderStaysStraight() throws {
        let card = Self.layout(Self.input(title: "Soirée", disposition: MessageCardDisposition(tilt: .left)))
        let groups = card.ops.compactMap { op -> MessageCardGroupOp? in if case let .group(group) = op { return group } else { return nil } }
        let group = try #require(groups.first)
        #expect(groups.count == 1)
        #expect(abs(group.rotation - (-4 * Double.pi / 180)) < 1e-9)
        #expect(card.ops.contains { if case let .text(text) = $0 { return text.text == "Soirée" } else { return false } })
    }

    // MARK: - Vignettes

    @Test func legible_aThumbnailKeepsItsSeparatorVisible() {
        let card = Self.layout(Self.input())
        let scale = 72.0 / 1080
        let thin = card.ops.compactMap { op -> MessageCardSeparatorOp? in if case let .separator(line) = op { return line } else { return nil } }
        #expect(thin.allSatisfy { $0.lineWidth * scale < 1 })
        let thumb = card.legible(atScale: scale)
        let lines = thumb.ops.compactMap { op -> MessageCardSeparatorOp? in if case let .separator(line) = op { return line } else { return nil } }
        #expect(!lines.isEmpty)
        #expect(lines.allSatisfy { $0.lineWidth * scale >= 1.5 - 1e-9 })
        #expect(thumb.regions == card.regions && thumb.width == card.width && thumb.height == card.height)
        #expect(card.legible(atScale: 1) == card)
    }

    // MARK: - Format & sujet

    @Test func format_carriesTheDispositionThroughTheStore_andAnOlderFormatReadsStandard() {
        var format = MessageCardFormat.initial
        format.showTimes = true
        format.useHandles = true
        format.disposition = MessageCardDisposition(aspect: .portrait, headerOrientation: .rotatedUp, authorPlacement: .after, tilt: .right, mediaLayout: .mosaic, audioStyle: .spectrum)
        #expect(MessageCardFormat.parse(format.serialized) == format)
        let older = #"{"template":"neige.systeme.bulles","showConversationTitle":false,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":true}"#
        #expect(MessageCardFormat.parse(older)?.disposition == .standard)
        #expect(MessageCardFormat.parse(older)?.showTimes == false)
    }

    @Test func format_theFrameTabOffersDateTimesAndHandles() {
        #expect(MessageCardFormat.initial.frameToggles(hasHandles: true) == [.showDate, .showTimes, .useHandles])
        #expect(MessageCardFormat.initial.frameToggles(hasHandles: false) == [.showDate, .showTimes])
        var hidden = MessageCardFormat.initial
        hidden.showAuthors = false
        #expect(hidden.frameToggles(hasHandles: true) == [.showDate, .showTimes])
    }

    @Test func input_useHandlesPaintsThePseudo_butAnonymityWins() {
        let subject = MessageCardSubject(
            quoted: MessageCardPart(author: "Awa Diallo", text: "Question ?", handle: "awa"),
            reply: MessageCardPart(author: "Jacques Martin", text: "Réponse.", handle: "@jacques"),
            sentAt: Date(timeIntervalSince1970: 0)
        )
        var format = MessageCardFormat.initial
        format.useHandles = true
        format.anonymizeQuoted = true
        let input = MessageCardInput.of(subject: subject, format: format, handle: "jacques", conversationTitle: nil, anonymousLabel: "Anonyme", formatDate: { _ in "" })
        #expect(input.reply.author == "@jacques")
        #expect(input.quoted?.author == "Anonyme")
        #expect(subject.hasHandles)
    }

    @Test func input_showTimesFormatsEachKnownTime() {
        let subject = MessageCardSubject(quoted: nil, reply: MessageCardPart(author: "J", text: "R"), sentAt: Date(timeIntervalSince1970: 0))
        var format = MessageCardFormat.initial
        format.showTimes = true
        let input = MessageCardInput.of(subject: subject, format: format, handle: nil, conversationTitle: nil, anonymousLabel: "A", formatDate: { _ in "" }, formatTime: { _ in "09:15" })
        #expect(input.replyTime == "09:15" && input.quotedTime == nil)
        #expect(MessageCardInput.of(subject: subject, format: .initial, handle: nil, conversationTitle: nil, anonymousLabel: "A", formatDate: { _ in "" }, formatTime: { _ in "09:15" }).replyTime == nil)
    }

    private static let now = Date(timeIntervalSince1970: 1_790_000_000)
    private static let viewer = MessageCardSubject.Viewer(id: "u-jacques", displayName: "Jacques", username: "jacques")

    private static func message(content: String = "", attachments: [MeeshyMessageAttachment]) -> MeeshyMessage {
        MeeshyMessage(id: "m", conversationId: "c", senderId: "u-awa", content: content, attachments: attachments, senderName: "Awa", senderUsername: "awa")
    }

    @Test func subject_aMediaOnlyMessageLeavesWithItsMedia_inTheOrderOfTheMessage() throws {
        let message = Self.message(attachments: [
            MeeshyMessageAttachment(id: "img", mimeType: "image/jpeg", fileUrl: "https://x/p.jpg", width: 400, height: 300),
            MeeshyMessageAttachment(id: "doc", mimeType: "application/pdf", fileUrl: "https://x/d.pdf"),
            MeeshyMessageAttachment(id: "snd", mimeType: "audio/mp4", fileUrl: "https://x/a.m4a", duration: 12_000),
        ])
        let subject = try #require(MessageCardSubject.of(message: message, servedText: nil, translations: [:], viewer: Self.viewer, now: Self.now))
        #expect(subject.media.map(\.media.id) == ["img", "snd"])
        #expect(subject.media[0].media.aspect == 4.0 / 3.0)
        #expect(subject.media[1].media.duration == 12)
        #expect(subject.reply.text.isEmpty && subject.reply.handle == "awa")
    }

    @Test func subject_aProtectedPieceProtectsItsMessage_anEncryptedOneIsNotPainted() {
        let viewOnce = Self.message(content: "Regarde", attachments: [MeeshyMessageAttachment(id: "i", mimeType: "image/png", fileUrl: "https://x/i.png", isViewOnce: true)])
        #expect(MessageCardSubject.of(message: viewOnce, servedText: nil, translations: [:], viewer: Self.viewer, now: Self.now) == nil)
        let sealed = Self.message(content: "Regarde", attachments: [MeeshyMessageAttachment(id: "i", mimeType: "image/png", fileUrl: "https://x/i.png", isEncrypted: true)])
        #expect(MessageCardSubject.of(message: sealed, servedText: nil, translations: [:], viewer: Self.viewer, now: Self.now)?.media.isEmpty == true)
        let sealedOnly = Self.message(attachments: [MeeshyMessageAttachment(id: "i", mimeType: "image/png", fileUrl: "https://x/i.png", isEncrypted: true)])
        #expect(MessageCardSubject.of(message: sealedOnly, servedText: nil, translations: [:], viewer: Self.viewer, now: Self.now) == nil)
    }

    // MARK: - Le média du message CITÉ (#8901)

    private static func quotedPhoto(protected: Bool? = nil, deletedAt: Date? = nil, expiresAt: Date? = nil) -> ReplyReference {
        var reference = ReplyReference(
            messageId: "q", authorName: "Bob", previewText: "Regarde ça",
            attachmentType: "image", attachmentId: "q-img", attachmentThumbnailUrl: "https://x/q-thumb.jpg",
            attachmentFileUrl: "https://x/q.jpg", attachmentIsProtected: protected,
            attachmentFacts: ReplyReference.QuotedAttachmentFacts(thumbHash: nil, width: 800, height: 400, durationMs: nil, fileSize: nil, pageCount: nil, mimeType: "image/jpeg")
        )
        reference.quotedMessageDeletedAt = deletedAt
        reference.quotedExpiresAt = expiresAt
        return reference
    }

    private static func reply(_ content: String, attachments: [MeeshyMessageAttachment] = [], quoting reference: ReplyReference) -> MeeshyMessage {
        var message = Self.message(content: content, attachments: attachments)
        message.replyTo = reference
        return message
    }

    @Test func subject_aTextReplyToAPhotoPaintsTheQuotedPhoto() throws {
        let subject = try #require(MessageCardSubject.of(message: Self.reply("Magnifique !", quoting: Self.quotedPhoto()), servedText: nil, translations: [:], viewer: Self.viewer, now: Self.now))
        #expect(subject.media.map(\.media.id) == ["q-img"])
        #expect(subject.media.first?.fileURL == "https://x/q.jpg")
        #expect(subject.media.first?.media.aspect == 2)
    }

    @Test func subject_theReplysOwnMediaComeFirst_theQuotedOnesAfter() throws {
        let own = MeeshyMessageAttachment(id: "own", mimeType: "image/png", fileUrl: "https://x/own.png")
        let subject = try #require(MessageCardSubject.of(message: Self.reply("Et la mienne", attachments: [own], quoting: Self.quotedPhoto()), servedText: nil, translations: [:], viewer: Self.viewer, now: Self.now))
        #expect(subject.media.map(\.media.id) == ["own", "q-img"])
    }

    @Test func subject_aProtectedDeletedOrExpiredQuoteBringsNoMedia() {
        let references = [
            Self.quotedPhoto(protected: true),
            Self.quotedPhoto(deletedAt: Self.now.addingTimeInterval(-60)),
            Self.quotedPhoto(expiresAt: Self.now.addingTimeInterval(-1)),
        ]
        for reference in references {
            #expect(MessageCardSubject.of(message: Self.reply("Réponse", quoting: reference), servedText: nil, translations: [:], viewer: Self.viewer, now: Self.now)?.media.isEmpty == true)
        }
    }

    @Test func subject_theQuotedMessageInMemoryBringsEveryPaintablePiece_underItsOwnGuards() throws {
        let quoted = MeeshyMessage(id: "q", conversationId: "c", senderId: "u-bob", content: "Deux photos", attachments: [
            MeeshyMessageAttachment(id: "q-a", mimeType: "image/jpeg", fileUrl: "https://x/a.jpg"),
            MeeshyMessageAttachment(id: "q-sealed", mimeType: "image/jpeg", fileUrl: "https://x/s.jpg", isEncrypted: true),
            MeeshyMessageAttachment(id: "q-b", mimeType: "video/mp4", fileUrl: "https://x/b.mp4", thumbnailUrl: "https://x/b.jpg"),
        ], senderName: "Bob")
        let subject = try #require(MessageCardSubject.of(message: Self.reply("Belles", quoting: Self.quotedPhoto()), servedText: nil, translations: [:], viewer: Self.viewer, quotedMessage: quoted, now: Self.now))
        #expect(subject.media.map(\.media.id) == ["q-a", "q-b"])
        #expect(subject.media.last?.posterURL == "https://x/b.jpg")

        var blurred = quoted
        blurred.isBlurred = true
        #expect(MessageCardSubject.of(message: Self.reply("Belles", quoting: Self.quotedPhoto()), servedText: nil, translations: [:], viewer: Self.viewer, quotedMessage: blurred, now: Self.now)?.media.isEmpty == true)
    }

    @Test func subject_aCommentShowsItsServedText_andAProtectedCommentNeverLeaves() throws {
        let comment = FeedComment(id: "c1", author: "Awa", authorId: "u-awa", authorUsername: "awa", content: "Bonjour", originalLanguage: "fr", translatedContent: "Hello",
                                  media: [FeedMedia(id: "m1", type: .video, url: "https://x/v.mp4", thumbnailUrl: "https://x/v.jpg", width: 1920, height: 1080, duration: 8)])
        let subject = try #require(MessageCardSubject.of(comment: comment, viewer: Self.viewer))
        #expect(subject.reply == MessageCardPart(author: "Awa", text: "Hello", handle: "awa"))
        #expect(subject.media.first?.posterURL == "https://x/v.jpg")
        #expect(subject.media.first?.media.duration == 8)
        #expect(MessageCardSubject.of(comment: comment, viewer: Self.viewer, showOriginal: true)?.reply.text == "Bonjour")
        let blurred = FeedComment(author: "Awa", content: "Secret", effectFlags: Int(MessageEffectFlags.blurred.rawValue))
        #expect(MessageCardSubject.of(comment: blurred, viewer: Self.viewer) == nil)
    }

    @Test func subject_aReplyCarriesItsRootAsItsQuote_servedByThePrism() throws {
        let root = FeedComment(id: "root", author: "Awa", authorId: "u-awa", authorUsername: "awa", content: "Bonjour", timestamp: Date(timeIntervalSince1970: 100),
                               originalLanguage: "fr", translatedContent: "Hello")
        let reply = FeedComment(id: "r1", author: "Bob", authorId: "u-bob", authorUsername: "bob", content: "Salut", timestamp: Date(timeIntervalSince1970: 200), parentId: "root")
        let subject = try #require(MessageCardSubject.of(comment: reply, viewer: Self.viewer, quoting: root))
        #expect(subject.quoted == MessageCardPart(author: "Awa", text: "Hello", handle: "awa"))
        #expect(subject.quotedAt == Date(timeIntervalSince1970: 100))
        #expect(subject.reply.text == "Salut")
    }

    @Test func subject_aProtectedOrEmptyRootIsNeverQuoted_theReplyStillLeaves() throws {
        let reply = FeedComment(id: "r1", author: "Bob", content: "Salut", parentId: "root")
        let blurredRoot = FeedComment(id: "root", author: "Awa", content: "Secret", effectFlags: Int(MessageEffectFlags.blurred.rawValue))
        let viewOnceRoot = FeedComment(id: "root", author: "Awa", content: "Secret", effectFlags: Int(MessageEffectFlags.viewOnce.rawValue))
        let emptyRoot = FeedComment(id: "root", author: "Awa", content: "  ")
        for root in [blurredRoot, viewOnceRoot, emptyRoot] {
            let subject = try #require(MessageCardSubject.of(comment: reply, viewer: Self.viewer, quoting: root))
            #expect(subject.quoted == nil)
            #expect(subject.quotedAt == nil)
        }
    }

    @Test func fileName_takesTheExtensionOfItsOutput() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        #expect(MessageCardSubject.fileName(at: Date(timeIntervalSince1970: 1_790_000_000), output: .gif, calendar: calendar) == "meeshy-20260921-141320.gif")
        #expect(MessageCardSubject.fileName(at: Date(timeIntervalSince1970: 1_790_000_000), output: .video, calendar: calendar).hasSuffix(".mp4"))
    }
}
