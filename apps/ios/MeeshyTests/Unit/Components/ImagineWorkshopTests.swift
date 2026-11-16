import XCTest
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
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
        XCTAssertEqual(MessageCardTrayOffer.mediaLayouts([.image]), [.above, .below, .left, .right, .backdrop])
        XCTAssertEqual(MessageCardTrayOffer.audioStyles([.audio]), MessageCardAudioStyle.allCases)
        XCTAssertTrue(MessageCardTrayOffer.audioStyles([.image]).isEmpty)
    }

    // MARK: - Plusieurs visuels (#9235)

    private static let photos = [
        MessageCardMedia(id: "p1", kind: .image), MessageCardMedia(id: "v1", kind: .video), MessageCardMedia(id: "p2", kind: .image),
    ]

    func test_media_arrangementsExistFromTwoVisuals_andNeverOnABackdrop() {
        XCTAssertTrue(MessageCardTrayOffer.arrangements(.initial, kinds: [.image, .audio]).isEmpty, "une seule image n'a rien à agencer")
        XCTAssertEqual(MessageCardTrayOffer.arrangements(.initial, kinds: [.image, .video]), [.single, .mosaic, .wave, .hero, .sine])
        var backdrop = MessageCardFormat.initial
        backdrop.disposition.mediaLayout = .backdrop
        XCTAssertTrue(MessageCardTrayOffer.arrangements(backdrop, kinds: [.image, .video]).isEmpty)
    }

    func test_media_theShownVisualIsChosenForOneOrABackdrop_notForAGrid() {
        XCTAssertEqual(MessageCardTrayOffer.featuredChoices(.initial, media: Self.photos).map(\.id), ["p1", "v1", "p2"])
        var wave = MessageCardFormat.initial
        wave.disposition.mediaArrangement = .wave
        XCTAssertTrue(MessageCardTrayOffer.featuredChoices(wave, media: Self.photos).isEmpty)
        wave.disposition.mediaLayout = .backdrop
        XCTAssertEqual(MessageCardTrayOffer.featuredChoices(wave, media: Self.photos).count, 3, "le fond n'en montre qu'un : on le choisit")
        XCTAssertTrue(MessageCardTrayOffer.featuredChoices(.initial, media: [Self.photos[0]]).isEmpty)
    }

    func test_media_theMediaAuthorIsOfferedOffTheBackdrop_whenSomeoneIsKnown() {
        XCTAssertTrue(MessageCardTrayOffer.offersMediaAuthor(.initial, hasMediaAuthors: true))
        XCTAssertFalse(MessageCardTrayOffer.offersMediaAuthor(.initial, hasMediaAuthors: false))
        var backdrop = MessageCardFormat.initial
        backdrop.disposition.mediaLayout = .backdrop
        XCTAssertFalse(MessageCardTrayOffer.offersMediaAuthor(backdrop, hasMediaAuthors: true))
    }

    func test_media_postArrangementsSpeakTheComposersWords() {
        XCTAssertEqual(MessageCardExportText.arrangementLabel(.wave), ComposerMosaicChoice.label(.wave))
        XCTAssertEqual(MessageCardExportSymbols.arrangement(.hero), ComposerMosaicChoice.symbol(.hero))
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
        XCTAssertTrue(MessageCardTrayOffer.clipLengths(output: .image, media: [Self.voice(55)]).isEmpty, "une image n'a pas de durée")
        XCTAssertEqual(MessageCardTrayOffer.clipLengths(output: .video, media: [Self.voice(55)]), [.fifteenSeconds, .thirtySeconds, .oneMinute])
        XCTAssertEqual(MessageCardTrayOffer.clipLengths(output: .video, media: [Self.voice(20)]), [.fifteenSeconds, .thirtySeconds])
        XCTAssertTrue(MessageCardTrayOffer.clipLengths(output: .video, media: [Self.voice(9)]).isEmpty, "un son court part en entier")
        let clip = MessageCardMedia(id: "v", kind: .video, duration: 40)
        XCTAssertTrue(MessageCardTrayOffer.clipLengths(output: .video, media: [clip, Self.voice(90)]).isEmpty, "une vidéo jointe fixe sa durée")
    }

    /// Au-delà d'une minute, « Imager » un message ou un commentaire coupe son
    /// son ou sa vidéo en QUARTS depuis le début, comme la vue Imager d'une
    /// œuvre (#14332, #13871) : 1/4 · 2/4 · 3/4 · 4/4, durée de chacun. Les
    /// quarts REMPLACENT l'extrait 15 / 30 / 60 s ; sous la minute, il reste.
    func test_media_aSoundOrAVideoOverAMinute_offersTheQuarters_inPlaceOfTheExcerpt() {
        let long = [Self.voice(240)]
        let quarters = MessageCardTrayOffer.clipQuarters(output: .video, media: long)
        XCTAssertEqual(quarters.map(\.quarter), ImagerQuarter.allCases)
        XCTAssertEqual(quarters.map(\.duration), [60, 120, 180, 240])
        XCTAssertTrue(MessageCardTrayOffer.clipLengths(output: .video, media: long).isEmpty, "les quarts remplacent 15 / 30 / 60 s")

        let film = [MessageCardMedia(id: "v", kind: .video, duration: 90)]
        XCTAssertEqual(MessageCardTrayOffer.clipQuarters(output: .video, media: film).map(\.duration), [22.5, 45, 67.5, 90])
        XCTAssertTrue(MessageCardTrayOffer.clipQuarters(output: .gif, media: film).isEmpty, "un GIF reste une boucle courte")
        XCTAssertTrue(MessageCardTrayOffer.clipQuarters(output: .image, media: long).isEmpty, "une image n'a pas de durée")

        let minute = [Self.voice(60)]
        XCTAssertTrue(MessageCardTrayOffer.clipQuarters(output: .video, media: minute).isEmpty, "sous la minute, le réglage actuel reste")
        XCTAssertEqual(MessageCardTrayOffer.clipLengths(output: .video, media: minute), [.fifteenSeconds, .thirtySeconds, .oneMinute])
    }

    func test_motionPlan_fourMinutesInTwoQuarters_rendersTwoMinutesFromTheStart() throws {
        let long = [Self.voice(240)]
        let half = try XCTUnwrap(MessageCardMotionPlan.of(.video, media: long, length: .fifteenSeconds, quarter: .two, start: 50))
        XCTAssertEqual(half.duration, 120)
        XCTAssertEqual(half.start, 0, "un quart se compte depuis le début")
        XCTAssertNil(MessageCardTrayOffer.excerpt(plan: half, media: long), "aucun passage à glisser : la part part du début")

        let whole = try XCTUnwrap(MessageCardMotionPlan.of(.video, media: long, quarter: .four))
        XCTAssertEqual(whole.duration, 240)

        let film = [MessageCardMedia(id: "v", kind: .video, duration: 240)]
        let quarter = try XCTUnwrap(MessageCardMotionPlan.of(.video, media: film, quarter: .one, start: 30))
        XCTAssertEqual(quarter.duration, 60)
        XCTAssertEqual(quarter.start, 0)
        XCTAssertEqual(quarter.fps, 15, "une vidéo garde sa cadence")

        let short = try XCTUnwrap(MessageCardMotionPlan.of(.video, media: [Self.voice(45)], length: .thirtySeconds, quarter: .two))
        XCTAssertEqual(short.duration, 30, "sous la minute, le quart ne change rien")
    }

    func test_media_thePassageIsChosenOnlyWhenTheMediaOutlastsTheExcerpt() throws {
        let long = [Self.voice(55)]
        let plan = MessageCardMotionPlan.of(.video, media: long, length: .thirtySeconds, start: 40)
        let excerpt = try XCTUnwrap(MessageCardTrayOffer.excerpt(plan: plan, media: long))
        XCTAssertEqual(excerpt.total, 55)
        XCTAssertEqual(excerpt.window, MessageCardClip(start: 25, duration: 30))
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

    /// « Réessayer » relit un son dont le fichier n'est pas arrivé (revue #8979).
    func test_loadedMedia_aSoundThatFailedIsLoadedAgain() {
        let failed = MessageCardLoadedMedia(pictures: .none, sounds: [
            "https://x/fr.m4a": MessageCardLoadedSound(samples: [], duration: nil, file: nil),
        ])
        XCTAssertEqual(failed.missing([Self.sound("a1", url: "https://x/fr.m4a")]).map(\.fileURL), ["https://x/fr.m4a"])
    }

    /// En VIDÉO, un son qui n'a pas pu se lire est un ÉCHEC — l'atelier le dit
    /// et offre de réessayer ; une image n'en a pas besoin. Un son encore en
    /// chemin retient la vidéo, sans avis (revue #8979).
    func test_loadedMedia_aSilentSoundFailsTheVideo_neverTheImage() {
        let items = [Self.sound("a1", url: "https://x/fr.m4a")]
        let failed = MessageCardLoadedMedia(pictures: .none, sounds: ["https://x/fr.m4a": MessageCardLoadedSound(samples: [], duration: nil, file: nil)])
        XCTAssertEqual(failed.failures(of: items, output: .video), ["a1"])
        XCTAssertEqual(failed.failures(of: items, output: .image), [])
        XCTAssertFalse(failed.hearsThePaintedSound(of: items), "jamais une « Animation enregistrée » muette")
        let loading = MessageCardLoadedMedia.empty
        XCTAssertEqual(loading.failures(of: items, output: .video), [], "un son en chemin n'est pas un échec")
        XCTAssertFalse(loading.hearsThePaintedSound(of: items))
        let heard = MessageCardLoadedMedia(pictures: .none, sounds: ["https://x/fr.m4a": MessageCardLoadedSound(samples: [], duration: 9, file: URL(fileURLWithPath: "/tmp/fr.m4a"))])
        XCTAssertTrue(heard.hearsThePaintedSound(of: items))
        XCTAssertTrue(MessageCardLoadedMedia.empty.hearsThePaintedSound(of: [MessageCardSubjectMedia(media: MessageCardMedia(id: "p", kind: .image), fileURL: "https://x/p")]))
    }

    /// La vidéo fait entendre le son PEINT — le premier —, jamais un autre qui serait arrivé, lui (revue #8979).
    func test_loadedMedia_theVideoHearsThePaintedSound_orNothing() {
        let loaded = MessageCardLoadedMedia(pictures: .none, sounds: [
            "https://x/a.m4a": MessageCardLoadedSound(samples: [], duration: nil, file: nil),
            "https://x/b.m4a": MessageCardLoadedSound(samples: [], duration: 9, file: URL(fileURLWithPath: "/tmp/b.m4a")),
        ])
        let items = [Self.sound("a", url: "https://x/a.m4a"), Self.sound("b", url: "https://x/b.m4a")]
        XCTAssertNil(loaded.soundFile(of: items), "la transcription du premier son au-dessus de la voix du second : jamais")
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

    /// UN titre et UN bouton, ceux des menus, pour l'atelier d'une carte et la
    /// vue Imager d'une œuvre, sur iOS comme sur Android (#14348, #14346) : la
    /// vue porte le mot du menu, « Imager », et enregistre par le verbe des
    /// menus d'export, « Enregistrer » — dans chacune des sept langues.
    func test_catalog_theWorkshopIsTitledByTheMenuWord_andSavesWithTheExportVerb() throws {
        let strings = try Self.catalog()
        XCTAssertEqual(Self.value(strings["export.card.title"], "fr"), "Imager")
        XCTAssertEqual(Self.value(strings["export.card.save"], "fr"), "Enregistrer")
        XCTAssertEqual(Self.value(strings["export.card.tab.frame"], "fr"), "Frame")
        for language in Self.languages {
            XCTAssertEqual(Self.value(strings["export.card.title"], language),
                           Self.value(strings["message.menu.export"], language), "titre [\(language)]")
            XCTAssertEqual(Self.value(strings["export.card.save"], language),
                           Self.value(strings["feed.post.save"], language), "bouton [\(language)]")
        }
    }

    func test_theWorkshopAndTheImagerView_neverFallBackToTheOldWords() throws {
        for file in ["Meeshy/Features/Export/MessageCardExportSheet.swift",
                     "Meeshy/Features/Export/MessageCardExportSheet+Output.swift"] {
            let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(file))
            XCTAssertFalse(source.contains("\"Imagine\")"), "\(file) : le titre est « Imager »")
            XCTAssertFalse(source.contains("\"Sauvegarder\")"), "\(file) : le bouton est « Enregistrer »")
        }
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
                    "export.card.part.transcript", "export.card.hint.pinch", "export.card.scale.hint",
                    "export.card.truncated.media",
                    // #9686 — les compositions d'un commentaire de post.
                    "export.compose.postAndComment", "export.compose.commentAlone", "export.compose.threadToHere",
                    "export.compose.postRootAndReply", "export.compose.chosenReplies", "export.compose.post",
                    "export.compose.thread", "export.compose.folded",
                    // #11783 — le média de tête choisi, l'audience qui retient le support.
                    "export.compose.withheld", "export.compose.head", "export.compose.head.image",
                    "export.compose.head.video", "export.compose.head.audio"]
        keys += MessageCardClipLength.allCases.map { "export.card.clip.\($0.rawValue)" }
        keys += MessageCardAspect.allCases.map { "export.card.aspect.\($0.rawValue)" }
        keys += MessageCardHeaderOrientation.allCases.map { "export.card.header.\($0.rawValue)" }
        keys += MessageCardTilt.allCases.map { "export.card.tilt.\($0.rawValue)" }
        keys += MessageCardMediaLayout.allCases.map { "export.card.media.\($0.rawValue)" }
        keys += ["export.card.media.mosaic", "export.card.media.single", "export.card.media.featured", "export.card.media.author"]
        keys += ["composer.mosaic.wave", "composer.mosaic.hero", "composer.mosaic.sine"]
        keys += MessageCardAudioStyle.allCases.map { "export.card.audio.\($0.rawValue)" }
        keys += MessageCardOutput.allCases.map { "export.card.output.\($0.rawValue)" }
        for key in keys {
            for language in Self.languages {
                let value = Self.value(strings[key], language)
                XCTAssertFalse((value ?? "").trimmingCharacters(in: .whitespaces).isEmpty, "\(key) [\(language)]")
            }
        }
    }

    // MARK: - « Post en tête » se VOIT sans défiler (#11477, recette 2026-10-21)

    /// Pour une réponse, les trois modes remplissaient la rangée et la bascule
    /// « Post en tête » finissait coupée au bord (« ✓ Pos… ») : le choix
    /// d'afficher le post existait sans se voir. Elle se pose hors du défilement
    /// des modes, à leur suite ; les modes, eux, défilent.
    func test_compositionBar_aReplyPinsThePostToggle_besideTheScrollingModes() {
        let modes: [PostCommentCardMode] = [.threadToHere, .postRootAndReply, .chosenReplies]
        let layout = MessageCardCompositionBar.layout(modes: modes, offersPostToggle: true)
        XCTAssertEqual(layout.scrollingModes, modes)
        XCTAssertTrue(layout.pinsPostToggle)
    }

    func test_compositionBar_aFirstLevelComment_showsItsTwoModes_withoutAPinnedToggle() {
        let layout = MessageCardCompositionBar.layout(modes: [.postAndComment, .commentAlone], offersPostToggle: false)
        XCTAssertEqual(layout.scrollingModes, [.postAndComment, .commentAlone])
        XCTAssertFalse(layout.pinsPostToggle)
    }

    func test_compositionBar_aSingleMode_offersNoModeChip_onlyTheToggle() {
        let layout = MessageCardCompositionBar.layout(modes: [.threadToHere], offersPostToggle: true)
        XCTAssertEqual(layout.scrollingModes, [])
        XCTAssertTrue(layout.pinsPostToggle)
    }

    // MARK: - Les puces de composition se LISENT (#9686, recette 2026-10-08)

    /// La puce sélectionnée peignait un texte clair sur un verre teinté pâle — le
    /// libellé disparaissait. Encre et fond se mesurent en clair ET en sombre,
    /// le fond composé sur celui de la feuille (AA texte normal : 4,5:1).
    func test_compositionChip_labelReachesAA_selectedOrNot_lightAndDark() {
        for style in [UIUserInterfaceStyle.light, .dark] {
            let traits = UITraitCollection(userInterfaceStyle: style)
            let sheet = Color(uiColor: UIColor.systemBackground.resolvedColor(with: traits))
            for selected in [true, false] {
                let ink = Color(uiColor: MessageCardCompositionBar.ink(selected: selected).resolvedColor(with: traits))
                let fill = Color(uiColor: MessageCardCompositionBar.fill(selected: selected).resolvedColor(with: traits))
                let ratio = WCAGContrast.ratio(ink, WCAGContrast.composite(fill, over: sheet))
                XCTAssertGreaterThanOrEqual(ratio, WCAGContrast.aaThreshold,
                                            "\(style == .dark ? "sombre" : "clair") \(selected ? "sélectionnée" : "libre") : \(WCAGContrast.fmt(ratio))")
            }
        }
    }

    // MARK: - Recadrer une photo qui déborde de son cadre (#18805)

    private static func framed(_ id: String, backdrop: Bool = false) -> MessageCardFramedMedia {
        MessageCardFramedMedia(mediaID: id, kind: .image, frame: MessageCardFrame(x: 0, y: 0, width: 400, height: 400),
                               radius: backdrop ? 0 : 28, isBackdrop: backdrop)
    }

    func test_crop_isOfferedAsSoonAsTheCardHasAFramablePicture_withoutTouchingIt() {
        let framed = [Self.framed("fond", backdrop: true), Self.framed("photo")]
        XCTAssertTrue(MessageCardCropRule.offers(framed: framed, pictured: ["fond", "photo"]))
        XCTAssertTrue(MessageCardCropRule.offers(framed: [Self.framed("fond", backdrop: true)], pictured: ["fond"]),
                      "le fond choisi d'un son se recadre sans qu'on ait à le toucher")
        XCTAssertFalse(MessageCardCropRule.offers(framed: [], pictured: ["photo"]), "une carte sans photo n'offre rien")
    }

    func test_crop_needsThePixelsOfThePhoto() {
        let framed = [Self.framed("photo"), Self.framed("loading")]
        XCTAssertEqual(MessageCardCropRule.usable(framed, pictured: ["photo"]).map(\.mediaID), ["photo"])
        XCTAssertTrue(MessageCardCropRule.usable(framed, pictured: []).isEmpty)
        XCTAssertFalse(MessageCardCropRule.offers(framed: framed, pictured: []))
    }

    // MARK: - Recadrer depuis toutes les entrées d'Imager (#18810)

    private static let pixels: CGImage = {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 48), format: {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            return format
        }())
        return renderer.image { context in
            UIColor.systemTeal.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 64, height: 48))
        }.cgImage!
    }()

    private static func entry(_ id: String, _ kind: MessageCardMediaKind, aspect: Double) -> MessageCardSubjectMedia {
        MessageCardSubjectMedia(media: MessageCardMedia(id: id, kind: kind, aspect: aspect), fileURL: "https://staging.meeshy.me/\(id)")
    }

    /// Les sujets tels que chaque entrée les construit : un message (photo), un commentaire
    /// qui répond (vidéo), un post (sa photo), une story (la scène rendue, en hero 9:16).
    private static func entries() throws -> [(name: String, subject: MessageCardSubject, picture: String)] {
        let when = Date(timeIntervalSince1970: 1_800_000_000)
        let message = MessageCardSubject(quoted: nil, reply: MessageCardPart(author: "Awa", text: "Regarde !"), sentAt: when,
                                         media: [entry("photo", .image, aspect: 1.5)])
        let comment = MessageCardSubject(quoted: MessageCardPart(author: "Moussa", text: "Le match"),
                                         reply: MessageCardPart(author: "Awa", text: "Le but !"), sentAt: when,
                                         media: [entry("clip", .video, aspect: 16.0 / 9.0)])
        let post = try XCTUnwrap(MessageCardSubject.of(
            post: FeedPost(id: "post", author: "Awa", authorId: "awa", authorUsername: "awa", type: "POST",
                           content: "Dakar", timestamp: when,
                           media: [FeedMedia(id: "dakar", type: .image, url: "https://staging.meeshy.me/dakar.jpg", width: 1200, height: 800)]),
            viewer: MessageCardSubject.Viewer(id: "me", displayName: "Moi"), preferredLanguages: ["fr"]))
        let story = MessageCardSubject(quoted: nil, reply: MessageCardPart(author: "Awa", text: ""), sentAt: when,
                                       media: [entry("story:1", .video, aspect: 9.0 / 16.0)], heroID: "story:1")
        return [("message", message, "photo"), ("commentaire", comment, "clip"), ("post", post, "dakar"), ("story", story, "story:1")]
    }

    private static func render(_ subject: MessageCardSubject, format: MessageCardFormat, pictured: [String],
                               backdrop: MessageCardBackdrop? = nil) -> [MessageCardFramedMedia] {
        var input = MessageCardInput.of(subject: subject, format: format, handle: "awa", conversationTitle: nil,
                                        anonymousLabel: "Anonyme", formatDate: { _ in "" })
        input.backdrop = backdrop
        let pictures = MessageCardPictures(Dictionary(uniqueKeysWithValues: pictured.map { ($0, pixels) }))
        return MessageCardRenderer.render(input, pictures: pictures)?.framedMedia ?? []
    }

    func test_crop_everyEntryOffersItsPhotoOrVideo_underEveryModel() throws {
        for (name, subject, picture) in try Self.entries() {
            for model in MessageCardModels.builtIn {
                let framed = Self.render(subject, format: model.applied(to: .initial), pictured: [picture])
                XCTAssertTrue(MessageCardCropRule.offers(framed: framed, pictured: [picture]), "\(name) · maquette \(model.id)")
                XCTAssertEqual(MessageCardCropRule.usable(framed, pictured: [picture]).map(\.mediaID), [picture], "\(name) · \(model.id)")
            }
        }
    }

    func test_crop_aSoundCardHasNoPictureOfItsOwn_itsChosenBackdropIsWhatCrops() {
        let when = Date(timeIntervalSince1970: 1_800_000_000)
        let voice = MessageCardSubject(quoted: nil, reply: MessageCardPart(author: "Awa", text: ""), sentAt: when,
                                       media: [Self.entry("voix", .audio, aspect: 1)])
        XCTAssertFalse(MessageCardCropRule.offers(framed: Self.render(voice, format: .initial, pictured: []), pictured: []))
        let backdrop = MessageCardBackdrop(media: MessageCardMedia(id: MessageCardBackdrop.mediaID, kind: .image, aspect: 0.75), veil: 0.4)
        let framed = Self.render(voice, format: .initial, pictured: [MessageCardBackdrop.mediaID], backdrop: backdrop)
        XCTAssertEqual(MessageCardCropRule.usable(framed, pictured: [MessageCardBackdrop.mediaID]).map(\.isBackdrop), [true])
    }

    func test_crop_theBackdropPanelOpensTheCrop_onceABackdropIsChosen() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Export/MessageCardBackdropPicker.swift"))
        XCTAssertTrue(source.contains("onCrop"), "le panneau du fond offre « Recadrer » sur le fond choisi")
        XCTAssertTrue(source.contains("\"export.card.crop\""), "le bouton du panneau dit « Recadrer », le mot du recadrage")
    }

    func test_crop_voiceOverRevealsTheAskedSideOfThePhoto() {
        let media = Self.framed("photo")
        let tall = MessageCardCropRule.revealed(.top, from: .centered, media: media, pixelWidth: 800, pixelHeight: 1600)
        XCTAssertLessThan(tall.framing.focusY, 0.5, "montrer le haut amène le haut de la photo dans le cadre")
        let bottom = MessageCardCropRule.revealed(.bottom, from: .centered, media: media, pixelWidth: 800, pixelHeight: 1600)
        XCTAssertGreaterThan(bottom.framing.focusY, 0.5)
        let wide = MessageCardCropRule.revealed(.left, from: .centered, media: media, pixelWidth: 1600, pixelHeight: 800)
        XCTAssertLessThan(wide.framing.focusX, 0.5)
        let blocked = MessageCardCropRule.revealed(.right, from: .centered, media: media, pixelWidth: 800, pixelHeight: 1600)
        XCTAssertEqual(blocked.framing, .centered)
        XCTAssertTrue(blocked.hitEdge, "une photo qui ne déborde pas en largeur bute")
    }

    func test_crop_theRenderKeyChangesWithTheFraming_andIgnoresACenteredOne() {
        XCTAssertEqual(MessageCardCropRule.key([:]), MessageCardCropRule.key(["photo": .centered]))
        XCTAssertNotEqual(MessageCardCropRule.key([:]), MessageCardCropRule.key(["photo": MessageCardFraming(zoom: 2)]))
        XCTAssertEqual(MessageCardCropRule.key(["a": MessageCardFraming(zoom: 2), "b": MessageCardFraming(zoom: 3)]),
                       MessageCardCropRule.key(["b": MessageCardFraming(zoom: 3), "a": MessageCardFraming(zoom: 2)]))
    }

    func test_crop_theFramingTravelsWithTheCard_toThePreviewAndEveryExport() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Export/MessageCardExportSheet.swift"))
        XCTAssertTrue(source.contains("card.framings = framings"), "input(for:) emporte le cadrage : aperçu, image, GIF et vidéo")
        XCTAssertTrue(source.contains("MessageCardCropRule.key(framings)"), "changer de cadrage repeint la carte")
    }

    func test_catalog_theCropWordsSpeakTheSevenLanguages() throws {
        let strings = try Self.catalog()
        let keys = ["export.card.crop", "export.card.crop.done", "export.card.crop.photo",
                    "export.card.crop.backdrop", "export.card.crop.zoomIn", "export.card.crop.zoomOut", "export.card.crop.recenter",
                    "export.card.crop.showTop", "export.card.crop.showBottom", "export.card.crop.showLeft", "export.card.crop.showRight"]
        for key in keys {
            for language in Self.languages {
                XCTAssertFalse((Self.value(strings[key], language) ?? "").isEmpty, "\(key) [\(language)]")
            }
        }
        XCTAssertEqual(Self.value(strings["export.card.crop"], "fr"), "Recadrer")
    }

    // MARK: - Le choix de liaison (#18809)

    func test_linkTile_everyLinkButTheBlankOnesPaintsItsMarkBetweenTheQuoteAndTheReply() {
        for link in MessageCardLinkID.allCases {
            let sketch = MessageCardLinkSketch.of(link)
            XCTAssertFalse(sketch.quote.isEmpty, "\(link.rawValue) : la citation se montre")
            XCTAssertFalse(sketch.reply.isEmpty, "\(link.rawValue) : la réponse se montre")
            switch link {
            case .silence:
                XCTAssertTrue(sketch.link.isEmpty, "le silence ne trace rien : la case montre l'espace")
            case .bulles:
                XCTAssertTrue(sketch.marks.contains { if case .panel = $0 { return true } else { return false } }, "les bulles portent les deux textes")
            default:
                XCTAssertFalse(sketch.link.isEmpty, "\(link.rawValue) peint sa liaison")
                XCTAssertTrue(sketch.link.allSatisfy { $0.ink == .accent }, "\(link.rawValue) : la liaison est à l'accent de la palette")
            }
        }
    }

    func test_linkTile_noTwoLinksLookAlike() {
        let sketches = MessageCardLinkID.allCases.map(MessageCardLinkSketch.of)
        XCTAssertEqual(Set(sketches.indices.flatMap { i in sketches.indices.filter { $0 > i && sketches[$0] == sketches[i] } }).count, 0)
    }

    func test_linkTile_paintsInThePaletteInks_neverTheInterfaceInk() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Export/MessageCardThumbnails.swift"))
        XCTAssertFalse(source.contains("Shading.foreground"), "une encre d'interface disparaît sur un fond de palette")
        let tray = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Export/MessageCardExportTray.swift"))
        XCTAssertTrue(tray.contains("MessageCardLinkGlyph(link: link, palette: format.template.palette.palette)"),
                      "la case montre la liaison posée sur la palette choisie")
    }

    @MainActor
    func test_linkTile_rendersEveryLinkVisibly_onADarkAndALightPalette() throws {
        for palette in [MessageCardPaletteID.aurore, .editorial] {
            let silence = try Self.tilePixels(.silence, palette: palette)
            for link in MessageCardLinkID.allCases where link != .silence && link != .bulles {
                let pixels = try Self.tilePixels(link, palette: palette)
                XCTAssertGreaterThan(Self.bandDifference(pixels, silence), 12, "\(link.rawValue) se voit dans sa case (\(palette.rawValue))")
            }
        }
    }

    @MainActor
    private static func tilePixels(_ link: MessageCardLinkID, palette: MessageCardPaletteID) throws -> [UInt8] {
        let renderer = ImageRenderer(content: MessageCardLinkGlyph(link: link, palette: palette.palette))
        renderer.scale = 2
        let image = try XCTUnwrap(renderer.cgImage)
        let (width, height) = (96, 96)
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let space = CGColorSpaceCreateDeviceRGB()
        let context = try XCTUnwrap(CGContext(data: &bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                              space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return bytes
    }

    /// Le nombre de pixels de la bande de la liaison qui changent franchement par rapport au silence.
    private static func bandDifference(_ a: [UInt8], _ b: [UInt8]) -> Int {
        let rows = Int(MessageCardLinkSketch.band.lowerBound / MessageCardLinkSketch.side * 96)...Int(MessageCardLinkSketch.band.upperBound / MessageCardLinkSketch.side * 96)
        return rows.reduce(0) { total, row in
            total + (0..<96).filter { column in
                let i = (row * 96 + column) * 4
                return (0..<3).map { abs(Int(a[i + $0]) - Int(b[i + $0])) }.reduce(0, +) > 90
            }.count
        }
    }

    func test_catalog_theElevenLinksSpeakTheSevenLanguages() throws {
        let strings = try Self.catalog()
        for link in MessageCardLinkID.allCases {
            for language in Self.languages {
                XCTAssertFalse((Self.value(strings["export.card.link.\(link.rawValue)"], language) ?? "").isEmpty, "\(link.rawValue) [\(language)]")
            }
        }
        XCTAssertEqual(Self.value(strings["export.card.link.double"], "fr"), "Double filet")
    }
}
