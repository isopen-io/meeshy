import XCTest
import SwiftUI
@testable import MeeshyUI

/// Chips « Fichiers » / « Bibliothèque » de la feuille d'enregistrement audio
/// du composer story (directive user 2026-08-02).
///
/// Le panneau Son ouvre la feuille d'enregistrement DIRECTEMENT sur une slide
/// vierge (`ComposerToolPanelHost.audioPanel.onAppear`) : sans chips embarquées,
/// les deux autres sources d'audio — l'import Fichiers et la bibliothèque de
/// sons — étaient inatteignables depuis l'endroit où l'utilisateur atterrit.
///
/// Même doctrine que `StoryComposerBlankCanvasTests` : le rendu prouve ce qui
/// est une propriété de la vue, les gardes de source se limitent à ce qu'elles
/// seules peuvent prouver (câblage, séquencement, purge d'état).
@MainActor
final class StoryVoiceRecorderSourceChipsTests: XCTestCase {

    private func measured(_ view: some View, width: CGFloat = 320) -> CGSize {
        let host = UIHostingController(rootView: view)
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.sizeThatFits(
            in: CGSize(width: width, height: CGFloat.greatestFiniteMagnitude))
    }

    // MARK: - Rendu

    // MARK: - Routage après fermeture (helper pur)

    // MARK: - Gardes de source

    /// Pendant l'enregistrement, changer de source n'a pas de sens et le tap
    /// perdrait la prise en cours (le dismiss annule le micro) : les chips
    /// n'existent que hors enregistrement, structurellement.
    func test_theRecorderMountsTheChipsOnlyOutsideARecording() throws {
        // La feuille d'enregistrement est UNIFIÉE (stories + posts/réels) depuis
        // 2026-08-13 : elle vit dans `MeeshyUI/Media`, la garde la suit.
        let code = try ComposerSourceGuard.source("../Media/AudioRecorderSheet.swift")
        let gated = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "if !recorder.isRecording", in: code),
            "Le gate hors-enregistrement des chips a disparu.")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "AudioRecorderSourceChips(", in: code),
            ComposerSourceGuard.occurrences(of: "AudioRecorderSourceChips(", in: gated),
            "Un montage des chips vit hors du gate : il resterait tapable mid-recording."
        )
        XCTAssertGreaterThan(
            ComposerSourceGuard.occurrences(of: "AudioRecorderSourceChips(", in: gated), 0,
            "L'assertion de parité ci-dessus ne vaut que si les chips sont encore montées."
        )
    }

}
