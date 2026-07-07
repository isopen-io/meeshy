import SwiftUI
import MeeshySDK
import MeeshyUI

/// Bulle avatar circulaire — forme repliée de l'appel en cours, atteinte par
/// swipe depuis `FloatingCallPillView`. Déplaçable (drag libre, clipse au bord
/// le plus proche), tap → plein écran, appui long → mini-menu rapide
/// (mute/haut-parleur/raccrocher). Montée sans condition à deux endroits
/// (`RootView`, `iPadRootView+Sheets`), garde interne symétrique à celle de
/// `FloatingCallPillView`.
struct CallBubbleView: View {
    @ObservedObject private var callManager = CallManager.shared
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var isMenuRevealed = false
    @State private var dragTranslation: CGSize = .zero
    @State private var menuDismissTask: Task<Void, Never>?

    private let diameter = CallBubbleGestureResolver.bubbleDiameter
    private let menuButtonDiameter: CGFloat = 44
    private let menuButtonGap: CGFloat = 8

    var body: some View {
        if callManager.displayMode == .bubble && callManager.callState.isActive && !callManager.isSystemPiPActive {
            GeometryReader { geometry in
                ZStack {
                    if isMenuRevealed {
                        dismissLayer
                    }
                    bubbleCluster(in: geometry)
                        .position(bubbleCenter(in: geometry))
                }
            }
            .ignoresSafeArea()
            .transition(reduceMotion ? .opacity : .scale.combined(with: .opacity))
            .animation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75), value: callManager.displayMode)
        }
    }

    // MARK: - Dismiss layer (taps outside the cluster close the mini-menu)

    private var dismissLayer: some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture { closeMenu() }
            .accessibilityHidden(true)
    }

    // MARK: - Cluster (bubble + revealed menu buttons)

    @ViewBuilder
    private func bubbleCluster(in geometry: GeometryProxy) -> some View {
        let offset = isMenuRevealed
            ? CallBubbleGestureResolver.menuOffset(edge: callManager.bubbleEdge, screenWidth: geometry.size.width, buttonDiameter: menuButtonDiameter)
            : 0
        let sideButtonOffset = diameter / 2 + menuButtonGap + menuButtonDiameter / 2

        ZStack {
            if isMenuRevealed {
                muteButton.offset(x: -sideButtonOffset)
                speakerButton.offset(x: sideButtonOffset)
                hangupButton.offset(y: sideButtonOffset)
            }

            CallParticipantVisual(diameter: diameter)
                .clipShape(Circle())
                .shadow(color: Color.black.opacity(0.3), radius: 8, y: 4)
                .overlay(alignment: .topTrailing) {
                    TransientCallSignalGlyph(strength: signalStrength)
                        .padding(6)
                        .background(Circle().fill(Color.black.opacity(0.55)))
                        .offset(x: 16, y: -16)
                }
        }
        .offset(x: offset)
        .offset(dragTranslation)
        .simultaneousGesture(dragGesture(in: geometry))
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.5, maximumDistance: 6)
                .onEnded { _ in revealMenu() }
        )
        .onTapGesture {
            guard !isMenuRevealed else { return }
            HapticFeedback.medium()
            callManager.displayMode = .fullScreen
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.bubble.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "a11y.call.bubble.expand", defaultValue: "Revenir au plein écran", bundle: .main)) {
            callManager.displayMode = .fullScreen
        }
        .accessibilityAction(named: String(localized: "a11y.call.bubble.quickMenu", defaultValue: "Ouvrir le mini-menu d'appel", bundle: .main)) {
            revealMenu()
        }
    }

    private var signalStrength: CallSignalStrength {
        CallSignalStrength.from(level: callManager.liveVideoQualityLevel, connection: callManager.connectionQuality)
    }

    // MARK: - Positioning

    private func bubbleCenter(in geometry: GeometryProxy) -> CGPoint {
        let margin = CallBubbleGestureResolver.bubbleEdgeMargin
        let radius = diameter / 2
        let safeArea = geometry.safeAreaInsets
        let x: CGFloat = callManager.bubbleEdge == .trailing
            ? geometry.size.width - safeArea.trailing - margin - radius
            : safeArea.leading + margin + radius
        let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
        let y = safeArea.top + callManager.bubbleVerticalFraction * availableHeight
        return CGPoint(x: x, y: y)
    }

    // MARK: - Reposition drag

    private func dragGesture(in geometry: GeometryProxy) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { value in
                guard !isMenuRevealed else { return }
                dragTranslation = value.translation
            }
            .onEnded { value in
                guard !isMenuRevealed else { return }
                let center = bubbleCenter(in: geometry)
                let releasedX = center.x + value.translation.width
                let releasedY = center.y + value.translation.height
                let edge = CallBubbleGestureResolver.snappedEdge(centerX: releasedX, screenWidth: geometry.size.width)

                let safeArea = geometry.safeAreaInsets
                let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
                let clampedY = CallBubbleGestureResolver.clampedVerticalPosition(
                    releasedY - safeArea.top, availableHeight: availableHeight, bubbleRadius: diameter / 2
                )

                withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.75)) {
                    dragTranslation = .zero
                    callManager.bubbleEdge = edge
                    callManager.bubbleVerticalFraction = availableHeight > 0 ? clampedY / availableHeight : 0
                }
                HapticFeedback.light()
            }
    }

    // MARK: - Mini-menu (long-press reveal)

    private func revealMenu() {
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
        .callToggleAccessibility(isToggle: true, isActive: callManager.isMuted)
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
        .callToggleAccessibility(isToggle: true, isActive: callManager.isSpeaker)
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
    }
}
