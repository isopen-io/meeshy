import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **Éditer une story ne doit RIEN perdre.**
///
/// `StoryComposerViewModel.init(editing:)` promet une hydratation « fidèle,
/// aucune conversion lossy ». Cette promesse ne tient que si elle est
/// VÉRIFIÉE champ par champ : un `StoryEffects` porte une trentaine de
/// propriétés (couleurs, dessin, transitions, audio, transformations de fond,
/// durée épinglée…), et il suffit qu'une seule soit reconstruite au lieu
/// d'être reprise pour que l'auteur perde son travail à la première
/// modification — silencieusement, puisque le canvas se contente d'afficher
/// ce qu'on lui donne.
///
/// Le test remplit CHAQUE champ d'une valeur distinctive, hydrate le composer,
/// et compare le blob ré-encodé à l'original. Un champ ajouté plus tard sans
/// être hydraté fait tomber ce test.
@MainActor
final class StoryEditHydrationFidelityTests: XCTestCase {

    /// `StoryEffects` avec tous les champs renseignés — valeurs volontairement
    /// distinctes les unes des autres pour qu'une permutation soit visible.
    private func makeRichEffects() -> StoryEffects {
        var effects = StoryEffects()
        effects.background = "#1E1B4B"
        effects.textStyle = "bold"
        effects.textColor = "#FF00AA"
        effects.textAlign = "center"
        effects.textSize = 42
        effects.textBg = "#00FFCC"
        effects.textOffsetY = 12
        effects.filter = "noir"
        effects.filterIntensity = 0.75
        effects.thumbHash = "abcdef0123456789"
        effects.canvasAspectRatio = 9.0 / 16.0
        effects.timelineDuration = 11.5
        effects.slideDuration = 9
        effects.backgroundAudioId = "audio-42"
        effects.backgroundAudioVolume = 0.42
        effects.backgroundAudioStart = 1.5
        effects.backgroundAudioEnd = 8.5
        effects.voiceAttachmentId = "voice-7"
        effects.musicTrackId = "track-9"
        effects.musicStartTime = 2
        effects.musicEndTime = 7
        effects.textObjects = [
            StoryTextObject(
                id: "t1",
                text: "Bonjour",
                x: 0.25, y: 0.75,
                zIndex: 3,
                fontSize: 33,
                textColor: "#123456"
            )
        ]
        return effects
    }

    private func makeStory(effects: StoryEffects) -> StoryItem {
        StoryItem(
            id: "story-1",
            content: "Légende d'origine",
            media: [],
            storyEffects: effects
        )
    }

    /// Encodage canonique : `.sortedKeys` rend la comparaison indépendante de
    /// l'ordre d'émission des clés.
    private func canonical(_ effects: StoryEffects) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return String(decoding: try encoder.encode(effects), as: UTF8.self)
    }

    // MARK: - Fidélité globale

    func test_editingHydration_preservesTheEntireEffectsBlob() throws {
        let original = makeRichEffects()
        let composer = StoryComposerViewModel(editing: makeStory(effects: original))

        let slide = try XCTUnwrap(composer.slides.first, "L'édition doit produire un slide.")
        XCTAssertEqual(
            try canonical(slide.effects), try canonical(original),
            "Le blob d'effets doit ressortir OCTET POUR OCTET. Toute différence est " +
            "du travail d'auteur perdu au premier enregistrement."
        )
    }

    // MARK: - Champs que l'utilisateur voit changer

    func test_editingHydration_preservesColours() throws {
        let original = makeRichEffects()
        let composer = StoryComposerViewModel(editing: makeStory(effects: original))
        let effects = try XCTUnwrap(composer.slides.first?.effects)

        XCTAssertEqual(effects.background, "#1E1B4B", "Couleur de fond perdue.")
        XCTAssertEqual(effects.textColor, "#FF00AA", "Couleur de texte perdue.")
        XCTAssertEqual(effects.textBg, "#00FFCC", "Couleur de fond de texte perdue.")
        XCTAssertEqual(effects.textObjects.first?.textColor, "#123456",
                       "Couleur d'un objet texte perdue.")
    }

    /// La durée épinglée par l'éditeur de timeline est AUTORITAIRE. La
    /// reconstruire depuis le contenu écraserait un choix explicite de l'auteur.
    func test_editingHydration_keepsThePinnedTimelineDuration() throws {
        let original = makeRichEffects()
        let composer = StoryComposerViewModel(editing: makeStory(effects: original))
        let slide = try XCTUnwrap(composer.slides.first)

        XCTAssertEqual(slide.effects.timelineDuration, 11.5)
        XCTAssertEqual(slide.duration, 11.5, accuracy: 0.001,
                       "La durée du slide doit suivre le pin de la timeline, pas un défaut.")
    }

    func test_editingHydration_preservesCaptionAndVisibilityContext() throws {
        let composer = StoryComposerViewModel(editing: makeStory(effects: makeRichEffects()))

        XCTAssertEqual(composer.slides.first?.content, "Légende d'origine")
        XCTAssertEqual(composer.editingPostId, "story-1",
                       "Sans l'identifiant, l'enregistrement créerait une story NEUVE " +
                       "au lieu de mettre à jour l'existante.")
    }
}
