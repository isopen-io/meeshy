import XCTest
@testable import Meeshy

/// #8680 — **un texte s'édite SUR la scène, quelle que soit la porte.**
///
/// Directive porteur 2026-09-29 : « lorsqu'on double-touche un texte, c'est
/// cette scène qui doit s'afficher et non plus l'ancienne ». La porte TEXTE
/// ouvrait déjà la saisie sur scène (#8558) — scène, outils du texte au rail et
/// `(x)` (#8652) ; le double-toucher et « Modifier » ouvraient encore l'éditeur
/// plein écran. Deux gestes, deux éditions pour le même objet.
final class ComposerSceneTextEditingTests: XCTestCase {

    private func hostUnit() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    private func compact(_ t: String) -> String {
        t.components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// Le corps de la branche `.text` de `onItemEdit` — le site que le
    /// double-toucher, l'appui long « Modifier » et l'action VoiceOver
    /// empruntent tous trois (`onItemDoubleTapped`).
    private func textEditBranch() throws -> String {
        let code = compact(try hostUnit())
        guard let porte = code.range(of: "onItemEdit:{id,kindin"),
              let texte = code.range(of: "case.text:", range: porte.upperBound..<code.endIndex),
              let suivante = code.range(of: "case.audio:", range: texte.upperBound..<code.endIndex)
        else {
            XCTFail("La branche texte de `onItemEdit` a changé de forme — re-pointer la garde.")
            return ""
        }
        return String(code[texte.upperBound..<suivante.lowerBound])
    }

    /// **LE témoin de la directive** : le double-toucher d'un texte ouvre la
    /// MÊME édition que la porte TEXTE.
    func test_doubleToucherUnTexte_ouvreLEditionSurScene() throws {
        let branche = try textEditBranch()
        XCTAssertTrue(branche.contains("beginSceneTextEditing(id)"),
                      "Double-toucher un texte doit ouvrir la saisie SUR la scène (#8680).")
    }

    /// **La garde du retour en arrière** : l'éditeur plein écran ne se rouvre
    /// plus depuis un texte double-touché.
    func test_doubleToucherUnTexte_nOuvrePlusLEditeurPleinEcran() throws {
        let branche = try textEditBranch()
        XCTAssertFalse(branche.contains("openObjectEditor("),
                       "Le double-toucher d'un texte rouvre l'éditeur plein écran — "
                        + "l'« ancienne » scène que la directive du 2026-09-29 retire.")
        XCTAssertFalse(branche.contains("editedObject="),
                       "Le double-toucher d'un texte monte l'éditeur plein écran par son état.")
    }

    /// La porte TEXTE et le double-toucher partagent un site UNIQUE : c'est lui
    /// qui entre en édition sur le modèle, et lui seul.
    func test_laSaisieSurScene_entreEnEditionSurLeModele() throws {
        let code = try hostUnit()
        guard let debut = code.range(of: "func beginSceneTextEditing(")?.upperBound,
              let fin = code.range(of: "}", range: debut..<code.endIndex)?.lowerBound else {
            return XCTFail("`beginSceneTextEditing` est introuvable.")
        }
        let corps = compact(String(code[debut..<fin]))
        XCTAssertTrue(corps.contains("viewModel.enterTextEditingMode(textId:id)"))
        XCTAssertFalse(corps.contains("editedObject="),
                       "La saisie sur scène ne monte jamais l'éditeur plein écran.")
    }
}
