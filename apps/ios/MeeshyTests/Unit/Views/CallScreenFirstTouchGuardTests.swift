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

    func test_callView_injectsTheSingleInteractionDoor() throws {
        let unit = AppSourceGuard.stripComments(try AppSourceGuard.callViewSource())
        XCTAssertEqual(unit.components(separatedBy: ".environment(\\.callChromeInteraction,").count - 1, 1,
                       "UNE porte, posée à la racine de l'écran d'appel")
        XCTAssertTrue(unit.contains(".environment(\\.callChromeInteraction, { noteChromeInteraction($0) })"))
        let note = try block("func noteChromeInteraction(_ interaction: CallChromeInteraction) {", until: "\n    }\n", in: unit)
        XCTAssertTrue(note.contains("chromeTouches = chromeTouches.noting(interaction)"))
        XCTAssertTrue(note.contains("interaction.revealsChrome"))
    }

    func test_autoHide_isKeyedOnEveryInteraction_andNeverFallsUnderAFinger() throws {
        let connected = try view("CallView+Connected.swift")
        XCTAssertTrue(connected.contains(".task(id: AutoHideKey(isVisible: showControls, layer: layer, interactionRevision: chromeTouches.revision))"))
        XCTAssertTrue(connected.contains("isTouching: chromeTouches.isTouching"))
        let task = try block(".task(id: AutoHideKey(", until: ".task(id: callManager.isVideoEnabled)", in: connected)
        XCTAssertEqual(task.components(separatedBy: "mayAutoHideNow").count - 1, 2,
                       "La règle se relit au réveil : un doigt posé pendant l'attente retient le masquage")
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
        let manager = try code("Meeshy/Features/Main/Services/CallManager.swift")
        let configure = try block("private func configureAudioSession() {", until: "private func updateAudioSessionModeForCurrentVideoState()", in: manager)
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
}
