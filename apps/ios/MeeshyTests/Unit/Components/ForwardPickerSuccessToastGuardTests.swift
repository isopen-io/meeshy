import Foundation
import XCTest
@testable import Meeshy

/// Le toast succès du picker de transfert ne doit JAMAIS être émis pendant que
/// la feuille est présentée.
///
/// Le toast est rendu par l'overlay RACINE (`MeeshyApp`) : une feuille posée
/// par-dessus le recouvre. Au détent `.large` il est purement invisible ; au
/// détent `.medium` il tombe dans la zone assombrie, où un tap referme la
/// feuille au lieu d'invoquer son action. Émis depuis `perform(_:)`, le
/// feedback « permet d'ouvrir la cible » de la spec (A.5) était donc
/// inopérant — et rien ne rougissait, puisque l'appel EXISTAIT bien.
/// `ForwardPickerSheet` documente lui-même le phénomène pour justifier
/// l'affichage in-sheet des ÉCHECS : la même contrainte vaut pour le succès.
///
/// Un rendu de feuille n'est pas décidable en test unitaire ; le SITE
/// d'émission, lui, se lit sur le texte source — et c'est exactement la marche
/// manquée. La garde exige que toute émission passe par
/// `fireDeferredSuccessToast()`, et que cette fonction ne soit appelée que
/// depuis `.onDisappear`.
final class ForwardPickerSuccessToastGuardTests: XCTestCase {

    private var sheetSource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // Components
            .deletingLastPathComponent()  // Unit
            .deletingLastPathComponent()  // MeeshyTests
            .deletingLastPathComponent()  // ios
            .appendingPathComponent("Meeshy/Features/Main/Components/ForwardPickerSheet.swift")
    }

    /// Le fichier documente en prose le piège même que la garde surveille, et
    /// cite `FeedbackToastManager` dans ses commentaires. Sans dépouillement, la
    /// documentation compterait comme une émission.
    private func strippedSource() throws -> String {
        Self.neutralizingStringLiterals(
            AppSourceGuard.stripComments(try String(contentsOf: sheetSource, encoding: .utf8))
        )
    }

    /// Vide le contenu des littéraux de chaîne (en conservant les guillemets) :
    /// l'appariement d'accolades ci-dessous doit ignorer une accolade qui
    /// vivrait dans un libellé.
    private static func neutralizingStringLiterals(_ source: String) -> String {
        var out = ""
        var inString = false
        var escaped = false
        for character in source {
            if inString {
                if escaped { escaped = false; continue }
                if character == "\\" { escaped = true; continue }
                if character == "\"" { inString = false; out.append(character) }
                continue
            }
            if character == "\"" { inString = true }
            out.append(character)
        }
        return out
    }

    /// Corps d'une fonction, par appariement d'accolades depuis sa signature.
    /// Une fenêtre de N caractères pourrirait au premier ajout de ligne
    /// (`reference_source_guard_fixed_char_windows_rot`).
    private func functionBody(after signature: String, in source: String) throws -> String {
        let start = try XCTUnwrap(
            source.range(of: signature),
            "Signature introuvable : « \(signature) ». Le fichier a bougé — une garde qui ne trouve plus sa cible doit rougir, jamais passer."
        )
        let open = try XCTUnwrap(
            source[start.upperBound...].firstIndex(of: "{"),
            "Aucune accolade ouvrante après « \(signature) »."
        )
        var depth = 0
        var index = open
        while index < source.endIndex {
            if source[index] == "{" { depth += 1 }
            if source[index] == "}" {
                depth -= 1
                if depth == 0 { return String(source[source.index(after: open)..<index]) }
            }
            index = source.index(after: index)
        }
        XCTFail("Accolades non appariées après « \(signature) ».")
        return ""
    }

    private func occurrences(of needle: String, in source: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var count = 0
        var searchStart = source.startIndex
        while let found = source.range(of: needle, range: searchStart..<source.endIndex) {
            count += 1
            searchStart = found.upperBound
        }
        return count
    }

    // MARK: - Site d'émission

    func test_successToast_isNeverEmittedWhileTheSheetIsPresented() throws {
        let source = try strippedSource()
        let deferred = try functionBody(after: "private func fireDeferredSuccessToast()", in: source)

        let total = occurrences(of: "FeedbackToastManager", in: source)
        XCTAssertGreaterThan(
            total, 0,
            "Balayage vide : plus aucune émission de toast dans le picker. "
            + "Un balayage vide ne doit jamais être indiscernable d'un succès."
        )
        XCTAssertEqual(
            occurrences(of: "FeedbackToastManager", in: deferred), total,
            "Le toast succès est émis hors de `fireDeferredSuccessToast()` — donc pendant que la feuille est présentée, "
            + "où l'overlay racine est recouvert : invisible au détent .large, et au détent .medium un tap referme la "
            + "feuille au lieu d'ouvrir la conversation. Différer l'émission à la fermeture."
        )
    }

    func test_deferredToast_isCalledOnlyFromOnDisappear() throws {
        let source = try strippedSource()
        let callSites = occurrences(of: "fireDeferredSuccessToast()", in: source)

        XCTAssertEqual(
            callSites, 2,
            "Attendu exactement deux mentions de `fireDeferredSuccessToast()` : sa déclaration et son unique appel. "
            + "Trouvé \(callSites) — un second site d'appel rouvre la porte à une émission pendant la présentation."
        )
        XCTAssertTrue(
            source.contains(".onDisappear { fireDeferredSuccessToast() }"),
            "L'unique appel doit être posé sur `.onDisappear` — c'est ce qui garantit que la feuille est PARTIE "
            + "(bouton « Fermer » comme glissé vers le bas) quand le toast racine apparaît."
        )
    }

    /// Le picker envoie à N cibles ; l'invariant produit est UN seul toast par
    /// ouverture, portant la PREMIÈRE cible servie.
    func test_deferredToast_firesAtMostOncePerPresentation() throws {
        let deferred = try functionBody(
            after: "private func fireDeferredSuccessToast()",
            in: try strippedSource()
        )

        XCTAssertTrue(
            deferred.contains("guard !successToastFired"),
            "Sans garde `successToastFired`, une feuille rouverte pourrait empiler les toasts."
        )
        XCTAssertTrue(
            deferred.contains("successToastFired = true"),
            "La garde doit être ARMÉE dans la fonction, sinon elle ne borne rien."
        )
        XCTAssertTrue(
            deferred.contains("firstServedConversation"),
            "La cible du toast est la PREMIÈRE conversation servie — sans elle, le tap n'ouvre rien."
        )
    }

    /// L'envoi lui-même ne doit rien émettre : c'est le défaut d'origine.
    ///
    /// Signature `ForwardTarget` depuis 2026-08-19 (Task 8, forward-reach) —
    /// le picker envoie désormais à une conversation existante OU un contact
    /// sans conversation encore ouverte ; la clé de dédup/état de ligne
    /// (`ForwardTarget.id`, préfixée `conv:`/`user:`) ne survit pas à un
    /// aller-retour par `Conversation`. La garde SUIT ce renommage légitime :
    /// elle continue de prouver que `perform(_:)` n'émet aucun toast.
    func test_performSend_emitsNoToast() throws {
        let perform = try functionBody(
            after: "private func perform(_ target: ForwardTarget) async",
            in: try strippedSource()
        )

        XCTAssertFalse(
            perform.contains("FeedbackToastManager"),
            "`perform(_:)` s'exécute feuille PRÉSENTÉE : tout toast qui en part est recouvert."
        )
        XCTAssertFalse(
            perform.contains("fireDeferredSuccessToast"),
            "Appeler la confirmation différée depuis l'envoi la rendrait immédiate — et donc de nouveau recouverte."
        )
    }
}
