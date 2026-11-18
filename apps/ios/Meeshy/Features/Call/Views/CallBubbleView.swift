import SwiftUI
import MeeshySDK
import MeeshyUI

/// La vignette de l'appel réduit — forme repliée de l'appel en cours, atteinte par
/// swipe depuis `FloatingCallPillView`. #19701 — UNE seule forme, la vignette
/// rectangulaire, en audio (l'avatar) comme en vidéo (la vidéo de l'autre) ; plus
/// de disque. Déplaçable (le doigt la porte image par image ; au lâcher, elle
/// glisse selon l'élan puis se pose au bord le plus proche), pinçable (3 paliers
/// small → medium → large, morphing continu — spec
/// 2026-08-03-call-bubble-pip-resize-morph-design.md), tap → plein écran
/// déployé depuis l'endroit où elle flotte (P18.4). #19696 — réduit, l'appel
/// ne porte AUCUN bouton d'appel : la personne (sa vidéo, sinon son avatar) et
/// la durée ; toutes les commandes vivent en plein écran. Montée dans la fenêtre
/// passe-plat du point de retour (`CallReturnPointWindowHost`, #8739), au-dessus
/// de tout plein écran ; elle se montre selon `CallReturnPoint.showsBubble` —
/// en mode bulle, et en mode pastille quand un plein écran recouvre la pastille.
struct CallBubbleView: View {
    // Audit P1-16 parity (see CallView.swift / FloatingCallPillView.swift) —
    // injected by the caller instead of a `= CallManager.shared` default, so
    // the parent's body re-evaluating for unrelated churn (unread counts,
    // presence, navigation) doesn't tear down and rebuild this view's
    // objectWillChange subscription. Both mount sites (RootView,
    // iPadRootView+Sheets) already hold their own @ObservedObject callManager.
    @ObservedObject var callManager: CallManager
    let isMainScreenCovered: Bool
    /// L'écran principal montre la conversation de l'appel (#18457) : en audio
    /// la bulle se tait (la puce d'en-tête suffit), en vidéo elle est la
    /// vignette, jamais le cercle.
    var isInCallConversation: Bool = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var dragTranslation: CGSize = .zero
    @State private var pinchScale: CGFloat = 1.0
    @State private var pinchLastSample: (time: Date, progress: CGFloat)?

    private let shareStopGap: CGFloat = 8

    private var isVideo: Bool {
        callManager.isVideoEnabled || callManager.isRemoteVideoEnabled
    }

    var body: some View {
        if CallReturnPoint.showsBubble(
            displayMode: callManager.displayMode,
            callState: callManager.callState,
            isSystemPiPActive: callManager.isSystemPiPActive,
            isMainScreenCovered: isMainScreenCovered,
            isInCallConversation: isInCallConversation,
            isVideo: isVideo
        ) {
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

    /// Progression continue (0...2, `.small...large`) — ancrée sur le
    /// palier snappé au repos (`pinchScale == 1`), suit l'échelle du doigt en
    /// direct pendant un pinch actif.
    private var currentProgress: CGFloat {
        CallBubbleGestureResolver.progress(
            startingTier: callManager.bubbleSizeTier,
            scale: pinchScale
        )
    }

    // MARK: - Cluster (la personne et la durée, « Arrêter » pendant un partage)

    @ViewBuilder
    private func bubbleCluster(in geometry: GeometryProxy) -> some View {
        let progress = currentProgress
        let size = CallBubbleGestureResolver.interpolatedSize(progress: progress)
        let cornerRadius = CallBubbleGestureResolver.rectangleCornerRadius

        ZStack {
            shareStopSlot(size: size)

            participantVisual(size: size, cornerRadius: cornerRadius)
        }
        // Le cadre touchable de la fenêtre passe-plat, mesuré AVANT les
        // décalages pour les suivre : élargi au glyphe de signal et à « Arrêter ».
        .background {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: CallReturnPointFrameKey.self,
                    value: proxy.frame(in: .global).insetBy(dx: -(touchReach + shareStopReachX), dy: -touchReach)
                )
            }
        }
        .offset(dragTranslation)
        .simultaneousGesture(dragGesture(in: geometry))
        .simultaneousGesture(pinchGesture)
        .onTapGesture { expandToFullScreen(in: geometry) }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.bubble.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityValue(accessibilityTierLabel(for: callManager.bubbleSizeTier))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "a11y.call.bubble.expand", defaultValue: "Revenir au plein écran", bundle: .main)) {
            expandToFullScreen(in: geometry)
        }
        .accessibilityAdjustableAction { direction in
            adjustTier(direction)
        }
    }

    /// La vignette : la vidéo de l'autre, sinon son avatar (`CallParticipantVisual`), son badge
    /// de réseau et l'étiquette « nom · durée » ; aucun bouton (#19696), aucun disque (#19701).
    private func participantVisual(size: CGSize, cornerRadius: CGFloat) -> some View {
        CallParticipantVisual(width: size.width, height: size.height, cornerRadius: cornerRadius, callManager: callManager)
            .shadow(color: Color.black.opacity(MeeshyOpacity.medium), radius: 8, y: 4)
            .overlay(alignment: .topTrailing) { signalBadge }
            .overlay(alignment: .bottom) { nameplate(frameWidth: size.width) }
    }

    private func adjustTier(_ direction: AccessibilityAdjustmentDirection) {
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

    private var signalBadge: some View {
        TransientCallSignalGlyph(strength: signalStrength)
            .padding(MeeshySpacing.xsPlus)
            .background(Circle().fill(Color.black.opacity(MeeshyOpacity.strong)))
            .offset(x: 16, y: -16)
    }

    /// P18.5 — l'étiquette de verre « nom · durée », en bas à gauche du cadre, resserrée à sa
    /// largeur. Elle ne prend aucun toucher.
    private func nameplate(frameWidth: CGFloat) -> some View {
        CallReducedCaption(callManager: callManager, style: .glass)
            .minimumScaleFactor(0.75)
            .fixedSize(horizontal: false, vertical: true)
            .frame(width: max(frameWidth - 2 * MeeshySpacing.sm, 0), alignment: .leading)
            .padding(.bottom, MeeshySpacing.sm)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }


    private var touchReach: CGFloat {
        max(16, shareStopReach)
    }

    // MARK: - « Arrêter » au-dessus d'un plein écran (#17763)

    private let shareStopHeight: CGFloat = 44

    /// Le cadre touchable de la fenêtre passe-plat s'étend jusqu'à la capsule.
    private var shareStopReach: CGFloat {
        guard CallReturnPoint.showsShareStop(isSharing: callManager.screenShare.isSharing) else { return 0 }
        return shareStopGap + shareStopHeight + MeeshySpacing.sm
    }

    /// La capsule déborde la bulle du côté de l'écran : le cadre touchable s'y étend aussi.
    private var shareStopReachX: CGFloat {
        shareStopReach > 0 ? 100 : 0
    }

    @ViewBuilder
    private func shareStopSlot(size: CGSize) -> some View {
        Group {
            if CallReturnPoint.showsShareStop(isSharing: callManager.screenShare.isSharing) {
                shareStopCapsule
                    .frame(width: size.width, alignment: callManager.bubbleEdge == .trailing ? .trailing : .leading)
                    .offset(y: size.height / 2 + shareStopGap + shareStopHeight / 2)
                    .transition(CallShareCapsuleMotion.swapTransition(reduceMotion: reduceMotion))
            }
        }
        .animation(CallShareCapsuleMotion.swapAnimation(reduceMotion: reduceMotion), value: callManager.screenShare.isSharing)
    }

    private var shareStopCapsule: some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: "rectangle.on.rectangle")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(Color.white)
                .accessibilityHidden(true)
            CallShareStopButton { callManager.screenShare.stopSharing() }
        }
        .padding(.leading, MeeshySpacing.sm)
        .meeshyGlass(in: Capsule(), tint: MeeshyColors.error)
        .fixedSize()
        .environment(\.colorScheme, .dark)
    }

    private func accessibilityTierLabel(for tier: CallBubbleSizeTier) -> String {
        switch tier {
        case .small: return String(localized: "call.bubble.size.small", defaultValue: "Petit", bundle: .main)
        case .medium: return String(localized: "call.bubble.size.medium", defaultValue: "Moyen", bundle: .main)
        case .large: return String(localized: "call.bubble.size.large", defaultValue: "Grand", bundle: .main)
        }
    }

    private var signalStrength: CallSignalStrength {
        CallSignalStrength.from(level: callManager.liveVideoQualityLevel, connection: callManager.connectionQuality)
    }

    // MARK: - P18.4 — l'appel se redéploie depuis l'endroit où la bulle flotte

    private func expandToFullScreen(in geometry: GeometryProxy) {
        HapticFeedback.medium()
        let center = bubbleCenter(in: geometry, size: CallBubbleGestureResolver.interpolatedSize(progress: currentProgress))
        let origin = CallShareCapsuleMotion.window(reduceMotion: reduceMotion, bubbleCenter: center, in: geometry.size)
        CallPipMorph.expand(callManager, from: origin, reduceMotion: reduceMotion)
    }

    // MARK: - Positioning

    private func bubbleCenter(in geometry: GeometryProxy, size: CGSize) -> CGPoint {
        let margin = CallBubbleGestureResolver.bubbleEdgeMargin
        let halfWidth = size.width / 2
        let safeArea = geometry.safeAreaInsets
        let x = callManager.bubbleEdge == .trailing
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
                dragTranslation = value.translation
            }
            .onEnded { value in
                let size = CallBubbleGestureResolver.interpolatedSize(progress: currentProgress)
                let center = bubbleCenter(in: geometry, size: size)
                // #19701 — l'élan du geste emporte la vignette au-delà du point de lâcher.
                let glided = CallBubbleGestureResolver.glidedTranslation(
                    translation: value.translation, predicted: value.predictedEndTranslation
                )
                let releasedX = center.x + glided.width
                let releasedY = center.y + glided.height
                let edge = CallBubbleGestureResolver.snappedEdge(centerX: releasedX, screenWidth: geometry.size.width)

                let safeArea = geometry.safeAreaInsets
                let availableHeight = geometry.size.height - safeArea.top - safeArea.bottom
                let clampedY = CallBubbleGestureResolver.clampedVerticalPosition(
                    releasedY - safeArea.top, availableHeight: availableHeight, bubbleRadius: size.height / 2
                )

                let glide = Animation.spring(
                    response: CallBubbleGestureResolver.glideResponse,
                    dampingFraction: CallBubbleGestureResolver.glideDamping
                )
                withAnimation(reduceMotion ? nil : glide) {
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
                // Sample BEFORE updating pinchScale, so onEnded can diff
                // against the second-to-last progress — an instantaneous
                // velocity estimate, matching dragGesture's own pre-update
                // sampling convention in FloatingCallPillView.
                pinchLastSample = (Date(), currentProgress)
                pinchScale = value
            }
            .onEnded { value in
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
}
