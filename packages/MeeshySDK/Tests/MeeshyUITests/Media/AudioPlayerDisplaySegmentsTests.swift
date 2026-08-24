import Testing
@testable import MeeshyUI
@testable import MeeshySDK

@Suite("AudioPlayerView.resolveDisplaySegments")
struct AudioPlayerDisplaySegmentsTests {

    private func makeTranscription(text: String, segments: [MessageTranscriptionSegment], durationMs: Int) -> MessageTranscription {
        MessageTranscription(attachmentId: "att_1", text: text, language: "fr",
                             confidence: 0.9, durationMs: durationMs, segments: segments)
    }

    private func makeTranslatedAudio(lang: String, transcription: String, segments: [MessageTranscriptionSegment]) -> MessageTranslatedAudio {
        MessageTranslatedAudio(id: "ta_1", attachmentId: "att_1", targetLanguage: lang,
                               url: "https://x/a.mp3", transcription: transcription,
                               durationMs: 1800, format: "mp3", cloned: false,
                               quality: 0.8, ttsModel: "chatterbox", segments: segments)
    }

    @Test("original branch: empty segments + non-empty text -> one synthesized segment")
    func test_resolveDisplaySegments_originalEmptySegments_synthesizesOne() {
        let stubSegments = [
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
            MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0),
        ]
        let transcription = makeTranscription(text: "bonjour le monde", segments: stubSegments, durationMs: 1600)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: transcription, translatedAudios: [])
        #expect(result.count == 1)
        #expect(result.first?.text == "bonjour le monde")
        #expect(result.first?.endTime == 1.6)
    }

    @Test("translated branch: empty segments + non-empty translated.transcription -> one synthesized segment")
    func test_resolveDisplaySegments_translatedEmptySegments_synthesizesOne() {
        let stubSegments = [MessageTranscriptionSegment(text: "", startTime: 0, endTime: 0)]
        let translated = makeTranslatedAudio(lang: "en", transcription: "hello world", segments: stubSegments)
        let transcription = makeTranscription(text: "bonjour le monde",
            segments: [MessageTranscriptionSegment(text: "bonjour le monde", startTime: 0, endTime: 1.6)],
            durationMs: 1600)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "en", transcription: transcription, translatedAudios: [translated])
        #expect(result.count == 1)
        #expect(result.first?.text == "hello world")
    }

    @Test("translated branch: non-empty segments are used directly")
    func test_resolveDisplaySegments_translatedRealSegments_usesThem() {
        let realSegments = [
            MessageTranscriptionSegment(text: "hello", startTime: 0, endTime: 0.8),
            MessageTranscriptionSegment(text: "world", startTime: 0.8, endTime: 1.8),
        ]
        let translated = makeTranslatedAudio(lang: "en", transcription: "hello world", segments: realSegments)
        let transcription = makeTranscription(text: "bonjour",
            segments: [MessageTranscriptionSegment(text: "bonjour", startTime: 0, endTime: 1)],
            durationMs: 1000)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "en", transcription: transcription, translatedAudios: [translated])
        #expect(result.map(\.text) == ["hello", "world"])
    }

    @Test("original branch: non-empty segments are used directly")
    func test_resolveDisplaySegments_originalRealSegments_usesThem() {
        let realSegments = [MessageTranscriptionSegment(text: "bonjour", startTime: 0, endTime: 1)]
        let transcription = makeTranscription(text: "bonjour", segments: realSegments, durationMs: 1000)
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: transcription, translatedAudios: [])
        #expect(result.map(\.text) == ["bonjour"])
    }

    @Test("no transcription, orig selected -> empty")
    func test_resolveDisplaySegments_noTranscription_returnsEmpty() {
        let result = AudioPlayerView.resolveDisplaySegments(
            selectedLanguage: "orig", transcription: nil, translatedAudios: [])
        #expect(result.isEmpty)
    }
}

// MARK: - Coupe de la transcription à « une trentaine de mots »

/// Directive 2026-08-24 : « rendre la transcription d'un audio limitée à
/// quelques trentaine de mots et avoir un bouton voir plus qui affiche cela
/// en plein écran ».
///
/// La coupe est une LOI PURE sur les segments — pas un `lineLimit` de peau :
/// le karaoké surligne des segments, il fallait donc couper la LISTE, pas
/// la hauteur du bloc. Elle remplace l'ancienne coupe à 255 caractères, qui
/// dépliait EN LIGNE (chevron) au lieu d'ouvrir le plein écran.
@Suite("AudioPlayerView.limitedSegments")
struct AudioPlayerTranscriptionWordLimitTests {

    private func seg(_ text: String, from: Double = 0, to: Double = 1) -> TranscriptionDisplaySegment {
        TranscriptionDisplaySegment(text: text, startTime: from, endTime: to, speakerId: nil, speakerColor: "08D9D6")
    }

    private func words(_ segments: [TranscriptionDisplaySegment]) -> [String] {
        segments.flatMap { $0.text.split(whereSeparator: \.isWhitespace).map(String.init) }
    }

    @Test("sous la limite : la transcription passe INTACTE, sans ellipse")
    func test_underTheLimit_isUntouched() {
        let segments = [seg("bonjour tout"), seg("le monde")]
        let result = AudioPlayerView.limitedSegments(segments, wordLimit: 30)
        #expect(result.map(\.text) == ["bonjour tout", "le monde"])
        #expect(AudioPlayerView.exceedsWordLimit(segments, wordLimit: 30) == false)
    }

    @Test("au-dessus : exactement `wordLimit` mots, ellipse sur le dernier gardé")
    func test_overTheLimit_keepsExactlyTheLimit_andEllipsizes() {
        let segments = (1...40).map { seg("mot\($0)") }
        #expect(AudioPlayerView.exceedsWordLimit(segments, wordLimit: 30))
        let result = AudioPlayerView.limitedSegments(segments, wordLimit: 30)
        #expect(words(result).count == 30)
        #expect(result.last?.text.hasSuffix("…") == true)
        #expect(words(result).first == "mot1")
    }

    @Test("la coupe tombe AU MILIEU d'un segment : ce segment est coupé, ses voisins d'après disparaissent")
    func test_theCutFallsInsideASegment() {
        let segments = [seg("un deux trois"), seg("quatre cinq six"), seg("sept huit")]
        let result = AudioPlayerView.limitedSegments(segments, wordLimit: 4)
        #expect(result.count == 2)
        #expect(result[0].text == "un deux trois")
        #expect(result[1].text == "quatre…")
    }

    @Test("la coupe tombe PILE sur une frontière : aucun segment vide, l'ellipse se pose sur le dernier gardé")
    func test_theCutFallsOnASegmentBoundary() {
        let segments = [seg("un deux trois"), seg("quatre cinq six")]
        let result = AudioPlayerView.limitedSegments(segments, wordLimit: 3)
        #expect(result.count == 1)
        #expect(result[0].text == "un deux trois…")
    }

    @Test("les timings du segment coupé sont CONSERVÉS — le karaoké garde son ancre de seek")
    func test_theCutSegmentKeepsItsTimings() {
        let segments = [seg("un deux trois quatre", from: 1.5, to: 4.25)]
        let result = AudioPlayerView.limitedSegments(segments, wordLimit: 2)
        #expect(result.first?.startTime == 1.5)
        #expect(result.first?.endTime == 4.25)
    }

    @Test("une limite nulle ou négative ne coupe RIEN — jamais un bloc vide par accident")
    func test_aNonPositiveLimitNeverTruncates() {
        let segments = [seg("un deux"), seg("trois")]
        #expect(AudioPlayerView.limitedSegments(segments, wordLimit: 0).map(\.text) == ["un deux", "trois"])
        #expect(AudioPlayerView.limitedSegments(segments, wordLimit: -3).map(\.text) == ["un deux", "trois"])
        #expect(AudioPlayerView.exceedsWordLimit(segments, wordLimit: 0) == false)
    }
}

/// La limite vit dans le PLAN de tenue — une seule constante, lue par la
/// carte comme par la rangée plate élue : deux coupes différentes pour la
/// même transcription seraient deux lois.
@Suite("AudioPlayerChromePlan.transcriptionWordLimit")
struct AudioPlayerChromeWordLimitTests {

    @Test("la carte et la rangée élue coupent à la MÊME trentaine de mots")
    func test_cardAndFocusedRow_shareTheSameLimit() {
        #expect(AudioPlayerChromePlan.plan(for: .card).transcriptionWordLimit == AudioPlayerChromePlan.standardTranscriptionWordLimit)
        #expect(AudioPlayerChromePlan.plan(for: .flatFocused).transcriptionWordLimit == AudioPlayerChromePlan.standardTranscriptionWordLimit)
        #expect(AudioPlayerChromePlan.standardTranscriptionWordLimit == 30)
    }

    @Test("la tenue minimale garde sa citation à 2 lignes — elle n'a pas de karaoké à couper")
    func test_flatMinimal_hasNoWordLimit() {
        #expect(AudioPlayerChromePlan.plan(for: .flatMinimal).transcriptionWordLimit == nil)
        #expect(AudioPlayerChromePlan.plan(for: .flatMinimal).flatTranscriptionLineLimit == 2)
    }
}
