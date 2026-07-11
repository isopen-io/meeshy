import XCTest
@testable import Meeshy

@MainActor
final class CallViewAccessibilityTests: XCTestCase {

    private func callViewSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/CallView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    // MARK: - Video duration badge

    func test_videoDurationBadge_hasExplicitAccessibilityLabel() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.duration.a11y.label"),
            "The video call duration badge must carry an explicit .accessibilityLabel " +
            "so VoiceOver announces the timer with context (e.g. 'Durée de l'appel, 05:32') " +
            "rather than raw digits ('05:32')."
        )
    }

    func test_videoDurationBadge_hasAccessibilityValue() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("accessibilityValue(callManager.formattedDuration)"),
            "The video duration badge must expose the timer via .accessibilityValue " +
            "so VoiceOver reads the label once and the dynamic value separately."
        )
    }

    func test_videoDurationBadge_hasUpdatesFrequentlyTrait() throws {
        // Anchored on the composed-label call site, not the raw "call.duration.a11y.label"
        // key — that key also appears earlier, inside videoDurationBadgeAccessibilityLabel's
        // own body (a plain computed property with no SwiftUI modifiers nearby), which
        // would make this window search land on the wrong occurrence.
        let source = try callViewSource()
        let badgeRange = source.range(of: ".accessibilityLabel(videoDurationBadgeAccessibilityLabel)")
        XCTAssertNotNil(badgeRange, "Duration badge must use the composed accessibility label")
        if let r = badgeRange {
            let window = source.index(r.upperBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
            let vicinity = String(source[r.lowerBound ..< window])
            XCTAssertTrue(
                vicinity.contains(".updatesFrequently"),
                "The duration badge must carry .updatesFrequently so VoiceOver " +
                "does not interrupt the user every second with a new timer value."
            )
        }
    }

    // MARK: - Call ended VoiceOver announcement

    func test_callState_ended_postsVoiceOverAnnouncement() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.a11y.ended"),
            "The .ended call state must post a UIAccessibility.announcement so " +
            "VoiceOver users are informed that the call has terminated. Without this, " +
            "a blind user hears nothing when the call ends."
        )
    }

    func test_callState_ended_announcementIsInOnChangeHandler() throws {
        let source = try callViewSource()
        guard let changeRange = source.range(of: "adaptiveOnChange(of: callManager.callState)") else {
            XCTFail("CallView must use adaptiveOnChange to observe callState transitions")
            return
        }
        let end = source.index(changeRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let handler = String(source[changeRange.lowerBound ..< end])
        XCTAssertTrue(
            handler.contains("call.a11y.ended"),
            "The .ended announcement must live inside the adaptiveOnChange(of: callManager.callState) " +
            "handler, not in a separate modifier, so it fires exactly once per state transition."
        )
    }

    // MARK: - callControlButton hint handling

    func test_callControlButton_doesNotPassEmptyHint() throws {
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains(".accessibilityHint(hint ?? \"\")"),
            "callControlButton must not pass an empty string to .accessibilityHint. " +
            "Use .optionalAccessibilityHint(_:) so the modifier is skipped entirely when " +
            "the hint is nil — empty strings create a redundant no-op modifier chain."
        )
    }

    func test_callControlButton_usesOptionalAccessibilityHint() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("optionalAccessibilityHint(hint)"),
            "callControlButton must delegate hint application to .optionalAccessibilityHint " +
            "so the modifier is only applied when a non-nil hint is provided."
        )
    }

    func test_optionalAccessibilityHint_extensionDefined() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("func optionalAccessibilityHint"),
            "A private View extension must define optionalAccessibilityHint so other " +
            "call UI components can reuse the same conditional hint pattern."
        )
    }

    func test_callToggleAccessibility_isNotFilePrivate() throws {
        // FloatingCallPillView (a different file) reuses this modifier for its
        // mute/speaker buttons so both call surfaces expose identical toggle
        // semantics to VoiceOver. `private extension View { ... }` at top level
        // is file-scoped in Swift and would make the modifier invisible outside
        // CallView.swift.
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains("private extension View {\n    @ViewBuilder\n    func callToggleAccessibility"),
            "callToggleAccessibility must not be declared in a `private extension View` — " +
            "that restricts it to CallView.swift and FloatingCallPillView could not reuse it."
        )
    }

    // MARK: - Connecting state VoiceOver announcement

    func test_callState_connecting_postsVoiceOverAnnouncement() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("call.a11y.connecting"),
            "The .connecting call state must post a UIAccessibility.announcement so " +
            "VoiceOver users are informed when ICE negotiation begins. Without this, " +
            "the transition from ringing to connected is completely silent — several " +
            "seconds during which the user hears nothing and may think the call failed."
        )
    }

    func test_callState_connecting_announcementIsInOnChangeHandler() throws {
        let source = try callViewSource()
        guard let changeRange = source.range(of: "adaptiveOnChange(of: callManager.callState)") else {
            XCTFail("CallView must use adaptiveOnChange to observe callState transitions")
            return
        }
        let end = source.index(changeRange.lowerBound, offsetBy: 800, limitedBy: source.endIndex) ?? source.endIndex
        let handler = String(source[changeRange.lowerBound ..< end])
        XCTAssertTrue(
            handler.contains("call.a11y.connecting"),
            "The .connecting announcement must live inside the adaptiveOnChange(of: callManager.callState) " +
            "handler alongside the .connected, .reconnecting, and .ended cases."
        )
    }

    // MARK: - Reduce Motion in FloatingCallPillView

    func test_reconnecting_usesCompactStatusPill_notFullScreenBanner() throws {
        // Regression guard for the 2026-07-11 fix: callState == .reconnecting
        // used to overlay a full-screen IslandEmergingBanner (with an
        // unconstrained ProgressView) that a real device showed covering the
        // whole screen. It must now render as a small, bounded statusPill
        // alongside the other call status indicators instead.
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains("private var reconnectingBanner"),
            "The full-screen reconnecting banner must be removed — .reconnecting now " +
            "renders via the compact statusPill row, matching the other call indicators."
        )
        XCTAssertTrue(
            source.contains("if case .reconnecting = callManager.callState {"),
            "The .reconnecting state must be handled inline where the other status " +
            "pills live (audioCallLayout status row / videoCallLayout duration badge)."
        )
    }

    // MARK: - Video quality VoiceOver announcement

    func test_linkQualityDegraded_postsVoiceOverAnnouncement() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("adaptiveOnChange(of: callManager.isLinkQualityDegraded)"),
            "CallView must observe the SUSTAINED degradation flag — not raw " +
            "liveVideoQualityLevel, whose single 5 s ticks would chat at VoiceOver " +
            "users on every transient spike — to announce quality changes."
        )
        XCTAssertTrue(
            source.contains("call.a11y.quality"),
            "CallView must post a VoiceOver announcement when the link degrades so " +
            "blind users are informed the stream is degraded — they cannot see the " +
            "visual quality indicator and would otherwise have no feedback."
        )
    }

    func test_qualityAnnouncement_isInsideDegradedFlagOnChangeHandler() throws {
        let source = try callViewSource()
        guard let changeRange = source.range(of: "adaptiveOnChange(of: callManager.isLinkQualityDegraded)") else {
            XCTFail("CallView must observe isLinkQualityDegraded via adaptiveOnChange")
            return
        }
        let end = source.index(changeRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let handler = String(source[changeRange.lowerBound ..< end])
        XCTAssertTrue(
            handler.contains("call.a11y.quality"),
            "The quality VoiceOver announcement must live inside the isLinkQualityDegraded " +
            "onChange handler so it fires on every sustained transition, not just once."
        )
    }

    // MARK: - Video suspended tile accessibility

    func test_videoSuspendedTile_hasAccessibilityLabel() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("localVideoSuspendedTile"),
            "CallView must define a localVideoSuspendedTile for the audio-only survival state."
        )
        XCTAssertTrue(
            source.contains("call.video.suspended.a11y") || source.contains("video.suspended"),
            "The video-suspended tile must carry an accessibility label so VoiceOver users " +
            "know the camera was paused to preserve the call on a poor network — without " +
            "it they see a frozen frame with no context."
        )
    }

    // MARK: - Remote camera-off placeholder accessibility

    func test_remoteCameraOffPlaceholder_hidesAvatarAndCombinesStatusRow() throws {
        // P0-3: shown full-area when the peer has a video track but turned
        // its camera off. The avatar is decorative (the status text already
        // conveys the state), and the icon+text row must read as one
        // VoiceOver stop, not two disjoint announcements.
        let source = try callViewSource()
        guard let range = source.range(of: "private var remoteCameraOffPlaceholder: some View {") else {
            XCTFail("CallView must define remoteCameraOffPlaceholder")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("avatarCircle(size: 96)"),
            "remoteCameraOffPlaceholder must show the peer's avatar in place of a frozen last frame."
        )
        XCTAssertTrue(
            body.contains(".accessibilityHidden(true)"),
            "The decorative avatar in remoteCameraOffPlaceholder must be hidden from VoiceOver — " +
            "the icon+text row below it already conveys the camera-off state."
        )
        XCTAssertTrue(
            body.contains("call.video.remoteOff"),
            "remoteCameraOffPlaceholder must carry the call.video.remoteOff localization key " +
            "so VoiceOver announces why the peer's video is absent."
        )
        XCTAssertTrue(
            body.contains(".accessibilityElement(children: .combine)"),
            "The icon+text status row in remoteCameraOffPlaceholder must combine into a single " +
            "VoiceOver element, not read the icon and text as two disjoint stops."
        )
    }

    // MARK: - callToggleAccessibility compound modifier

    func test_callControlButton_usesCallToggleAccessibilityModifier() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains("callToggleAccessibility"),
            "callControlButton must apply the callToggleAccessibility modifier to bundle " +
            "label, hint, trait, and value into a single reusable modifier — avoids " +
            "repeated .accessibilityLabel/.accessibilityHint chains that drift out of sync."
        )
    }

    // MARK: - Effects toggle button accessibility

    func test_effectsToggleButton_hasAccessibilityHint() throws {
        // The call.filters.a11y label now appears on TWO controls (the bottom-bar
        // effects toggle AND the self-preview pipFrameButton, Fix 8) — EVERY
        // occurrence must pair the label with the call.filters.hint hint, or
        // VoiceOver users get no indication that the control toggles the video
        // effects toolbar.
        let source = try callViewSource()
        var searchStart = source.startIndex
        var occurrences = 0
        while let labelRange = source.range(of: "call.filters.a11y", range: searchStart..<source.endIndex) {
            occurrences += 1
            let end = source.index(labelRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
            let vicinity = String(source[labelRange.lowerBound ..< end])
            XCTAssertTrue(
                vicinity.contains(".accessibilityHint"),
                "occurrence #\(occurrences) of call.filters.a11y has no .accessibilityHint nearby — " +
                "unlike every sibling control (mute/speaker/camera/end-call via callControlButton)."
            )
            XCTAssertTrue(
                vicinity.contains("call.filters.hint"),
                "occurrence #\(occurrences) of call.filters.a11y must pair with the " +
                "call.filters.hint localization key."
            )
            searchStart = labelRange.upperBound
        }
        XCTAssertGreaterThan(occurrences, 0, "effectsToggleButton must carry the call.filters.a11y accessibility label")
    }

    // MARK: - End call button accessibility

    func test_endCallButton_hasDestructiveTrait() throws {
        let source = try callViewSource()
        guard let endCallRange = source.range(of: "endCallGlass") else {
            XCTFail("CallView must define endCallGlass for the end call button")
            return
        }
        let end = source.index(endCallRange.lowerBound, offsetBy: 600, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[endCallRange.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains("call.end.a11y") || vicinity.contains("accessibilityLabel"),
            "The end call button must carry an explicit accessibility label — its red " +
            "colour alone does not convey the destructive action to VoiceOver users."
        )
    }

    // MARK: - HIG 44×44 minimum hit targets

    func test_pipFrameButton_hitTargetMeetsHIGMinimum() throws {
        let source = try callViewSource()
        guard let range = source.range(of: "private func pipFrameButton") else {
            XCTFail("pipFrameButton must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".frame(width: 44, height: 44)"),
            "pipFrameButton's visual glyph is 28pt (too small for the 100×140 self-view tile), " +
            "but its tappable area must still meet the HIG 44×44 minimum via an invisible " +
            "expanded frame + contentShape."
        )
        XCTAssertTrue(
            body.contains(".contentShape(Rectangle())"),
            "pipFrameButton must apply .contentShape(Rectangle()) so the entire expanded " +
            "44×44 frame is tappable, not just the visible 28pt circle."
        )
    }

    func test_pipFrameButton_usesAdaptiveGlass_notFlatDarkCircle() throws {
        let source = try callViewSource()
        guard let range = source.range(of: "private func pipFrameButton") else {
            XCTFail("pipFrameButton must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 900, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains(".callControlGlass(diameter: 28, isActive: false, tint: .white)"),
            "pipFrameButton must use the same adaptiveGlass-backed callControlGlass wrapper " +
            "as every other circular call control (task #17) — not a hand-rolled " +
            "Color.black.opacity(0.45) circle."
        )
        XCTAssertFalse(
            body.contains("Color.black.opacity(0.45)"),
            "pipFrameButton's old flat dark-circle background must be fully removed, not left " +
            "as dead code alongside the new glass treatment."
        )
    }

    func test_minimizeChevron_hitTargetMeetsHIGMinimum() throws {
        let source = try callViewSource()
        guard let range = source.range(of: "callControlGlass(diameter: 40, isActive: false, tint: .white)") else {
            XCTFail("Minimize chevron's 40pt glass circle must exist")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 450, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains(".frame(width: 44, height: 44)") && vicinity.contains(".contentShape(Rectangle())"),
            "The minimize chevron's visual glass circle is 40pt, but its tappable area must " +
            "still meet the HIG 44×44 minimum via an invisible expanded frame + contentShape."
        )
    }

    // MARK: - Dead code

    func test_doesNotDeclareUnusedColorSchemeReader() throws {
        // CallView pins `.environment(\.colorScheme, .dark)` on its own subtree
        // (the call chrome is intentionally white-on-dark, FaceTime/WhatsApp
        // style) so a locally-read `@Environment(\.colorScheme)` always
        // resolves to `.dark` and the derived `isDark` was permanently `true`
        // and unused — verified unreferenced anywhere else in this file.
        let source = try callViewSource()
        XCTAssertFalse(
            source.contains("@Environment(\\.colorScheme) private var colorScheme"),
            "CallView must not declare a dead colorScheme reader — it forces .dark on its " +
            "own subtree, so a locally-read colorScheme value can never be anything else."
        )
        XCTAssertFalse(
            source.contains("private var isDark: Bool { colorScheme == .dark }"),
            "CallView must not declare a dead isDark computed property with no readers."
        )
        XCTAssertTrue(
            source.contains(".environment(\\.colorScheme, .dark)"),
            "CallView must still pin the call chrome subtree to .dark — only the unused " +
            "local reader/computed property were dead, not the environment override itself."
        )
    }

    // MARK: - CallEffectsOverlay wiring

    func test_callEffectsOverlay_receivesCallManagerFromParent() throws {
        // `CallEffectsOverlay(... )` must not fall back to instantiating
        // `CallManager.shared` itself (`@ObservedObject private var callManager
        // = CallManager.shared`) — that re-creates the subscription on every
        // CallView body re-evaluation (pulse animation, showEffectsToolbar
        // toggle, control-bar auto-hide). CallView and IncomingCallView were
        // already fixed for this exact hazard (Audit P1-16); the overlay must
        // receive the same singleton instance CallView already holds.
        let source = try callViewSource()
        guard let range = source.range(of: "CallEffectsOverlay(") else {
            XCTFail("CallView must instantiate CallEffectsOverlay")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 200, limitedBy: source.endIndex) ?? source.endIndex
        let call = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            call.contains("callManager: callManager"),
            "CallView must pass its own `callManager` into CallEffectsOverlay so the child " +
            "reuses the parent's @ObservedObject subscription instead of creating its own."
        )
    }

    // MARK: - audioCallLayout avatar VoiceOver double-read

    func test_audioCallLayout_avatarPairIsAccessibilityHidden() throws {
        // `pulsingAvatar` already hides its avatar because the remote user's
        // name is rendered as a Text directly below it — without this, VoiceOver
        // reads the avatar initial, then "Vous", then the full name as three
        // disjoint stops. `audioCallLayout` (the established audio-call screen)
        // has the exact same avatar-then-name shape but was missing the guard.
        let source = try callViewSource()
        guard let layoutRange = source.range(of: "private var audioCallLayout: some View {") else {
            XCTFail("CallView must define audioCallLayout")
            return
        }
        guard let avatarRange = source.range(
            of: "callAvatarPair(size: 120)",
            range: layoutRange.upperBound..<source.endIndex
        ) else {
            XCTFail("audioCallLayout must call callAvatarPair(size: 120)")
            return
        }
        let end = source.index(avatarRange.upperBound, offsetBy: 60, limitedBy: source.endIndex) ?? source.endIndex
        let vicinity = String(source[avatarRange.lowerBound ..< end])
        XCTAssertTrue(
            vicinity.contains(".accessibilityHidden(true)"),
            "audioCallLayout's callAvatarPair(size: 120) must carry .accessibilityHidden(true) " +
            "to avoid VoiceOver double-reading the avatar initial and the adjacent remote-name Text."
        )
    }

    // MARK: - Video duration badge does not swallow child accessibility content

    /// `.accessibilityLabel`/`.accessibilityValue` applied directly to a
    /// container implicitly collapses it into one opaque VoiceOver element
    /// (`children: .ignore`) — any child's own `.accessibilityLabel` (the
    /// signal glyph, the peer-degraded wifi icon) is silently discarded. The
    /// video layout has no separate `statusPill` row like the audio layout, so
    /// this badge is the ONLY place that state surfaces — the composed label
    /// must carry it explicitly rather than relying on children that never reach
    /// VoiceOver.
    func test_videoDurationBadge_composesAccessibilityLabel_insteadOfRawKey() throws {
        let source = try callViewSource()
        XCTAssertTrue(
            source.contains(".accessibilityLabel(videoDurationBadgeAccessibilityLabel)"),
            "The video duration badge must use the composed videoDurationBadgeAccessibilityLabel, " +
            "not a raw String(localized: \"call.duration.a11y.label\") literal — the composed " +
            "form is what folds in the swallowed signal-quality / peer-degraded state."
        )
    }

    /// TransientCallSignalGlyph is mounted TWICE (audio capsule status area + this video
    /// overlay badge, cf. test_signalGlyph_isMountedInDurationBadges) — these two tests must
    /// scope their search to the SECOND (video) occurrence, inside videoCallLayout, or they'd
    /// silently inspect the unrelated audio-layout mount instead.
    private func videoDurationBadgeVicinity(_ source: String, window: Int = 2200) -> String {
        guard let layoutRange = source.range(of: "private var videoCallLayout: some View {") else {
            XCTFail("CallView must define videoCallLayout")
            return ""
        }
        guard let badgeRange = source.range(
            of: "TransientCallSignalGlyph(strength: signalStrength)",
            range: layoutRange.upperBound..<source.endIndex
        ) else {
            XCTFail("CallView must mount TransientCallSignalGlyph in the video duration badge")
            return ""
        }
        let end = source.index(badgeRange.lowerBound, offsetBy: window, limitedBy: source.endIndex) ?? source.endIndex
        return String(source[badgeRange.lowerBound ..< end])
    }

    func test_videoDurationBadge_isExplicitOpaqueAccessibilityElement() throws {
        let source = try callViewSource()
        let vicinity = videoDurationBadgeVicinity(source)
        XCTAssertTrue(
            vicinity.contains(".accessibilityElement(children: .ignore)"),
            "The badge must explicitly declare children: .ignore — implicit collapsing from " +
            "the parent .accessibilityLabel is fragile (a future refactor that removes the " +
            "outer label would silently re-expose fragmented per-child announcements)."
        )
    }

    func test_videoDurationBadge_wifiIcon_hasNoOrphanedAccessibilityLabel() throws {
        // The icon's own .accessibilityLabel was dead (swallowed by the parent's
        // opaque element) — leaving it in place after the fix would be
        // misleading dead code implying VoiceOver reads it directly.
        let source = try callViewSource()
        let vicinity = videoDurationBadgeVicinity(source)
        XCTAssertFalse(
            vicinity.contains("wifi.exclamationmark") && vicinity.contains("call.status.peer.network"),
            "The badge's wifi.exclamationmark icon must not carry its own .accessibilityLabel " +
            "anymore — that information now lives in the composed videoDurationBadgeAccessibilityLabel."
        )
    }

    func test_videoDurationBadgeAccessibilityLabel_includesPeerDegradedState() throws {
        let source = try callViewSource()
        guard let range = source.range(of: "private var videoDurationBadgeAccessibilityLabel: String {") else {
            XCTFail("CallView must define videoDurationBadgeAccessibilityLabel")
            return
        }
        let end = source.index(range.lowerBound, offsetBy: 700, limitedBy: source.endIndex) ?? source.endIndex
        let body = String(source[range.lowerBound ..< end])
        XCTAssertTrue(
            body.contains("callManager.isRemoteQualityDegraded"),
            "videoDurationBadgeAccessibilityLabel must fold in isRemoteQualityDegraded so the " +
            "peer-network warning (visually the wifi.exclamationmark icon) reaches VoiceOver."
        )
        XCTAssertTrue(
            body.contains("signalStrength.isDegraded") && body.contains("signalStrength.accessibilityLabel"),
            "videoDurationBadgeAccessibilityLabel must fold in the signal glyph's own state when " +
            "degraded — visual parity: the glyph itself only appears when isDegraded."
        )
    }
}

// MARK: - Island banner emergence transition (2026-07-03 UX feedback)

/// Retour user : « la pill doit apparaître plus lentement avec une
/// accélération à mi-chemin — on doit voir comment ça sort de l'encoche, et
/// comment ça y retourne ». Le mouvement (les DEUX sens) vit dans la
/// transition interne d'IslandEmergingBanner ; un `.transition` externe au
/// call-site l'écraserait et la capsule disparaîtrait en fondu sur place.
@MainActor
final class IslandBannerEmergenceTransitionTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(path)
        return try String(contentsOf: url, encoding: .utf8)
    }

    func test_banner_usesSlowStartTimingCurves_forBothDirections() throws {
        let banner = try source("Meeshy/Features/Main/Components/IslandEmergingBanner.swift")
        XCTAssertTrue(
            banner.contains(".asymmetric") && banner.contains("insertion:") && banner.contains("removal:"),
            "The emergence must be an asymmetric transition — insertion (out of the island) AND removal (back into the island) each with their own curve."
        )
        let curveCount = banner.components(separatedBy: ".timingCurve(").count - 1
        XCTAssertGreaterThanOrEqual(
            curveCount, 2,
            "Both directions must use custom slow-start timing curves (user feedback 2026-07-03: slow appearance, mid-way acceleration) — a spring starts fast and hides the emergence from the island."
        )
        XCTAssertFalse(
            banner.contains("withAnimation(.spring"),
            "The old fast-start spring emergence must not come back — the capsule must visibly grow out of the island."
        )
    }

    func test_callSites_haveNoExternalTransition_thatWouldOverrideEmergence() throws {
        let callView = try source("Meeshy/Features/Main/Views/CallView.swift")
        guard let start = callView.range(of: "if showRemoteQualityAlertPill {"),
              let end = callView.range(of: "Effects overlay") else {
            XCTFail("CallView banner block markers not found")
            return
        }
        let bannerBlock = String(callView[start.lowerBound ..< end.lowerBound])
        XCTAssertFalse(
            bannerBlock.contains(".transition("),
            "Island banner call-sites must NOT attach an external .transition — it overrides the internal island-emergence transition and the capsule would fade in place instead of returning into the island."
        )
    }
}
