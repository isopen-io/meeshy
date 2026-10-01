import Foundation
import Testing
@testable import MeeshySDK

/// **Imager un vocal** (#8979) — sa transcription (celle de la piste servie),
/// qui défile en karaoké sur l'extrait choisi ; son minuteur ; la durée et le
/// point de départ de la vidéo ; l'onde et le spectre qui se distinguent ; la
/// police de la transcription ; l'échelle de chaque partie, réglée au pincement.
/// Des lois pures, mesurées avec une règle fixe.
struct MessageCardAudioTests {

    private static func measure(_ text: String, _ font: MessageCardFont) -> Double { Double(text.count) * font.size * 0.5 }

    private static let phrases = ["Bonjour à tous.", "On se retrouve demain.", "À la gare, vers midi.",
                                  "Prenez vos billets.", "Le train part à treize heures.", "Bon voyage !"]

    /// Six phrases de deux secondes chacune.
    private static let timed = MessageCardTranscript(text: nil, segments: phrases.enumerated().map {
        MessageCardTranscript.Segment(text: $0.element, start: Double($0.offset) * 2, end: Double($0.offset + 1) * 2)
    })

    private static func voice(duration: Double = 12, samples: [Double] = [], transcript: MessageCardTranscript? = timed) -> MessageCardMedia {
        MessageCardMedia(id: "a1", kind: .audio, duration: duration, samples: samples, transcript: transcript)
    }

    private static func input(
        reply: String = "Écoute ça",
        media: [MessageCardMedia],
        disposition: MessageCardDisposition = .standard,
        clip: MessageCardClip? = nil,
        time: Double? = nil
    ) -> MessageCardInput {
        MessageCardInput(quoted: nil, reply: MessageCardPart(author: "Jacques", text: reply), template: MessageCardTemplates.defaultID,
                         handle: "jacques", media: media, disposition: disposition, clip: clip, time: time)
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

    private static func bars(_ ops: [MessageCardOp]) -> [MessageCardRectOp] {
        flat(ops).compactMap { if case let .bar(bar) = $0 { return bar } else { return nil } }
    }

    private static func panels(_ ops: [MessageCardOp]) -> [MessageCardRectOp] {
        flat(ops).compactMap { if case let .panel(panel) = $0 { return panel } else { return nil } }
    }

    private static func media(_ ops: [MessageCardOp]) -> [MessageCardMediaOp] {
        flat(ops).compactMap { if case let .media(media) = $0 { return media } else { return nil } }
    }

    /// Les lignes de transcription peintes, de haut en bas.
    private static func transcriptLines(_ card: MessageCardLayout) -> [MessageCardTextOp] {
        guard let zone = card.regions.first(where: { $0.part == .transcript }) else { return [] }
        return texts(card.ops).filter { $0.y > zone.y && $0.y <= zone.y + zone.height + 1 }
    }

    private static func region(_ card: MessageCardLayout, _ part: MessageCardPartID) -> MessageCardRegion? {
        card.regions.first { $0.part == part }
    }

    private static let palette = MessageCardTemplates.defaultID.palette.palette

    // MARK: - La piste servie

    private static func attachment() -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: "snd", mimeType: "audio/mp4", fileUrl: "https://x/a.m4a", duration: 12_000,
            transcription: .init(text: "Bonjour à tous. On se retrouve demain.", language: "fr", segments: [
                .init(text: "Bonjour à tous.", startTime: 0, endTime: 2),
                .init(text: "On se retrouve demain.", startTime: 2, endTime: 4.5),
            ]),
            audioTranslations: ["EN": .init(url: "https://x/a-en.m4a", transcription: "Hello everyone. See you tomorrow.", durationMs: 9_000, segments: [
                .init(text: "Hello everyone.", startTime: 0, endTime: 1.8),
                .init(text: "See you tomorrow.", startTime: 1.8, endTime: 4),
            ])]
        )
    }

    private static func subjectMedia(audioLanguages: [String: String]) throws -> MessageCardSubjectMedia {
        let message = MeeshyMessage(id: "m", conversationId: "c", senderId: "u-awa", content: "", attachments: [attachment()], senderName: "Awa")
        let viewer = MessageCardSubject.Viewer(id: "u-me", displayName: "Moi")
        let subject = try #require(MessageCardSubject.of(message: message, servedText: nil, translations: [:], viewer: viewer,
                                                         audioLanguages: audioLanguages, now: Date(timeIntervalSince1970: 0)))
        return try #require(subject.media.first)
    }

    @Test func transcript_theServedTrackCarriesItsFileItsDurationAndItsTranscript() throws {
        let english = try Self.subjectMedia(audioLanguages: ["snd": "en"])
        #expect(english.fileURL == "https://x/a-en.m4a")
        #expect(english.media.duration == 9)
        #expect(english.media.transcript?.cues.map(\.text) == ["Hello everyone.", "See you tomorrow."])

        let original = try Self.subjectMedia(audioLanguages: [:])
        #expect(original.fileURL == "https://x/a.m4a")
        #expect(original.media.duration == 12)
        #expect(original.media.transcript?.cues.map(\.text) == ["Bonjour à tous.", "On se retrouve demain."])

        let missing = try Self.subjectMedia(audioLanguages: ["snd": "es"])
        #expect(missing.fileURL == "https://x/a.m4a", "une langue sans piste traduite garde l'original")
        #expect(missing.media.transcript?.cues.first?.text == "Bonjour à tous.")
    }

    // MARK: - Transcription

    @Test func transcript_anImageShowsTheFirstLinesUnderTheSound_andCanBeHidden() throws {
        let card = Self.layout(Self.input(media: [Self.voice()]))
        let sound = try #require(Self.region(card, .media))
        let zone = try #require(Self.region(card, .transcript))
        #expect(zone.y >= sound.y + sound.height, "la transcription se lit SOUS le son")
        let lines = Self.transcriptLines(card)
        #expect(lines.count == MessageCardAudioMetrics.transcriptLines)
        #expect(lines.first?.text.hasPrefix("Bonjour") == true)
        #expect(lines.last?.text.hasSuffix("…") == true, "la suite est coupée : \(lines.map(\.text))")
        #expect(Self.panels(card.ops).isEmpty, "rien n'est surligné sur une image")

        var hidden = MessageCardDisposition.standard
        hidden.showsTranscript = false
        let bare = Self.layout(Self.input(media: [Self.voice()], disposition: hidden))
        #expect(Self.region(bare, .transcript) == nil)
        #expect(!Self.texts(bare.ops).contains { $0.text.hasPrefix("Bonjour") })
    }

    @Test func transcript_theVideoHighlightsThePhraseBeingSaid_andScrollsToKeepIt() throws {
        let early = Self.layout(Self.input(media: [Self.voice()], clip: MessageCardClip(start: 0, duration: 12), time: 0.5))
        let earlyLines = Self.transcriptLines(early)
        let lit = try #require(earlyLines.first { $0.color == Self.palette.replyInk })
        #expect(lit.text.hasPrefix("Bonjour"))
        #expect(Self.panels(early.ops).count == 1, "la phrase en cours est surlignée")

        let late = Self.layout(Self.input(media: [Self.voice()], clip: MessageCardClip(start: 0, duration: 12), time: 9))
        let lateLines = Self.transcriptLines(late)
        let said = try #require(lateLines.first { $0.color == Self.palette.replyInk })
        #expect(said.text.hasPrefix("Le train"), "à 9 s se dit la cinquième phrase : \(lateLines.map(\.text))")
        #expect(!lateLines.contains { $0.text.hasPrefix("Bonjour") }, "les lignes ont défilé")
        #expect(late.height == early.height, "une carte animée garde sa taille d'une image à l'autre")
    }

    @Test func transcript_withoutTimingTheKaraokeAdvancesWithTheVoice() throws {
        let untimed = try #require(MessageCardTranscript(text: "Un. Deux. Trois. Quatre.", segments: []))
        #expect(untimed.isUntimed)
        let cues = untimed.timed(over: 8)
        #expect(cues.map(\.text) == ["Un.", "Deux.", "Trois.", "Quatre."])
        #expect(cues.first?.start == 0)
        #expect(cues.last?.end == 8)
        #expect(zip(cues, cues.dropFirst()).allSatisfy { $0.end == $1.start })
        let card = Self.layout(Self.input(media: [Self.voice(duration: 8, transcript: untimed)], clip: MessageCardClip(start: 0, duration: 8), time: 7.5))
        #expect(Self.transcriptLines(card).first { $0.color == Self.palette.replyInk }?.text == "Quatre.")
    }

    @Test func transcript_theExcerptShowsOnlyWhatIsSaidInIt() throws {
        let card = Self.layout(Self.input(media: [Self.voice()], clip: MessageCardClip(start: 6, duration: 4)))
        let lines = Self.transcriptLines(card).map(\.text)
        #expect(lines.first?.hasPrefix("Prenez") == true, "\(lines)")
        #expect(!lines.contains { $0.hasPrefix("Bonjour") || $0.hasPrefix("Bon voyage") })
    }

    @Test func transcript_isPaintedInTheChosenTypeface_orTheTemplates() throws {
        let template = Self.transcriptLines(Self.layout(Self.input(media: [Self.voice()])))
        #expect(template.first?.font.face == MessageCardTemplates.defaultID.typeface.typeface.replyFace)
        var chosen = MessageCardDisposition.standard
        chosen.transcriptTypeface = .machine
        let machine = Self.transcriptLines(Self.layout(Self.input(media: [Self.voice()], disposition: chosen)))
        #expect(machine.first?.font.face == MessageCardTypefaceID.machine.typeface.replyFace)
    }

    // MARK: - Minuteur

    @Test func timer_aVideoSaysElapsedOverLength_anImageItsLength_andItCanBeHidden() {
        let long = Self.voice(duration: 90, transcript: nil)
        let moving = Self.texts(Self.layout(Self.input(media: [long], clip: MessageCardClip(start: 30, duration: 30), time: 12)).ops).map(\.text)
        #expect(moving.contains("0:12 / 0:30"), "\(moving)")
        let still = Self.texts(Self.layout(Self.input(media: [long])).ops).map(\.text)
        #expect(still.contains("1:30"))
        var hidden = MessageCardDisposition.standard
        hidden.showsTimer = false
        for style in MessageCardAudioStyle.allCases {
            hidden.audioStyle = style
            let texts = Self.texts(Self.layout(Self.input(media: [long], disposition: hidden, clip: MessageCardClip(start: 0, duration: 30), time: 3)).ops)
            #expect(!texts.contains { $0.text.contains(":") }, "\(style)")
        }
        #expect(MessageCardMediaPlan.audioHeight(.wave, timer: false) < MessageCardMediaPlan.audioHeight(.wave))
    }

    // MARK: - Durée et extrait

    @Test func clipLength_offersOnlyTheLengthsThatChangeTheVideo() {
        #expect(MessageCardClipLength.offered(forSoundDuration: 90) == [.fifteenSeconds, .thirtySeconds, .oneMinute])
        #expect(MessageCardClipLength.offered(forSoundDuration: 45) == [.fifteenSeconds, .thirtySeconds, .oneMinute])
        #expect(MessageCardClipLength.offered(forSoundDuration: 20) == [.fifteenSeconds, .thirtySeconds])
        #expect(MessageCardClipLength.offered(forSoundDuration: 10).isEmpty, "un son de 10 s part en entier")
        #expect(MessageCardClipLength.offered(forSoundDuration: nil) == MessageCardClipLength.allCases)
        let offered = MessageCardClipLength.offered(forSoundDuration: 20)
        #expect(MessageCardClipLength.oneMinute.selected(among: offered, soundDuration: 20) == .thirtySeconds)
        #expect(MessageCardClipLength.fifteenSeconds.selected(among: offered, soundDuration: 20) == .fifteenSeconds)
        #expect(MessageCardClipLength.oneMinute.bounded(by: 20) == 20)
    }

    @Test func motion_aSoundLeavesOnTheChosenLength_fromTheChosenPoint_keptInsideTheSound() throws {
        let long = Self.voice(duration: 90, transcript: nil)
        let half = try #require(MessageCardMotionPlan.of(.video, media: [long], length: .thirtySeconds, start: 20))
        #expect(half.duration == 30 && half.start == 20)
        let late = try #require(MessageCardMotionPlan.of(.video, media: [long], length: .thirtySeconds, start: 75))
        #expect(late.start == 60, "l'extrait glisse pour tenir dans le son")
        let early = try #require(MessageCardMotionPlan.of(.video, media: [long], length: .fifteenSeconds, start: -4))
        #expect(early.start == 0 && early.duration == 15)
        let short = try #require(MessageCardMotionPlan.of(.video, media: [Self.voice(duration: 20)], length: .oneMinute, start: 5))
        #expect(short.duration == 20 && short.start == 0)
        let clip = MessageCardMedia(id: "v", kind: .video, duration: 40)
        let gif = try #require(MessageCardMotionPlan.of(.gif, media: [clip], start: 38))
        #expect(gif.duration == 6 && gif.start == 34)
    }

    @Test func excerpt_theBarsAreThoseOfTheExcerpt() throws {
        let quietThenLoud = Array(repeating: 0.05, count: 60) + Array(repeating: 1.0, count: 60)
        let voice = Self.voice(duration: 12, samples: quietThenLoud, transcript: nil)
        let loud = Self.layout(Self.input(media: [voice], clip: MessageCardClip(start: 6, duration: 6)))
        let quiet = Self.layout(Self.input(media: [voice], clip: MessageCardClip(start: 0, duration: 6)))
        let tallest = { (card: MessageCardLayout) -> Double in Self.bars(card.ops).map(\.height).max() ?? 0 }
        let shortest = { (card: MessageCardLayout) -> Double in Self.bars(card.ops).map(\.height).min() ?? 0 }
        #expect(shortest(loud) > tallest(quiet), "l'extrait sonore ne montre que ses barres")
        #expect(voice.samples(in: MessageCardClip(start: 6, duration: 6)).allSatisfy { $0 == 1 })
    }

    // MARK: - Onde et spectre

    @Test func wave_isAFineDenseMirroredEnvelope_spectrumAnEqualizerOnABaseline() throws {
        var wave = MessageCardDisposition.standard
        wave.showsTimer = false
        let waveBars = Self.bars(Self.layout(Self.input(media: [Self.voice(transcript: nil)], disposition: wave)).ops)
        #expect(waveBars.count >= 96, "une onde DENSE : \(waveBars.count) barres")
        #expect(waveBars.allSatisfy { $0.width <= 4 }, "et FINE")
        let middles = Set(waveBars.map { (($0.y + $0.height / 2) * 2).rounded() })
        #expect(middles.count == 1, "en miroir autour d'UNE ligne médiane")

        var spectrum = wave
        spectrum.audioStyle = .spectrum
        let spectrumBars = Self.bars(Self.layout(Self.input(media: [Self.voice(transcript: nil)], disposition: spectrum)).ops)
        let bands = spectrumBars.filter { $0.width > 12 && $0.height > 6 && $0.width < 100 }
        #expect(bands.count == MessageCardAudioMetrics.spectrumBands, "\(bands.count) bandes")
        let floors = Set(bands.map { ($0.y + $0.height).rounded() })
        #expect(floors.count == 1, "les barres se POSENT sur une ligne de base")
        let crests = spectrumBars.filter { $0.height <= 6 && $0.width > 12 && $0.width < 100 }
        #expect(crests.count == MessageCardAudioMetrics.spectrumBands, "un repère de crête par bande")
        #expect(crests.allSatisfy { crest in bands.contains { abs($0.x - crest.x) < 0.5 && crest.y < $0.y } })
        let waveWidth = waveBars.map(\.width).max() ?? 0
        #expect(bands.allSatisfy { $0.width > waveWidth * 4 }, "des barres larges contre une onde fine")
    }

    @Test func spectrum_dancesWithTheSound_theWaveDoesNot() throws {
        let samples = (0..<240).map { 0.5 + 0.45 * sin(Double($0) * 0.37) * cos(Double($0) * 0.11) }
        let voice = Self.voice(duration: 20, samples: samples, transcript: nil)
        let clip = MessageCardClip(start: 0, duration: 20)
        var spectrum = MessageCardDisposition.standard
        spectrum.audioStyle = .spectrum
        let heights = { (disposition: MessageCardDisposition, time: Double) -> [Double] in
            Self.bars(Self.layout(Self.input(media: [voice], disposition: disposition, clip: clip, time: time)).ops)
                .filter { $0.width > 12 && $0.width < 100 && $0.height > 6 }.map(\.height)
        }
        #expect(heights(spectrum, 3) != heights(spectrum, 6), "les bandes bougent avec le son")
        let waveAt = { (time: Double) -> [Double] in
            Self.bars(Self.layout(Self.input(media: [voice], clip: clip, time: time)).ops).map(\.height)
        }
        #expect(waveAt(3) == waveAt(6), "l'onde garde sa forme ; seule la partie jouée change de couleur")
    }

    // MARK: - Format

    @Test func format_carriesTheSoundChoicesAndTheScales_andAnOlderFormatReadsTheDefaults() throws {
        var format = MessageCardFormat.initial
        format.disposition.showsTranscript = false
        format.disposition.showsTimer = false
        format.disposition.transcriptTypeface = .machine
        format.disposition.clipLength = .fifteenSeconds
        format.disposition.scales[.reply] = 1.5
        format.disposition.scales[.media] = 0.6
        #expect(MessageCardFormat.parse(format.serialized) == format)

        let older = #"{"template":"neige.systeme.bulles","showConversationTitle":false,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":true,"audioStyle":"spectrum"}"#
        let read = try #require(MessageCardFormat.parse(older)?.disposition)
        #expect(read.showsTranscript && read.showsTimer)
        #expect(read.transcriptTypeface == nil && read.clipLength == .oneMinute && read.scales == .identity)
        #expect(read.audioStyle == .spectrum)

        let damaged = #"{"template":"neige.systeme.bulles","showConversationTitle":false,"showAuthors":true,"showDate":false,"anonymizeQuoted":false,"anonymizeReply":true,"scales":{"pied":3,"reply":9},"clipLength":42,"transcriptTypeface":"disparue"}"#
        let repaired = try #require(MessageCardFormat.parse(damaged)?.disposition)
        #expect(repaired.scales[.reply] == 2)
        #expect(repaired.scales == MessageCardScales([.reply: 2]))
        #expect(repaired.clipLength == .oneMinute && repaired.transcriptTypeface == nil)
    }

    // MARK: - Échelles

    @Test func scales_clampToHalfAndDouble_snapToOne_andIgnoreWhatHasNoSize() {
        var scales = MessageCardScales.identity
        scales[.reply] = 3
        #expect(scales[.reply] == 2)
        scales[.reply] = 0.1
        #expect(scales[.reply] == 0.5)
        scales[.reply] = 1.03
        #expect(scales[.reply] == 1 && scales.isIdentity, "tout près de 100 %, l'échelle s'y aimante")
        scales[.link] = 1.5
        scales[.background] = 1.5
        #expect(scales.isIdentity)
    }

    @Test func scale_aPinchedReplyGrowsWithItsName_theOtherPartsKeepTheirSize() throws {
        let base = Self.layout(Self.input(reply: "Oui", media: []))
        var pinched = MessageCardDisposition.standard
        pinched.scales[.reply] = 1.4
        let grown = Self.layout(Self.input(reply: "Oui", media: [], disposition: pinched))
        let text = { (card: MessageCardLayout, value: String) in Self.texts(card.ops).first { $0.text == value }?.font.size ?? 0 }
        #expect(abs(text(grown, "Oui") / text(base, "Oui") - 1.4) < 0.05)
        #expect(text(grown, "Jacques") > text(base, "Jacques"), "la ligne du nom suit son message")
        let reply = try #require(Self.region(grown, .reply))
        #expect(reply.height > (Self.region(base, .reply)?.height ?? 0))
    }

    @Test func scale_aPinchedMediaOverflowsTheColumn_aShrunkOneCenters() throws {
        let photo = MessageCardMedia(id: "p", kind: .image, aspect: 2)
        var bigger = MessageCardDisposition.standard
        bigger.scales[.media] = 1.15
        let grown = try #require(Self.media(Self.layout(Self.input(media: [photo], disposition: bigger)).ops).first)
        #expect(grown.width > 1080 - 2 * 96 && grown.x < 96)
        #expect(grown.x >= MessageCardMediaPlan.bleed && grown.x + grown.width <= 1080 - MessageCardMediaPlan.bleed)
        var smaller = MessageCardDisposition.standard
        smaller.scales[.media] = 0.5
        let shrunk = try #require(Self.media(Self.layout(Self.input(media: [photo], disposition: smaller)).ops).first)
        #expect(shrunk.width == 444)
        #expect(abs((shrunk.x + shrunk.width / 2) - 540) < 1, "réduit, il se centre")
        let zone = try #require(Self.region(Self.layout(Self.input(media: [photo], disposition: smaller)), .media))
        #expect(zone.x == shrunk.x && zone.width == shrunk.width, "sa zone le suit")
    }

    @Test func scale_theHeaderAndTheTranscriptScale() throws {
        var pinched = MessageCardDisposition.standard
        pinched.scales[.header] = 1.5
        pinched.scales[.transcript] = 0.75
        let input = MessageCardInput(quoted: nil, reply: MessageCardPart(author: "J", text: "R"), template: MessageCardTemplates.defaultID,
                                     handle: nil, title: "Soirée", media: [Self.voice()], disposition: pinched)
        let card = Self.layout(input)
        #expect(Self.texts(card.ops).first { $0.text == "Soirée" }?.font.size == 51)
        let base = Self.transcriptLines(Self.layout(Self.input(media: [Self.voice()]))).first?.font.size ?? 0
        let small = Self.transcriptLines(card).first?.font.size ?? 0
        #expect(abs(small / base - 0.75) < 0.05)
    }

    // MARK: - Zones

    @Test func regions_theTranscriptHasItsOwnZone_underTheSound() {
        let card = Self.layout(Self.input(media: [Self.voice()]))
        #expect(card.regions.map(\.part) == [.media, .transcript, .reply])
        for (zone, next) in zip(card.regions, card.regions.dropFirst()) {
            #expect(zone.y + zone.height <= next.y)
        }
    }
}
