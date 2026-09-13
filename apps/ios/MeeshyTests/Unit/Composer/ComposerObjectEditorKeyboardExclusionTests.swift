import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le clavier du canvas et le panneau d'options s'excluent** (#6156 —
/// directive porteur 2026-09-12, capture à l'appui ; cas 2 et 3 de #6132).
///
/// > « Ici on a clairement une composition visuelle non désirée ! C'est soit le
/// > clavier soit les choix de police… Pour avoir le clavier il faut toucher le
/// > texte en édition, et si on veut changer le style ça enlève le focus. »
///
/// ## L'exception est le cœur du lot, pas un détail
///
/// Écrite « clavier levé ⇒ range le panneau », la règle aurait retiré sous le
/// doigt le champ de ⌾ DÉCRIRE au moment même où l'auteur le touche. C'est le
/// défaut que #5083 a déjà payé sur CET écran — un champ de saisie à y=884 sur
/// un écran de 874 points, décrit par l'arbre d'accessibilité et atteignable par
/// aucun doigt.
///
/// > Le prédicat porte donc sur ce que la section POSSÈDE, jamais sur l'état du
/// > clavier. Les témoins ci-dessous vérifient les deux moitiés : que la règle
/// > s'applique là où elle doit, et qu'elle s'ARRÊTE là où elle nuirait.
final class ComposerObjectEditorKeyboardExclusionTests: XCTestCase {

    /// Toutes les sections réellement atteignables, balayées par FAMILLE —
    /// jamais une liste écrite à la main, qui se périmerait au premier outil
    /// ajouté sans que rien ne rougisse.
    private var toutesLesSections: [ComposerObjectEditorSection] {
        MeeshySceneObject.Kind.allCases.flatMap { ComposerObjectEditorRail.entries(for: $0) }
    }

    // MARK: - Le prédicat

    /// **Une seule section possède son champ**, et le balayage le prouve sur
    /// l'ensemble réel plutôt que sur l'exemple choisi.
    func test_uneSeuleSection_porteSonPropreChamp() {
        let porteuses = toutesLesSections.filter { ComposerObjectEditorRail.ownsTextField($0) }
        XCTAssertEqual(Set(porteuses), [.media(.altText)],
                       "⌾ DÉCRIRE est la seule section dont le clavier sert un champ INTÉRIEUR (#6156).")
    }

    /// **La liste balayée n'est pas vide** — sans ce témoin, un `entries(for:)`
    /// qui rendrait `[]` ferait passer le précédent en trouvant zéro porteuse
    /// dans zéro section.
    func test_leBalayage_voitDesSections() {
        XCTAssertGreaterThan(toutesLesSections.count, 5,
                             "Le balayage doit voir les sections réelles, sinon il ne prouve rien.")
    }

    /// **Le clavier monte ⇒ on range**, sauf là où il sert le panneau lui-même.
    func test_leClavierQuiMonte_rangeLePanneau_saufDecrire() {
        XCTAssertFalse(ComposerObjectEditorRail.collapsesWhenKeyboardRises(.media(.altText)),
                       "DÉCRIRE garde son panneau : le clavier y sert SON champ (#5083).")
        for section in toutesLesSections where section != .media(.altText) {
            XCTAssertTrue(ComposerObjectEditorRail.collapsesWhenKeyboardRises(section),
                          "\(section) doit céder le bas au clavier du canvas (#6156).")
        }
    }

    /// **Choisir un outil rend le clavier**, même exception.
    ///
    /// Jumelle voulue de la précédente : une exclusion qui ne vaudrait que dans
    /// un sens laisserait l'état interdit se former par l'autre porte — c'est
    /// exactement la composition que la capture montre.
    func test_choisirUnOutil_rendLeClavier_saufDecrire() {
        XCTAssertFalse(ComposerObjectEditorRail.dismissesKeyboard(afterTapping: .media(.altText)),
                       "Ouvrir DÉCRIRE ne doit pas rendre le clavier qu'on va y utiliser.")
        for section in toutesLesSections where section != .media(.altText) {
            XCTAssertTrue(ComposerObjectEditorRail.dismissesKeyboard(afterTapping: section),
                          "\(section) rend le clavier en s'ouvrant (#6156).")
        }
    }

    // MARK: - Le BRANCHEMENT, qu'aucune valeur ne voit

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(chemin))
    }

    private func compact(_ s: String) -> String { s.filter { !$0.isWhitespace } }

    /// **Une règle juste que personne n'appelle ne corrige rien.** Les deux
    /// sites d'appel sont la seule chose qui relie le prédicat à l'écran.
    func test_lesDeuxSensSontBranches() throws {
        let code = compact(try source("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift"))
        XCTAssertTrue(code.contains("ComposerObjectEditorRail.dismissesKeyboard(afterTapping:entree)"),
                      "Le rail doit CONSULTER la règle avant d'ouvrir un panneau (#6156).")
        XCTAssertTrue(code.contains(".excludingOptionsWhileTyping("),
                      "Le sens « le clavier monte » doit être monté sur le body (#6156).")
        XCTAssertTrue(code.contains("section:selectedTool"),
                      "L'exclusion doit recevoir la section OUVERTE — sans elle, l'exception de DÉCRIRE ne peut pas jouer.")
    }

    /// **Le geste de rendre le clavier a DEUX appelants.** Il en avait un seul,
    /// inline dans `yieldScreenToScene` ; l'extraire sans le rebrancher aurait
    /// laissé le rail muet.
    func test_rendreLeClavier_aDeuxAppelants() throws {
        let code = try source("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift")
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "yieldKeyboard", in: code), 3,
                       "Sa déclaration et ses DEUX appelants — le rail et le geste qui rend l'écran.")
    }

    /// Sans elle, les gardes de source ci-dessus sont vertes par omission.
    func test_lesGardesLisentUneSourceNonVide() throws {
        XCTAssertGreaterThan(try source("Meeshy/Features/Main/Composer/ComposerObjectEditorView.swift").count,
                             5000, "La source de l'éditeur est vide ou introuvable.")
    }
}
