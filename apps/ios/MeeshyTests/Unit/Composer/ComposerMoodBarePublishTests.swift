import XCTest
@testable import Meeshy

/// #10527 — **valider une humeur sans un mot demande, et une icône ouvre la
/// feuille complète des emojis.**
///
/// Trois choses, et aucune ne monte une vue :
/// 1. la règle PURE « faut-il demander ? » ;
/// 2. la règle PURE de l'emoji choisi hors de la grille ;
/// 3. le CÂBLAGE, par garde de source : la flèche du mood passe par la
///    question, la surface ouvre la feuille du dépôt et rend le focus au mot.
final class ComposerMoodBarePublishTests: XCTestCase {

    // MARK: - Faut-il demander ?

    func test_step_sansAucunMot_demande() {
        XCTAssertEqual(ComposerMoodBarePublish.step(text: "", isRepublication: false), .askForAWord)
    }

    func test_step_desEspacesSeuls_demandent_commeUneSaisieVide() {
        XCTAssertEqual(ComposerMoodBarePublish.step(text: "  \n\t ", isRepublication: false), .askForAWord)
    }

    func test_step_unMot_publieSansDemander() {
        XCTAssertEqual(ComposerMoodBarePublish.step(text: " ça va ", isRepublication: false), .publish)
    }

    func test_step_uneRepublicationSansMot_neDemandeRien() {
        XCTAssertEqual(ComposerMoodBarePublish.step(text: "", isRepublication: true), .publish)
    }

    // MARK: - L'emoji choisi hors de la grille

    func test_custom_unEmojiHorsDeLaGrille_prendSaCellule() {
        XCTAssertEqual(ComposerMoodEmojiChoice.custom("🦊", offered: ["🎉", "☕"]), "🦊")
    }

    func test_custom_unEmojiDeLaGrille_nEstPasPeintDeuxFois() {
        XCTAssertNil(ComposerMoodEmojiChoice.custom("🎉", offered: ["🎉", "☕"]))
    }

    func test_custom_aucunEmoji_neRendRien() {
        XCTAssertNil(ComposerMoodEmojiChoice.custom(nil, offered: ["🎉"]))
        XCTAssertNil(ComposerMoodEmojiChoice.custom("", offered: ["🎉"]))
    }

    // MARK: - Les libellés

    func test_lesQuatreLibelles_sontResolus_etDistincts() {
        let libelles = [ComposerMoodBareCopy.question, ComposerMoodBareCopy.addWord,
                        ComposerMoodBareCopy.publishAnyway, ComposerMoodBareCopy.moreEmojis]
        XCTAssertEqual(Set(libelles).count, 4)
        for libelle in libelles {
            XCTAssertFalse(libelle.isEmpty)
            XCTAssertFalse(libelle.hasPrefix("status.composer."), "« \(libelle) » est une clé brute : elle manque au catalogue.")
        }
    }

    // MARK: - Le câblage

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func compact(_ code: String) -> String {
        code.filter { !$0.isWhitespace }
    }

    func test_laFlecheDuMood_passeParLaQuestion_etGardeLeGesteDuMeuble() throws {
        let hote = compact(try AppSourceGuard.stripComments(AppSourceGuard.composerHostSource()))
        guard let debut = hote.range(of: "varmoodHeaderPublishButton:someView{") else {
            return XCTFail("`moodHeaderPublishButton` introuvable — la garde ne mesurerait rien.")
        }
        let bloc = String(hote[debut.lowerBound...].prefix(420))
        XCTAssertTrue(bloc.contains("ComposerMoodPublishGate("), "La flèche du mood doit passer par la question.")
        XCTAssertTrue(bloc.contains("text:documentText"), "La question se décide sur le texte du meuble.")
        XCTAssertTrue(
            bloc.contains("publish:{publishDocument(ComposerPublishChoice(format:selectedFormat,layout:nil))}"),
            "Le geste reste celui du meuble : la question n'ouvre aucun second chemin de publication."
        )
    }

    func test_laQuestion_offreSesDeuxReponses_enUnGeste() throws {
        let code = compact(try source("Meeshy/Features/Main/Composer/ComposerMoodBarePublish.swift"))
        XCTAssertTrue(code.contains(".alert(ComposerMoodBareCopy.question,isPresented:$isAsking)"))
        XCTAssertTrue(code.contains("Button(ComposerMoodBareCopy.addWord){returnToWord()}"))
        XCTAssertTrue(code.contains("Button(ComposerMoodBareCopy.publishAnyway){publish()}"))
        XCTAssertTrue(code.contains("focus?.focus()"), "« Ajouter un mot » rend le focus au champ.")
    }

    func test_laSurface_ouvreLaFeuilleDuDepot_etRendLeFocusAuMot() throws {
        let surface = compact(try source("Meeshy/Features/Main/Composer/ComposerMoodSurface.swift"))
        XCTAssertTrue(surface.contains("ComposerMoodMoreEmojiCell(side:Self.cellSide)"), "La grille porte la porte vers les autres emojis.")
        XCTAssertTrue(surface.contains("ComposerMoodEmojiSheet(offered:StatusViewModel.moodOptions)"))
        XCTAssertTrue(surface.contains("emoji=picked"), "L'emoji choisi devient celui de l'humeur.")
        XCTAssertTrue(surface.contains(".focused($isWordFocused)"))
        XCTAssertTrue(surface.contains(".environment(\\.composerMoodWordFocus,ComposerMoodWordFocus{isWordFocused=true})"))

        let lot = compact(try source("Meeshy/Features/Main/Composer/ComposerMoodBarePublish.swift"))
        XCTAssertTrue(lot.contains("EmojiPickerSheet("), "La feuille est celle du dépôt, jamais une seconde.")
        XCTAssertFalse(lot.contains("LazyVGrid"), "Ce lot n'écrit aucune grille d'emojis.")
        XCTAssertTrue(lot.contains(".accessibilityLabel(Text(ComposerMoodBareCopy.moreEmojis))"), "L'icône est nommée pour VoiceOver.")
        XCTAssertTrue(lot.contains(".frame(width:side,height:side)"), "La porte a les mesures d'une cellule (56 pt).")
    }
}
