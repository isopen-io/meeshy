import XCTest
import MeeshySDK
@testable import MeeshyUI

/// Gate de purge des brouillons fantômes — `checkForDraft()`
/// (`StoryComposerView+SyncRestore.swift`) ne doit plus JAMAIS proposer la
/// reprise (`DraftResumeCard`) pour un brouillon qui n'a jamais eu que le
/// fond auto-appliqué (bug corrigé au Problème 1). `shouldOfferDraftResume`
/// délègue entièrement à `composerHasContent` — même garantie, même risque :
/// un faux négatif jetterait un VRAI brouillon en silence.
final class StoryComposerDraftResumeGateTests: XCTestCase {

    private func offersResume(slides: [StorySlide], slideImageIds: Set<String> = []) -> Bool {
        StoryComposerView.shouldOfferDraftResume(slides: slides, slideImageIds: slideImageIds)
    }

    /// Le cas MAJORITAIRE visé par ce domaine : un fond seul (auto-appliqué à
    /// l'ouverture, jamais touché par l'utilisateur) ne doit plus jamais
    /// déclencher la carte de reprise.
    func test_phantomDraft_backgroundOnly_doesNotOfferResume() {
        var slide = StorySlide()
        var effects = StoryEffects()
        effects.background = "FF0000"
        slide.effects = effects
        XCTAssertFalse(offersResume(slides: [slide]))
    }

    func test_realDraft_withText_offersResume() {
        var slide = StorySlide()
        slide.content = "Bonjour"
        XCTAssertTrue(offersResume(slides: [slide]))
    }

    /// Cas per-slide dans le contexte spécifique de la reprise : un sticker
    /// posé sur le DEUXIÈME slide doit être détecté, pas seulement celui du
    /// slide courant — présuppose le fix per-slide du Problème 1.
    func test_realDraft_withStickerOnSecondSlide_offersResume() {
        var second = StorySlide()
        second.effects.stickerObjects = [StorySticker(emoji: "🎉")]
        XCTAssertTrue(offersResume(slides: [StorySlide(), second]))
    }

    func test_noSlides_doesNotOfferResume() {
        XCTAssertFalse(offersResume(slides: []))
    }

    /// Vérifie le câblage `slideImageIds` construit depuis les références
    /// média légères (`loadMediaReferences()`, pas `loadMedia()` — un
    /// décodage bitmap complet bloquerait le thread principal, cf.
    /// challenge_S2 finding #1).
    func test_realDraft_withAttachedImage_offersResume() {
        let slide = StorySlide()
        XCTAssertTrue(offersResume(slides: [slide], slideImageIds: [slide.id]))
    }
}
