import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

// **Joindre un média à un commentaire montre son aperçu, comme dans un
// message** (#9736), **et la galerie des commentaires garde le lien avec la
// zone** (#9697).

// MARK: - Le plafond de la zone

final class CommentAttachmentLimitTests: XCTestCase {

    func test_admitting_fillsInOrderUntilTheLimit_thenRefuses() {
        let outcome = CommentAttachmentLimit.admitting(["c", "d", "e"], into: ["a", "b"], limit: 4)
        XCTAssertEqual(outcome.staged, ["a", "b", "c", "d"])
        XCTAssertEqual(outcome.accepted, ["c", "d"])
        XCTAssertEqual(outcome.refused, ["e"])
        XCTAssertTrue(outcome.evicted.isEmpty)
    }

    func test_admitting_aFullZone_refusesEverything() {
        let outcome = CommentAttachmentLimit.admitting(["c"], into: ["a", "b"], limit: 2)
        XCTAssertEqual(outcome.staged, ["a", "b"])
        XCTAssertTrue(outcome.accepted.isEmpty)
        XCTAssertEqual(outcome.refused, ["c"])
    }

    func test_admitting_aSinglePieceZone_replacesWithTheLastComer() {
        let outcome = CommentAttachmentLimit.admitting(["b", "c"], into: ["a"], limit: 1)
        XCTAssertEqual(outcome.staged, ["c"])
        XCTAssertEqual(outcome.accepted, ["c"])
        XCTAssertEqual(outcome.evicted, ["a"])
        XCTAssertEqual(outcome.refused, ["b"])
    }

    func test_admitting_nothing_leavesTheZoneUntouched() {
        let outcome = CommentAttachmentLimit.admitting([String](), into: ["a"], limit: 1)
        XCTAssertEqual(outcome.staged, ["a"])
        XCTAssertTrue(outcome.evicted.isEmpty)
    }

    func test_theServerCeiling_isTheOneTheZoneApplies() {
        let incoming = (0..<(MAX_POST_MEDIA + 3)).map { "p\($0)" }
        let outcome = CommentAttachmentLimit.admitting(incoming, into: [], limit: MAX_POST_MEDIA)
        XCTAssertEqual(outcome.staged.count, MAX_POST_MEDIA)
        XCTAssertEqual(outcome.refused.count, 3)
    }
}

// MARK: - Le lien grille ↔ zone

final class CommentLibraryLinkTests: XCTestCase {

    func test_attachedAssetIds_followsTheLivePieces() {
        var link = CommentLibraryLink()
        link.link("A", to: "p1", liveAttachmentIds: ["p1"])
        link.link("B", to: "p2", liveAttachmentIds: ["p1", "p2"])
        XCTAssertEqual(link.attachedAssetIds(liveAttachmentIds: ["p1", "p2"]), ["A", "B"])
        XCTAssertEqual(link.attachedAssetIds(liveAttachmentIds: ["p2"]), ["B"], "Retirer une pièce libère sa tuile.")
        XCTAssertEqual(link.attachedAssetIds(liveAttachmentIds: []), [], "Un commentaire envoyé libère toute la grille.")
    }

    func test_link_prunesThePiecesThatLeftTheZone() {
        var link = CommentLibraryLink()
        link.link("A", to: "sent", liveAttachmentIds: ["sent"])
        link.link("B", to: "new", liveAttachmentIds: ["new"])
        XCTAssertEqual(link.links, ["new": "B"])
    }

    func test_deselected_removesWhatThePickerNoLongerReturns() {
        var link = CommentLibraryLink()
        link.link("A", to: "p1", liveAttachmentIds: ["p1"])
        link.link("B", to: "p2", liveAttachmentIds: ["p1", "p2"])
        link.pickerPreselection = ["A", "B"]
        XCTAssertEqual(link.deselected(returned: ["B", "C"], liveAttachmentIds: ["p1", "p2"]), ["p1"])
    }

    func test_preselectedAttached_keepsOnlyWhatIsBothJoinedAndPrimed() {
        XCTAssertEqual(
            RecentMediaAttachmentLink.preselectedAttached(attached: ["A", "B", "C"], preselection: ["A", "B", "X"]),
            ["A", "B"]
        )
    }

    func test_deselectedAttachmentIds_uncheckingEverything_removesEveryPreselectedPiece() {
        let removed = RecentMediaAttachmentLink.deselectedAttachmentIds(
            links: ["p1": "A", "p2": "B"], liveAttachmentIds: ["p1", "p2"],
            preselected: ["A", "B"], returned: [])
        XCTAssertEqual(removed, ["p1", "p2"])
    }

    func test_deselectedAttachmentIds_withoutPreselection_removesNothing() {
        let removed = RecentMediaAttachmentLink.deselectedAttachmentIds(
            links: ["p1": "A"], liveAttachmentIds: ["p1"], preselected: [], returned: [])
        XCTAssertTrue(removed.isEmpty, "L'écho d'une remise à zéro de la sélection n'est pas un décochage.")
    }

    func test_deselectedAttachmentIds_leavesPiecesThatWereNotPrimed() {
        let removed = RecentMediaAttachmentLink.deselectedAttachmentIds(
            links: ["p1": "A", "p2": "B"], liveAttachmentIds: ["p1", "p2", "camera"],
            preselected: ["A"], returned: ["A"])
        XCTAssertTrue(removed.isEmpty)
    }

    func test_deselectedAttachmentIds_anItemWithoutIdentifier_concludesNothing() {
        let removed = RecentMediaAttachmentLink.deselectedAttachmentIds(
            links: ["p1": "A"], liveAttachmentIds: ["p1"], preselected: ["A"], returned: [nil])
        XCTAssertTrue(removed.isEmpty)
    }
}

// MARK: - Ce qui entre dans la zone, et ce qui en part

@MainActor
final class CommentAttachmentIntakeTests: XCTestCase {

    private func url(_ name: String) -> URL { URL(fileURLWithPath: "/tmp/\(name)") }

    private func piece(_ id: String, _ type: ComposerAttachmentType, file: String?) -> ComposerAttachment {
        ComposerAttachment(id: id, type: type, name: id, url: file.map(url))
    }

    func test_normalized_keepsMediaAsTheyAre() {
        XCTAssertEqual(CommentAttachmentIntake.normalized(piece("a", .image, file: "a.jpg"))?.type, .image)
        XCTAssertEqual(CommentAttachmentIntake.normalized(piece("b", .video, file: "b.mov"))?.type, .video)
        XCTAssertEqual(CommentAttachmentIntake.normalized(piece("c", .voice, file: "c.m4a"))?.type, .voice)
    }

    func test_normalized_anImportedFileThatIsAMedia_takesItsType() {
        XCTAssertEqual(CommentAttachmentIntake.normalized(piece("son", .file, file: "note.m4a"))?.type, .voice)
        XCTAssertEqual(CommentAttachmentIntake.normalized(piece("img", .file, file: "scan.png"))?.type, .image)
        XCTAssertEqual(CommentAttachmentIntake.normalized(piece("vid", .file, file: "clip.mp4"))?.type, .video)
        XCTAssertEqual(CommentAttachmentIntake.normalized(piece("son", .file, file: "note.m4a"))?.id, "son")
    }

    func test_normalized_refusesWhatACommentCannotCarry() {
        XCTAssertNil(CommentAttachmentIntake.normalized(piece("pdf", .file, file: "doc.pdf")))
        XCTAssertNil(CommentAttachmentIntake.normalized(piece("vide", .file, file: nil)))
        XCTAssertNil(CommentAttachmentIntake.normalized(piece("lieu", .location, file: nil)))
    }

    func test_filling_givesThePieceItsFile_inPlace() throws {
        let zone = [piece("a", .image, file: "a.jpg"), piece("b", .image, file: nil)]
        let filled = try XCTUnwrap(CommentAttachmentIntake.filling(zone, id: "b", url: url("b.jpg"), size: 12))
        XCTAssertEqual(filled.map(\.id), ["a", "b"])
        XCTAssertEqual(filled[1].url, url("b.jpg"))
        XCTAssertEqual(filled[1].size, 12)
    }

    func test_filling_aPieceThatLeftTheZone_doesNotComeBack() {
        XCTAssertNil(CommentAttachmentIntake.filling([piece("a", .image, file: "a.jpg")], id: "partie",
                                                     url: url("x.jpg"), size: 1))
    }

    func test_stillLoading_keepsOnlyThePiecesWithoutAFile() {
        let zone = [piece("a", .image, file: "a.jpg"), piece("b", .video, file: nil)]
        XCTAssertEqual(CommentAttachmentIntake.stillLoading(zone).map(\.id), ["b"])
    }

    func test_admit_stagesMedia_andReturnsWhatEntered() {
        var zone = [piece("a", .image, file: "a.jpg")]
        let entered = CommentAttachmentIntake.admit([piece("b", .voice, file: "b.m4a")], into: &zone)
        XCTAssertEqual(entered.map(\.id), ["b"])
        XCTAssertEqual(zone.map(\.id), ["a", "b"])
    }

    func test_admit_aSinglePieceHost_showsOnlyTheLastPiece() {
        var zone = [piece("a", .image, file: nil)]
        CommentAttachmentIntake.admit([piece("b", .voice, file: nil)], into: &zone, limit: 1)
        XCTAssertEqual(zone.map(\.id), ["b"])
    }

    func test_pendingMedia_sendsEveryPieceOfTheZone_inItsOrder() {
        let zone = [piece("a", .image, file: "a.jpg"), piece("b", .video, file: "b.mov"),
                    piece("c", .voice, file: "c.m4a")]
        let media = CommentComposerStaging.pendingMedia(in: zone)
        XCTAssertEqual(media.map(\.fileURL), [url("a.jpg"), url("b.mov"), url("c.m4a")])
        XCTAssertEqual(media.map(\.optimistic.type), [.image, .video, .audio])
    }

    func test_pendingMedia_isCappedByTheServerCeiling_andSkipsPiecesStillLoading() {
        let zone = (0..<(MAX_POST_MEDIA + 2)).map { piece("p\($0)", .image, file: "p\($0).jpg") }
        XCTAssertEqual(CommentComposerStaging.pendingMedia(in: zone).count, MAX_POST_MEDIA)
        XCTAssertTrue(CommentComposerStaging.pendingMedia(in: [piece("lecture", .image, file: nil)]).isEmpty)
    }
}

// MARK: - Le message : décocher retire, un brouillon restauré garde la carte

@MainActor
final class ComposerLibraryLinkPersistenceTests: XCTestCase {

    private func makeState() -> ConversationComposerState {
        var state = ConversationComposerState()
        state.pendingAttachments = [
            MessageAttachment(id: "p1", mimeType: "image/jpeg"),
            MessageAttachment(id: "p2", mimeType: "image/jpeg"),
        ]
        state.linkLibraryAsset("A", to: "p1")
        state.linkLibraryAsset("B", to: "p2")
        return state
    }

    func test_primePickerPreselection_checksJoinedAssetsFirst_andArmsThem() {
        var state = makeState()
        XCTAssertEqual(state.primePickerPreselection(selection: ["C"]), ["A", "B", "C"])
        XCTAssertEqual(state.pickerPreselectedAttached, ["A", "B"])
    }

    func test_consumePickerDeselection_returnsTheUncheckedPieces_once() {
        var state = makeState()
        _ = state.primePickerPreselection(selection: [])
        XCTAssertEqual(state.consumePickerDeselection(returned: ["B"]), ["p1"])
        XCTAssertTrue(state.consumePickerDeselection(returned: []).isEmpty,
                      "L'écho de la remise à zéro ne retire rien.")
    }

    func test_adoptRestoredDraft_keepsThePieceToAssetMap() {
        var state = ConversationComposerState()
        state.adoptRestoredDraft(
            attachments: [MessageAttachment(id: "p1", mimeType: "image/jpeg")],
            files: ["p1": URL(fileURLWithPath: "/tmp/p1.jpg")],
            assetLinks: ["p1": "A"]
        )
        XCTAssertEqual(state.attachedLibraryAssetIds, ["A"])
    }

    func test_assetLinks_areBoundedToTheRestoredPieces() {
        let refs = [
            DraftAttachmentRef(attachmentId: "p1", storedFileName: "p1.jpg", originalName: "a",
                               mimeType: "image/jpeg", libraryAssetId: "A"),
            DraftAttachmentRef(attachmentId: "perdue", storedFileName: "x.jpg", originalName: "b",
                               mimeType: "image/jpeg", libraryAssetId: "B"),
            DraftAttachmentRef(attachmentId: "camera", storedFileName: "c.jpg", originalName: "c",
                               mimeType: "image/jpeg"),
        ]
        XCTAssertEqual(MessageDraftMediaStore.assetLinks(of: refs, restored: ["p1", "camera"]), ["p1": "A"])
    }

    func test_aDraftWrittenBeforeTheField_stillDecodes() throws {
        let legacy = Data("""
        {"attachmentId":"p1","storedFileName":"p1.jpg","originalName":"a","mimeType":"image/jpeg","fileSize":3,"thumbnailColor":"4ECDC4"}
        """.utf8)
        let ref = try JSONDecoder().decode(DraftAttachmentRef.self, from: legacy)
        XCTAssertNil(ref.libraryAssetId)
    }
}

// MARK: - La zone est MONTÉE, la même, chez le message et chez les commentaires

final class CommentAttachmentZoneMountingGuardTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let text = try String(contentsOf: root.appendingPathComponent("Meeshy/Features/Main/\(relative)"), encoding: .utf8)
        return AppSourceGuard.stripComments(text)
    }

    func test_theMessageAndTheCommentTray_mountTheSameZoneAndTile() throws {
        let message = try source("Views/ConversationView+ComposerAttachments.swift")
        let tray = try source("Views/CommentMediaView.swift")
        for shared in ["ComposerAttachmentZone(", "ComposerAttachmentTile(", "ComposerPlaceTile("] {
            XCTAssertTrue(message.contains(shared), "Le message ne monte plus \(shared)")
            XCTAssertTrue(tray.contains(shared), "La zone des commentaires ne monte pas \(shared) : c'est une copie.")
        }
    }

    func test_everyCommentHost_mountsTheTray_andStagesThroughTheIntake() throws {
        let hosts = [
            "Views/FeedCommentsSheet+Attachments.swift",
            "Views/PostDetailView+CommentComposer.swift",
            "Views/StoryViewerView+CanvasComposerBar.swift",
        ]
        for host in hosts {
            let code = try source(host)
            XCTAssertTrue(code.contains("CommentAttachmentsTray("), "\(host) ne monte pas la zone d'aperçu.")
            XCTAssertTrue(code.contains("CommentAttachmentIntake."), "\(host) pose ses pièces hors de l'entrée commune.")
            XCTAssertFalse(code.contains("commentAttachments.append("),
                           "\(host) ajoute une pièce sans plafond ni aperçu immédiat.")
        }
        XCTAssertTrue(try source("Views/FeedCommentsSheet.swift").contains("AnyView(commentAttachmentsPreview)"),
                      "La feuille des commentaires ne remet plus sa zone à la barre.")
    }

    func test_theHostsThatShowSeveralPieces_sendThemAll() throws {
        let several = ["Views/FeedCommentsSheet.swift", "Views/PostDetailView+CommentComposer.swift"]
        for host in several {
            let code = try source(host)
            XCTAssertTrue(code.contains("CommentComposerStaging.pendingMedia(in:"), "\(host) n'envoie pas toute la zone.")
            XCTAssertFalse(code.contains("firstPendingMedia"), "\(host) montre plusieurs pièces et n'en envoie qu'une.")
        }
        let story = try source("Views/StoryViewerView+CanvasComposerBar.swift")
        XCTAssertTrue(story.contains("firstPendingMedia"))
        XCTAssertTrue(story.contains("static let mediaLimit = 1"),
                      "La story n'envoie qu'un média : sa zone ne doit en montrer qu'un.")
    }

    func test_theCommentGallery_isLinkedToTheZone() throws {
        let sheet = try source("Views/FeedCommentsSheet.swift")
        XCTAssertTrue(sheet.contains("onRecentLibraryAssetSelected:"),
                      "La galerie des commentaires garde l'ancien chemin sans identifiant d'asset.")
        XCTAssertTrue(sheet.contains("recentAttachedAssetIds:"), "La grille ne sait pas ce qui est déjà joint.")
        let attachments = try source("Views/FeedCommentsSheet+Attachments.swift")
        XCTAssertTrue(attachments.contains("commentLibrary.deselected("),
                      "Décocher une image jointe dans la photothèque ne la retire pas de la zone.")
    }
}

// MARK: - Le composeur reste sous l'en-tête de la feuille

/// **La zone d'aperçu ne passe jamais sous l'en-tête** (#9736, recette du
/// 2026-10-09) : à mi-hauteur, le composeur débordait vers le haut et la croix
/// de la feuille recouvrait le ✕ des tuiles.
final class CommentSheetFitTests: XCTestCase {

    /// Le cadre d'une vue pas encore placée (ou déjà retirée) est nul : son
    /// haut n'est pas fini. La sonde n'en tire rien, et ne plante pas.
    func test_aNonFiniteMeasure_isNotAnOverflow_andLeavesTheDetent() {
        XCTAssertFalse(CommentSheetFit.overflows(composerTop: .infinity))
        XCTAssertFalse(CommentSheetFit.overflows(composerTop: -CGFloat.infinity))
        XCTAssertFalse(CommentSheetFit.overflows(composerTop: .nan))
        XCTAssertEqual(CommentSheetFit.detent(composerTop: CGRect.null.minY, current: .medium), .medium)
    }

    func test_aComposerWhoseTopIsAboveTheContentArea_overflows() {
        XCTAssertTrue(CommentSheetFit.overflows(composerTop: -40))
        XCTAssertFalse(CommentSheetFit.overflows(composerTop: 0))
        XCTAssertFalse(CommentSheetFit.overflows(composerTop: 120))
        XCTAssertFalse(CommentSheetFit.overflows(composerTop: -0.25), "Un arrondi de mise en page n'est pas un débordement.")
    }

    func test_anOverflowingComposer_takesTheLargeDetent() {
        XCTAssertEqual(CommentSheetFit.detent(composerTop: -40, current: .medium), .large)
    }

    func test_aFittingComposer_leavesTheDetentToTheUser() {
        XCTAssertEqual(CommentSheetFit.detent(composerTop: 80, current: .medium), .medium)
        XCTAssertEqual(CommentSheetFit.detent(composerTop: 80, current: .large), .large,
                       "La feuille ne se réduit jamais d'elle-même.")
    }

    func test_theSheet_probesItsComposer_andBindsItsDetent() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let sheet = AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/FeedCommentsSheet.swift"), encoding: .utf8))
        XCTAssertTrue(sheet.contains(".keepsComposerBelowSheetHeader(detent: $sheetDetent)"),
                      "Le composeur n'est plus sondé : il peut repasser sous l'en-tête.")
        XCTAssertTrue(sheet.contains(".commentSheetContent()"),
                      "Sans l'espace de la zone de contenu, la sonde mesure contre l'écran.")
        let fit = AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Components/CommentSheetFit.swift"), encoding: .utf8))
        XCTAssertTrue(sheet.contains("onShowAttachments: { growSheetForComposer() }"),
                      "Ouvrir le panneau des pièces ne demande plus la grande détente.")
        let bar = AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Components/UniversalComposerBar+Layout.swift"), encoding: .utf8))
        XCTAssertTrue(bar.contains(".modifier(ComposerPanelFrame(resting: attachmentPanelHeight, yields: panelYieldsToHost))"),
                      "Le panneau de la barre ne cède plus dans une feuille : il repousse la zone d'aperçu sous l'en-tête.")
        XCTAssertTrue(fit.contains("self.frame(width: area.size.width, height: area.size.height, alignment: .bottom)"),
                      "La zone de contenu doit avoir la taille PROPOSÉE : posée sur un conteneur qui grandit avec le débordement, la sonde ne voit rien.")
        XCTAssertTrue(sheet.contains(".presentationDetents([.large, .medium], selection: $sheetDetent)"),
                      "Une détente que rien ne lie ne peut pas grandir.")
    }
}

// MARK: - La mise en page de la feuille, EXÉCUTÉE

/// Ce que la mise en page a posé, et la détente que la sonde a demandée.
/// `@unchecked Sendable` : il n'est lu et écrit que sur le fil principal, par
/// la mise en page et par la sonde.
private final class CommentSheetFitRecorder: @unchecked Sendable {
    var detent: PresentationDetent = .medium
    var area: CGRect = .zero
    var composer: CGRect = .zero
    var preview: CGRect = .zero
    var panel: CGRect = .zero
    var list: CGRect = .zero
}

/// **Le témoin qui exécute la mise en page.** La zone de contenu, la sonde et
/// le cadre du panneau sont ceux de la feuille (`commentSheetContent`,
/// `keepsComposerBelowSheetHeader`, `ComposerPanelFrame`) ; la barre elle-même
/// est figurée par ses hauteurs — zone d'aperçu, rangée d'outils et champ
/// (incompressibles), puis le panneau.
///
/// Ce témoin prouve la RÈGLE de mise en page. Il ne présente pas la feuille
/// réelle par son `.sheet` : la détente effective se lit au simulateur, par
/// les traces `[CommentSheetFit]`.
@MainActor
final class CommentSheetFitLayoutTests: XCTestCase {

    private typealias Recorder = CommentSheetFitRecorder

    private struct Panel: View {
        let recorder: Recorder
        @Environment(\.composerPanelYieldsToHost) private var yields

        var body: some View {
            Color.green
                .modifier(ComposerPanelFrame(resting: 324, yields: yields))
                .background(GeometryReader { proxy -> Color in
                    recorder.panel = proxy.frame(in: .named(CommentSheetFit.space))
                    return Color.clear
                })
        }
    }

    /// La structure de `CommentsSheetView.sheetBody` : une colonne « liste
    /// défilante + composeur » dans la zone de contenu.
    private struct Sheet: View {
        /// Zone d'aperçu (100) + rangée d'outils et champ.
        let chromeHeight: CGFloat
        let recorder: Recorder

        /// La détente que la sonde DEMANDE, lue sans attendre un second rendu :
        /// c'est la demande qui est la règle, pas la réaction de la feuille.
        private var detent: Binding<PresentationDetent> {
            let recorder = recorder
            return Binding(get: { recorder.detent }, set: { recorder.detent = $0 })
        }

        private func record(_ path: ReferenceWritableKeyPath<Recorder, CGRect>) -> some View {
            GeometryReader { proxy -> Color in
                recorder[keyPath: path] = proxy.frame(in: .named(CommentSheetFit.space))
                return Color.clear
            }
        }

        var body: some View {
            ZStack {
                Color.clear.ignoresSafeArea()
                VStack(spacing: 0) {
                    ScrollView { Color.gray.frame(height: 2_000) }
                        .background(record(\.list))
                    VStack(spacing: 0) {
                        Color.orange.frame(height: 100).background(record(\.preview))
                        Color.blue.frame(height: chromeHeight - 100)
                        Panel(recorder: recorder)
                    }
                    .background(record(\.composer))
                    .keepsComposerBelowSheetHeader(detent: detent)
                }
            }
            .commentSheetContent()
            .background(GeometryReader { proxy -> Color in
                recorder.area = CGRect(origin: .zero, size: proxy.size)
                return Color.clear
            })
        }
    }

    /// Pose la feuille dans une fenêtre et laisse SwiftUI faire ses passes.
    private func layOut(chromeHeight: CGFloat, windowHeight: CGFloat) -> Recorder {
        let recorder = Recorder()
        render(Sheet(chromeHeight: chromeHeight, recorder: recorder), windowHeight: windowHeight)
        return recorder
    }

    private func render<Root: View>(_ root: Root, windowHeight: CGFloat) {
        let host = UIHostingController(rootView: root)
        let frame = CGRect(x: 0, y: 0, width: 402, height: windowHeight)
        // Une fenêtre sans scène ne fait pas ses passes de rendu : on prend
        // celle de l'application hôte des tests.
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: frame)
        window.frame = frame
        window.rootViewController = host
        window.isHidden = false
        host.view.frame = window.bounds
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        RunLoop.main.run(until: Date().addingTimeInterval(0.6))
        host.view.layoutIfNeeded()
        window.isHidden = true
    }

    /// À mi-hauteur, panneau ouvert et une pièce jointe : rien ne passe sous
    /// l'en-tête. C'est la LISTE qui cède, puis le panneau, dans cet ordre.
    func test_atMediumHeight_thePreviewZoneAndTheToolRowStayBelowTheHeader() {
        let recorder = layOut(chromeHeight: 204, windowHeight: 440)

        XCTAssertGreaterThan(recorder.area.height, 0, "La mise en page n'a pas été exécutée.")
        XCTAssertGreaterThanOrEqual(recorder.preview.minY, -0.5,
                                    "Le haut de la zone d'aperçu est sous le bas de l'en-tête.")
        XCTAssertLessThanOrEqual(recorder.composer.maxY, recorder.area.height + 0.5,
                                 "Le bas du composeur ne dépasse pas le bas de la feuille.")
        XCTAssertLessThan(recorder.panel.height, 324, "La place manque : c'est le panneau qui cède.")
        XCTAssertGreaterThanOrEqual(recorder.panel.height, ComposerPanelFrame.floor - 0.5)
        XCTAssertEqual(recorder.list.height, 0, accuracy: 0.5, "La liste des commentaires cède jusqu'à zéro avant le composeur.")
        XCTAssertEqual(recorder.detent, .medium, "Rien ne déborde : la sonde ne demande rien.")
    }

    /// Même le plancher du panneau ne tient pas : la sonde le VOIT, et demande
    /// la grande détente.
    func test_whenEvenTheFloorDoesNotFit_theProbeSeesIt_andAsksForTheLargeDetent() {
        let recorder = layOut(chromeHeight: 420, windowHeight: 440)

        XCTAssertLessThan(recorder.composer.minY, 0, "La sonde doit voir le composeur dépasser le haut de la zone.")
        XCTAssertEqual(recorder.detent, .large)
    }

    /// À la grande détente, le panneau retrouve sa hauteur de repos et la
    /// liste reprend ce qui reste.
    func test_atLargeHeight_thePanelRests_andTheListTakesTheRemainder() {
        let recorder = layOut(chromeHeight: 204, windowHeight: 800)

        XCTAssertEqual(recorder.panel.height, 324, accuracy: 0.5)
        XCTAssertGreaterThanOrEqual(recorder.preview.minY, 0)
        XCTAssertGreaterThan(recorder.list.height, 0)
        XCTAssertEqual(recorder.detent, .medium)
    }

    /// Hors d'une feuille, le panneau garde sa hauteur fixe : la rangée de
    /// saisie d'une conversation ne bouge pas quand clavier et panneau s'échangent.
    func test_outsideASheet_thePanelKeepsItsFixedHeight() {
        let recorder = Recorder()
        render(VStack(spacing: 0) {
            Color.gray
            Panel(recorder: recorder)
        }.coordinateSpace(name: CommentSheetFit.space), windowHeight: 300)

        XCTAssertEqual(recorder.panel.height, 324, accuracy: 0.5)
    }
}

// MARK: - La caméra des commentaires

/// **La caméra s'offre à droite, dans les trois composeurs de commentaire**
/// (#9736, décision porteur 2026-10-09) — par la porte de la barre du message,
/// pas par une copie, et sa prise retombe dans la zone d'aperçu.
final class CommentCameraDoorMountingGuardTests: XCTestCase {

    private func source(_ relative: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/\(relative)"), encoding: .utf8))
    }

    func test_everyCommentHost_offersTheCamera() throws {
        for host in ["Views/FeedCommentsSheet.swift",
                     "Views/PostDetailView+CommentComposer.swift",
                     "Views/StoryViewerView+CanvasComposerBar.swift"] {
            XCTAssertTrue(try source(host).contains(".commentCamera(attachments: $commentAttachments"),
                          "\(host) n'offre pas la caméra à son composeur de commentaire.")
        }
    }

    func test_theStory_keepsItsSinglePieceCeiling_forACapture() throws {
        XCTAssertTrue(try source("Views/StoryViewerView+CanvasComposerBar.swift")
            .contains(".commentCamera(attachments: $commentAttachments, limit: Self.mediaLimit"))
    }

    func test_theDoor_isTheMessageBarsOwn_notACopy() throws {
        let toolbar = try source("Components/UniversalComposerBar+Toolbar.swift")
        XCTAssertTrue(toolbar.contains("offersCamera: resolvedOnCamera != nil"),
                      "La porte caméra de la barre ne lit plus ce que l'hôte lui confie par l'environnement.")
        XCTAssertTrue(toolbar.contains("if let openCamera = resolvedOnCamera"))
        XCTAssertTrue(toolbar.contains("\"composer.attach.camera\""), "La porte se nomme « Caméra » pour VoiceOver.")
        XCTAssertTrue(try source("Components/UniversalComposerBar.swift")
            .contains("onCamera ?? environmentCameraDoor?.open"))
    }

    func test_theCapture_opensTheComposerViewfinder_andLandsInTheZone() throws {
        let door = try source("Components/CommentCameraDoor.swift")
        XCTAssertTrue(door.contains("ComposerViewfinder {"),
                      "Le viseur est celui du composeur — le même que le message, qui obéit à la politique d'enregistrement.")
        XCTAssertTrue(door.contains("CommentAttachmentIntake.stage(capture:"),
                      "La prise doit entrer par l'entrée commune : aperçu immédiat et plafond des pièces.")
    }
}

// MARK: - Envoyer, ou garder : jamais « vider puis abandonner »

/// **Recette du 2026-10-09** : une pièce encore en préparation, sans texte, et
/// l'envoi vidait le composeur puis sortait sans rien garder. La décision se
/// prend désormais AVANT de toucher à quoi que ce soit.
@MainActor
final class CommentSendGateTests: XCTestCase {

    private func piece(_ id: String, file: String?) -> ComposerAttachment {
        ComposerAttachment(id: id, type: .image, name: id, url: file.map { URL(fileURLWithPath: "/tmp/\($0)") })
    }

    func test_aPieceStillPreparing_keepsEverything_evenWithText() {
        XCTAssertEqual(CommentSendGate.decide(text: "", zone: [piece("a", file: nil)], hasPlace: false),
                       .keepWhilePreparing(loading: 1))
        XCTAssertEqual(CommentSendGate.decide(text: "regarde", zone: [piece("a", file: "a.jpg"), piece("b", file: nil)], hasPlace: false),
                       .keepWhilePreparing(loading: 1), "Rien ne part amputé d'une pièce qui se prépare.")
    }

    func test_readyPieces_send() {
        XCTAssertEqual(CommentSendGate.decide(text: "", zone: [piece("a", file: "a.jpg")], hasPlace: false),
                       .send(pieceIds: ["a"]))
        XCTAssertEqual(CommentSendGate.decide(text: "salut", zone: [], hasPlace: false), .send(pieceIds: []))
        XCTAssertEqual(CommentSendGate.decide(text: "", zone: [], hasPlace: true), .send(pieceIds: []))
    }

    func test_nothingToSend() {
        XCTAssertEqual(CommentSendGate.decide(text: "  ", zone: [], hasPlace: false), .nothing)
    }

    /// La tuile tournait sans fin : une pièce dont le fichier arrive était
    /// « égale » à elle-même sans fichier, et SwiftUI sautait le rendu.
    func test_aPieceWhoseFileArrived_isNotEqualToItselfWithoutIt() {
        XCTAssertNotEqual(piece("a", file: nil), piece("a", file: "a.jpg"))
        XCTAssertEqual(piece("a", file: "a.jpg"), piece("a", file: "a.jpg"))
    }

    func test_theSheet_decidesBeforeClearing() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let sheet = AppSourceGuard.stripComments(try String(
            contentsOf: root.appendingPathComponent("Meeshy/Features/Main/Views/FeedCommentsSheet.swift"), encoding: .utf8))
        let gate = try XCTUnwrap(sheet.range(of: "CommentSendGate.decide("))
        let clear = try XCTUnwrap(sheet.range(of: "commentAttachments = []"))
        XCTAssertLessThan(gate.lowerBound, clear.lowerBound, "La décision précède le vidage du composeur.")
    }
}
