import XCTest
import MeeshySDK
@testable import Meeshy

/// **Écrire un commentaire fait le silence autour** (#8601, demande porteur du
/// 2026-09-28 : « il faut faire disparaître les boutons et décorateurs autour
/// sauf les commentaires si affichés »).
///
/// La LOI s'éprouve par son verdict ; le CÂBLAGE par la source, couche par
/// couche — un verdict juste qu'une couche ne lit pas la laisse peinte.
final class StoryComposingFocusTests: XCTestCase {

    // MARK: - La loi

    func test_enSaisie_leChromeSEfface_memeHorsImmersion() {
        XCTAssertFalse(StoryComposingFocus.showsChrome(chromeVisible: true, isComposing: true))
    }

    func test_auRepos_leChromeSuitLImmersion() {
        XCTAssertTrue(StoryComposingFocus.showsChrome(chromeVisible: true, isComposing: false))
        XCTAssertFalse(StoryComposingFocus.showsChrome(chromeVisible: false, isComposing: false),
                       "la saisie ajoute une raison de se taire, elle n'en retire aucune")
    }

    /// Les décorations du CONTENU restent en immersion — ce n'est pas du
    /// chrome — et se taisent pendant la saisie.
    func test_lesDecorationsDuContenu_neSeTaisentQuEnSaisie() {
        XCTAssertTrue(StoryComposingFocus.showsContentDecorations(isComposing: false))
        XCTAssertFalse(StoryComposingFocus.showsContentDecorations(isComposing: true))
    }

    // MARK: - Le câblage du lecteur

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try String(
            contentsOf: AppSourceGuard.unitURLs(chemin)[0], encoding: .utf8))
    }

    private var canvas: String {
        get throws { try source("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift") }
    }

    private func occurrences(_ motif: String, in code: String) -> Int {
        code.components(separatedBy: motif).count - 1
    }

    /// En-tête (barres de progression, auteur, `ReferenceNoteRow`) et rail
    /// d'actions : le chrome, sous la conjonction.
    func test_enTeteEtRail_suiventLeChromeDeSaisie() throws {
        let code = try canvas
        XCTAssertEqual(occurrences(".storyFocusFade(readerChromeShown)", in: code), 2,
                       "l'en-tête et le rail d'actions s'effacent en saisie")
        XCTAssertFalse(code.contains(".opacity(chromeVisible ? 1 : 0)"),
                       "plus aucune couche de chrome ne lit l'immersion seule")
    }

    func test_lesVoiles_suiventLeChromeDeSaisie() throws {
        XCTAssertTrue(try canvas.contains("StoryReaderScrims(topInset: topInset, chromeVisible: readerChromeShown)"))
    }

    /// Pastilles audio, cibles de lieu, réactions en vol.
    func test_lesDecorationsDuContenu_seTaisentEnSaisie() throws {
        let code = try canvas
        XCTAssertEqual(occurrences(".storyFocusFade(readerDecorationsShown)", in: code), 3)
        XCTAssertFalse(code.contains(".allowsHitTesting(!isComposerEngaged)"),
                       "désactiver le doigt ne suffisait pas : la couche restait PEINTE")
    }

    func test_laLegende_laTranscriptionEtLaPastilleDeSon_seTaisentEnSaisie() throws {
        let code = try source("Meeshy/Features/Main/Views/StoryViewerView+CanvasCaption.swift")
        XCTAssertTrue(code.contains(".storyFocusFade(readerDecorationsShown)"))
        XCTAssertEqual(occurrences(".opacity(readerDecorationsShown ? 1 : 0)", in: code), 2)
    }

    /// **Ce qui RESTE, et c'est la moitié de la demande** : le composeur ne
    /// lit que l'immersion, et la couche des commentaires n'est touchée par
    /// aucune des deux règles.
    func test_leComposeurEtLesCommentaires_restent() throws {
        let composeur = try source("Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerLayer.swift")
        XCTAssertTrue(composeur.contains(".opacity(chromeVisible ? 1 : 0)"))
        XCTAssertFalse(composeur.contains("readerChromeShown"),
                       "le champ qu'on tape ne disparaît pas sous son propre doigt")

        let code = try canvas
        let commentaires = try XCTUnwrap(code.range(of: "makeCommentsOverlay()"))
        let suite = code[commentaires.upperBound...].prefix(600)
        XCTAssertFalse(suite.contains("storyFocusFade"),
                       "les commentaires affichés restent visibles pendant qu'on écrit")
    }
}
