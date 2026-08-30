import XCTest
import SwiftUI
@testable import Meeshy

/// **`1a` (#4071) — la rangée d'entrées porte ses libellés À L'ÉCRAN, pas
/// seulement dans l'arbre d'accessibilité.**
///
/// La capture cible `1a` dessine six tuiles, chacune avec son libellé VISIBLE
/// sous l'icône (`PHOTO`, `CAMÉRA`, `EMOJI`, `DOC`, `LIEU`, `MICRO`). Le réel
/// mesuré le 2026-08-30 sur Meeshy-iOS26 ne rendait que huit glyphes nus : les
/// libellés existaient — traduits en sept langues — mais **uniquement en
/// `accessibilityLabel`**. Ils étaient donc LUS par VoiceOver et jamais VUS.
///
/// C'est la loi 12 prise au mot : *« l'utilisateur a-t-il DÛ comprendre quelque
/// chose pour s'en servir ? »*. Un glyphe nu fait deviner — et deviner entre
/// `paperclip` et `photo`, ou entre `mappin.and.ellipse` et `mic`, n'est pas
/// une devinette théorique : ce sont les deux paires que la rangée pose côte à
/// côte.
///
/// ## Ce que ce fichier NE mesure pas
///
/// Le jeu de symboles, son rendu hiérarchique et son rebond sont déjà gardés
/// par `ComposerToolIconsTests` — les redoubler ici ferait deux gardes pour une
/// règle, et c'est la divergence qu'on paie ensuite. Ce fichier ne pose qu'une
/// question : **le libellé est-il rendu ?**
@MainActor
final class ComposerToolLabelTests: XCTestCase {

    private func compact(_ text: String) -> String {
        AppSourceGuard.stripComments(text)
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Retire les appels `.accessibilityLabel(…)`, parenthèses équilibrées.**
    ///
    /// Sans ce retrait, toute garde qui cherche `Text(ComposerDocumentCopy.label(tool))`
    /// se valide TOUTE SEULE : cette chaîne est une sous-chaîne exacte de
    /// `.accessibilityLabel(Text(ComposerDocumentCopy.label(tool)))`, qui vit déjà
    /// dans la source. La première version de ce fichier est passée au VERT sur un
    /// corps qui ne rendait aucun libellé — mesuré, pas supposé.
    ///
    /// La leçon est plus large que ce fichier : **une garde de source qui cherche
    /// un fragment doit d'abord retirer les contextes où ce fragment a un AUTRE
    /// sens.** Un `Text` dans une étiquette d'accessibilité et un `Text` dans un
    /// corps sont deux choses différentes que le texte brut ne distingue pas.
    private func withoutAccessibilityLabels(_ compacted: String) -> String {
        let marker = ".accessibilityLabel("
        var out = compacted
        while let start = out.range(of: marker) {
            var depth = 0
            var index = out.index(before: start.upperBound)   // sur la parenthèse ouvrante
            var end: String.Index?
            while index < out.endIndex {
                if out[index] == "(" { depth += 1 }
                if out[index] == ")" {
                    depth -= 1
                    if depth == 0 { end = out.index(after: index); break }
                }
                index = out.index(after: index)
            }
            guard let end else { break }
            out.removeSubrange(start.lowerBound..<end)
        }
        return out
    }

    // 1 — le libellé est un `Text` du CORPS, pas seulement un attribut d'a11y.
    //
    // Garde POSITIVE, délibérément : elle rougit le jour où quelqu'un retire le
    // `Text`. Une garde négative (« ne contient pas … ») passerait au vert en
    // perdant sa protection, ce que le dépôt a déjà payé (leçon 464).
    func test_chaqueEntree_rendSonLibelleVisible() throws {
        let src = withoutAccessibilityLabels(compact(try AppSourceGuard.composerSurfaceSource()))
        XCTAssertTrue(
            src.contains("Text(ComposerDocumentCopy.label(tool))"),
            "La rangée doit RENDRE le libellé de chaque outil dans son corps "
                + "(`Text(ComposerDocumentCopy.label(tool))`), étiquettes d'accessibilité retirées de "
                + "la source avant de chercher. Le trouver uniquement en `accessibilityLabel` signifie "
                + "qu'il est lu par VoiceOver et jamais vu à l'écran — exactement l'état mesuré sur "
                + "`1a` le 2026-08-30."
        )
    }

    // 1 bis — le retrait fonctionne. Sans ce témoin, une régression du
    // « stripper » rendrait la garde nº1 muette sans que rien ne rougisse : elle
    // chercherait dans une source dont plus rien n'a été retiré.
    func test_leRetraitDesEtiquettes_enleveBienLeurContenu() {
        let sample = "Button{}label:{Image()}.accessibilityLabel(Text(ComposerDocumentCopy.label(tool)))"
        XCTAssertFalse(
            withoutAccessibilityLabels(sample).contains("ComposerDocumentCopy.label"),
            "Le retrait doit emporter le CONTENU de l'étiquette, parenthèses équilibrées comprises — "
                + "sinon la garde nº1 se valide toute seule, ce qui est arrivé."
        )
        XCTAssertTrue(
            withoutAccessibilityLabels(sample).contains("Image()"),
            "Le retrait ne doit emporter QUE l'étiquette — pas ce qui l'entoure."
        )
    }

    // 2 — et il reste ANNONCÉ : rendre le texte ne dispense pas de l'étiquette,
    // qui garde le bouton comme UN seul élément pour VoiceOver au lieu de deux.
    func test_leLibelleVisible_neRemplacePas_lEtiquetteDAccessibilite() throws {
        let src = compact(try AppSourceGuard.composerSurfaceSource())
        XCTAssertTrue(
            src.contains(".accessibilityLabel(Text(ComposerDocumentCopy.label(tool)))"),
            "L'étiquette d'accessibilité doit SURVIVRE au libellé visible : sans elle, le bouton se "
                + "décompose en deux éléments (l'icône, puis le texte) et VoiceOver annonce le nom du "
                + "symbole SF avant le mot."
        )
    }

    // 3 — le libellé est du TEXTE, donc il se mesure au seuil AA du texte
    // (4,5:1), pas au seuil composant (3:1) qui suffisait aux icônes seules.
    func test_laTeinteDesLibelles_passeAAtexte_surChaquePlateau() {
        let foreground = MeeshyColors.textSecondary(isDark: true)
        for tint in PlateauTint.allCases {
            let ratio = WCAGContrast.ratioOfTranslucentForeground(foreground, on: tint.color)
            XCTAssertGreaterThanOrEqual(
                ratio, 4.5,
                "Les libellés d'outils (`textSecondary`) sur le plateau \(tint.rawValue) mesurent "
                    + "\(WCAGContrast.fmt(ratio)):1 — sous AA texte (4,5:1). Une icône passe à 3:1 ; "
                    + "un mot, non."
            )
        }
    }

    // 4 — le libellé suit Dynamic Type. Une taille en points figée le rendrait
    // illisible aux paliers accessibles, sur la seule surface où l'utilisateur
    // doit LIRE pour choisir sa porte.
    func test_leLibelle_suitDynamicType() throws {
        let src = withoutAccessibilityLabels(compact(try AppSourceGuard.composerSurfaceSource()))
        XCTAssertTrue(
            src.contains("Text(ComposerDocumentCopy.label(tool)).font(.caption"),
            "Le libellé doit porter un style de police SÉMANTIQUE (`.caption2`/`.caption`), qui "
                + "échelonne avec Dynamic Type. Une taille en POINTS figée (`.font(.system(size: 10))`) "
                + "l'ignore — sur la seule surface où l'utilisateur doit LIRE pour choisir sa porte. "
                + "Garde POSITIVE : elle rougit si la police devient figée, là où un « ne contient pas "
                + "…system(size:… » passerait au vert en ne protégeant plus rien."
        )
    }

    // 5 — les sept outils ont tous un libellé non vide. Une entrée dont le mot
    // manque rendrait une tuile muette, pire qu'un glyphe nu : elle laisserait
    // un trou là où les voisines expliquent.
    func test_lesSeptOutils_ontTousUnLibelleNonVide() {
        for tool in ComposerDocumentTool.allCases {
            let label = ComposerDocumentCopy.label(tool)
            XCTAssertFalse(
                label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                "L'outil `\(tool.rawValue)` n'a pas de libellé : sa tuile serait muette au milieu de "
                    + "voisines qui expliquent."
            )
        }
    }
}
