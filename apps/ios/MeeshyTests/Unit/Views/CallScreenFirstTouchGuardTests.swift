import XCTest
@testable import Meeshy

/// #8735 — chaque bouton de l'écran d'appel répond au premier toucher, comme
/// la flèche et le bouton Conversation de l'en-tête. Ces gardes tiennent le
/// CÂBLAGE des règles pures (`CallChromeInteractionTests`) : une règle juste
/// que rien n'appelle ne réarme aucun compte à rebours.
@MainActor
final class CallScreenFirstTouchGuardTests: XCTestCase {

    private static let viewsPath = "Meeshy/Features/Main/Views/"

    private func code(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relativePath)
        let source = try String(contentsOf: url, encoding: .utf8)
        XCTAssertFalse(source.isEmpty, "\(relativePath) est vide — la garde ne mesurerait rien")
        return AppSourceGuard.stripComments(source)
    }

    private func view(_ name: String) throws -> String {
        try code(Self.viewsPath + name)
    }

    private func block(_ start: String, until end: String, in code: String) throws -> String {
        let from = try XCTUnwrap(code.range(of: start), "\(start) introuvable — la garde ne mesurerait rien")
        let to = try XCTUnwrap(code.range(of: end, range: from.upperBound ..< code.endIndex), "\(end) introuvable")
        return String(code[from.upperBound ..< to.lowerBound])
    }

    // MARK: - Une porte, réarmée par chaque toucher

    func test_pressLabel_reportsEveryFingerDownAndUp() throws {
        let label = try block("private struct CallPressLabel<Content: View>: View {", until: "private struct CallPressHaptic", in: try view("CallDeviceControls.swift"))
        XCTAssertTrue(label.contains("@Environment(\\.callChromeInteraction)"))
        XCTAssertTrue(label.contains("reportInteraction?(pressed ? .touchBegan : .touchEnded)"),
                      "Chaque bouton CallPressButtonStyle (pilule, rangées, puces, barre d'un mode) réarme le masquage")
        XCTAssertTrue(label.contains(".onDisappear"), "Un bouton qui disparaît sous le doigt lève ce doigt")
        XCTAssertTrue(label.contains("CallPressFeedback.animation(isPressed: isPressed, reduceMotion: reduceMotion)"),
                      "Aucun ressort à l'enfoncement")
    }

    func test_sortie_reportsItsTap() throws {
        let menu = try block("struct CallOutputMenu<Face: View>: View {", until: "final class CallAudioRoutePickerLauncher", in: try view("CallDeviceControls.swift"))
        let primary = try block("} primaryAction: {", until: "}", in: menu)
        XCTAssertTrue(primary.contains("reportInteraction?(.tap)"))
        XCTAssertTrue(primary.contains("onToggleSpeaker()"))
    }

    /// #8978 — un appui n'écrit plus aucun état de la racine : la porte ne garde que le rallumage
    /// pendant le fondu. Écrire un compteur de touchers à chaque doigt posé ou levé recalculait tout
    /// l'écran d'appel deux fois par appui, dans les images où le bouton doit montrer son enfoncement.
    func test_callView_injectsTheSingleInteractionDoor_andAPressWritesNoRootState() throws {
        let unit = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        XCTAssertEqual(unit.components(separatedBy: ".environment(\\.callChromeInteraction,").count - 1, 1,
                       "UNE porte, posée à la racine de l'écran d'appel")
        XCTAssertTrue(unit.contains(".environment(\\.callChromeInteraction, { noteChromeInteraction($0) })"))
        let note = try block("func noteChromeInteraction(_ interaction: CallChromeInteraction) {", until: "\n    }\n", in: unit)
        XCTAssertTrue(note.contains("interaction.revealsChrome"))
        XCTAssertFalse(unit.contains("chromeTouches"), "Aucun état de la racine ne compte les touchers")
    }

    /// #8978 — aucun minuteur ne cache les contrôles : un toucher sur l'écran les cache, un autre
    /// les remet. Le masquage au bout de 4 s les retirait sous le doigt de qui cherchait une option.
    func test_noTimerHidesTheControls_onlyATapTogglesThem() throws {
        let unit = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        for minuterie in ["AutoHideKey", "autoHideDelay", "mayAutoHideNow", "shouldAutoHideControls"] {
            XCTAssertFalse(unit.contains(minuterie), "Le masquage minuté est revenu : \(minuterie)")
        }
        let toggle = try block("func toggleControls() {", until: "\n    }\n", in: unit)
        XCTAssertTrue(toggle.contains("CallChromeVisibility.mayToggleByTap(isVideoStage: isVideoStage)"))
        XCTAssertTrue(toggle.contains("showControls.toggle()"))
    }

    func test_pillRows_reportTheirScrolling_andFlickFreely() throws {
        let row = try view("CallPillRow.swift")
        XCTAssertTrue(row.contains(".modifier(CallRowScrollInteraction())"))
        XCTAssertTrue(row.contains(".onScrollPhaseChange"))
        XCTAssertTrue(row.contains("CallChromeScrollRule.interaction(wasScrolling: isScrolling, isScrolling: scrolling)"))
        XCTAssertTrue(row.contains("if #available(iOS 18.0, *)"), "La phase de défilement n'existe qu'à partir d'iOS 18")
        XCTAssertTrue(row.contains("viewAligned(limitBehavior: .never)"))
    }

    // MARK: - Grâce du fondu

    func test_chromeVisibility_cutsTouchesAtTheEndOfTheFade_notItsStart() throws {
        let glass = try view("CallControlGlass.swift")
        let modifier = try block("private struct CallChromeVisibilityModifier: ViewModifier {", until: "enum CallButtonFill {", in: glass)
        XCTAssertTrue(modifier.contains("CallChromeVisibility.acceptsTouches("))
        XCTAssertTrue(modifier.contains(".allowsHitTesting(accepts)"))
        XCTAssertFalse(glass.contains(".allowsHitTesting(isVisible)"), "Couper le toucher au DÉBUT du fondu laisse un bouton visible et sourd")
        XCTAssertTrue(modifier.contains("reportInteraction?(.revive)"), "Un toucher reçu pendant le fondu rallume le chrome")
    }

    // MARK: - Scène de groupe

    func test_groupStage_revealsFromAnywhere_andTilesFollowTheRule() throws {
        let connected = try view("CallView+Connected.swift")
        let layout = try block("private var groupStageLayout: some View {", until: "private var stageRevealTarget: some View {", in: connected)
        XCTAssertTrue(layout.contains(".background(stageRevealTarget)"))
        XCTAssertTrue(layout.contains("isChromeVisible: isChromeVisible"))
        let stage = try view("GroupCallStageView.swift")
        XCTAssertTrue(stage.contains("GroupStageTapRule.outcome(isChromeVisible: isChromeVisible)"))
        XCTAssertTrue(stage.contains(".onTapGesture { tapTile(tile) }"))
    }

    func test_featuredTile_installsItsDoubleTapOnlyForAScreenShare() throws {
        let stage = try view("GroupCallStageView.swift")
        XCTAssertFalse(stage.contains("onTapGesture(count: 2)"), "Un double toucher permanent retarde chaque toucher simple")
        XCTAssertTrue(stage.contains(".gesture(zoomResetTap, including: isScreenShare ? .all : .subviews)"))
    }

    // MARK: - Ce qui couvrait le bloc

    func test_noticesSitAboveThePill_andNeverOverItsRows() throws {
        let controls = try view("CallView+CallControls.swift")
        let layer = try block("var callControlsLayer: some View {", until: "var callControlsNoticesAbove: some View {", in: controls)
        XCTAssertFalse(layer.contains("CallInviteStrip("))
        XCTAssertFalse(layer.contains("CallControlsNoticePill("))
        XCTAssertFalse(controls.contains("chromeBottomInset + 200"), "Une hauteur fixe tombe sur la première rangée du (…) déployé")
        XCTAssertTrue(controls.contains(".alignmentGuide(.top) { $0[.bottom] + 10 }"))
        let connected = try view("CallView+Connected.swift")
        XCTAssertEqual(connected.components(separatedBy: ".overlay(alignment: .top) { callControlsNoticesAbove }").count - 1, 2,
                       "En duo comme en groupe, au-dessus du bloc")
        let strip = try block("struct CallInviteStrip: View, Equatable {", until: "struct CallControlsNoticePill", in: try view("CallControlsViews.swift"))
        XCTAssertTrue(strip.contains(".allowsHitTesting(false)"), "Une information ne vole aucun toucher")
    }

    // MARK: - Un creux réseau ne détruit plus l'écran

    func test_connectedView_isMountedExactlyOnce() throws {
        let callView = try view("CallView.swift")
        XCTAssertEqual(AppSourceGuard.occurrences(ofIdentifier: "connectedView", in: callView), 1,
                       "Deux branches du switch en faisaient deux vues : .connected → .reconnecting détruisait le (…), le mode, les rangées")
        let gate = try XCTUnwrap(callView.range(of: "if showsConnectedLayout {"))
        let mounted = try XCTUnwrap(callView.range(of: "connectedView"))
        let states = try XCTUnwrap(callView.range(of: "switch callManager.callState {"))
        XCTAssertLessThan(gate.lowerBound, mounted.lowerBound)
        XCTAssertLessThan(mounted.lowerBound, states.lowerBound, "Monté HORS du switch, avant lui")
    }

    // MARK: - Haptique pendant l'appel

    func test_callAudioSession_allowsHapticsDuringRecording() throws {
        let manager = try AppSourceGuard.unit("Meeshy/Features/Main/Services/CallManager.swift")
        let configure = try block("func configureAudioSession() {", until: "func updateAudioSessionModeForCurrentVideoState()", in: manager)
        XCTAssertTrue(configure.contains("setAllowHapticsAndSystemSoundsDuringRecording(true)"),
                      "Sans ce choix, iOS tait tout retour haptique pendant que l'appel enregistre le micro")
    }

    // MARK: - Pile du fil principal sur appareil (2026-09-30)

    /// Cinq `.ips` d'un iPhone : `___chkstk_darwin` dans `closure #1 in
    /// CallView.callSurface` — la fermeture du `ZStack` réservait la trame de
    /// toutes ses branches à la fois, au-delà du 1 Mo de pile d'un appareil. Le
    /// simulateur (8 Mo) ne peut pas rougir : seule la FORME se garde.
    func test_callSurface_nePorteQueDesBlocsEffacés() throws {
        let unit = try view("CallView.swift")
        let surface = try block("private var callSurface: some View {", until: ".ignoresSafeArea()", in: unit)
        for erased in ["surfaceBackdrop", "surfaceContent", "surfaceEffects", "AnyView(topChrome)"] {
            XCTAssertTrue(surface.contains(erased), "\(erased) doit rester un bloc effacé de la surface d'appel")
        }
        for inline in ["switch callManager.callState", "connectedView", "CallEffectsOverlay(", "LocalCameraVideoView("] {
            XCTAssertFalse(surface.contains(inline), "\(inline) ne se pose plus DANS la fermeture de callSurface")
        }
        for declaration in ["private var surfaceBackdrop: AnyView { AnyView(surfaceBackdropBody) }",
                            "private var surfaceContent: AnyView { AnyView(surfaceContentBody) }",
                            "private var surfaceEffects: AnyView { AnyView(surfaceEffectsBody) }"] {
            XCTAssertTrue(unit.contains(declaration), "l'effacement vit à la DÉCLARATION : \(declaration)")
        }
    }

    /// `.ips` du 2026-09-29 : `closure #1 in closure #1 in
    /// ConversationCardStatsRow.row(languages:)` trappait sur
    /// `com.apple.SwiftUI.AsyncRenderer` — la fermeture d'un `ForEach` hérite de
    /// l'isolation @MainActor, iOS 26 la rappelle hors du fil principal.
    func test_statsRow_nePasseAucuneFermetureAuRenduAsynchrone() throws {
        let unit = try code("Meeshy/Features/Main/Components/ConversationCard/ConversationLinkCardBody.swift")
        let row = try block("struct ConversationCardStatsRow: View {", until: "private func metric(", in: unit)
        XCTAssertFalse(row.contains("ForEach("), "aucune fermeture de ForEach dans la rangée mesurée hors du fil principal")
        XCTAssertTrue(row.contains("languagePill(shown[0])"))
    }

    /// 2026-09-30 — dans un `GlassEffectContainer` (iOS 26) le verre est composé
    /// par le conteneur, qui ignore l'opacité de ses enfants : la pilule restait
    /// dessinée après le masquage automatique, visible mais sourde. Au terme du
    /// fondu, le contenu est retiré du rendu.
    func test_chromeVisibility_retireLeContenuDuRenduAuTermeDuFondu() throws {
        let unit = try view("CallControlGlass.swift")
        let modifier = try block("private struct CallChromeVisibilityModifier: ViewModifier {", until: "enum CallButtonFill", in: unit)
        XCTAssertTrue(modifier.contains("content.hidden()"), "le contenu masqué quitte le rendu, pas seulement l'opacité")
        XCTAssertTrue(modifier.contains("if accepts {"), "il reste rendu tant qu'il répond (grâce du fondu, #8735)")
    }

    /// 2026-09-30 — l'aperçu de l'appelant (#8480) posé en `.background` d'un
    /// `VStack` sans cadre n'était peint que sur la largeur des boutons : une
    /// colonne au milieu de l'écran de sonnerie.
    func test_apercuDeLAppelant_couvreTouteLaSonnerie() throws {
        let incoming = try view("IncomingCallView.swift")
        let framed = try XCTUnwrap(incoming.range(of: ".frame(maxWidth: .infinity, maxHeight: .infinity)"))
        let backdrop = try XCTUnwrap(incoming.range(of: ".background { CallPreviewBackdrop(preview: .shared) }"))
        XCTAssertLessThan(framed.lowerBound, backdrop.lowerBound, "le cadre plein écran précède l'aperçu")
        let connecting = try block("var connectingView: some View {", until: "var pulsingAvatar", in: try view("CallView+States.swift"))
        XCTAssertTrue(connecting.contains(".frame(maxWidth: .infinity, maxHeight: .infinity)"))
    }
}
