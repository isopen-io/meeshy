import XCTest
@testable import Meeshy

/// #8735 — chaque bouton de l'écran d'appel répond au premier toucher, comme
/// la flèche et le bouton Conversation de l'en-tête. Ces gardes tiennent le
/// CÂBLAGE des règles pures (`CallChromeInteractionTests`) : une règle juste
/// que rien n'appelle ne réarme aucun compte à rebours.
@MainActor
final class CallScreenFirstTouchGuardTests: XCTestCase {

    private static let viewsPath = "Meeshy/Features/Call/Views/"

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
        XCTAssertFalse(toggle.contains("isVideoStage"), "#17945 — le toucher range tout sur toute scène, vidéo ou audio")
        XCTAssertTrue(toggle.contains("showControls.toggle()"))
    }

    /// #17945 (loi 11) — en duo audio, un toucher sur le fond derrière l'avatar range l'en-tête,
    /// la pilule et le journal, et l'avatar reprend 120 pt (la loi pure `CallPillText` le décide) ;
    /// un nouveau toucher les rend. Sous VoiceOver les contrôles restent en place.
    func test_audioDuo_aTapOnTheBackground_stowsTheChrome() throws {
        let connected = try view("CallView+Connected.swift")
        let duo = try block("private var duoLayout: some View {", until: "private var swipeDownToLeaveGesture: some Gesture {", in: connected)
        XCTAssertTrue(duo.contains(".onTapGesture { tapAudioBackground() }"), "Le fond de l'audio est la scène")
        XCTAssertTrue(duo.contains("if pillText.compactsAudioLayout {"), "L'avatar compact suit le journal servi, rangé ou non")
        let tap = try block("func tapAudioBackground() {", until: "\n    }\n", in: connected)
        XCTAssertTrue(tap.contains("guard exposesTheTapToggle else { return }"))
        XCTAssertTrue(tap.contains("toggleControls()"))
        let exposes = try block("private var exposesTheTapToggle: Bool {", until: "\n    }\n", in: connected)
        XCTAssertTrue(exposes.contains("CallChromeVisibility.mayToggleByTap(isVoiceOverRunning: UIAccessibility.isVoiceOverRunning)"))
        XCTAssertFalse(exposes.contains("isVideoStage"))
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
        let manager = try AppSourceGuard.unit("Meeshy/Features/Call/Services/CallManager.swift")
        let configure = try block("func configureAudioSession() {", until: "func updateAudioSessionModeForCurrentVideoState()", in: manager)
        let tuning = try AppSourceGuard.unit("Meeshy/Features/Call/Services/WebRTC/CallAudioSessionTuning.swift")
        XCTAssertTrue(configure.contains("CallAudioSessionTuning.applyCallPreferences(to: session.session)")
                      && tuning.contains("setAllowHapticsAndSystemSoundsDuringRecording(true)"),
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
        for inline in ["switch callManager.callState", "connectedView", "callModeLayer", "LocalCameraVideoView("] {
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

    // MARK: - #17532 — le rangement : UN verre, par les bords, et la vignette rend d'abord les contrôles

    /// G1.3 — contrôles cachés, les sous-titres restent dans LE verre de la pilule, privé de sa
    /// rangée de base : plus de second verre (`callChromeGlass`) qui apparaîtrait pendant que la
    /// pilule s'efface.
    func test_stowedPill_isTheSameGlass_whoseBaseRowRetires() throws {
        let pillSource = try view("CallView+Pill.swift")
        let pill = try block("var callControlsPill: some View {", until: "var pillHairline: some View", in: pillSource)
        XCTAssertTrue(pill.contains("text.hasBaseRow"), "La rangée de base se retire quand la pilule est rangée")
        XCTAssertTrue(pill.contains("text.showsCaptionsBand"), "Les sous-titres restent dans le verre, rangés ou non")
        XCTAssertTrue(pill.contains(".transition(unfoldTransition)"), "La rangée de base part par le morphisme des rangées : le verre se resserre")
        XCTAssertEqual(pill.components(separatedBy: ".callControlsGlass(in:").count - 1, 1)
        let controlsBlock = try block("var callControlsBlock: some View {", until: "private func unfoldedRows", in: pillSource)
        XCTAssertTrue(controlsBlock.contains("let isShown = isChromeVisible || pillText.staysWhenChromeStowed"),
                      "La pilule rangée ne s'efface pas quand elle porte les sous-titres")
        XCTAssertTrue(controlsBlock.contains(".callChromeVisibility(isShown)"))
        XCTAssertTrue(controlsBlock.contains(".modifier(CallEdgeStow(edge: .bottom, margin: Self.chromeBottomInset, isVisible: isShown, reduceMotion: reduceMotion))"),
                      "Toute rangée, la pilule repart vers le bas de l'écran, d'où elle vient, de toute sa hauteur mesurée")
        XCTAssertFalse(pillSource.contains("stowedCaptions"), "Plus de second verre pour les sous-titres rangés")
        let transcript = try view("CallView+Transcript.swift")
        XCTAssertFalse(transcript.contains("stowedCaptions"))
        XCTAssertFalse(transcript.contains("captionsBand(hasOwnGlass: true)"), "Seul le bandeau d'un mode (Effets, Montage) a son verre")
    }

    /// G1.11 · G2.8 — les rails sortent par leur bord et reviennent par lui ; l'en-tête sort par le
    /// haut ; la rangée de base se retire de la pilule. Transformation et opacité seulement,
    /// « Réduire les animations » : un fondu.
    func test_stow_movesTheChromeThroughItsEdges() throws {
        let rails = try view("CallView+Rails.swift")
        let positioned = try block("private func positionedRail(", until: "private func actionRail(", in: rails)
        XCTAssertTrue(positioned.contains(".modifier(CallRailStow(side: side, safeHorizontal: safeHorizontal, isVisible: isChromeVisible, reduceMotion: reduceMotion))"),
                      "Le rail rangé sort par SON bord de l'écran")
        let stow = try block("private struct CallRailStow: ViewModifier {", until: "private struct CallRailSlide", in: rails)
        XCTAssertTrue(stow.contains("CallChromeStow.leavesByItsEdge(isVisible: isVisible, reduceMotion: reduceMotion)"))
        XCTAssertTrue(stow.contains(".animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: isVisible)"))
        let header = try block("var topChrome: some View {", until: "private func headerButton(", in: try view("CallView+Header.swift"))
        let row = try XCTUnwrap(header.range(of: "AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing)"))
        let headerStow = try XCTUnwrap(header.range(of: ".modifier(CallEdgeStow(edge: .top, margin: Self.chromeTopInset, isVisible: isChromeVisible, reduceMotion: reduceMotion))"), "L'en-tête rangé remonte")
        let spacer = try XCTUnwrap(header.range(of: "Spacer()", options: .backwards))
        XCTAssertTrue(row.upperBound < headerStow.lowerBound && headerStow.upperBound < spacer.lowerBound,
                      "C'est la RANGÉE qui se mesure et sort, pas la colonne pleine hauteur qui la pose")
        let glass = try view("CallControlGlass.swift")
        let edgeStow = try block("struct CallEdgeStow: ViewModifier {", until: "struct CallSelfTileStow", in: glass)
        XCTAssertTrue(edgeStow.contains(".onGeometryChange(for: CGFloat.self) { $0.size.height } action: { extent = $0 }"), "La sortie se mesure sur l'élément")
        XCTAssertTrue(edgeStow.contains("CallChromeStow.leavesByItsEdge(isVisible: isVisible, reduceMotion: reduceMotion) ? CallChromeStow.travel(toward: edge, extent: extent, margin: margin) : 0"))
        XCTAssertFalse(glass.contains("headerRowHeight") || glass.contains("pillTravel"), "Plus de distance devinée")
        let connected = try view("CallView+Connected.swift")
        let toggle = try block("func toggleControls() {", until: "\n    }\n", in: connected)
        XCTAssertTrue(toggle.contains("withAnimation(CallChromeStow.animation(reduceMotion: reduceMotion))"), "Le toggle tient compte de Réduire les animations")
        let note = try block("func noteChromeInteraction(", until: "\n    }\n", in: connected)
        XCTAssertTrue(note.contains("CallChromeStow.animation(reduceMotion: reduceMotion)"))
    }

    /// G1.11 — ma vignette se range par une transformation (échelle ancrée à son coin), son cadre
    /// ne change pas : aucun relayout pendant le geste.
    func test_selfTile_stowsByScale_notByANewFrame() throws {
        let tile = try view("CallView+SelfView.swift")
        let size = try block("func pipTileSize(in container: CGSize, safeArea: EdgeInsets) -> CGSize {", until: "private func nearestCorner(", in: tile)
        XCTAssertFalse(size.contains("isChromeVisible"), "Le cadre est celui du palier choisi")
        XCTAssertTrue(tile.contains("var selfTileStowFactor: CGFloat { CallSelfTileScale.restingFactor(selfTileScale, isChromeVisible: isChromeVisible) }"))
        XCTAssertEqual(tile.components(separatedBy: ".modifier(CallSelfTileStow(factor: selfTileStowFactor, anchor: CallSelfTileScale.anchor(of: base, in: geo.size)").count - 1, 2,
                       "La vignette vivante ET la tuile « vidéo en pause » se rangent de même")
        XCTAssertEqual(tile.components(separatedBy: "stowFactor: selfTileStowFactor))").count - 1, 2,
                       "Rangées, les deux tuiles gardent les coins et le liseré d'une petite vignette (loi 4)")
        XCTAssertFalse(tile.contains("RoundedRectangle(cornerRadius:"), "La découpe et le liseré ont un seul site")
        let outline = try block("struct CallSelfTileOutline: ViewModifier {", until: "\n}", in: try view("CallTileChrome.swift"))
        XCTAssertTrue(outline.contains("RoundedRectangle(cornerRadius: CallSelfTileScale.counterScaled(MeeshyRadius.smPlus, by: stowFactor))"))
        XCTAssertTrue(outline.contains("lineWidth: CallSelfTileScale.counterScaled(lineWidth, by: stowFactor)"))
        let outlineSite = try XCTUnwrap(tile.range(of: ".modifier(CallSelfTileOutline("))
        let stowSite = try XCTUnwrap(tile.range(of: ".modifier(CallSelfTileStow("))
        XCTAssertLessThan(outlineSite.lowerBound, stowSite.lowerBound, "Le liseré est dessiné AVANT l'échelle qui le contre-balance")
        XCTAssertTrue(tile.contains("CallPeerMutedBadge(compact: true).padding(MeeshySpacing.xs).scaleEffect(CallSelfTileScale.counterScaled(1, by: selfTileStowFactor), anchor: .bottomLeading)"),
                      "Le badge micro coupé reste lisible dans la vignette rangée")
        let glass = try view("CallControlGlass.swift")
        let stow = try block("struct CallSelfTileStow: ViewModifier {", until: "\n}\n", in: glass)
        XCTAssertTrue(stow.contains(".scaleEffect(factor, anchor: anchor)"))
        XCTAssertFalse(stow.contains("clipShape"), "L'échelle ne redécoupe pas : ombre et badges restent hors découpe")
        XCTAssertTrue(stow.contains(".animation(reduceMotion ? nil : CallChromeStow.animation(reduceMotion: false), value: isChromeVisible)"),
                      "Réduire les animations : la vignette change de taille sans mouvement")
    }

    /// G1.9 (loi 15) — contrôles cachés, toucher ma vignette rend d'abord les contrôles ; la
    /// permutation attend le toucher suivant. VoiceOver garde l'action directe (les contrôles
    /// restent en place sous VoiceOver).
    func test_selfTileTap_revealsTheControlsFirst_thenSwaps() throws {
        let tile = try view("CallView+SelfView.swift")
        let tap = try block("private func tapPictureInPicture() {", until: "private func swapPictureInPicture()", in: tile)
        XCTAssertTrue(tap.contains("GroupStageTapRule.outcome(isChromeVisible: showControls) == .spotlight"), "La règle de la scène de groupe, pas une seconde")
        XCTAssertTrue(tap.contains("noteChromeInteraction(.revive)"), "Contrôles rangés : on les rend, on ne permute pas")
        XCTAssertTrue(tap.contains("swapPictureInPicture()"))
        XCTAssertTrue(tile.contains(".onTapGesture { tapPictureInPicture() }"))
        XCTAssertTrue(tile.contains(".accessibilityAction { swapPictureInPicture() }"))
    }
}
