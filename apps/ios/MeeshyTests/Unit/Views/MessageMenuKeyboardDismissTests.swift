import XCTest
@testable import Meeshy

/// **Un appui long sur un message referme le clavier avant d'ouvrir son menu.**
///
/// Le symptôme, rapporté par le porteur : clavier ouvert, appui long sur une
/// bulle — le menu s'ouvre DERRIÈRE le clavier, donc invisible et inutilisable.
///
/// ### Pourquoi un témoin de SOURCE et pas de comportement
///
/// Le geste vit dans deux chemins mutuellement exclusifs, tous deux liés à des
/// primitives que XCTest ne peut pas présenter hors device : le
/// `LongPressGesture` custom (< iOS 26) et le `.contextMenu` NATIF (≥ iOS 26).
/// Ce qui se teste ici est donc l'INVARIANT de câblage — les DEUX chemins
/// passent par le même site de fermeture — et non le pixel. Le pixel se vérifie
/// au simulateur, et c'est écrit dans l'issue.
///
/// **Le témoin porte sur les DEUX chemins**, parce qu'un correctif posé sur le
/// seul chemin custom laisserait les appareils iOS 26 avec le défaut intact —
/// et personne ne s'en apercevrait avant un retour terrain. C'est la forme du
/// § « Une garde d'admission se pose sur CHAQUE chemin » du CLAUDE.md gateway,
/// portée à une vue.
final class MessageMenuKeyboardDismissTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(relativePath))
    }

    private static let list = "Meeshy/Features/Main/Views/MessageListView.swift"
    private static let helper = "Meeshy/Features/Main/Views/MessageMenuKeyboard.swift"

    func test_leSiteDeFermeture_existe_etRelacheLePremierRepondeur() throws {
        let src = try source(Self.helper)

        XCTAssertTrue(
            src.contains("resignFirstResponder"),
            "Le site de fermeture doit relâcher le premier répondeur — c'est la seule façon de "
                + "refermer le clavier sans savoir QUI le détient (champ du composeur, recherche, légende)."
        )
        XCTAssertTrue(
            src.contains("enum MessageMenuKeyboard"),
            "La fermeture vit dans UN site nommé, pas recopiée à chaque geste : c'est ce qui "
                + "permet au témoin ci-dessous de vérifier les deux chemins par le même nom."
        )
    }

    func test_cheminCustom_avantIOS26_fermeLeClavierAvantDOuvrirSonMenu() throws {
        let src = try source(Self.list)
        let corps = try Self.corpsDe("struct ConditionalBubbleLongPress", dans: src)

        XCTAssertTrue(
            corps.contains("MessageMenuKeyboard.dismiss()"),
            "Le geste custom (< iOS 26) présente un menu en surcouche : sans fermeture, il "
                + "s'ouvre derrière le clavier."
        )
    }

    func test_cheminNatif_iOS26_fermeLeClavierQuandLApercuParait() throws {
        let src = try source(Self.list)
        let corps = try Self.corpsDe("struct MessageMenuPreviewContainer", dans: src)

        XCTAssertTrue(
            corps.contains("MessageMenuKeyboard.dismiss()"),
            "Le `.contextMenu` natif n'offre aucun rappel de présentation ; son APERÇU, lui, "
                + "paraît exactement quand le menu s'ouvre. C'est le seul point du chemin natif "
                + "qui se déclenche à l'ouverture RÉELLE, jamais sur un appui annulé."
        )
    }

    /// Le corps d'une déclaration, borné par SES accolades — jamais par un
    /// nombre de caractères, qu'une fenêtre fixe ferait déborder sur la
    /// déclaration voisine (même raison que `MediaGalleryStagePresentationTests`).
    private static func corpsDe(_ marqueur: String, dans source: String) throws -> String {
        guard let début = source.range(of: marqueur) else {
            throw XCTSkip("marqueur introuvable : \(marqueur)")
        }
        guard let ouvrante = source[début.lowerBound...].firstIndex(of: "{") else {
            throw XCTSkip("accolade ouvrante introuvable pour \(marqueur)")
        }
        var profondeur = 0
        var index = ouvrante
        while index < source.endIndex {
            if source[index] == "{" { profondeur += 1 }
            if source[index] == "}" {
                profondeur -= 1
                if profondeur == 0 { return String(source[ouvrante...index]) }
            }
            index = source.index(after: index)
        }
        throw XCTSkip("accolade fermante introuvable pour \(marqueur)")
    }
}
