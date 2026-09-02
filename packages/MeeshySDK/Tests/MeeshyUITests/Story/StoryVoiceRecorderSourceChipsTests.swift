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

    func test_sourceChips_meetTheFortyFourPointTouchTarget() {
        let size = measured(StoryVoiceRecorderSourceChips(
            onImportAudioFile: {}, onOpenSoundLibrary: {}))
        XCTAssertGreaterThanOrEqual(
            size.height, 44,
            "Les chips sont des portes de navigation, pas des décorations : 44 pt de zone de contact."
        )
    }

    func test_sourceChips_withoutAnyHandler_haveNoSurfaceAtAll() {
        let size = measured(StoryVoiceRecorderSourceChips(
            onImportAudioFile: nil, onOpenSoundLibrary: nil))
        XCTAssertEqual(
            size.height, 0, accuracy: 0.5,
            """
            Sans handler il n'y a rien à ouvrir : l'absence doit être STRUCTURELLE \
            (pas une rangée vide qui réserve de la place), pour que les call sites \
            existants du recorder restent identiques au pixel près.
            """
        )
    }

    func test_sourceChips_withASingleHandler_showOnlyThatDoor() {
        let both = measured(StoryVoiceRecorderSourceChips(
            onImportAudioFile: {}, onOpenSoundLibrary: {}))
        let filesOnly = measured(StoryVoiceRecorderSourceChips(
            onImportAudioFile: {}, onOpenSoundLibrary: nil))
        XCTAssertGreaterThan(
            both.width, filesOnly.width,
            "Chaque chip n'existe que si SA closure est fournie — pas de bouton mort."
        )
    }

    // MARK: - Routage après fermeture (helper pur)

    func test_recorderFollowUpDoors_openExactlyTheMatchingDoor() {
        let files = StoryComposerView.recorderFollowUpDoors(.audioFiles)
        XCTAssertTrue(files.audioFiles)
        XCTAssertFalse(files.soundLibrary, "Une seule porte à la fois : deux sheets simultanées se volent la présentation.")

        let library = StoryComposerView.recorderFollowUpDoors(.soundLibrary)
        XCTAssertTrue(library.soundLibrary)
        XCTAssertFalse(library.audioFiles)
    }

    func test_recorderFollowUpDoors_openNothingOnAPlainDismissal() {
        let doors = StoryComposerView.recorderFollowUpDoors(nil)
        XCTAssertFalse(doors.audioFiles)
        XCTAssertFalse(doors.soundLibrary)
    }

    // MARK: - Gardes de source

    /// Le séquencement sheet → sheet passe par `onDismiss` : poser le drapeau de
    /// la porte suivante PENDANT que la feuille recorder est encore montée fait
    /// perdre la présentation (deux sheets sur le même hôte). La garde ancre le
    /// câblage complet dans le corps de `sheetModifiers`.
    func test_theRecorderSheetWiresBothChipsAndSequencesThroughOnDismiss() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Media.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var sheetModifiers:", in: code),
            "`sheetModifiers` a disparu : les feuilles du composer ne sont plus montées.")

        for symbol in ["onImportAudioFile", "onOpenSoundLibrary",
                       ".audioFiles", ".soundLibrary", "recorderFollowUpDoors("] {
            XCTAssertTrue(
                body.contains(symbol),
                "« \(symbol) » manque au montage de la feuille recorder : une des deux portes est morte."
            )
        }
        XCTAssertGreaterThanOrEqual(
            ComposerSourceGuard.occurrences(of: "onDismiss", in: body), 1,
            "Le follow-up doit s'ouvrir APRÈS la fermeture de la feuille recorder, jamais pendant."
        )
    }

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

    /// Un reset du composer pendant qu'un follow-up est en attente ne doit pas
    /// laisser une porte fantôme s'ouvrir à la prochaine fermeture de la
    /// feuille recorder — même famille que les autres scratch states purgés là.
    func test_aComposerResetClearsThePendingFollowUp() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func resetLocalState(", in: code),
            "`resetLocalState` a disparu.")
        XCTAssertTrue(
            body.contains("recorderFollowUp = nil"),
            "Le follow-up survit au reset : la prochaine fermeture du recorder ouvrirait une porte fantôme."
        )
    }
}
