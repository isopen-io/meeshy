import XCTest
@testable import Meeshy
import MeeshyUI

// MARK: - CallPillStatus Unit Tests

@MainActor
final class CallPillStatusTests: XCTestCase {

    // MARK: - from(_ state:) mapping

    func test_from_connected_returnsConnected() {
        XCTAssertEqual(CallPillStatus.from(.connected), .connected)
    }

    func test_from_outgoingRinging_returnsRinging() {
        XCTAssertEqual(CallPillStatus.from(.ringing(isOutgoing: true)), .ringing)
    }

    func test_from_incomingRinging_returnsRinging() {
        XCTAssertEqual(CallPillStatus.from(.ringing(isOutgoing: false)), .ringing)
    }

    func test_from_offering_returnsRinging() {
        // Audit 2026-07-10 — `.offering` (SDP offer sent, awaiting answer) is
        // still the callee's phone physically ringing; CallView already shows
        // outgoingRingingView ("Sonnerie…") for this state, not a connecting
        // spinner. The pill must agree, or minimizing an outgoing call before
        // it's answered shows a misleading "establishing connection" status.
        XCTAssertEqual(CallPillStatus.from(.offering), .ringing)
    }

    func test_from_connecting_returnsConnecting() {
        XCTAssertEqual(CallPillStatus.from(.connecting), .connecting)
    }

    func test_from_reconnecting_returnsReconnecting() {
        XCTAssertEqual(CallPillStatus.from(.reconnecting(attempt: 1)), .reconnecting)
    }

    func test_from_reconnecting_highAttempt_returnsReconnecting() {
        XCTAssertEqual(CallPillStatus.from(.reconnecting(attempt: 5)), .reconnecting)
    }

    func test_from_idle_returnsConnecting_safeNonConnectedFallback() {
        // The pill is hidden when `.idle` (isActive == false); mapping to
        // `.connecting` ensures a stray render never displays a green "00:00".
        XCTAssertEqual(CallPillStatus.from(.idle), .connecting)
    }

    func test_from_ended_returnsConnecting_safeNonConnectedFallback() {
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .local)), .connecting)
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .remote)), .connecting)
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .missed)), .connecting)
        XCTAssertEqual(CallPillStatus.from(.ended(reason: .connectionLost)), .connecting)
    }

    // MARK: - isConnected

    func test_isConnected_trueOnlyForConnected() {
        XCTAssertTrue(CallPillStatus.connected.isConnected)
        XCTAssertFalse(CallPillStatus.ringing.isConnected)
        XCTAssertFalse(CallPillStatus.connecting.isConnected)
        XCTAssertFalse(CallPillStatus.reconnecting.isConnected)
    }

    // MARK: - label

    func test_label_emptyForConnected() {
        XCTAssertEqual(CallPillStatus.connected.label, "")
    }

    func test_label_nonEmptyForNonConnectedStates() {
        // Les libellés survivent pour VoiceOver même si le rendu visuel est
        // devenu un glyphe code couleur (retour user 2026-07-04).
        XCTAssertFalse(CallPillStatus.ringing.label.isEmpty,
                       "ringing status label must not be empty — VoiceOver reads it")
        XCTAssertFalse(CallPillStatus.connecting.label.isEmpty,
                       "connecting status label must not be empty — VoiceOver reads it")
        XCTAssertFalse(CallPillStatus.reconnecting.label.isEmpty,
                       "reconnecting status label must not be empty — VoiceOver reads it")
    }

    // MARK: - Status glyphs (2026-07-04 — glyphes + code couleur)

    func test_glyph_nilForConnected_durationTakesOver() {
        XCTAssertNil(CallPillStatus.connected.glyphSystemName)
        XCTAssertNil(CallPillStatus.connected.glyphColor)
    }

    func test_glyph_definedForEveryPreConnectionState() {
        for status in [CallPillStatus.ringing, .connecting, .reconnecting] {
            XCTAssertNotNil(status.glyphSystemName, "\(status) must expose a status glyph")
            XCTAssertNotNil(status.glyphColor, "\(status) must expose a status color")
        }
    }

    func test_glyph_reconnecting_isNetworkDropGlyph() {
        // Rupture réseau = glyphe wifi barré, code couleur rouge — distinct de
        // l'attente ambre (sonnerie/connexion).
        XCTAssertEqual(CallPillStatus.reconnecting.glyphSystemName, "wifi.exclamationmark")
        XCTAssertNotEqual(CallPillStatus.reconnecting.glyphColor, CallPillStatus.ringing.glyphColor)
    }
}

// MARK: - FloatingCallPillView Source Inspection Tests

@MainActor
final class FloatingCallPillViewTests: XCTestCase {

    private func pillSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/FloatingCallPillView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Reduce Motion support

    func test_pill_readsReduceMotionEnvironment() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("accessibilityReduceMotion"),
            "FloatingCallPillView must read @Environment(\\.accessibilityReduceMotion) " +
            "to conditionally skip animated transitions for motion-sensitive users."
        )
    }

    func test_pill_transition_usesConditionalOpacityWhenReduceMotion() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? .opacity"),
            "FloatingCallPillView transition must collapse to .opacity when reduceMotion " +
            "is true — .move animations can trigger vestibular discomfort."
        )
    }

    func test_pill_animation_isNilWhenReduceMotion() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? nil"),
            "FloatingCallPillView spring animation must be nil when reduceMotion is true " +
            "so the pill appears/disappears without a spring bounce."
        )
    }

    func test_expandToFullScreen_respectsReduceMotion() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("reduceMotion ? nil : .spring(response: 0.5"),
            "expandToFullScreen() must gate its withAnimation on reduceMotion — " +
            "unconditional .spring when reduceMotion is enabled triggers a spring " +
            "bounce that can cause vestibular discomfort."
        )
    }

    // MARK: - Morph PiP (retour user 2026-08-12)

    // La réduction/expansion entre le plein écran et la bannière est un MORPH
    // interne (contraction/étirement vers le haut), pas l'animation système du
    // fullScreenCover : les deux bascules de displayMode passent par
    // withTransaction(disablesAnimations) et CallView porte le trio
    // scale/opacité/coins (pipMorphProgress).

    func test_expandToFullScreen_usesMorphNotSystemCoverAnimation() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("callManager.requestPipExpansionMorph()"),
            "expandToFullScreen() must arm the one-shot expansion hint so " +
            "CallView plays the grow-from-banner morph on appear."
        )
        guard let fnRange = source.range(of: "private func expandToFullScreen()") else {
            XCTFail("expandToFullScreen not found"); return
        }
        let body = String(source[fnRange.lowerBound...].prefix(900))
        XCTAssertTrue(
            body.contains("disablesAnimations = true"),
            "expandToFullScreen() must present the fullScreenCover without the " +
            "system slide animation — the CallView morph IS the transition."
        )
    }

    func test_callView_carriesPipMorphTrioAndCollapseHelper() throws {
        let viewsDir = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        let source = try String(
            contentsOf: viewsDir.appendingPathComponent("CallView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(
            source.contains("pipMorphProgress, anchor: .top") ||
            source.contains("scaleEffect(1 - 0.9 * pipMorphProgress, anchor: .top)"),
            "CallView must scale its root content toward .top during the PiP " +
            "morph — the banner lives at the top of the viewport."
        )
        XCTAssertTrue(
            source.contains("private func collapseIntoPip()"),
            "All collapse paths (chevron, swipe-down, open-conversation) must " +
            "route through collapseIntoPip() so the shrink morph plays before " +
            "the cover swap."
        )
        XCTAssertTrue(
            source.contains("consumePendingPipExpansion()"),
            "CallView.onAppear must consume the expansion hint and play the " +
            "grow morph when returning from the banner."
        )
        XCTAssertFalse(
            source.contains("withAnimation(.spring(response: 0.5, dampingFraction: 0.8)) {\n                                        callManager.displayMode = .pip"),
            "No direct animated displayMode flips left behind — they would " +
            "stack the system cover animation on top of the morph."
        )
    }

    // MARK: - Accessibility labels on controls

    func test_muteButton_hasAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.mute") && source.contains("call.pill.unmute"),
            "The mute button in FloatingCallPillView must carry dynamic accessibility labels " +
            "reflecting the current mute state so VoiceOver announces the tap outcome."
        )
    }

    func test_speakerButton_hasAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.speaker.on") && source.contains("call.pill.speaker.off"),
            "The speaker button must carry dynamic accessibility labels reflecting the " +
            "current speaker state."
        )
    }

    func test_hangupButton_hasAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.hangup"),
            "The hang-up button must carry an accessibility label so VoiceOver users " +
            "can identify it without exploring by touch."
        )
    }

    // 2026-07-04 — le bouton « agrandir » dédié est RETIRÉ : toucher la
    // bannière remet en plein écran (le bouton était redondant et chargeait
    // la barre). Le retour plein écran reste couvert par le tap container.
    func test_expandButton_isRemoved_tapOnBannerExpands() throws {
        let source = try pillSource()
        XCTAssertFalse(
            source.contains("private var expandButton"),
            "The dedicated expand button must stay removed — tapping the banner itself " +
            "returns to the full-screen call (user feedback 2026-07-04)."
        )
        XCTAssertTrue(
            source.contains(".onTapGesture {") && source.contains("expandToFullScreen()"),
            "The banner container must keep its tap-to-expand gesture — it is the only " +
            "affordance left to return to the full-screen call."
        )
    }

    func test_banner_isFullWidth_whatsAppStyle() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains(".frame(maxWidth: .infinity)"),
            "The minimised call banner must stretch edge-to-edge (WhatsApp-style bar " +
            "over the whole app) instead of floating as a content-sized capsule."
        )
    }

    // 2026-08-12 — barre immersive façon WhatsApp : le fond de la bannière
    // remonte sous la status bar jusqu'au bord haut du viewport. Sans cette
    // extension, la zone status bar laisse voir le contenu scrollé derrière
    // (bulles de messages au-dessus de la barre — capture user 2026-08-12).
    func test_banner_backgroundBleedsIntoTopSafeArea_immersive() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains(".ignoresSafeArea(.container, edges: .top)"),
            "The banner background must extend under the status bar to the top of the " +
            "viewport (WhatsApp-style immersive bar) — otherwise scrolled content stays " +
            "visible in the status-bar strip above the banner."
        )
        guard let backgroundRange = source.range(of: ".background("),
              let offsetRange = source.range(of: ".offset(x: pillDragOffset)") else {
            XCTFail("expected pillContent to keep its .background + .offset chain")
            return
        }
        let backgroundBlock = String(source[backgroundRange.lowerBound..<offsetRange.lowerBound])
        XCTAssertTrue(
            backgroundBlock.contains(".ignoresSafeArea(.container, edges: .top)"),
            "ignoresSafeArea must apply to the banner BACKGROUND only (decor bleed), " +
            "never to the banner content — the controls must stay inside the safe area."
        )
    }

    // 2026-08-12 — retour user (second passage, remplace le fondu demandé le
    // matin même) : la bannière est PLEINEMENT indigo. Pas de voile noir
    // (l'ancien scrim 40 % la faisait lire comme une « barre noire » sur la
    // status bar), pas de fondu transparent en bas — un aplat indigo net dont
    // les arrêts (CallBannerContrast.bannerTop/bannerBottom) portent seuls le
    // contraste WCAG (CallBannerContrastTests).
    func test_banner_isFullIndigo_noScrimNoFade() throws {
        let source = try pillSource()
        guard let backgroundRange = source.range(of: ".background("),
              let offsetRange = source.range(of: ".offset(x: pillDragOffset)") else {
            XCTFail("expected pillContent to keep its .background + .offset chain")
            return
        }
        let backgroundBlock = String(source[backgroundRange.lowerBound..<offsetRange.lowerBound])
        XCTAssertFalse(
            backgroundBlock.contains("TopBarBottomFade"),
            "No bottom fade on the call banner — the bar must end in a clean " +
            "indigo edge (user feedback 2026-08-12, superseding the morning's " +
            "fade request)."
        )
        XCTAssertFalse(
            backgroundBlock.contains("Color.black.opacity"),
            "No black scrim over the banner — the status-bar strip must read " +
            "as plain indigo, never as a dark band (user feedback 2026-08-12). " +
            "Contrast comes from the gradient stops, calibrated in " +
            "CallBannerContrastTests."
        )
        XCTAssertTrue(
            backgroundBlock.contains("CallBannerContrast.bannerTop") &&
            backgroundBlock.contains("CallBannerContrast.bannerBottom"),
            "The banner decor must use the calibrated CallBannerContrast " +
            "stops so the WCAG tests and the shipped gradient can never drift " +
            "apart."
        )
        XCTAssertTrue(
            backgroundBlock.contains(".ignoresSafeArea(.container, edges: .top)"),
            "The indigo decor must keep bleeding under the status bar / " +
            "Dynamic Island — the call details sit right below the island."
        )
    }

    // 2026-08-12 — retrait des chevrons gauche/droite (retour user : inutiles ;
    // ils violaient aussi la garde RTL qui bannit les symboles nommés par un
    // côté physique, cf. RightToLeftLayoutGuardTests).
    func test_banner_edgeChevrons_removed() throws {
        let source = try pillSource()
        XCTAssertFalse(
            source.contains("\"chevron.left\"") || source.contains("\"chevron.right\""),
            "The decorative edge chevrons must stay removed from the banner — user " +
            "feedback 2026-08-12 (useless affordance), and physical-side symbol names " +
            "violate the RTL guard."
        )
        XCTAssertFalse(
            source.contains("\"chevron.backward\"") || source.contains("\"chevron.forward\""),
            "No replacement edge chevrons either — the swipe-to-collapse gesture is " +
            "discoverable through the drag itself and the VoiceOver custom action."
        )
    }

    func test_pillContent_delegatesAvatarToCallParticipantVisual() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("CallParticipantVisual(diameter: 44, callManager: callManager)"),
            "FloatingCallPillView must delegate its video/avatar visual to the shared " +
            "CallParticipantVisual component (reused at 56pt by CallBubbleView) instead " +
            "of reimplementing the cache-first avatar resolution locally, injecting its " +
            "own `callManager` rather than letting the child default to `.shared`."
        )
        XCTAssertFalse(
            source.contains("UserService.shared.getProfile"),
            "The pill must NOT hit the network for the profile directly. " +
            "Le PRÉFIXE, et non `getProfileById` : ce site a changé de nom en " +
            "migrant vers l'adresse canonique (#4161), et une garde négative " +
            "qui épingle un nom devenu obsolète passe au vert en cessant de " +
            "protéger. `getProfile` couvre les trois variantes — `handle:`, " +
            "`idOrUsername:` et `ById` — donc aussi la prochaine."
        )
    }

    /// Le corps d'un membre de la pill, borné à la DÉCLARATION SUIVANTE.
    ///
    /// Ces trois gardes découpaient une fenêtre de 1000 caractères après la
    /// déclaration. Les commentaires de contraste WCAG ajoutés dans
    /// `muteButton`/`speakerButton` (« errorSoft, pas error : #F87171 ne tient
    /// pas le 3:1 » / « indigo200, pas indigo400 ») et la longueur des
    /// `defaultValue` français ont fini par pousser `.accessibilityHint(`
    /// au-delà de la fenêtre — 1044 pour mute, 1101 pour speaker — alors que
    /// le hint est bel et bien là. Un garde d'accessibilité qui casse parce
    /// qu'on a documenté un choix de couleur mesure la mauvaise chose : la
    /// portée d'une propriété est sa déclaration suivante, pas un nombre
    /// d'octets.
    private func pillMemberBody(_ source: String, _ declaration: String) -> String? {
        guard let range = source.range(of: declaration) else { return nil }
        let end = source.range(of: "\n    private ", range: range.upperBound ..< source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[range.lowerBound ..< end])
    }

    func test_hangupButton_hasAccessibilityHint() throws {
        let source = try pillSource()
        guard let vicinity = pillMemberBody(source, "private var hangupButton") else {
            XCTFail("FloatingCallPillView must define hangupButton")
            return
        }
        XCTAssertTrue(
            vicinity.contains(".accessibilityHint(") && vicinity.contains("call.end.hint"),
            "The hang-up button must carry an accessibility hint — CallView's endCallButton " +
            "already has one (call.end.hint); the pill's hangup button is the same action and " +
            "must not regress behind it for VoiceOver users."
        )
    }

    func test_muteButton_hasAccessibilityHint() throws {
        // Audit fix: mute/speaker only had .accessibilityLabel + toggle trait —
        // unlike hangupButton, VoiceOver users got no indication of what muting
        // means for the other party from the label alone.
        let source = try pillSource()
        guard let vicinity = pillMemberBody(source, "private var muteButton") else {
            XCTFail("FloatingCallPillView must define muteButton")
            return
        }
        XCTAssertTrue(
            vicinity.contains(".accessibilityHint(") && vicinity.contains("call.control.mute.hint"),
            "The mute button must carry an accessibility hint, sharing the call.control.mute.hint " +
            "key already used by CallView's mute control so both call surfaces read identically."
        )
    }

    func test_speakerButton_hasAccessibilityHint() throws {
        let source = try pillSource()
        guard let vicinity = pillMemberBody(source, "private var speakerButton") else {
            XCTFail("FloatingCallPillView must define speakerButton")
            return
        }
        XCTAssertTrue(
            vicinity.contains(".accessibilityHint(") && vicinity.contains("call.control.speaker.hint"),
            "The speaker button must carry an accessibility hint, sharing the call.control.speaker.hint " +
            "key already used by CallView's speaker control so both call surfaces read identically."
        )
    }

    func test_collapseToBubble_resetsSizeTierToCircle() throws {
        let source = try pillSource()
        guard let range = source.range(of: "private func collapseToBubble(exitTranslation: CGFloat) {") else {
            XCTFail("collapseToBubble not found in FloatingCallPillView.swift"); return
        }
        let end = source.range(of: "\n    // MARK: - Actions", range: range.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        let body = String(source[range.lowerBound..<end])
        XCTAssertTrue(
            body.contains("callManager.bubbleSizeTier = .circle"),
            "collapseToBubble must reset bubbleSizeTier to .circle — the only entry point " +
            "into .bubble mode, so a PiP left enlarged in a previous session must not " +
            "reappear already expanded."
        )
    }

    func test_pillContent_hasContainerAccessibilityLabel() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.ongoing"),
            "The pill container must carry a combined accessibility label so VoiceOver " +
            "users can quickly identify an active call without having to explore each control."
        )
    }

    func test_pillContent_isAnnouncedAsAButton() throws {
        let source = try pillSource()
        guard let pillContentRange = source.range(of: "private var pillContent: some View {"),
              let nextVarRange = source.range(of: "\n    private var ", range: pillContentRange.upperBound..<source.endIndex) else {
            XCTFail("expected to locate the pillContent computed property body")
            return
        }
        let body = source[pillContentRange.upperBound..<nextVarRange.lowerBound]
        XCTAssertTrue(
            body.contains(".accessibilityAddTraits(.isButton)"),
            "pillContent has .onTapGesture { expandToFullScreen() } — without .isButton, VoiceOver " +
            "does not announce this whole banner as tappable, unlike the equivalent tap-to-toggle " +
            "region on the full-screen CallView which explicitly adds this trait."
        )
    }

    func test_pillContent_hasTapToReturnHint() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("call.pill.tapToReturn"),
            "The pill container must carry an accessibility hint explaining the tap action " +
            "(return to full-screen call)."
        )
    }

    // MARK: - Toggle semantics parity with CallView

    func test_muteButton_appliesToggleAccessibility() throws {
        let source = try pillSource()
        // Corps équilibré, pas une fenêtre de 1 000 caractères :
        // `toggleStateAccessibility` se trouvait à 1 001 — UN caractère de
        // trop — et la garde virait au rouge sur du code parfaitement juste.
        guard let vicinity = DeclarationBodyScanner.body(containing: "private var muteButton", in: source) else {
            XCTFail("FloatingCallPillView must define muteButton")
            return
        }
        XCTAssertTrue(
            vicinity.contains("toggleStateAccessibility(isToggle: true, isActive: callManager.isMuted)"),
            "The mute button must apply .toggleStateAccessibility so VoiceOver exposes the " +
            "same toggle trait + on/off value as the equivalent control in CallView — a plain " +
            "label swap alone loses the toggle semantics and rotor navigation support."
        )
    }

    func test_speakerButton_appliesToggleAccessibility() throws {
        let source = try pillSource()
        // Corps équilibré, pas une fenêtre de 1 000 caractères :
        // `toggleStateAccessibility` se trouvait à 1 001 — UN caractère de
        // trop — et la garde virait au rouge sur du code parfaitement juste.
        guard let vicinity = DeclarationBodyScanner.body(containing: "private var speakerButton", in: source) else {
            XCTFail("FloatingCallPillView must define speakerButton")
            return
        }
        XCTAssertTrue(
            vicinity.contains("toggleStateAccessibility(isToggle: true, isActive: callManager.isSpeaker)"),
            "The speaker button must apply .toggleStateAccessibility so VoiceOver exposes the " +
            "same toggle trait + on/off value as the equivalent control in CallView."
        )
    }

    // MARK: - Status text

    func test_statusLine_showsDurationOnlyWhenConnected() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("pillStatus.isConnected ? spokenDuration"),
            "The pill status line must announce the live duration ONLY for the .connected " +
            "state — pre-connection states must speak a textual label, never 00:00. The " +
            "announced form is the SPOKEN twin since 247i: a speech synthesiser reads the " +
            "clock spelling \"02:34\" as a time of day."
        )
    }

    func test_formattedDuration_delegatesToCallManager_notLocalReimplementation() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("callManager.formattedDuration"),
            "FloatingCallPillView.formattedDuration must delegate to " +
            "CallManager.formattedDuration (CallManager.formatDuration) instead of " +
            "reimplementing mm:ss locally — the pill's own reimplementation drops the " +
            "hours field past 60 minutes (\"125:33\" instead of \"2:05:33\"), unlike " +
            "every other duration label in CallView which already uses the shared helper."
        )
    }

    /// The spoken twin obeys the same delegation rule, and for the same reason:
    /// two spellings of one duration is how the pill's own reimplementation
    /// drifted from CallView in the first place.
    func test_spokenDuration_delegatesToCallManager_notLocalReimplementation() throws {
        let source = try pillSource()
        XCTAssertTrue(
            source.contains("callManager.spokenDuration"),
            "FloatingCallPillView.spokenDuration must delegate to CallManager.spokenDuration " +
            "rather than re-deriving a spoken duration locally."
        )
    }

    // MARK: - Dynamic Type sizing

    func test_pillContent_usesMinHeightNotExactHeight() throws {
        let source = try pillSource()
        // userInfoSection stacks two Dynamic-Type-scalable Text lines that can
        // exceed pillHeight at accessibility text sizes (AX1+). An exact
        // `.frame(height:)` would force-clip the name/status instead of letting
        // the pill grow to fit its content.
        XCTAssertTrue(
            source.contains(".frame(minHeight: pillHeight)"),
            "pillContent must use .frame(minHeight: pillHeight), not an exact .frame(height:), " +
            "so the pill grows to fit Dynamic Type text instead of clipping it."
        )
        XCTAssertFalse(
            source.contains(".frame(height: pillHeight)"),
            "pillContent must not force an exact height on the pill — that clips " +
            "userInfoSection's text at large accessibility text sizes."
        )
    }
}

// MARK: - CallPresentationLayer Mount Tests

// 2026-08-12 — la bannière d'appel doit COMPRIMER la frame de toute l'app
// (VStack bannière → contenu), pas seulement augmenter sa safe area. Un
// `.safeAreaInset(edge: .top)` ne traverse pas la frontière UIKit de la
// NavigationStack : les headers des destinations (ConversationView,
// ConversationListView) restaient épinglés au sommet physique, cachés et
// inaccessibles derrière la bannière (capture user 2026-08-12). Réduire la
// frame propage mécaniquement — chaque écran garde ses géométries internes,
// seul son viewport commence sous la bannière (comportement WhatsApp).
@MainActor
final class CallPresentationLayerMountTests: XCTestCase {

    private func rootViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/RootView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Corps de CallPresentationLayer, commentaires dépouillés — les
    /// commentaires documentent l'ancien mécanisme `.safeAreaInset` rejeté
    /// et matcheraient sinon les assertions négatives (même piège que la
    /// garde RTL, cf. RightToLeftLayoutGuardTests.strippingComments).
    private func callPresentationLayerBody() throws -> String {
        let source = AppSourceGuard.stripComments(try rootViewSource())
        guard let start = source.range(of: "struct CallPresentationLayer: ViewModifier {"),
              let end = source.range(of: "\nstruct ", range: start.upperBound..<source.endIndex) else {
            XCTFail("CallPresentationLayer not found in RootView.swift")
            return ""
        }
        return String(source[start.lowerBound..<end.lowerBound])
    }

    func test_pill_isMountedAsFrameCompressingVStack_notSafeAreaInset() throws {
        let body = try callPresentationLayerBody()
        XCTAssertTrue(
            body.contains("VStack(spacing: 0)"),
            "CallPresentationLayer must mount the call banner as the first element of a " +
            "VStack(spacing: 0) above the app content so the banner SHRINKS the frame of " +
            "the whole app — a safeAreaInset only augments the safe area, which does not " +
            "propagate across the NavigationStack's UIKit boundary (conversation headers " +
            "stayed pinned under the banner, unreachable)."
        )
        XCTAssertFalse(
            body.contains(".safeAreaInset(edge: .top"),
            "The pill must NOT be mounted via .safeAreaInset(edge: .top) — that mechanism " +
            "left navigationDestination chrome (back pill, avatar, call/search buttons) " +
            "hidden behind the banner."
        )
    }

    func test_pill_precedesContentInCompressionStack() throws {
        let body = try callPresentationLayerBody()
        guard let pillRange = body.range(of: "FloatingCallPillView(callManager: callManager)"),
              let contentRange = body.range(of: "content", range: pillRange.upperBound..<body.endIndex) else {
            XCTFail("expected FloatingCallPillView mounted before content in CallPresentationLayer")
            return
        }
        XCTAssertLessThan(
            pillRange.lowerBound, contentRange.lowerBound,
            "The banner must be the FIRST element of the compression VStack, with the app " +
            "content below it — the app viewport starts under the banner, WhatsApp-style."
        )
    }
}

// MARK: - CallParticipantVisual Source Inspection Tests

@MainActor
final class CallParticipantVisualTests: XCTestCase {

    private func source() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views/
            .deletingLastPathComponent()   // Unit/
            .deletingLastPathComponent()   // MeeshyTests/
            .deletingLastPathComponent()   // ios/
            .appendingPathComponent("Meeshy/Features/Main/Views/CallParticipantVisual.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_resolvesRemoteProfile_cacheFirst() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("CacheCoordinator.shared.profiles.load(for:"),
            "CallParticipantVisual must resolve the remote user's real avatar cache-first " +
            "(Instant App) instead of always showing the initial fallback."
        )
        XCTAssertFalse(
            src.contains("UserService.shared.getProfile"),
            "CallParticipantVisual must NOT hit the network for the profile — CallView " +
            "already refreshes and re-feeds the cache; this component serves cached data only. " +
            "Le PRÉFIXE, et non `getProfileById` : voir la garde jumelle de " +
            "`FloatingCallPillView` — épingler un nom qu'un renommage périme " +
            "fait passer la garde au vert en lui retirant sa protection."
        )
    }

    func test_circularInit_derivesSquareFrameAndHalfRadius() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("init(diameter: CGFloat, callManager: CallManager)"),
            "The circular convenience initializer must stay so existing call sites " +
            "(pill 44pt, bubble circle tier) keep compiling unchanged."
        )
        XCTAssertTrue(
            src.contains("self.cornerRadius = diameter / 2"),
            "The circular initializer must derive cornerRadius from the diameter so " +
            "RoundedRectangle(cornerRadius:) renders a perfect circle, matching the " +
            "previous Circle()-clipped behavior exactly."
        )
    }

    func test_clipsWithRoundedRectangle_notFixedCircle() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)"),
            "The video clip shape must be a RoundedRectangle driven by the instance's " +
            "cornerRadius (not a fixed Circle()) so CallBubbleView's rectangle PiP tiers " +
            "can reuse this component."
        )
        XCTAssertFalse(
            src.contains(".clipShape(Circle())"),
            "The fixed Circle() clip must be gone — it can no longer represent the " +
            "rectangle PiP tiers."
        )
    }

    func test_avatarFallback_sizedFromSmallerDimension() throws {
        let src = try source()
        XCTAssertTrue(
            src.contains("size: min(width, height)"),
            "The avatar fallback must size itself from the smaller dimension so it never " +
            "stretches out of its circular aspect at a rectangle PiP tier."
        )
    }
}
