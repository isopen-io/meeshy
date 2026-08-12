import XCTest
@testable import MeeshySDK
@testable import Meeshy

/// Une story sans le moindre contenu affichable existe vraiment en base.
///
/// Constaté le 2026-07-26 sur le compte de démonstration : huit stories d'un
/// même auteur avec `media: []`, `storyEffects: {"textObjects": []}` et
/// `content: null`. Le lecteur les rendait en écran NOIR pendant toute la
/// durée de slide — soit, pour qui ouvrait cet anneau, huit écrans noirs
/// d'affilée. Le rendu était correct : il n'y avait rien à rendre.
///
/// Ce prédicat sépare « rien à montrer » de « pas encore chargé ». Il est
/// délibérément CONSERVATEUR : au moindre champ porteur, la story est
/// considérée affichable. Un faux positif ferait disparaître du contenu réel
/// — beaucoup plus grave qu'un écran noir de six secondes.
final class StoryContentPresenceTests: XCTestCase {

    // MARK: - Fixtures

    private func makeStory(content: String? = nil,
                           media: [FeedMedia] = [],
                           audioUrl: String? = nil,
                           effects: StoryEffects? = nil) -> StoryItem {
        StoryItem(id: "s",
                  content: content,
                  media: media,
                  storyEffects: effects,
                  createdAt: Date(),
                  expiresAt: nil,
                  audioUrl: audioUrl,
                  isViewed: false)
    }

    private func emptyEffects() -> StoryEffects {
        StoryEffects(textObjects: [])
    }

    // MARK: - Le cas constaté en production

    func test_storyWithNothingAtAll_isNotRenderable() {
        let story = makeStory(content: nil, media: [], effects: emptyEffects())

        XCTAssertFalse(
            StoryContentPresence.hasRenderableContent(story),
            "media vide + textObjects vide + content nul : il n'y a littéralement rien à afficher"
        )
    }

    func test_storyWithoutEffectsAtAll_isNotRenderable() {
        XCTAssertFalse(StoryContentPresence.hasRenderableContent(makeStory()))
    }

    // MARK: - Tout ce qui suffit à rendre une story affichable

    func test_plainTextContent_isRenderable() {
        XCTAssertTrue(StoryContentPresence.hasRenderableContent(
            makeStory(content: "Bonjour", effects: emptyEffects())))
    }

    /// Une story de couleur unie n'a ni média ni texte — et reste parfaitement
    /// valide. C'est le faux positif le plus facile à commettre.
    func test_solidBackgroundAlone_isRenderable() {
        var effects = emptyEffects()
        effects.background = "#6366F1"

        XCTAssertTrue(
            StoryContentPresence.hasRenderableContent(makeStory(effects: effects)),
            "un fond de couleur seul est une story légitime"
        )
    }

    func test_textObject_isRenderable() {
        var effects = emptyEffects()
        effects.textObjects = [StoryTextObject(text: "Salut")]

        XCTAssertTrue(StoryContentPresence.hasRenderableContent(makeStory(effects: effects)))
    }

    /// Un textObject blanc ne compte pas : c'est un résidu du composer, pas du
    /// contenu. Sinon le prédicat déclarerait affichable une story qui rend un
    /// écran noir — précisément ce qu'on cherche à éviter.
    func test_blankTextObject_doesNotCount() {
        var effects = emptyEffects()
        effects.textObjects = [StoryTextObject(text: "   ")]

        XCTAssertFalse(StoryContentPresence.hasRenderableContent(makeStory(effects: effects)))
    }

    func test_legacyMedia_isRenderable() {
        let media = FeedMedia(id: "m", type: .image, url: "https://x/y.jpg")

        XCTAssertTrue(StoryContentPresence.hasRenderableContent(makeStory(media: [media])))
    }

    /// Une story purement sonore n'a rien à MONTRER mais quelque chose à
    /// JOUER : la sauter reviendrait à supprimer le message de son auteur.
    func test_audioOnlyStory_isRenderable() {
        XCTAssertTrue(
            StoryContentPresence.hasRenderableContent(
                makeStory(audioUrl: "https://x/voice.m4a", effects: emptyEffects())),
            "« rien à voir » n'est pas « rien à restituer »"
        )
    }

    func test_backgroundAudioId_isRenderable() {
        var effects = emptyEffects()
        effects.backgroundAudioId = "audio-1"

        XCTAssertTrue(StoryContentPresence.hasRenderableContent(makeStory(effects: effects)))
    }

    // MARK: - Bornes

    /// Un fond vide ou blanc ne sauve pas une story par ailleurs vide.
    func test_blankBackgroundString_doesNotCount() {
        var effects = emptyEffects()
        effects.background = "  "

        XCTAssertFalse(StoryContentPresence.hasRenderableContent(makeStory(effects: effects)))
    }

    func test_blankContentString_doesNotCount() {
        XCTAssertFalse(StoryContentPresence.hasRenderableContent(
            makeStory(content: "\n  ", effects: emptyEffects())))
    }
}
