import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #14500 — **sur un iPhone SE (375 × 667 pt) et un 13 mini (375 × 812 pt),
/// aucun rail du composer ne recouvre une zone de contrôle ni ne sort de
/// l'écran.**
///
/// Le chrome RÉEL (`ComposerSceneOverlayChrome`) est rendu par `RenderedScreen`
/// à la taille de l'écran, au-dessus d'un socle qui réserve la hauteur mesurée
/// sur le simulateur SE (Public · Publier de 621 à 665 pt, soit 46 pt). Les
/// rectangles se lisent dans l'arbre d'accessibilité rendu, par les
/// identifiants que la recette lit aussi : la propriété se mesure au point,
/// jamais dans le texte d'un modificateur.
///
/// Les cas sont les pires de chaque rail : le post à deux diapos (la colonne
/// la plus haute, dix boutons dont « Texte du post », sous la rangée des
/// diapos, ↶ et ↷ montés) et le fond média, dont le rail d'édition porte le
/// plus d'entrées et doit défiler dans sa colonne.
@MainActor
final class ComposerSceneChromeSmallScreenTests: XCTestCase {

    private static let iPhoneSE = CGSize(width: 375, height: 667)
    private static let iPhone13mini = CGSize(width: 375, height: 812)
    /// #14622 — une fenêtre d'iPad de 360 pt : la scène 9:16 n'y dépasse pas
    /// 640 pt, et la colonne du post, l'entrée Coller comprise, y déborde.
    private static let iPad360 = CGSize(width: 360, height: 640)
    private static let smallScreens = [iPhoneSE, iPhone13mini, iPad360]
    private static let socleReserve: CGFloat = 46

    private struct Harness: View {
        let chrome: ComposerSceneOverlayChrome
        let size: CGSize
        var body: some View {
            chrome
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .composerFloatingSocle {
                    Color.clear
                        .frame(maxWidth: .infinity)
                        .frame(height: ComposerSceneChromeSmallScreenTests.socleReserve)
                        .accessibilityElement()
                        .accessibilityLabel(Text("socle"))
                        .accessibilityIdentifier("test.socle")
                }
                .frame(width: size.width, height: size.height)
                .ignoresSafeArea()
        }
    }

    private static let rest = ComposerRestChrome.State(toolIsOpen: false, writesText: false, cameraIsArmed: false,
                                                       bottomPanelIsOpen: false, timelineIsOpen: false)

    private static func selected() -> ComposerRestChrome.State {
        var state = rest
        state.objectIsSelected = true
        return state
    }

    private static func slides() -> AnyView {
        AnyView(Color.clear.frame(maxWidth: .infinity).frame(height: 44)
            .accessibilityElement()
            .accessibilityLabel(Text("diapos"))
            .accessibilityIdentifier("test.slides"))
    }

    private static func moreMenu() -> AnyView {
        AnyView(ComposerSceneRoundGlyph(symbol: ComposerRestTool.more.symbol)
            .accessibilityElement()
            .accessibilityLabel(Text("plus"))
            .accessibilityIdentifier("composer.rest.more"))
    }

    private static func pasteEntry() -> AnyView {
        AnyView(ComposerSceneRoundGlyph(symbol: "doc.on.clipboard")
            .accessibilityElement()
            .accessibilityLabel(Text("coller"))
            .accessibilityIdentifier("composer.rest.paste"))
    }

    private static func postAtTwoSlides(state: ComposerRestChrome.State = rest,
                                        selection: ComposerSelectionColumn? = nil,
                                        paste: Bool = false,
                                        sceneSideInset: CGFloat = 0,
                                        sceneTopInset: CGFloat = 0) -> ComposerSceneOverlayChrome {
        ComposerSceneOverlayChrome(state: state, slideRow: slides(), slideCount: 2,
                                   onClose: {}, onUndo: {}, onRedo: {},
                                   tools: ComposerRestTool.allCases, onTool: { _ in },
                                   moreMenu: moreMenu(), pasteEntry: paste ? pasteEntry() : nil,
                                   selection: selection, sceneSideInset: sceneSideInset,
                                   sceneTopInset: sceneTopInset)
    }

    private static let controls = ["composer.close", "composer.history.undo", "composer.history.redo", "test.socle"]

    private func assertClearOfControls(_ rails: [String], on screen: RenderedScreen, size: CGSize,
                                       file: StaticString = #filePath, line: UInt = #line) throws {
        let bounds = CGRect(origin: .zero, size: size)
        let zones = Self.controls.compactMap { id in screen.node(id).map { (id, $0.frame) } }
        for rail in rails {
            let frame = try XCTUnwrap(screen.frame(of: rail), "\(size) : \(rail) introuvable dans l'arbre rendu",
                                      file: file, line: line)
            XCTAssertTrue(bounds.contains(frame.insetBy(dx: 0.5, dy: 0.5)),
                          "\(size) : \(rail) sort de l'écran : \(frame)", file: file, line: line)
            for (control, zone) in zones {
                XCTAssertFalse(frame.insetBy(dx: 0.5, dy: 0.5).intersects(zone),
                               "\(size) : \(rail) \(frame) recouvre \(control) \(zone)", file: file, line: line)
            }
        }
    }

    func test_auRepos_lePostADeuxDiapos_neCroiseAucuneZoneDeControle() throws {
        let tools = ComposerRestTool.allCases.map { "composer.rest.\($0.rawValue)" }
        for size in Self.smallScreens {
            let screen = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(), size: size), size: size)
            defer { screen.dismount() }

            for control in Self.controls {
                XCTAssertNotNil(screen.frame(of: control), "\(size) : \(control) absent, le témoin ne mesurerait rien.")
            }
            try assertClearOfControls(tools + ["test.slides"], on: screen, size: size)
        }
    }

    func test_auRepos_lesBoutonsDeLaColonne_gardentLeurCibleDe44Points() throws {
        let screen = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(), size: Self.iPhoneSE), size: Self.iPhoneSE)
        defer { screen.dismount() }

        for tool in ComposerRestTool.allCases {
            let frame = try XCTUnwrap(screen.frame(of: "composer.rest.\(tool.rawValue)"), "\(tool) introuvable")
            XCTAssertGreaterThanOrEqual(min(frame.width, frame.height), 44 - 0.5,
                                        "\(tool) : cible sous 44 pt sur le SE (\(frame)).")
        }
    }

    func test_leRailDuFondMedia_resteDansSaColonne_auDessusDuSocle() throws {
        let items = ComposerEditRailItems.items(for: .background, actions: [],
                                                backgroundActions: ComposerBackgroundEditAction.allCases,
                                                sections: [], extras: [], keyframes: false,
                                                backgroundEntries: ComposerBackgroundModifyEntry.allCases)
        let column = ComposerSelectionColumn(level: .background, items: items, onItem: { _ in })

        XCTAssertGreaterThan(items.count, 10, "Le cas doit être celui qui déborde la hauteur du SE.")
        for size in Self.smallScreens {
            let chrome = Self.postAtTwoSlides(state: Self.selected(), selection: column)
            let screen = RenderedScreen(Harness(chrome: chrome, size: size), size: size)
            defer { screen.dismount() }

            try assertClearOfControls(["composer.selection.column"], on: screen, size: size)
        }
    }

    func test_lesActionsDUnObjet_restentDansLEcran_sousLHistorique() throws {
        let items = ComposerEditRailItems.items(for: .actions, actions: ComposerSelectionAction.allCases,
                                                sections: [], extras: [], keyframes: false)
        let column = ComposerSelectionColumn(level: .actions, items: items, onItem: { _ in })
        let entries = items.map { "composer.selection.\($0.identifier)" }
        for size in Self.smallScreens {
            let chrome = Self.postAtTwoSlides(state: Self.selected(), selection: column)
            let screen = RenderedScreen(Harness(chrome: chrome, size: size), size: size)
            defer { screen.dismount() }

            try assertClearOfControls(["composer.selection.column"] + entries, on: screen, size: size)
        }
    }

    // MARK: - La scène plus étroite que l'écran

    /// La scène 9:16 du SE, posée au-dessus du socle : elle prend toute la
    /// hauteur et laisse une marge de chaque côté.
    private static func sceneOfSE() -> CGRect {
        let zone = ComposerSceneFit.zone(in: CGSize(width: iPhoneSE.width, height: iPhoneSE.height - socleReserve),
                                         aspectRatio: SceneShape.aspect)
        return ComposerSceneFit.frame(in: zone, aspectRatio: SceneShape.aspect)
    }

    /// Relevé au simulateur iPhone SE (#13864) : ✕ et ↶ débordaient à cheval
    /// sur les coins de la scène, la colonne frôlait son bord droit. Ils se
    /// posent SUR la scène, à la même distance de son bord que sur un écran
    /// qu'elle remplit en largeur.
    func test_surLeSE_laCroixLHistoriqueEtLaColonne_sePosentDansLaLargeurDeLaScene() throws {
        let scene = Self.sceneOfSE()
        XCTAssertGreaterThan(scene.minX, 8, "Le cas doit être celui d'une scène plus étroite que l'écran : \(scene).")
        let chrome = Self.postAtTwoSlides(sceneSideInset: scene.minX)
        let screen = RenderedScreen(Harness(chrome: chrome, size: Self.iPhoneSE), size: Self.iPhoneSE)
        defer { screen.dismount() }

        let ids = ["composer.close", "composer.history.undo", "composer.history.redo", "composer.rest.column.body",
                   "composer.rest.postText", "composer.rest.more"]
        for id in ids {
            let frame = try XCTUnwrap(screen.frame(of: id), "\(id) introuvable dans l'arbre rendu")
            XCTAssertGreaterThanOrEqual(frame.minX, scene.minX + MeeshySpacing.xs - 0.5,
                                        "\(id) \(frame) déborde le bord gauche de la scène \(scene).")
            XCTAssertLessThanOrEqual(frame.maxX, scene.maxX - MeeshySpacing.xs + 0.5,
                                     "\(id) \(frame) déborde le bord droit de la scène \(scene).")
        }
    }

    /// Relevé au simulateur iPhone SE : ✕ et ↶ commençaient à 4 pt du haut, la
    /// scène à 12 — à cheval sur son bord haut. Ils se posent sous lui.
    func test_surLeSE_laCroixEtLHistorique_sePosentSousLeHautDeLaScene() throws {
        let scene = Self.sceneOfSE()
        XCTAssertGreaterThan(scene.minY, 8, "Le cas doit être celui d'une scène qui commence sous le chrome : \(scene).")
        let chrome = Self.postAtTwoSlides(sceneSideInset: scene.minX, sceneTopInset: scene.minY)
        let screen = RenderedScreen(Harness(chrome: chrome, size: Self.iPhoneSE), size: Self.iPhoneSE)
        defer { screen.dismount() }

        for id in ["composer.close", "composer.history.undo", "composer.history.redo"] {
            let frame = try XCTUnwrap(screen.frame(of: id), "\(id) introuvable dans l'arbre rendu")
            XCTAssertGreaterThanOrEqual(frame.minY, scene.minY + MeeshySpacing.xs - 0.5,
                                        "\(id) \(frame) déborde le bord haut de la scène \(scene).")
        }
    }

    /// Relevé au simulateur SE : l'invite d'une scène vide (« Toca la escena
    /// para la cámara »), posée dans le canevas et réduite avec lui par le socle,
    /// mordait la colonne d'outils une fois celle-ci rentrée dans la scène.
    func test_surLeSE_lInviteDeLaSceneVide_laisseLaColonneLibre() {
        let couche = CGRect(origin: .zero, size: Self.iPhoneSE)
        let zone = ComposerSceneFit.zone(in: couche.size, aspectRatio: SceneShape.aspect)
        let scene = ComposerSceneFit.frame(in: zone, aspectRatio: SceneShape.aspect)
        let echelle = (Self.iPhoneSE.height - Self.socleReserve - scene.minY) / scene.height
        XCTAssertLessThan(echelle, 1, "Le cas doit être celui d'une scène réduite par le socle.")
        let cote = ComposerRestChrome.sceneSideInset(layer: couche, aspectRatio: SceneShape.aspect, scale: echelle)
        let colonne = Self.iPhoneSE.width - cote - MeeshySpacing.smPlus - ComposerRestChrome.toolColumnInnerMargin
            - ComposerSceneRoundGlyph.size
        let invite = zone.midX + (zone.maxX - ComposerSceneQuickCaptureHint.railClearance - zone.midX) * echelle
        XCTAssertLessThanOrEqual(invite, colonne - MeeshySpacing.xs,
                                 "L'invite finit à \(invite), la colonne commence à \(colonne).")
    }

    // MARK: - #14622 : le pied de la colonne ne défile jamais

    func test_lePiedDeLaColonne_estTexteDuPostPuisPlus_etLeResteDefile() {
        XCTAssertEqual(ComposerRestChrome.columnFoot(ComposerRestTool.allCases), [.postText, .more])
        XCTAssertEqual(ComposerRestChrome.columnBody(ComposerRestTool.allCases),
                       [.text, .media, .sticker, .sound, .drawing, .background, .mention, .place])
        let story = ComposerRestChrome.tools(offered: [.text, .media, .sticker, .sound, .drawing, .background])
        XCTAssertEqual(ComposerRestChrome.columnFoot(story), [.more])
        XCTAssertEqual(ComposerRestChrome.columnBody(story) + ComposerRestChrome.columnFoot(story), story)
    }

    func test_quandLaColonneDeborde_plusEtTexteDuPost_restentVisiblesAuPied() throws {
        let foot = ["composer.rest.postText", "composer.rest.more", "composer.rest.paste"]
        for size in Self.smallScreens {
            let screen = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(paste: true), size: size), size: size)
            defer { screen.dismount() }

            try assertClearOfControls(foot + ["composer.rest.column.body"], on: screen, size: size)
            let body = try XCTUnwrap(screen.frame(of: "composer.rest.column.body"), "\(size) : corps introuvable")
            let frames = try foot.map { id in try XCTUnwrap(screen.frame(of: id), "\(size) : \(id) introuvable") }
            XCTAssertLessThanOrEqual(body.maxY, frames[0].minY + 0.5,
                                     "\(size) : le corps qui défile \(body) passe sous « Texte du post » \(frames[0]).")
            XCTAssertLessThanOrEqual(frames[0].maxY, frames[1].minY + 0.5, "\(size) : ⋯ n'est pas sous « Texte du post ».")
            XCTAssertLessThanOrEqual(frames[1].maxY, frames[2].minY + 0.5, "\(size) : Coller n'est pas sous ⋯.")
        }
    }

    func test_laColonneDuPostAvecColler_debordeBienLaFenetreDIPadDe360Points() throws {
        let screen = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(paste: true), size: Self.iPad360),
                                    size: Self.iPad360)
        defer { screen.dismount() }

        let body = try XCTUnwrap(screen.frame(of: "composer.rest.column.body"))
        let place = try XCTUnwrap(screen.frame(of: "composer.rest.place"))
        XCTAssertGreaterThan(place.maxY, body.maxY + 0.5,
                             "Le cas doit déborder, sinon le témoin du pied ne mesure rien : \(place) dans \(body).")
    }

    // MARK: - #14622 : un rail qui déborde le montre

    func test_leSigneDeDefilement_ditCeQuiResteDeChaqueCote() {
        let viewport: CGFloat = 400
        XCTAssertEqual(ComposerScrollEdges.of(content: CGRect(x: 0, y: 0, width: 72, height: 300), viewport: viewport),
                       ComposerScrollEdges(top: false, bottom: false))
        XCTAssertEqual(ComposerScrollEdges.of(content: CGRect(x: 0, y: 0, width: 72, height: 900), viewport: viewport),
                       ComposerScrollEdges(top: false, bottom: true))
        XCTAssertEqual(ComposerScrollEdges.of(content: CGRect(x: 0, y: -200, width: 72, height: 900), viewport: viewport),
                       ComposerScrollEdges(top: true, bottom: true))
        XCTAssertEqual(ComposerScrollEdges.of(content: CGRect(x: 0, y: -500, width: 72, height: 900), viewport: viewport),
                       ComposerScrollEdges(top: true, bottom: false))
        XCTAssertEqual(ComposerScrollEdges.of(content: CGRect(x: 0, y: -0.3, width: 72, height: 400.4), viewport: viewport),
                       ComposerScrollEdges(top: false, bottom: false), "Un demi-point d'arrondi n'est pas un débord.")
    }

    /// Le fondu se lit au PIXEL : un rail noir, posé sur le fond blanc de
    /// l'hôte et plus haut que son viewport, laisse voir le blanc au bord qui
    /// cache encore des entrées, jamais au milieu ni au bord déjà atteint.
    func test_unRailQuiDeborde_seFondAuBordQuiCacheEncoreDesEntrees() throws {
        let size = CGSize(width: 60, height: 200)
        let rail = VStack(spacing: 0) {
            ForEach(0..<20, id: \.self) { index in
                Color.black.frame(width: 60, height: 40)
                    .accessibilityElement()
                    .accessibilityIdentifier("test.rail.\(index)")
            }
        }
        .modifier(ComposerScrollEdgeCue())
        .frame(width: size.width, height: size.height)
        .ignoresSafeArea()
        let screen = RenderedScreen(rail, size: size)
        defer { screen.dismount() }
        RunLoop.main.run(until: Date().addingTimeInterval(0.5))

        let format = UIGraphicsImageRendererFormat()
        format.preferredRange = .standard
        let image = UIGraphicsImageRenderer(bounds: screen.root.bounds, format: format).image { _ in
            screen.root.drawHierarchy(in: screen.root.bounds, afterScreenUpdates: true)
        }
        let top = try XCTUnwrap(Self.brightness(of: image, at: CGPoint(x: 30, y: 2)))
        let middle = try XCTUnwrap(Self.brightness(of: image, at: CGPoint(x: 30, y: 100)))
        let bottom = try XCTUnwrap(Self.brightness(of: image, at: CGPoint(x: 30, y: 198)))
        XCTAssertLessThan(middle, 0.05, "Le milieu du rail reste plein.")
        XCTAssertLessThan(top, 0.05, "En haut, rien n'est caché : aucun fondu.")
        XCTAssertGreaterThan(bottom, 0.5, "En bas, des entrées attendent : le bord s'efface (clarté \(bottom)).")
    }

    /// La clarté d'un point lu dans les octets d'une image 8 bits, rangée par
    /// rangée depuis le HAUT : le plus petit canal, qui vaut 0 sur le noir et 1
    /// sur le blanc quel que soit l'ordre des canaux.
    private static func brightness(of image: UIImage, at point: CGPoint) -> CGFloat? {
        guard let cg = image.cgImage, let data = cg.dataProvider?.data,
              let bytes = CFDataGetBytePtr(data) else { return nil }
        guard cg.bitsPerComponent == 8 else { return nil }
        let pixel = cg.bitsPerPixel / 8
        let offset = Int(point.y * image.scale) * cg.bytesPerRow + Int(point.x * image.scale) * pixel
        return CGFloat((0..<min(pixel, 3)).map { bytes[offset + $0] }.min() ?? 0) / 255
    }

    // MARK: - DIAGNOSTIC TEMPORAIRE #16246 (retiré avant la PR)

    private func scrollViewsDiag(in view: UIView) -> [UIScrollView] {
        ((view as? UIScrollView).map { [$0] } ?? []) + view.subviews.flatMap { scrollViewsDiag(in: $0) }
    }

    private func dumpDiag(_ screen: RenderedScreen) -> String {
        RunLoop.main.run(until: Date().addingTimeInterval(1.0))
        let nodes = screen.nodes.filter { $0.identifier != nil && !($0.identifier ?? "").isEmpty }
            .map { "\($0.identifier ?? "")@\($0.frame)" }.joined(separator: " ; ")
        let svs = scrollViewsDiag(in: screen.root).map { sv in
            "sv{\(sv.convert(sv.bounds, to: nil)) cs:\(sv.contentSize.height) off:\(sv.contentOffset.y) adj:\(sv.adjustedContentInset.top) id:\(sv.accessibilityIdentifier ?? "-") n:\(sv.accessibilityElementCount())}"
        }.joined(separator: ",")
        return "safe=\(screen.root.safeAreaInsets.top) NODES: \(nodes) SV: \(svs)"
    }

    func test_DIAG_16246_arbre() {
        let a = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(paste: true), size: Self.iPhoneSE), size: Self.iPhoneSE)
        let da = dumpDiag(a); a.dismount()
        let items = ComposerEditRailItems.items(for: .background, actions: [],
                                                backgroundActions: ComposerBackgroundEditAction.allCases,
                                                sections: [], extras: [], keyframes: false,
                                                backgroundEntries: ComposerBackgroundModifyEntry.allCases)
        let column = ComposerSelectionColumn(level: .background, items: items, onItem: { _ in })
        let b = RenderedScreen(Harness(chrome: Self.postAtTwoSlides(state: Self.selected(), selection: column),
                                       size: Self.iPhoneSE), size: Self.iPhoneSE)
        let db = dumpDiag(b); b.dismount()
        XCTFail("DIAG16246A " + da + " DIAG16246B " + db)
    }
}
