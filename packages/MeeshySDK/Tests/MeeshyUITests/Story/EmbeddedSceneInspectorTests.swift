import XCTest
import SwiftUI
@testable import MeeshyUI
import MeeshySDK

/// **Lot 3A du composer unifié (#4035) — la zone contextuelle INSPECTEUR.**
///
/// `EmbeddedSceneInspector` monte le premier contrôle réel de l'état
/// INSPECTEUR (planche P4 §3) — le panneau filtres — sur le MÊME
/// `StoryComposerViewModel` que l'atelier, SANS jamais référencer sa coquille
/// plein écran (`StoryComposerView` / `ComposerControlsLayer` /
/// `ComposerBottomBand` / `ComposerToolPanelHost`). Deux familles de preuves :
/// 1. le modèle est bien PARTAGÉ (jamais une jumelle divergente) ;
/// 2. la SOURCE ne recouple rien à la coquille — garde NÉGATIVE, prouvée
///    rouge avant d'être verte (voir le journal de la tâche).
@MainActor
final class EmbeddedSceneInspectorTests: XCTestCase {

    func test_init_sharesTheSameViewModelInstance_neverACopy() throws {
        let viewModel = StoryComposerViewModel()
        let inspector = try XCTUnwrap(EmbeddedSceneInspector(viewModel: viewModel, kind: .media))
        XCTAssertTrue(inspector.viewModel === viewModel,
            "L'inspecteur doit lire/muter LE MÊME modèle que l'atelier — une copie serait la jumelle "
                + "divergente que le dépôt interdit (publication, reader et export doivent rester d'accord "
                + "sur ce qu'EST la story).")
    }

    // MARK: - Loi 4 — l'ABSENCE est portée par l'init, pas par l'appelant

    /// Le seul kind que ce lot sert : la planche range les 8 filtres à
    /// l'« Inspecteur média » (§ P7).
    func test_init_servesTheMediaSelection() {
        XCTAssertNotNil(EmbeddedSceneInspector(viewModel: StoryComposerViewModel(), kind: .media),
            "Une sélection média doit servir le panneau filtres — c'est le seul contrôle du lot 3A.")
    }

    /// **Garde négative — le cœur de la loi 4.** Un kind dont AUCUN contrôle
    /// n'est servi ne doit pas pouvoir produire une zone : sinon l'écran
    /// peindrait, sous une sélection de TEXTE, les contrôles d'un média —
    /// « les contrôles de l'objet courant, EUX SEULS » (planche P4 §3).
    /// Elle rougit dès qu'on relâche le `guard kind == .media` de l'`init?`.
    func test_init_refusesEverySelectionItServesNoControlFor() {
        let unserved: [StoryCanvasUIView.CanvasItemKind?] = [nil, .text, .sticker, .place]
        for kind in unserved {
            XCTAssertNil(EmbeddedSceneInspector(viewModel: StoryComposerViewModel(), kind: kind),
                "`EmbeddedSceneInspector` s'est construit pour la sélection \(String(describing: kind)), "
                    + "dont ce lot ne sert AUCUN contrôle — la zone montrerait les contrôles d'un AUTRE "
                    + "objet que celui sélectionné (loi 4 + planche P4 §3).")
        }
    }

    // MARK: - Garde négative — isolation de la coquille plein écran

    private func inspectorSource() throws -> String {
        try ComposerSourceGuard.source("EmbeddedSceneInspector.swift")
    }

    /// Garde-fou de la garde : sans lui, un chemin devenu faux ferait passer
    /// toutes les assertions ci-dessous sur une chaîne vide.
    func test_theGuardReadsANonEmptySource() throws {
        let code = try inspectorSource()
        XCTAssertGreaterThan(code.count, 50,
            "La source de `EmbeddedSceneInspector` est introuvable ou vide — la garde ne mesurerait RIEN.")
        XCTAssertTrue(code.contains("struct EmbeddedSceneInspector"),
            "Le fichier lu n'est pas celui de l'inspecteur.")
    }

    private static let forbiddenShellTypeNames = [
        "ComposerToolPanelHost",
        "ComposerBottomBand",
        "ComposerControlsLayer",
    ]

    /// Tant que le composer unifié est en bêta, la surface document ne doit
    /// RIEN pouvoir casser de l'atelier plein écran (encore atteignable par
    /// d'autres portes — tray stories « + »). La preuve n'est pas une
    /// promesse de doc-comment (qui, elle, CITE ces symboles pour
    /// s'expliquer — d'où `ComposerSourceGuard.stripComments`, dont
    /// `source(_:)` retire déjà les commentaires avant de rendre le code) :
    /// c'est l'ABSENCE de toute référence de CODE à la coquille.
    func test_doesNotReference_theFullScreenShellTypes() throws {
        let code = try inspectorSource()
        for forbidden in Self.forbiddenShellTypeNames {
            XCTAssertFalse(code.contains(forbidden),
                "`EmbeddedSceneInspector` référence `\(forbidden)` en CODE — un recouplage à la coquille "
                    + "plein écran que la bêta du composer unifié interdit (arbitrage porteur, lot 3A).")
        }
    }

    /// `StoryComposerView` (la coquille) est interdit ; `StoryComposerViewModel`
    /// (le modèle PARTAGÉ, volontairement lu/muté par cette vue) et
    /// `StoryComposerCanvasView` (le rendu canvas partagé, Phase 1) restent
    /// permis — d'où un test de FRONTIÈRE DE MOT, pas une simple sous-chaîne
    /// (`"StoryComposerView"` est un préfixe des deux).
    func test_doesNotReference_theBareShellView_butKeepsTheSharedModel() throws {
        let code = try inspectorSource()
        XCTAssertTrue(code.contains("StoryComposerViewModel"),
            "L'inspecteur doit lire/muter LE MÊME modèle que l'atelier — jamais une jumelle divergente.")

        let pattern = "\\bStoryComposerView\\b"
        let regex = try NSRegularExpression(pattern: pattern)
        let range = NSRange(code.startIndex..., in: code)
        XCTAssertNil(regex.firstMatch(in: code, range: range),
            "`EmbeddedSceneInspector` référence le type `StoryComposerView` (la coquille plein écran) — "
                + "recouplage interdit tant que le composer unifié est en bêta.")
    }
}
