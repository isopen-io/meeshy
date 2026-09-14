import XCTest
import SwiftUI
@testable import MeeshyUI

/// LA LÉGENDE DÉPLIÉE ÉPOUSE SON TEXTE, et la traduction se pose entre elle et
/// son invite (#6504).
///
/// Directive porteur 2026-09-14, capture à l'appui : « les légendes doivent
/// être juste alignées au-dessus de see less, mais mettre entre les deux
/// l'icône de traduction ». Sur la capture, une légende de six lignes flottait
/// au milieu de l'écran et « see less » tombait tout en bas.
///
/// Le doc-comment du composant affirmait que la fenêtre défilante « se
/// dimensionne à son CONTENU, plafonnée à `maxExpandedHeight` ». Ce témoin
/// MESURE au lieu de le croire.
@MainActor
final class MediaCaptionOverlayFitTests: XCTestCase {

    private let largeur: CGFloat = 390
    private let plafond: CGFloat = 420

    private func hauteur(_ vue: some View) -> CGFloat {
        let hote = UIHostingController(rootView: vue)
        return hote.sizeThatFits(in: CGSize(width: largeur, height: 2000)).height
    }

    private func legende(_ texte: String, depliee: Bool) -> some View {
        MediaCaptionOverlay(caption: texte, isExpanded: depliee, maxExpandedHeight: plafond, onToggle: {})
    }

    /// Une légende COURTE dépliée : son bloc tient le texte et l'invite, pas le
    /// plafond. Si la fenêtre prenait toute la hauteur offerte, « voir moins »
    /// tomberait 420 pt sous une ligne de texte — le vide de la capture.
    func test_uneLegendeCourteDepliee_epouseSonTexte_pasLePlafond() {
        let courte = "Ce matin j'ai choisi la paix."

        let depliee = hauteur(legende(courte, depliee: true))

        XCTAssertLessThan(depliee, plafond / 2,
                          "La légende dépliée mesure \(depliee) pt pour une ligne : sa fenêtre prend le plafond (\(plafond) pt) au lieu de son texte.")
    }

    /// Une légende LONGUE dépliée ne dépasse jamais le plafond : elle défile.
    func test_uneLegendeLongueDepliee_restePlafonnee() {
        let longue = Array(repeating: "Pas ce qui arrange les autres, ce qui m'arrange moi.", count: 40).joined(separator: " ")

        let depliee = hauteur(legende(longue, depliee: true))

        XCTAssertLessThanOrEqual(depliee, plafond + 80,
                                 "La légende longue dépliée mesure \(depliee) pt : elle devrait défiler sous le plafond, invite comprise.")
    }

    // MARK: - L'emplacement de traduction

    private func source() throws -> String {
        ComposerSourceGuard.stripComments(
            try String(
                contentsOf: ComposerSourceGuard.packageRoot
                    .appendingPathComponent("Sources/MeeshyUI/Primitives/MediaCaptionOverlay.swift"),
                encoding: .utf8
            )
        )
    }

    private func corps(_ nom: String, dans code: String) throws -> String {
        let debut = try XCTUnwrap(code.range(of: "private var \(nom): some View"), "`\(nom)` introuvable.")
        let reste = String(code[debut.upperBound...])
        return reste.components(separatedBy: "\n    private ").first ?? reste
    }

    /// L'emplacement se rend APRÈS le texte et AVANT l'invite, dans les deux
    /// états : c'est « entre les deux » de la directive.
    func test_lEmplacement_seRendEntreLeTexteEtLInvite_dansLesDeuxEtats() throws {
        let code = try source()
        for etat in ["collapsedCaption", "expandedCaption"] {
            let bloc = try corps(etat, dans: code)
            let texte = try XCTUnwrap(bloc.range(of: "render("), "\(etat) : aucun texte rendu.")
            let emplacement = try XCTUnwrap(bloc.range(of: "accessory"), "\(etat) : l'emplacement de traduction n'est pas rendu.")
            let invite = try XCTUnwrap(bloc.range(of: "affordance("), "\(etat) : aucune invite.")
            XCTAssertLessThan(texte.lowerBound, emplacement.lowerBound, "\(etat) : l'emplacement précède le texte.")
            XCTAssertLessThan(emplacement.lowerBound, invite.lowerBound, "\(etat) : l'emplacement suit l'invite.")
        }
    }

    /// Optionnel : les quatre hôtes existants ne passent rien et ne changent pas.
    func test_lEmplacement_estOptionnel() throws {
        XCTAssertTrue(try source().contains("accessory: AnyView? = nil"),
                      "L'emplacement doit être facultatif, pour ne rien imposer aux hôtes qui n'en ont pas.")
    }
}
