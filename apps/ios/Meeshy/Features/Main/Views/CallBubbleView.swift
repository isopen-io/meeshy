import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bulle avatar circulaire — forme repliée de l'appel en cours, atteinte par
/// swipe depuis `FloatingCallPillView`. Déplaçable (drag libre, clipse au
/// bord le plus proche), pinçable (4 paliers de taille cercle → small →
/// medium → large, morphing continu — spec
/// 2026-08-03-call-bubble-pip-resize-morph-design.md), tap → plein écran,
/// appui long (palier cercle uniquement) → mini-menu rapide
/// (mute/haut-parleur/raccrocher). Aux paliers rectangle, ces 3 actions sont
/// à la place une barre persistante en haut du cadre. Montée sans condition
/// à deux endroits (`RootView`, `iPadRootView+Sheets`), garde interne
/// symétrique à celle de `FloatingCallPillView`.
struct CallBubbleView: View {
    // Audit P1-16 parity (see CallView.swift / FloatingCallPillView.swift) —
    // injected by the caller instead of a `= CallManager.shared` default, so
    // the parent's body re-evaluating for unrelated churn (unread counts,
    // presence, navigation) doesn't tear down and rebuild this view's
    // objectWillChange subscription. Both mount sites (RootView,
    // iPadRootView+Sheets) already hold their own @ObservedObject callManager.
    @ObservedObject var callManager: CallManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isMenuRevealed = false
    @State private var dragTranslation: CGSize = .zero
    @State private var menuDismissTask: Task<Void, Never>?
    @State private var pinchScale: CGFloat = 1.0
    @State private var pinchLastSample: (time: Date, progress: CGFloat)?

    private let circleDiameter = CallBubbleGestureResolver.bubbleDiameter
    private let menuButtonDiameter: CGFloat = 44
    private let menuButtonGap: CGFloat = 8

    var body: some View {
        if callManager.displayMode == .bubble && callManager.callState.isActive && !callManager.isSystemPiPActive {
            GeometryReader { geometry in
                bubbleCluster(in: geometry)
                    .position(bubbleCenter(in: geometry, size: CallBubbleGestureResolver.interpolatedSize(progress: currentProgress)))
            }
            .ignoresSafeArea()
            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75), value: callManager.displayMode)
        }
    }

    // MARK: - Pinch progress

    /// Progression continue (0...3, `.circle...large`) — ancrée sur le
    /// palier snappé au repos (`pinchScale == 1`), suit l'échelle du doigt en
    /// direct pendant un pinch actif.
    private var currentProgress: CGFloat {
        CallBubbleGestureResolver.progress(startingTier: callManager.bubbleSizeTier, scale: pinchScale)
    }

    /// Vrai tant que la forme est encore proche du cercle — c'est cette
    /// région, et elle seule, qui garde le mini-menu déclenché par long-press
    /// (au-delà, la barre de contrôle persistante prend le relais).
    private var isCircleRegion: Bool {
        currentProgress < 0.5
    }

    // MARK: - Cluster (bubble + revealed menu / persistent control bar)

    @ViewBuilder
    private func bubbleCluster(in geometry: GeometryProxy) -> some View {
        let progress = currentProgress
        let size = CallBubbleGestureResolver.interpolatedSize(progress: progress)
        let cornerRadius = CallBubbleGestureResolver.interpolatedCornerRadius(progress: progress)
        let controlOpacity = CallBubbleGestureResolver.controlBarOpacity(progress: progress)
        let menuOffset = isMenuRevealed
            ? CallBubbleGestureResolver.menuOffset(edge: callManager.bubbleEdge, screenWidth: geometry.size.width, buttonDiameter: menuButtonDiameter)
            : 0
        let sideButtonOffset = circleDiameter / 2 + menuButtonGap + menuButtonDiameter / 2

        ZStack {
            if isCircleRegion && isMenuRevealed {
                muteButton.offset(x: -sideButtonOffset)
                speakerButton.offset(x: sideButtonOffset)
                hangupButton.offset(y: sideButtonOffset)
            }

            CallParticipantVisual(width: size.width, height: size.height, cornerRadius: cornerRadius, callManager: callManager)
                .shadow(color: Color.black.opacity(0.3), radius: 8, y: 4)
                .overlay(alignment: .topTrailing) {
                    TransientCallSignalGlyph(strength: signalStrength)
                        .padding(6)
                        .background(Circle().fill(Color.black.opacity(0.55)))
                        .offset(x: 16, y: -16)
                }
                .overlay(alignment: .top) {
                    tierControlBar
                        .opacity(controlOpacity)
                        .allowsHitTesting(controlOpacity > 0.5)
                }
        }
        .offset(x: menuOffset)
        .offset(dragTranslation)
        .simultaneousGesture(dragGesture(in: geometry))
        .simultaneousGesture(pinchGesture)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5, maximumDistance: 6)
                .onEnded { _ in revealMenu() }
        )
        .onTapGesture {
            if isMenuRevealed {
                closeMenu()
            } else {
                HapticFeedback.medium()
                callManager.displayMode = .fullScreen
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.bubble.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityValue(accessibilityTierLabel(for: callManager.bubbleSizeTier))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "a11y.call.bubble.expand", defaultValue: "Revenir au plein écran", bundle: .main)) {
            callManager.displayMode = .fullScreen
        }
        .accessibilityAction(named: String(localized: "a11y.call.bubble.quickMenu", defaultValue: "Ouvrir le mini-menu d'appel", bundle: .main)) {
            revealMenu()
        }
        // Retaper la bulle referme le menu (voir .onTapGesture ci-dessus),
        // mais VoiceOver navigue par swipe, pas par tap direct sur la bulle —
        // sans cette action explicite, fermer le menu exigerait d'attendre
        // les 3s d'auto-dismiss ou de déclencher raccrocher (destructif).
        .accessibilityAction(named: String(localized: "a11y.call.bubble.closeMenu", defaultValue: "Fermer le mini-menu d'appel", bundle: .main)) {
            closeMenu()
        }
        .accessibilityAdjustableAction { direction in
            let newRawValue: Int
            switch direction {
            case .increment: newRawValue = callManager.bubbleSizeTier.rawValue + 1
            case .decrement: newRawValue = callManager.bubbleSizeTier.rawValue - 1
            @unknown default: return
            }
            guard let newTier = CallBubbleSizeTier(rawValue: newRawValue) else { return }
            withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.8)) {
                callManager.bubbleSizeTier = newTier
            }
            HapticFeedback.light()
        }
    }

    private var tierControlBar: some View {
        HStack(spacing: 12) {
            muteButton
            speakerButton
            hangupButton
        }
        .padding(.top, 10)
    }

    private func accessibilityTierLabel(for tier: CallBubbleSizeTier) -> String {
        switch tier {
        case .circle: return String(localized: "call.bubble.size.circle", defaultValue: "Cercle", bundle: .main)
        case .small: return String(localized: "call.bubble.size.small", defaultValue: "Petit", bundle: .main)
        case .medium: return String(localized: "call.bubble.size.medium", defaultValue: "Moyen", bundle: .main)
        case .large: return String(localized: "call.bubble.size.large", defaultValue: "Grand", bundle: .main)
        }
    }

    private var signalStrength: CallSignalStrength {
        CallSignalStrength.from(level: callManager.liveVideoQualityLevel, connection: callManager.connectionQuality)
    }

    // MARK: - Positioning

    private func bubbleCenter(in geometry: GeometryProxy, size: CGSize) -> CGPoint {
        let margin = CallBubbleGestureResolver.bubbleEdgeMargin
        let halfWidth = size.width / 2
        let safeArea = geometry.safeAreaInsets
        let x: CGFloat = callManager.bubbleEdge == .trailing
            ? geometry.size.width - safeArea.trailing - margin - halfWidth
            : safeArea.leading + margin + halfWidth
        let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
        let rawY = callManager.bubbleVerticalFraction * availableHeight
        let clampedY = CallBubbleGestureResolver.clampedVerticalPosition(
            rawY, availableHeight: availableHeight, bubbleRadius: size.height / 2
        )
        return CGPoint(x: x, y: safeArea.top + clampedY)
    }

    // MARK: - Reposition drag

    private func dragGesture(in geometry: GeometryProxy) -> some Gesture {
        // `minimumDistance: 10` — matches the pill's own collapse gesture
        // (`FloatingCallPillView.collapseDragGesture`). A near-zero threshold
        // co-fires with `.onTapGesture` on ordinary finger jitter during a
        // tap, causing a redundant edge-snap + haptic alongside the tap's
        // own full-screen expansion.
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                guard !isMenuRevealed else { return }
                dragTranslation = value.translation
            }
            .onEnded { value in
                guard !isMenuRevealed else { return }
                let size = CallBubbleGestureResolver.interpolatedSize(progress: currentProgress)
                let center = bubbleCenter(in: geometry, size: size)
                let releasedX = center.x + value.translation.width
                let releasedY = center.y + value.translation.height
                let edge = CallBubbleGestureResolver.snappedEdge(centerX: releasedX, screenWidth: geometry.size.width)

                let safeArea = geometry.safeAreaInsets
                let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
                let clampedY = CallBubbleGestureResolver.clampedVerticalPosition(
                    releasedY - safeArea.top, availableHeight: availableHeight, bubbleRadius: size.height / 2
                )

                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75)) {
                    dragTranslation = .zero
                    callManager.bubbleEdge = edge
                    callManager.bubbleVerticalFraction = availableHeight > 0 ? clampedY / availableHeight : 0
                }
                HapticFeedback.light()
            }
    }

    // MARK: - Pinch resize

    private var pinchGesture: some Gesture {
        MagnificationGesture()
            .onChanged { value in
                guard !isMenuRevealed else { return }
                // Sample BEFORE updating pinchScale, so onEnded can diff
                // against the second-to-last progress — an instantaneous
                // velocity estimate, matching dragGesture's own pre-update
                // sampling convention in FloatingCallPillView.
                pinchLastSample = (Date(), currentProgress)
                pinchScale = value
            }
            .onEnded { value in
                guard !isMenuRevealed else { return }
                let finalProgress = CallBubbleGestureResolver.progress(startingTier: callManager.bubbleSizeTier, scale: value)
                let velocity: CGFloat
                if let sample = pinchLastSample {
                    let elapsed = Date().timeIntervalSince(sample.time)
                    velocity = elapsed > 0 ? (finalProgress - sample.progress) / CGFloat(elapsed) : 0
                } else {
                    velocity = 0
                }
                pinchLastSample = nil
                let resolvedTier = CallBubbleGestureResolver.nextTier(progress: finalProgress, velocity: velocity)
                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75)) {
                    callManager.bubbleSizeTier = resolvedTier
                    pinchScale = 1.0
                }
                HapticFeedback.light()
            }
    }

    // MARK: - Mini-menu (long-press reveal, circle region only)

    private func revealMenu() {
        guard currentProgress < 0.5 else { return }
        HapticFeedback.medium()
        withAnimation(reduceMotion ? nil : .spring(response: 0.35, dampingFraction: 0.75)) {
            isMenuRevealed = true
        }
        armAutoDismiss()
    }

    private func closeMenu() {
        menuDismissTask?.cancel()
        withAnimation(reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.8)) {
            isMenuRevealed = false
        }
    }

    private func armAutoDismiss() {
        menuDismissTask?.cancel()
        menuDismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            guard !Task.isCancelled else { return }
            closeMenu()
        }
    }

    private var muteButton: some View {
        Button {
            callManager.toggleMute()
            HapticFeedback.light()
            armAutoDismiss()
        } label: {
            Image(systemName: callManager.isMuted ? "mic.slash.fill" : "mic.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(callManager.isMuted ? MeeshyColors.error : .white)
                .frame(width: menuButtonDiameter, height: menuButtonDiameter)
                .background(Circle().fill(callManager.isMuted ? MeeshyColors.error.opacity(0.2) : Color.black.opacity(0.55)))
        }
        .pressable()
        .accessibilityLabel(callManager.isMuted
            ? String(localized: "call.pill.unmute", defaultValue: "Réactiver le micro")
            : String(localized: "call.pill.mute", defaultValue: "Couper le micro"))
        .toggleStateAccessibility(isToggle: true, isActive: callManager.isMuted)
    }

    private var speakerButton: some View {
        Button {
            callManager.toggleSpeaker()
            HapticFeedback.light()
            armAutoDismiss()
        } label: {
            Image(systemName: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(callManager.isSpeaker ? MeeshyColors.indigo400 : .white)
                .frame(width: menuButtonDiameter, height: menuButtonDiameter)
                .background(Circle().fill(callManager.isSpeaker ? MeeshyColors.indigo400.opacity(0.2) : Color.black.opacity(0.55)))
        }
        .pressable()
        .accessibilityLabel(callManager.isSpeaker
            ? String(localized: "call.pill.speaker.off", defaultValue: "Désactiver le haut-parleur")
            : String(localized: "call.pill.speaker.on", defaultValue: "Activer le haut-parleur"))
        .toggleStateAccessibility(isToggle: true, isActive: callManager.isSpeaker)
    }

    private var hangupButton: some View {
        Button {
            closeMenu()
            callManager.endCall()
            HapticFeedback.error()
        } label: {
            Image(systemName: "phone.down.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .frame(width: menuButtonDiameter, height: menuButtonDiameter)
                .background(
                    Circle().fill(
                        LinearGradient(
                            colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.85)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.bubble.hangup", defaultValue: "Raccrocher l'appel"))
        .accessibilityHint(String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main))
    }
}
