import XCTest
@testable import Meeshy

/// #8459 — la pilule est UN bloc de verre réel (iOS 26), et les actions du
/// `(…)` s'y déploient au-dessus de la rangée de base, en duo comme en groupe.
/// #8435 — le bouton PiP quitte le plein écran par le même chemin que le glissé.
@MainActor
final class CallViewGlassGuardTests: XCTestCase {

    private func callViewCode() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
    }

    private func block(_ start: String, until end: String, in code: String) throws -> String {
        let from = try XCTUnwrap(code.range(of: start), "\(start) introuvable — la garde ne mesurerait rien")
        let to = try XCTUnwrap(code.range(of: end, range: from.upperBound ..< code.endIndex), "\(end) introuvable")
        return String(code[from.upperBound ..< to.lowerBound])
    }

    /// #8459 — un bouton de la pilule est un disque PLAT dans le bloc de
    /// verre : pas de verre sur verre, ni d'identité de morphing.
    func test_pillGlyph_isAFlatDiscInsideTheGlassBlock() throws {
        let glyph = try block("struct CallPillGlyph: View {", until: "struct CallPillButtonLabel", in: try callViewCode())
        XCTAssertTrue(glyph.contains(".background(Circle().fill(CallButtonFill.color(for: kind)))"))
        XCTAssertFalse(glyph.contains("CallButtonGlass"), "Un bouton de verre dans un bloc de verre, c'est du verre sur verre")
        XCTAssertFalse(glyph.contains("adaptiveGlass"))
    }

    func test_buttonFill_activeIsWhite_endIsRed_restIsTranslucent() throws {
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallControlGlass.swift")
        )
        let fill = try block("enum CallButtonFill {", until: "\n}\n", in: glass)
        XCTAssertTrue(fill.contains("case .active: return .white"))
        XCTAssertTrue(fill.contains("case .destructive: return MeeshyColors.error"))
        XCTAssertTrue(fill.contains("Color.white.opacity("))
        XCTAssertFalse(glass.contains("struct CallButtonGlass"), "Le verre par bouton a quitté l'écran d'appel")
    }

    /// #8459 · #8550 — UN seul bloc de verre réel : la pilule ; les familles
    /// OU le panneau ouvert s'y déploient, au-dessus de la rangée de base,
    /// sans second bloc — en duo comme en groupe, par le MÊME chemin. #8578 —
    /// le panneau REMPLACE les rangées : jamais les deux à la fois.
    func test_actions_unfoldInsideTheSingleGlassBlock_aboveTheBaseRow() throws {
        let code = try callViewCode()
        let pill = try block("var callControlsPill: some View {", until: "var pillHairline: some View", in: code)
        XCTAssertEqual(pill.components(separatedBy: ".callControlsGlass(in:").count - 1, 1, "Un seul verre pour tout le bloc")
        let panel = try XCTUnwrap(pill.range(of: "panelRows(panel)"))
        let families = try XCTUnwrap(pill.range(of: "familyRows(CallCameraRail.menuRows(actions, placement: cameraControlsPlacement))"))
        let base = try XCTUnwrap(pill.range(of: "baseRow"))
        let glass = try XCTUnwrap(pill.range(of: ".callControlsGlass(in:"))
        XCTAssertTrue(pill.contains("if let panel = layer.pillPanel {"), "Le panneau se lit dans CallScreenLayer")
        let alternative = String(pill[panel.upperBound ..< families.lowerBound])
        XCTAssertTrue(alternative.contains("} else {"), "Le panneau REMPLACE les familles, il ne s'empile pas (#8578)")
        XCTAssertLessThan(families.lowerBound, base.lowerBound)
        XCTAssertLessThan(base.lowerBound, glass.lowerBound, "Le verre enveloppe les rangées ET la rangée de base")
        XCTAssertFalse(pill.contains("isGroupStage ?"), "Duo et groupe partagent la même disposition")
        XCTAssertFalse(code.contains("callLegibilityVeil"), "Plus de voile non vitré : le bloc est du verre")
        XCTAssertFalse(code.contains("actionRails"), "Les rails latéraux ont quitté l'écran d'appel")
        XCTAssertFalse(code.contains("CallReactionPalette"), "La palette flottante a rejoint la pilule")
    }

    /// Le bloc de verre est un verre RÉEL sous iOS 26 (`adaptiveGlass`, qui
    /// porte le `glassEffect` et le repli matériau).
    func test_controlsGlass_isRealAdaptiveGlass() throws {
        let glass = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallControlGlass.swift")
        )
        let modifier = try block("func callControlsGlass<S: Shape>(in shape: S) -> some View {", until: "\n    }\n", in: glass)
        XCTAssertTrue(modifier.contains(".adaptiveGlass(in: shape)"))
    }

    /// Les rangées d'actions ne portent plus aucun fond propre : elles sont
    /// DANS le bloc, et elles défilent à l'horizontale.
    func test_actionRows_carryNoBackgroundOfTheirOwn() throws {
        let code = try callViewCode()
        let rows = try block("private func familyRows(", until: "func actionButton(", in: code)
        XCTAssertFalse(rows.contains("callChromeGlass"))
        XCTAssertTrue(rows.contains("CallPillRow("))
        XCTAssertFalse(code.contains("glassEffectID"), "Plus de morphing : les actions naissent dans le bloc qui grandit")
        let row = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallPillRow.swift")
        )
        XCTAssertTrue(row.contains("ScrollView(.horizontal, showsIndicators: false)"))
        XCTAssertTrue(row.contains("scrollTargetBehavior(.viewAligned(limitBehavior: .never))"), "Un lancer va aussi loin qu'il porte (#8736)")
        XCTAssertFalse(row.contains("adaptiveGlass"), "Une rangée dans le bloc de verre n'a pas de verre à elle")
        XCTAssertFalse(row.contains("callChromeGlass"))
    }

    /// Les fichiers de l'écran d'appel qui portent un défilement horizontal
    /// — balayés par GLOB, jamais par liste : un nouveau carrousel est gardé
    /// dès qu'il existe.
    private func horizontalScrollerSources() throws -> [String: String] {
        let anchor = try XCTUnwrap(AppSourceGuard.unitURLs("Meeshy/Features/Main/Views/CallModeCarousel.swift").first)
        let directory = anchor.deletingLastPathComponent()
        let horizontal = try NSRegularExpression(pattern: #"ScrollView\([^)]*\.horizontal"#)
        return try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            .filter { url in
                let name = url.lastPathComponent
                return url.pathExtension == "swift"
                    && (name.hasPrefix("Call") || name.hasPrefix("GroupCall") || name == "VideoFiltersPanel.swift")
            }
            .reduce(into: [String: String]()) { result, url in
                let code = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
                let range = NSRange(code.startIndex ..< code.endIndex, in: code)
                guard horizontal.firstMatch(in: code, range: range) != nil else { return }
                result[url.lastPathComponent] = code
            }
    }

    /// #8575 · #8736 — un geste de glissé posé sur les éléments d'un
    /// défilement horizontal capte le doigt avant le `ScrollView` : la rangée
    /// ne défile plus. L'enfoncement passe par un `ButtonStyle`, qui ne pose
    /// aucun geste — dans TOUT fichier d'appel qui défile à l'horizontale.
    func test_horizontalScrollers_carryNoDragGesture_soEveryRowScrolls() throws {
        let scrollers = try horizontalScrollerSources()
        let expected: Set<String> = ["CallModeCarousel.swift", "CallPillRow.swift", "VideoFiltersPanel.swift", "GroupCallStageView.swift"]
        XCTAssertTrue(expected.isSubset(of: Set(scrollers.keys)), "La garde ne mesurerait rien : \(scrollers.keys.sorted())")
        for (file, code) in scrollers {
            XCTAssertFalse(code.contains(".pressable()"), "\(file) : pressable() pose un DragGesture(minimumDistance: 0) qui vole le défilement")
            XCTAssertFalse(code.contains("DragGesture(minimumDistance: 0)"), file)
        }
        let code = try callViewCode()
        XCTAssertFalse(code.contains(".pressable()"))
        XCTAssertFalse(code.contains("DragGesture(minimumDistance: 0)"))
        XCTAssertTrue(code.contains("struct CallPressButtonStyle: ButtonStyle"))
        for file in ["CallPillRow.swift", "CallModeCarousel.swift", "VideoFiltersPanel.swift"] {
            XCTAssertTrue(scrollers[file]?.contains(".buttonStyle(CallPressButtonStyle())") == true, file)
        }
    }

    /// #8736 — le carrousel et les rangées laissent le lancer aller aussi
    /// loin qu'il porte ; le centre suit le doigt, et le choix ne part qu'au
    /// repos, jamais un défilement programmé contre le doigt.
    func test_carouselAndRows_followTheFingerWithoutBlocking() throws {
        let carousel = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallModeCarousel.swift")
        )
        let row = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallPillRow.swift")
        )
        for (file, code) in [("CallModeCarousel", carousel), ("CallPillRow", row)] {
            XCTAssertTrue(code.contains(".viewAligned(limitBehavior: .never)"), "\(file) : l'accroche par défaut raccourcit le lancer")
            XCTAssertFalse(code.contains("scrollTargetBehavior(.viewAligned)"), "\(file) : accroche sans limitBehavior")
        }
        XCTAssertEqual(carousel.components(separatedBy: "LazyHStack(spacing: layout.spacing)").count - 1, 2, "Les deux pistes, iOS 17+ et iOS 16, sont paresseuses")
        XCTAssertTrue(carousel.contains("onScrollPhaseChange"), "iOS 18 : le choix part au repos du défilement")
        XCTAssertTrue(carousel.contains(".task(id: centred)"), "Avant iOS 18 : le repos se lit après un court délai")
        XCTAssertTrue(carousel.contains("CallModeCarouselRule.trackHeight(itemHeight:"), "La bande de glissé tient un pouce")
        XCTAssertTrue(carousel.contains("motion.rests(on:"), "Le choix se lit par la règle pure")
        XCTAssertTrue(carousel.contains("motion.follows("), "Le suivi programmé se lit par la règle pure")
    }

    /// #8578 — un mode libère l'écran : le chrome d'appel se masque par la
    /// MÊME règle que le toucher (`CallChromeVisibility`), et le mode ne pose
    /// qu'UN carrousel, centré en bas, et sa barre d'action.
    func test_mode_freesTheScreen_withASingleCarouselAndItsActionBar() throws {
        let code = try callViewCode()
        XCTAssertTrue(code.contains("isModeActive: layer.freesTheScreen"))
        XCTAssertTrue(code.contains("callModeLayer"))
        XCTAssertFalse(code.contains("CallEffectsPanel("), "Le panneau Effets empilé a laissé place au mode")
        XCTAssertFalse(code.contains("CallCapturePanel("), "Le panneau Capture empilé a laissé place au mode")
        let controls = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallModeControls.swift")
        )
        let effects = try block("struct CallEffectsModeControls: View {", until: "struct CallMontageModeControls: View {", in: controls)
        XCTAssertTrue(effects.contains("if showsSettings {"), "Réglages REMPLACE le carrousel")
        XCTAssertTrue(effects.contains("switch category {"), "Un seul carrousel, Visage OU Couleur")
        XCTAssertEqual(effects.components(separatedBy: "CallModeActionBar(").count - 1, 1)
        let montage = try block("struct CallMontageModeControls: View {", until: "struct CallMontageStage: View {", in: controls)
        XCTAssertEqual(montage.components(separatedBy: "CallModeCarousel(").count - 1, 1)
        XCTAssertEqual(montage.components(separatedBy: "CallModeActionBar(").count - 1, 1)
        let carousel = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallModeCarousel.swift")
        )
        XCTAssertTrue(carousel.contains(".scrollTargetBehavior(.viewAligned(limitBehavior: .never))"), "Le carrousel s'accroche")
        XCTAssertTrue(carousel.contains(".scrollPosition(id: $centred, anchor: .center)"), "L'élément choisi se pose au centre")
        XCTAssertTrue(carousel.contains(".accessibilityAdjustableAction"), "VoiceOver choisit d'un balayage vertical")
    }

    /// #8625 — aucun déclencheur : deux tapes sur le style choisi prennent la
    /// photo, un appui long filme, et l'arrêt se pose au centre du gabarit.
    func test_mode_shootsFromTheSelectedStyle_withoutAShutter() throws {
        let code = try callViewCode()
        let controls = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallModeControls.swift")
        )
        let carousel = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallModeCarousel.swift")
        )
        XCTAssertFalse(controls.contains("CallModeShutter"), "Le déclencheur a quitté Effets et Montage")
        XCTAssertFalse(carousel.contains("struct CallModeShutter"))
        XCTAssertTrue(carousel.contains("CallModeGestureRule.outcome("), "Le geste se lit par la règle pure")
        XCTAssertTrue(code.contains("CallModeRecordingOverlay(capture: capture)"), "L'arrêt de l'enregistrement se pose sur la scène")
        XCTAssertTrue(controls.contains("CallModeRecordingStop(startedAt:"))
        XCTAssertTrue(code.contains("CallCaptureOutcomeAnnouncer(capture: capture)"), "Le résultat s'annonce même après la sortie du mode")
    }

    /// #8625 — une lenteur est un bug : l'écran d'appel TIENT la capture sans
    /// l'observer. Aperçu, chrono, flash et résultat se lisent dans des vues
    /// feuilles ; sinon un film redessinerait tout l'écran à chaque trame.
    func test_callView_holdsTheCaptureWithoutObservingIt() throws {
        let code = try callViewCode()
        XCTAssertTrue(code.contains("@StateObject var captureHost = CallCaptureHost()"))
        XCTAssertFalse(code.contains("@StateObject var capture "), "Observer le contrôleur redessine l'écran d'appel à chaque trame")
        XCTAssertFalse(code.contains("@ObservedObject var capture"))
        for published in ["preview", "previewFeed", "recordingStartedAt", "flashCount", "status", "style", "thumbnails", "isRecording"] {
            XCTAssertFalse(code.contains("capture.\(published)"), "capture.\(published) se lit dans une vue feuille, jamais dans CallView")
        }
        let service = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallCaptureController.swift")
        )
        let host = try block("final class CallCaptureHost: ObservableObject {", until: "final class CallCaptureController", in: service)
        XCTAssertFalse(host.contains("@Published"), "Le propriétaire ne publie rien")
        XCTAssertFalse(service.contains("@Published private(set) var preview"), "L'aperçu se publie sur son flux, pas sur le contrôleur")
    }

    /// #8576 — le zoom caméra suit MON image en plein écran, jamais la
    /// vignette. #8626 — les commandes de ma caméra vivent dans ma vignette,
    /// et en haut au centre quand mon image est en plein écran, visibles avec
    /// le chrome.
    /// #8626 — une vignette trop petite pour la grille pose UN bouton caméra
    /// qui la déploie par-dessus elle ; un tap ailleurs, sur la vignette ou sur
    /// une action la replie.
    func test_smallSelfTile_foldsTheCameraControlsIntoOneButton() throws {
        let code = try callViewCode()
        XCTAssertTrue(code.contains("CallCameraRail.tileLayout(tileSize: tileSize, count: actions.count)"))
        XCTAssertTrue(code.contains("foldedCameraButton"))
        XCTAssertTrue(code.contains("tapCameraMenu(.button)"))
        XCTAssertTrue(code.contains("tapCameraMenu(.action)"))
        let toggle = try block("func toggleControls() {", until: "\n    }\n", in: code)
        XCTAssertTrue(toggle.contains("tapCameraMenu(.elsewhere)"), "Un tap ailleurs replie la grille")
        let pip = try block("var pipView: some View {", until: "var videoAutoPaused: Bool {", in: code)
        XCTAssertTrue(pip.contains("tapCameraMenu(.elsewhere)"), "Un tap sur la vignette replie la grille avant de permuter")
    }

    func test_cameraZoom_followsMyFullScreenImage_neverTheTile() throws {
        let code = try callViewCode()
        let pip = try block("var pipView: some View {", until: "var videoAutoPaused: Bool {", in: code)
        XCTAssertFalse(pip.contains("callCameraZoom"), "Pincer la vignette la redimensionne, il ne zoome pas")
        XCTAssertTrue(pip.contains("selfTileCameraControls(tileSize: size)"), "Les commandes de ma caméra vivent dans ma vignette")
        XCTAssertTrue(code.contains(".callCameraZoom(isEnabled: effectiveSwapStreams)"))
        let rail = try block("var cameraRail: some View {", until: "\n    }\n}", in: code)
        XCTAssertTrue(rail.contains("CallCameraRail.actions(from: currentActionSet)"))
        XCTAssertTrue(rail.contains("CallCameraRail.isShown("))
        XCTAssertTrue(rail.contains("CallCameraZoomAccessibilityElement()"))
        XCTAssertTrue(rail.contains("alignment: .top"), "Mon image en plein écran : les commandes en haut au centre")
        XCTAssertFalse(rail.contains("alignment: .trailing"), "Le rail vertical de droite a laissé place à la rangée du haut")
        XCTAssertTrue(code.contains("cameraRail\n"), "Le rail est monté dans l'appel établi")
        let stage = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/GroupCallStageView.swift")
        )
        XCTAssertTrue(stage.contains(".callCameraZoom(isEnabled: tile.isLocal && tile.showsVideo)"))
        XCTAssertTrue(stage.contains("GroupCallSpotlight.featuresLocal(focus)"))
    }

    /// Le bouton PiP quitte le plein écran (et retombe sur la pastille si
    /// AVKit refuse), exactement comme le glissé.
    func test_pipButton_andSwipe_leaveFullScreenThroughTheSameEntry() throws {
        let code = try callViewCode()
        let button = try block("func pictureInPictureActionButton(", until: "}\n}", in: code)
        XCTAssertTrue(button.contains("enterSystemPiP()"))
        XCTAssertFalse(button.contains("callManager.startSystemPiP()"), "Le bouton passe par enterSystemPiP et son repli")
        XCTAssertTrue(code.contains("case .systemPiP: enterSystemPiP()"))
        XCTAssertTrue(code.contains("CallPiPPolicy.shouldFallBackToPill("))
        XCTAssertTrue(code.contains("CallPiPPolicy.swipeDownOutcome("))
    }
}
