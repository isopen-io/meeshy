import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// L'éditeur audio PRODUIT une transcription (`AudioEditorResult.transcription`,
/// posée par `AudioEditorController.finalize()`), et le composer story la
/// JETAIT : les deux `onConfirm` de `StoryComposerView+Media` ignoraient le
/// paramètre (`{ url, _, _, _ in }`).
///
/// Conséquence mesurée le 2026-07-26 : aucun champ `voiceTranscriptions` n'était
/// jamais écrit dans tout le dépôt — l'entrée « Afficher la transcription » du
/// menu « … » du lecteur ne pouvait apparaître pour AUCUNE story. La bascule
/// était livrée et correctement câblée côté lecture, mais inerte.
///
/// Ces tests verrouillent le maillon manquant : la persistance de la
/// transcription dans les effets de la slide courante.
@MainActor
final class StoryComposerVoiceTranscriptionTests: XCTestCase {

    private func makeVM() -> StoryComposerViewModel {
        StoryComposerViewModel()
    }

    // MARK: - Persistance

    func test_attachVoiceTranscriptions_storesThemOnTheCurrentSlide() {
        let vm = makeVM()

        vm.attachVoiceTranscriptions([
            StoryVoiceTranscription(language: "fr", content: "Bonjour tout le monde")
        ])

        XCTAssertEqual(vm.currentEffects.voiceTranscriptions?.count, 1)
        XCTAssertEqual(vm.currentEffects.voiceTranscriptions?.first?.language, "fr")
        XCTAssertEqual(vm.currentEffects.voiceTranscriptions?.first?.content, "Bonjour tout le monde")
    }

    /// C'est ce que lit le lecteur pour décider d'afficher l'entrée de menu.
    func test_attachVoiceTranscriptions_makesTheReaderEntryAvailable() {
        let vm = makeVM()
        XCTAssertFalse(StoryAudioTranscript.hasTranscript(effects: vm.currentEffects))

        vm.attachVoiceTranscriptions([
            StoryVoiceTranscription(language: "fr", content: "Bonjour")
        ])

        XCTAssertTrue(StoryAudioTranscript.hasTranscript(effects: vm.currentEffects))
    }

    // MARK: - Fusion

    /// Un second enregistrement dans une AUTRE langue enrichit le Prisme au lieu
    /// d'écraser le premier.
    func test_attachVoiceTranscriptions_mergesDistinctLanguages() {
        let vm = makeVM()

        vm.attachVoiceTranscriptions([StoryVoiceTranscription(language: "fr", content: "Bonjour")])
        vm.attachVoiceTranscriptions([StoryVoiceTranscription(language: "en", content: "Hello")])

        let langs = Set((vm.currentEffects.voiceTranscriptions ?? []).map(\.language))
        XCTAssertEqual(langs, ["fr", "en"])
    }

    /// Ré-enregistrer dans la MÊME langue remplace : sinon le lecteur afficherait
    /// une transcription périmée à côté de l'audio réellement joué.
    func test_attachVoiceTranscriptions_replacesSameLanguage() {
        let vm = makeVM()

        vm.attachVoiceTranscriptions([StoryVoiceTranscription(language: "fr", content: "Premier jet")])
        vm.attachVoiceTranscriptions([StoryVoiceTranscription(language: "fr", content: "Version corrigée")])

        XCTAssertEqual(vm.currentEffects.voiceTranscriptions?.count, 1)
        XCTAssertEqual(vm.currentEffects.voiceTranscriptions?.first?.content, "Version corrigée")
    }

    /// La comparaison de langue est insensible à la région : `fr-FR` et `fr`
    /// désignent la même piste.
    func test_attachVoiceTranscriptions_matchesLanguageAcrossRegionVariants() {
        let vm = makeVM()

        vm.attachVoiceTranscriptions([StoryVoiceTranscription(language: "fr-FR", content: "Premier jet")])
        vm.attachVoiceTranscriptions([StoryVoiceTranscription(language: "fr", content: "Version corrigée")])

        XCTAssertEqual(vm.currentEffects.voiceTranscriptions?.count, 1)
        XCTAssertEqual(vm.currentEffects.voiceTranscriptions?.first?.content, "Version corrigée")
    }

    // MARK: - Entrées dégénérées

    /// La transcription est optionnelle : sans reconnaissance vocale aboutie,
    /// `finalize()` renvoie `nil` et le composer reçoit un tableau vide. Écrire
    /// un `voiceTranscriptions: []` ferait apparaître une entrée de menu qui
    /// n'afficherait rien.
    func test_attachVoiceTranscriptions_ignoresEmptyInput() {
        let vm = makeVM()

        vm.attachVoiceTranscriptions([])

        XCTAssertNil(vm.currentEffects.voiceTranscriptions)
        XCTAssertFalse(StoryAudioTranscript.hasTranscript(effects: vm.currentEffects))
    }

    func test_attachVoiceTranscriptions_ignoresBlankContent() {
        let vm = makeVM()

        vm.attachVoiceTranscriptions([StoryVoiceTranscription(language: "fr", content: "   \n ")])

        XCTAssertFalse(StoryAudioTranscript.hasTranscript(effects: vm.currentEffects))
    }
}
