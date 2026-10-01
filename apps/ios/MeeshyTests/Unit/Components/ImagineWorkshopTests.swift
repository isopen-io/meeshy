import XCTest
import MeeshySDK
@testable import Meeshy

/// **L'atelier « Imagine » (#8692)** — l'ordre de ses onglets (« Frame » avant
/// « Fond »), ce que ses panneaux offrent (un réglage n'existe que s'il change
/// la carte), et ses mots, dans les sept langues du catalogue.
@MainActor
final class ImagineWorkshopTests: XCTestCase {

    // MARK: - Onglets

    func test_tabs_formatThenFrame_comeBeforeTheBackground() {
        let tabs = MessageCardExportTab.offered(hasMedia: true, languageCount: 2)
        XCTAssertEqual(tabs, [.styles, .format, .frame, .palette, .typeface, .link, .media, .details, .language])
        guard let frame = tabs.firstIndex(of: .frame), let palette = tabs.firstIndex(of: .palette) else {
            return XCTFail("« Frame » et « Fond » attendus")
        }
        XCTAssertLessThan(frame, palette)
    }

    func test_tabs_mediaAndLanguageOnlyWhenTheContentHasThem() {
        let tabs = MessageCardExportTab.offered(hasMedia: false, languageCount: 1)
        XCTAssertFalse(tabs.contains(.media))
        XCTAssertFalse(tabs.contains(.language))
    }

    func test_touchingAPart_opensTheTabThatSetsIt() {
        XCTAssertEqual(MessageCardExportTab.of(.header), .frame)
        XCTAssertEqual(MessageCardExportTab.of(.media), .media)
        XCTAssertEqual(MessageCardExportTab.of(.transcript), .media, "la transcription se règle dans « Médias »")
        XCTAssertEqual(MessageCardExportTab.of(.background), .palette)
        XCTAssertEqual(MessageCardExportTab.of(.link), .link)
    }

    // MARK: - Ce que les panneaux offrent

    func test_frame_theHeaderOrientationExistsOnlyWithAHeader() {
        XCTAssertTrue(MessageCardTrayOffer.headerOrientations(.initial, hasTitle: true).isEmpty)
        var dated = MessageCardFormat.initial
        dated.showDate = true
        XCTAssertEqual(MessageCardTrayOffer.headerOrientations(dated, hasTitle: false), MessageCardHeaderOrientation.allCases)
        var titled = MessageCardFormat.initial
        titled.showConversationTitle = true
        XCTAssertTrue(MessageCardTrayOffer.headerOrientations(titled, hasTitle: false).isEmpty, "un titre absent n'est pas un en-tête")
        XCTAssertFalse(MessageCardTrayOffer.headerOrientations(titled, hasTitle: true).isEmpty)
    }

    func test_frame_theNamesPlacementExistsOnlyWithANameLine() {
        var bare = MessageCardFormat.initial
        bare.showAuthors = false
        XCTAssertTrue(MessageCardTrayOffer.placements(bare).isEmpty)
        bare.showTimes = true
        XCTAssertEqual(MessageCardTrayOffer.placements(bare), [.above, .after])
    }

    func test_media_layoutsFollowThePictures_stylesFollowTheSound() {
        XCTAssertTrue(MessageCardTrayOffer.mediaLayouts([.audio]).isEmpty)
        XCTAssertEqual(MessageCardTrayOffer.mediaLayouts([.image]), [.above, .below, .backdrop])
        XCTAssertEqual(MessageCardTrayOffer.mediaLayouts([.image, .video]), [.above, .below, .mosaic, .backdrop])
        XCTAssertEqual(MessageCardTrayOffer.audioStyles([.audio]), MessageCardAudioStyle.allCases)
        XCTAssertTrue(MessageCardTrayOffer.audioStyles([.image]).isEmpty)
    }

    // MARK: - Un vocal (#8979)

    private static let transcript = MessageCardTranscript(text: "Bonjour à tous. On se voit demain.")
    private static func voice(_ duration: Double?, transcript: MessageCardTranscript? = ImagineWorkshopTests.transcript, samples: [Double] = []) -> MessageCardMedia {
        MessageCardMedia(id: "a1", kind: .audio, duration: duration, samples: samples, transcript: transcript)
    }

    func test_media_theTranscriptAndTheTimerAreOfferedOnlyForASound_theFontOnlyForAShownTranscript() {
        let spoken = [Self.voice(30)]
        XCTAssertTrue(MessageCardTrayOffer.offersTranscript(spoken))
        XCTAssertTrue(MessageCardTrayOffer.offersTimer(spoken))
        XCTAssertEqual(MessageCardTrayOffer.transcriptTypefaces(.initial, media: spoken), MessageCardTypefaceID.allCases,
                       "la police de la transcription reprend le catalogue de l'onglet « Police »")
        var hidden = MessageCardFormat.initial
        hidden.disposition.showsTranscript = false
        XCTAssertTrue(MessageCardTrayOffer.transcriptTypefaces(hidden, media: spoken).isEmpty)

        let silent = [Self.voice(30, transcript: nil)]
        XCTAssertFalse(MessageCardTrayOffer.offersTranscript(silent), "un son sans transcription n'a rien à montrer")
        XCTAssertTrue(MessageCardTrayOffer.transcriptTypefaces(.initial, media: silent).isEmpty)
        XCTAssertFalse(MessageCardTrayOffer.offersTimer([MessageCardMedia(id: "p", kind: .image)]))
    }

    func test_media_theVideoLengthIsOfferedOnlyForAVideoDrawnFromALongSound() {
        XCTAssertTrue(MessageCardTrayOffer.clipLengths(output: .image, media: [Self.voice(90)]).isEmpty, "une image n'a pas de durée")
        XCTAssertEqual(MessageCardTrayOffer.clipLengths(output: .video, media: [Self.voice(90)]), [.fifteenSeconds, .thirtySeconds, .oneMinute])
        XCTAssertEqual(MessageCardTrayOffer.clipLengths(output: .video, media: [Self.voice(20)]), [.fifteenSeconds, .thirtySeconds])
        XCTAssertTrue(MessageCardTrayOffer.clipLengths(output: .video, media: [Self.voice(9)]).isEmpty, "un son court part en entier")
        let clip = MessageCardMedia(id: "v", kind: .video, duration: 40)
        XCTAssertTrue(MessageCardTrayOffer.clipLengths(output: .video, media: [clip, Self.voice(90)]).isEmpty, "une vidéo jointe fixe sa durée")
    }

    func test_media_thePassageIsChosenOnlyWhenTheMediaOutlastsTheExcerpt() throws {
        let long = [Self.voice(90)]
        let plan = MessageCardMotionPlan.of(.video, media: long, length: .thirtySeconds, start: 70)
        let excerpt = try XCTUnwrap(MessageCardTrayOffer.excerpt(plan: plan, media: long))
        XCTAssertEqual(excerpt.total, 90)
        XCTAssertEqual(excerpt.window, MessageCardClip(start: 60, duration: 30))
        XCTAssertEqual(excerpt.levels(12).count, 12)

        let short = [Self.voice(20)]
        XCTAssertNil(MessageCardTrayOffer.excerpt(plan: MessageCardMotionPlan.of(.video, media: short), media: short), "un son plus court que la vidéo part en entier")
        XCTAssertNil(MessageCardTrayOffer.excerpt(plan: nil, media: long), "une image fixe n'a pas de passage")

        let clip = [MessageCardMedia(id: "v", kind: .video, duration: 40)]
        let gif = try XCTUnwrap(MessageCardTrayOffer.excerpt(plan: MessageCardMotionPlan.of(.gif, media: clip, start: 10), media: clip))
        XCTAssertEqual(gif.window, MessageCardClip(start: 10, duration: 6))
        XCTAssertEqual(Set(gif.levels(8)).count, 1, "une vidéo montre une règle, pas une onde inventée")
    }

    // MARK: - Chaque piste garde son onde (#8979)

    private static func sound(_ id: String, url: String, duration: Double? = nil) -> MessageCardSubjectMedia {
        MessageCardSubjectMedia(media: MessageCardMedia(id: id, kind: .audio, duration: duration), fileURL: url)
    }

    func test_loadedMedia_eachSoundKeepsTheWaveAndTheDurationOfItsOwnTrack() {
        let loaded = MessageCardLoadedMedia(pictures: .none, sounds: [
            "https://x/fr.m4a": MessageCardLoadedSound(samples: [0.2, 0.4], duration: 12, file: nil),
            "https://x/en.m4a": MessageCardLoadedSound(samples: [1, 0.5, 0.25], duration: 9, file: URL(fileURLWithPath: "/tmp/en.m4a")),
        ])
        let english = [Self.sound("a1", url: "https://x/en.m4a")]
        XCTAssertEqual(loaded.media(of: english).first?.samples, [1, 0.5, 0.25])
        XCTAssertEqual(loaded.media(of: english).first?.duration, 9, "la durée lue dans le fichier, quand le message ne la disait pas")
        XCTAssertEqual(loaded.soundFile(of: english), URL(fileURLWithPath: "/tmp/en.m4a"))
        XCTAssertEqual(loaded.media(of: [Self.sound("a1", url: "https://x/fr.m4a", duration: 14)]).first?.duration, 14, "la durée du message prime")
        let spanish = [Self.sound("a1", url: "https://x/es.m4a")]
        XCTAssertEqual(loaded.missing(spanish).map(\.fileURL), ["https://x/es.m4a"], "une autre piste se charge à son tour")
        XCTAssertTrue(loaded.missing(english).isEmpty)
    }

    func test_output_aVideoOffersGifAndVideo_aSoundOnlyVideo() {
        XCTAssertEqual(MessageCardOutput.offered(for: [.video]), [.image, .gif, .video])
        XCTAssertEqual(MessageCardOutput.offered(for: [.audio]), [.image, .video])
        XCTAssertEqual(MessageCardOutput.offered(for: [.image]), [.image])
    }

    // MARK: - Les mots, dans les sept langues

    private static let languages = ["fr", "en", "es", "pt-BR", "de", "it", "ar"]

    private static func catalog() throws -> [String: [String: Any]] {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Components
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // ios
            .appendingPathComponent("Meeshy/Localizable.xcstrings")
        let root = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        return try XCTUnwrap(root?["strings"] as? [String: [String: Any]])
    }

    private static func value(_ entry: [String: Any]?, _ language: String) -> String? {
        let localizations = entry?["localizations"] as? [String: Any]
        let unit = (localizations?[language] as? [String: Any])?["stringUnit"] as? [String: Any]
        return unit?["value"] as? String
    }

    // MARK: - Un média qui ne se charge pas le DIT (#8901)

    private static func item(_ id: String, _ kind: MessageCardMediaKind) -> MessageCardSubjectMedia {
        MessageCardSubjectMedia(media: MessageCardMedia(id: id, kind: kind), fileURL: "https://x/\(id)")
    }

    func test_media_aVisualWithoutPixelsIsNamedFailed_aSoundNever() {
        let items = [Self.item("photo", .image), Self.item("clip", .video), Self.item("voice", .audio), Self.item("ok", .image)]
        XCTAssertEqual(MessageCardLoadedMedia.failures(of: items, painted: ["ok"]), ["photo", "clip"])
        XCTAssertEqual(MessageCardLoadedMedia.failures(of: items, painted: ["photo", "clip", "ok"]), [])
    }

    func test_media_theFailureSaysHowManyPiecesAreMissing() {
        XCTAssertNil(MessageCardExportText.mediaFailure(count: 0))
        let one = MessageCardExportText.mediaFailure(count: 1)
        let three = MessageCardExportText.mediaFailure(count: 3)
        XCTAssertFalse((one ?? "").isEmpty)
        XCTAssertTrue(three?.contains("3") == true, three ?? "nil")
        XCTAssertNotEqual(one, three)
    }

    func test_catalog_theActionIsImager_theWorkshopIsImagine() throws {
        let strings = try Self.catalog()
        XCTAssertEqual(Self.value(strings["message.menu.export"], "fr"), "Imager")
        XCTAssertEqual(Self.value(strings["export.card.title"], "fr"), "Imagine")
        XCTAssertEqual(Self.value(strings["export.card.tab.frame"], "fr"), "Frame")
    }

    func test_catalog_everyImagineWordSpeaksTheSevenLanguages() throws {
        let strings = try Self.catalog()
        var keys = ["message.menu.export", "export.card.title", "message.action.create",
                    "export.card.tab.format", "export.card.tab.frame", "export.card.tab.media", "export.card.part.media",
                    "export.card.option.times", "export.card.option.handles", "export.card.output.label",
                    "export.card.motion.running", "export.announce.galleryMotion", "export.announce.sharedMotion",
                    "export.announce.motionFailed", "export.card.names.above", "export.card.names.after",
                    "export.card.media.failed.one", "export.card.media.failed.other", "export.card.media.retry",
                    "export.card.media.transcript", "export.card.media.timer", "export.card.media.transcriptFont",
                    "export.card.clip.label", "export.card.excerpt.label", "export.card.excerpt.hint",
                    "export.card.part.transcript", "export.card.hint.pinch", "export.card.scale.hint"]
        keys += MessageCardClipLength.allCases.map { "export.card.clip.\($0.rawValue)" }
        keys += MessageCardAspect.allCases.map { "export.card.aspect.\($0.rawValue)" }
        keys += MessageCardHeaderOrientation.allCases.map { "export.card.header.\($0.rawValue)" }
        keys += MessageCardTilt.allCases.map { "export.card.tilt.\($0.rawValue)" }
        keys += MessageCardMediaLayout.allCases.map { "export.card.media.\($0.rawValue)" }
        keys += MessageCardAudioStyle.allCases.map { "export.card.audio.\($0.rawValue)" }
        keys += MessageCardOutput.allCases.map { "export.card.output.\($0.rawValue)" }
        for key in keys {
            for language in Self.languages {
                let value = Self.value(strings[key], language)
                XCTAssertFalse((value ?? "").trimmingCharacters(in: .whitespaces).isEmpty, "\(key) [\(language)]")
            }
        }
    }
}
