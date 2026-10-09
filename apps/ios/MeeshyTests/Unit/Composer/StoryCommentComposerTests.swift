import XCTest
import MeeshySDK
@testable import Meeshy

// **Recette staging du 2026-10-09** (build `523b9dab43`) : trois défauts de la
// zone d'attachement — la photo d'un commentaire de story partait sans elle
// (#9743), la story filait pendant qu'on choisissait la pièce (#9821), et la
// barre de la conversation rangeait les pièces dans l'ordre où leur
// préparation finissait (#9776).

private enum StoryComposerSource {
    static func read(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent(relative), encoding: .utf8))
    }

    static func storyComposer() throws -> String {
        try read("Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerBar.swift")
    }
}

// MARK: - Un commentaire de story part AVEC sa pièce (#9743)

@MainActor
final class StoryCommentSendsItsPieceTests: XCTestCase {

    /// La barre ne connaît pas la zone de la story : ses pièces internes sont
    /// vides. Les transmettre envoyait le texte seul (`pièces=0`).
    func test_theStoryComposer_sendsFromItsZone_neverFromTheBarCopy() throws {
        let source = try StoryComposerSource.storyComposer()
        XCTAssertFalse(source.contains("submitStoryComment(text: text, attachments: attachments)"),
                       "La copie de la barre est vide : la photo partait sans elle.")
        XCTAssertTrue(source.contains("externalAttachments: commentAttachments"),
                      "Sans la zone, la barre refuse un envoi sans texte : une photo seule ne partait pas.")
        let submit = try XCTUnwrap(source.range(of: "private func submitStoryComment("))
        let body = source[submit.lowerBound...]
        XCTAssertTrue(body.contains("let staged = commentAttachments"), "La zone de la story fait foi.")
        XCTAssertTrue(body.contains("CommentComposerStaging.firstPendingMedia(in: staged)"),
                      "Le média part de la zone, lue avant d'être vidée.")
    }

    /// Le modèle de la feuille du fil (8cc2623a0d) : décider, puis vider.
    func test_theStoryComposer_decidesBeforeClearing() throws {
        let source = try StoryComposerSource.storyComposer()
        let submit = try XCTUnwrap(source.range(of: "private func submitStoryComment("))
        let body = String(source[submit.lowerBound...])
        let gate = try XCTUnwrap(body.range(of: "CommentSendGate.decide(text: trimmed, zone: staged"))
        let clear = try XCTUnwrap(body.range(of: "commentAttachments = []"))
        XCTAssertLessThan(gate.lowerBound, clear.lowerBound, "La décision précède le vidage du composeur.")
        XCTAssertFalse(body.contains("stillLoading"),
                       "Vider en gardant les pièces en préparation effaçait la pièce PRÊTE.")
    }

    /// Ce que la story enverrait pour une photo prête sans texte : la pièce.
    func test_aReadyPhoto_withoutText_leavesWithIt() {
        let photo = ComposerAttachment(id: "photo", type: .image, name: "photo",
                                       url: URL(fileURLWithPath: "/tmp/photo.jpg"))
        XCTAssertEqual(CommentSendGate.decide(text: "", zone: [photo], hasPlace: false), .send(pieceIds: ["photo"]))
        XCTAssertNotNil(CommentComposerStaging.firstPendingMedia(in: [photo]))
    }
}

// MARK: - La story attend pendant qu'une pièce se compose (#9821)

@MainActor
final class StoryComposerHoldTests: XCTestCase {

    func test_nothingBeingComposed_letsTheStoryPlay() {
        XCTAssertFalse(StoryComposerHold.holds(barHasContent: false, zoneHasPieces: false,
                                               attachmentPanelOpen: false, pickerPresented: false))
    }

    func test_theAttachmentPanelOpen_holdsTheStory() {
        XCTAssertTrue(StoryComposerHold.holds(barHasContent: false, zoneHasPieces: false,
                                              attachmentPanelOpen: true, pickerPresented: false))
    }

    func test_aPickerPresented_holdsTheStory() {
        XCTAssertTrue(StoryComposerHold.holds(barHasContent: false, zoneHasPieces: false,
                                              attachmentPanelOpen: false, pickerPresented: true))
    }

    /// La pièce choisie revient dans la zone, la barre n'en sait rien : sans
    /// texte, elle disait « vide » et la story repartait.
    func test_aPieceInTheZone_holdsTheStory() {
        XCTAssertTrue(StoryComposerHold.holds(barHasContent: false, zoneHasPieces: true,
                                              attachmentPanelOpen: false, pickerPresented: false))
    }

    func test_text_stillHoldsTheStory() {
        XCTAssertTrue(StoryComposerHold.holds(barHasContent: true, zoneHasPieces: false,
                                              attachmentPanelOpen: false, pickerPresented: false))
    }

    /// Le lecteur ne lit qu'UN drapeau : il doit être ALIMENTÉ par la règle,
    /// et la règle par le panneau et par chacun des sélecteurs.
    func test_theStoryComposer_feedsThePauseFromTheRule() throws {
        let source = try StoryComposerSource.storyComposer()
        XCTAssertTrue(source.contains(".adaptiveOnChange(of: holdsStory) { _, holds in hasComposerContent = holds }"),
                      "Le drapeau du lecteur doit suivre la règle, pas seulement le texte de la barre.")
        XCTAssertFalse(source.contains("hasComposerContent = hasContent"),
                       "Le contenu de la barre n'est qu'UNE des causes.")
        XCTAssertTrue(source.contains("onAttachmentsVisibilityChange: { open in attachmentPanelOpen = open }"),
                      "La fermeture du panneau doit relâcher la story, quelle qu'en soit la cause.")
        XCTAssertTrue(source.contains("pickerPresented: showCommentPhotoPicker || showCommentFilePicker || showCommentLocationPicker"),
                      "Chaque sélecteur présenté doit tenir la story.")
    }

    /// La barre dit l'ouverture ET la fermeture du panneau, quelle qu'en soit
    /// la cause — frappe, focus, envoi referment le panneau sans passer par
    /// `showAttachmentCarousel`.
    func test_theBar_reportsEveryPanelVisibilityChange() throws {
        let layout = try StoryComposerSource.read("Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift")
        XCTAssertTrue(layout.contains(".adaptiveOnChange(of: showAttachOptions) { _, open in onAttachmentsVisibilityChange?(open) }"))
    }
}

// MARK: - La zone garde l'ordre de la sélection (#9776)

@MainActor
final class PreparationTrackingOrderTests: XCTestCase {

    private func piece(_ id: String) -> MessageAttachment {
        MessageAttachment(id: id, mimeType: "image/jpeg")
    }

    /// Sélection 3,1,5,2,4 ; préparations finies dans l'ordre 4,2,3,1,5.
    /// Avant le correctif, la barre montrait 4,2,3,1,5.
    func test_piecesFinishingOutOfOrder_keepTheSelectionOrder() {
        let selection = ["3", "1", "5", "2", "4"]
        let selectedBefore = Dictionary(uniqueKeysWithValues: selection.enumerated().map { index, id in
            (id, Set(selection.prefix(index)))
        })
        let zone = ["4", "2", "3", "1", "5"].reduce([MessageAttachment]()) { zone, id in
            PreparationTracking.placed(piece(id), in: zone, selectedBefore: selectedBefore[id] ?? [])
        }
        XCTAssertEqual(zone.map(\.id), selection)
    }

    /// Une pièce choisie APRÈS, par un autre chemin (fichier, collage), reste
    /// derrière celle qui se préparait déjà.
    func test_aPieceAddedLater_staysBehind() {
        let zone = PreparationTracking.placed(piece("photo"), in: [piece("avant"), piece("fichier")],
                                              selectedBefore: ["avant"])
        XCTAssertEqual(zone.map(\.id), ["avant", "photo", "fichier"])
    }

    /// Une pièce retirée de la zone pendant la préparation ne déplace rien.
    func test_aRemovedPredecessor_placesAfterTheLastOneStillThere() {
        let zone = PreparationTracking.placed(piece("c"), in: [piece("a"), piece("d")],
                                              selectedBefore: ["a", "b"])
        XCTAssertEqual(zone.map(\.id), ["a", "c", "d"])
    }

    func test_track_reservesThePlaceAtSelection() throws {
        let source = try StoryComposerSource.read("Meeshy/Features/Main/Services/PreparationTracking.swift")
        let reserve = try XCTUnwrap(source.range(of: "let selectedBefore = Set("))
        let append = try XCTUnwrap(source.range(of: "preparing.wrappedValue.append(prep)"))
        XCTAssertLessThan(reserve.lowerBound, append.lowerBound, "La place se lit AVANT que la pièce rejoigne la zone.")
        XCTAssertFalse(source.contains("attachments.wrappedValue.append("),
                       "Ajouter à la fin rangeait les pièces dans l'ordre où leur préparation finissait.")
    }
}
