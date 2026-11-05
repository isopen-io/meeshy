import XCTest
import SwiftUI
@testable import MeeshyUI

/// S5 — la page blanche d'auteur, côté VUE.
///
/// Deux familles d'assertions, délibérément séparées :
///
/// 1. **Rendu** — tout ce qui est une propriété de la vue est prouvé par le
///    rendu, jamais par un `contains` : une garde de source qui cherche
///    `minHeight: 44` dans un fichier de 1 400 lignes ne peut pas dire SUR QUOI
///    il porte, et un refactor d'extraction la rend verte pour de mauvaises
///    raisons (cf. mémoire projet, `feedback_extract_refactor_breaks_source_
///    guard_tests`).
/// 2. **Garde de source** — restreinte à ce qu'elle SEULE peut prouver : la
///    disparition d'un symbole, l'absence d'un appel, une parité de comptes.
@MainActor
final class StoryComposerBlankCanvasTests: XCTestCase {

    private func measured(_ view: some View, width: CGFloat = 320) -> CGSize {
        let host = UIHostingController(rootView: view)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.sizeThatFits(
            in: CGSize(width: width, height: CGFloat.greatestFiniteMagnitude))
    }

    // MARK: - Rendu

    // MARK: - Gardes de source

    func test_theBackgroundTapNeverTogglesAFlagDirectly() throws {
        for (path, code) in try ComposerSourceGuard.allStorySources() {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: "areFabsVisible", in: code), 0,
                "\(path) : le tap sur le fond passe par la politique, jamais par un drapeau basculé à la main."
            )
        }
    }

}
