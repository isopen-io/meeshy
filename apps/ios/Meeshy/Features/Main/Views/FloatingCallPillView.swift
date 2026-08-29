import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Call Pill Status

/// What the minimised call banner's status line should convey, derived purely
/// from `CallState`. Only `.connected` shows the running call duration (green +
/// glyphe signal) ; every pre-connection state shows a color-coded glyph
/// (amber = sonnerie/connexion, red = rupture réseau) so a call that is merely
/// ringing/connecting/reconnecting is never misrepresented as an established
/// 00:00 call.
enum CallPillStatus: Equatable {
    case connected
    case ringing
    case connecting
    case reconnecting

    /// `true` only for an established call → the banner shows the live duration.
    var isConnected: Bool { self == .connected }

    /// Pre-connection status label (empty for `.connected`, where the view shows
    /// the formatted duration instead). Porté par VoiceOver — visuellement,
    /// l'état est un glyphe code couleur (retour user 2026-07-04 : remplacer
    /// les textes « Sonnerie… »/« Connexion… » par des glyphes).
    var label: String {
        switch self {
        case .connected:    return ""
        case .ringing:      return String(localized: "call.pill.status.ringing", defaultValue: "Sonnerie…")
        case .connecting:   return String(localized: "call.pill.status.connecting", defaultValue: "Connexion…")
        case .reconnecting: return String(localized: "call.pill.status.reconnecting", defaultValue: "Reconnexion…")
        }
    }

    /// Glyphe d'état pré-connexion (nil pour `.connected` : la durée + le
    /// glyphe signal prennent le relais).
    var glyphSystemName: String? {
        switch self {
        case .connected:    return nil
        case .ringing:      return "bell.and.waves.left.and.right"
        case .connecting:   return "arrow.triangle.2.circlepath"
        case .reconnecting: return "wifi.exclamationmark"
        }
    }

    /// Code couleur de l'état : ambre = en attente (sonnerie/connexion),
    /// rouge = rupture réseau en cours de récupération. Le rouge est
    /// `errorSoft` et non `error` : sur l'aplat indigo de la bannière,
    /// #F87171 ne tient pas le 3:1 WCAG (CallBannerContrastTests).
    var glyphColor: Color? {
        switch self {
        case .connected:    return nil
        case .ringing:      return MeeshyColors.warning
        case .connecting:   return MeeshyColors.warning
        case .reconnecting: return CallBannerContrast.errorStateTint
        }
    }

    static func from(_ state: CallState) -> CallPillStatus {
        switch state {
        case .connected:  return .connected
        case .ringing:    return .ringing
        // Audit 2026-07-10 — `.offering` means the SDP offer is out and ICE is
        // negotiating, but the callee's phone is still physically ringing;
        // CallView already treats it as "still ringing" (outgoingRingingView),
        // not "establishing a connection". Minimizing an outgoing call before
        // it's answered must show the same "Sonnerie…" status, not "Connexion…".
        case .offering:     return .ringing
        case .connecting:   return .connecting
        case .reconnecting: return .reconnecting
        // The pill is hidden in `.idle`/`.ended` (callState.isActive == false);
        // map to a safe non-connected status so a stray render never shows green.
        case .idle, .ended: return .connecting
        }
    }
}

// MARK: - Floating Call Pill View

/// Bannière d'appel réduite — pleine largeur façon WhatsApp, montée en tête
/// du VStack de compression de frame (CallPresentationLayer) : la frame de
/// TOUTE l'app (NavigationStack et headers de destinations compris) commence
/// sous la bannière — jamais de contenu caché ou inaccessible derrière — et
/// le fond remonte sous la status bar jusqu'au bord haut du viewport
/// (immersif). Toucher la
/// bannière revient au plein écran ; le bouton « agrandir » dédié a été retiré
/// (redondant avec le tap, retour user 2026-07-04), les chevrons décoratifs de
/// bord aussi (retour user 2026-08-12). L'avatar réel du correspondant est
/// résolu cache-first (Instant App) et l'état de connexion est porté par des
/// glyphes code couleur, pas par du texte.
struct FloatingCallPillView: View {
    // Audit P1-16 parity (see CallView.swift) — injected by the caller
    // (RootView/iPadRootView already hold their own @ObservedObject
    // callManager to gate the adjacent fullScreenCover) instead of a
    // `= CallManager.shared` default. A defaulted @ObservedObject is
    // reassigned — and its objectWillChange subscription torn down and
    // rebuilt — every time the parent's body re-evaluates for churn
    // unrelated to the call (unread counts, presence, navigation), and
    // both mount sites are top-level containers that re-evaluate often.
    // (@EnvironmentObject was tried before and crashed at launch: the pill
    // is mounted as a `.overlay` closure, which SwiftUI does NOT propagate
    // environment objects into — hence explicit injection, not environment.)
    @ObservedObject var callManager: CallManager
    // Audit P2-iOS-9 — respect the user's Reduce Motion preference. The
    // slide-in/-out spring animation is the primary animation concern here;
    // when reduce motion is on, collapse it to a simple cross-fade.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Suit le drag horizontal en direct pour l'offset + fondu visuels ; ne
    /// persiste rien (contrairement à `bubbleEdge`/`bubbleVerticalFraction`
    /// sur `CallManager`, qui ne concernent que la bulle repliée).
    @State private var pillDragOffset: CGFloat = 0
    @State private var pillLastDragSample: (time: Date, translationWidth: CGFloat)?

    private let pillHeight: CGFloat = 64

    var body: some View {
        if callManager.displayMode == .pip && callManager.callState.isActive && !callManager.isSystemPiPActive {
            pillContent
                // Bannière verre + contrôles blancs : on épingle le verre en
                // sombre pour rester lisible quel que soit le mode système.
                .environment(\.colorScheme, .dark)
                // P2-iOS-9 — slide-in from top when motion is allowed; fade
                // only when reduce motion is on (no translational movement).
                .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                .animation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.75), value: callManager.displayMode)
                .zIndex(999)
        }
    }

    // MARK: - Pill Content

    private var pillContent: some View {
        HStack(spacing: 12) {
            CallParticipantVisual(diameter: 44, callManager: callManager)
            userInfoSection
            Spacer(minLength: 8)
            controlButtons
        }
        .padding(.horizontal, 14)
        // minHeight (not an exact height): userInfoSection stacks two
        // Dynamic-Type-scalable Text lines that can exceed pillHeight at
        // accessibility text sizes (AX1+) — an exact frame would force-clip
        // the name/status instead of letting the pill grow to fit.
        .frame(minHeight: pillHeight)
        // Pleine largeur (façon barre d'appel WhatsApp) : la bannière s'étire
        // d'un bord à l'autre au sommet de l'app au lieu de flotter en capsule.
        .frame(maxWidth: .infinity)
        .background(
            // Retour user 2026-08-12 (second passage) : PLEINEMENT indigo.
            // Plus de voile noir (l'ancien scrim 40 % faisait lire la zone
            // status bar comme une « barre noire ») ni de fondu transparent
            // en bas — un aplat indigo net, arrêts 600→800 calibrés WCAG
            // sans scrim (CallBannerContrastTests : blanc ≥ 6.3:1, glyphes
            // d'état ≥ 3:1 aux deux arrêts).
            LinearGradient(
                colors: [CallBannerContrast.bannerTop, CallBannerContrast.bannerBottom],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            // Immersif façon WhatsApp : la bannière est posée en tête du
            // VStack de compression (CallPresentationLayer), donc SOUS la
            // status bar — seul son décor déborde jusqu'au bord haut du
            // viewport : l'indigo recouvre la bande status bar / Dynamic
            // Island, et les détails d'appel (signal, durée) s'affichent
            // juste sous l'îlot. Le layout du contenu (contrôles, avatar)
            // reste dans la safe area.
            .ignoresSafeArea(.container, edges: .top)
        )
        .offset(x: pillDragOffset)
        .opacity(pillDragOpacity)
        .simultaneousGesture(collapseDragGesture)
        .contentShape(Rectangle())
        .onTapGesture {
            expandToFullScreen()
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(
            String(localized: "call.pill.ongoing", defaultValue: "Appel en cours")
            + (callManager.remoteUsername.map { " — \($0)" } ?? "")
        )
        .accessibilityHint(String(localized: "call.pill.tapToReturn", defaultValue: "Touchez pour revenir à l'appel en plein écran"))
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: String(localized: "a11y.call.pill.collapse", defaultValue: "Réduire en bulle", bundle: .main)) {
            collapseToBubble(exitTranslation: 1)
        }
    }

    // MARK: - User Info

    private var userInfoSection: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(callManager.remoteUsername ?? String(localized: "call.pill.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white)
                .lineLimit(1)

            statusLine
        }
    }

    /// Seconde ligne : durée verte + glyphe signal code couleur quand l'appel
    /// est établi ; sinon le glyphe d'état pré-connexion (sonnerie/connexion en
    /// ambre, rupture réseau en rouge). Le libellé texte survit pour VoiceOver.
    private var statusLine: some View {
        HStack(spacing: 5) {
            if pillStatus.isConnected {
                TransientCallSignalGlyph(strength: signalStrength, errorTint: CallBannerContrast.errorStateTint)
                // Blanc, pas success : #34D399 ne tient que 3.3:1 contre
                // l'arrêt haut de l'aplat indigo — sous le seuil 4.5:1 du
                // texte courant (CallBannerContrastTests). L'état « établi »
                // reste porté par le glyphe signal.
                Text(formattedDuration)
                    .font(.caption.weight(.medium).monospacedDigit())
                    .foregroundColor(.white)
            } else if let glyph = pillStatus.glyphSystemName, let color = pillStatus.glyphColor {
                Image(systemName: glyph)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(color)
            }
        }
        .accessibilityElement(children: .combine)
        // When connected the line otherwise reads to VoiceOver as a bare
        // "02:34" with no hint it is the call duration. Name what the readout
        // measures via the label and expose the running time as the value;
        // pre-connection states keep their spoken status ("Sonnerie…").
        .accessibilityLabel(pillStatus.isConnected
            ? String(localized: "a11y.call.pill.duration", defaultValue: "Dur\u{00E9}e d'appel", bundle: .main)
            : pillStatus.label)
        .accessibilityValue(pillStatus.isConnected ? spokenDuration : "")
        .accessibilityAddTraits(.updatesFrequently)
    }

    /// Status conveyed by the banner's second line — drives whether the live
    /// duration (green) or a pre-connection glyph (amber/red) is shown.
    private var pillStatus: CallPillStatus {
        CallPillStatus.from(callManager.callState)
    }

    /// Même dérivation que CallView : stats RTT+perte d'abord, état ICE en
    /// repli — le mapping vit dans `CallSignalStrength` (pur, testé).
    private var signalStrength: CallSignalStrength {
        CallSignalStrength.from(
            level: callManager.liveVideoQualityLevel,
            connection: callManager.connectionQuality
        )
    }

    // MARK: - Control Buttons

    private var controlButtons: some View {
        HStack(spacing: 8) {
            muteButton
            speakerButton
            hangupButton
        }
    }

    private var muteButton: some View {
        Button {
            callManager.toggleMute()
            HapticFeedback.light()
        } label: {
            Image(systemName: callManager.isMuted ? "mic.slash.fill" : "mic.fill")
                .font(.subheadline.weight(.medium))
                // errorSoft, pas error : #F87171 ne tient pas le 3:1 WCAG
                // contre l'aplat indigo de la bannière (CallBannerContrastTests).
                .foregroundColor(callManager.isMuted ? CallBannerContrast.errorStateTint : .white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(callManager.isMuted ? CallBannerContrast.errorStateTint.opacity(0.2) : Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(callManager.isMuted
            ? String(localized: "call.pill.unmute", defaultValue: "Réactiver le micro")
            : String(localized: "call.pill.mute", defaultValue: "Couper le micro"))
        .accessibilityHint(String(localized: "call.control.mute.hint", defaultValue: "Coupe votre micro pour le correspondant", bundle: .main))
        .toggleStateAccessibility(isToggle: true, isActive: callManager.isMuted)
    }

    private var speakerButton: some View {
        Button {
            callManager.toggleSpeaker()
            HapticFeedback.light()
        } label: {
            Image(systemName: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill")
                .font(.subheadline.weight(.medium))
                // indigo200, pas indigo400 : ce dernier ne tient que 2.1:1
                // contre l'aplat indigo de la bannière (CallBannerContrastTests).
                .foregroundColor(callManager.isSpeaker ? CallBannerContrast.speakerActiveTint : .white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(callManager.isSpeaker ? CallBannerContrast.speakerActiveTint.opacity(0.2) : Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(callManager.isSpeaker
            ? String(localized: "call.pill.speaker.off", defaultValue: "Désactiver le haut-parleur")
            : String(localized: "call.pill.speaker.on", defaultValue: "Activer le haut-parleur"))
        .accessibilityHint(String(localized: "call.control.speaker.hint", defaultValue: "Bascule la sortie audio vers le haut-parleur du téléphone", bundle: .main))
        .toggleStateAccessibility(isToggle: true, isActive: callManager.isSpeaker)
    }

    private var hangupButton: some View {
        Button {
            callManager.endCall()
            HapticFeedback.error()
        } label: {
            Image(systemName: "phone.down.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [MeeshyColors.error, MeeshyColors.error.opacity(0.85)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.pill.hangup", defaultValue: "Raccrocher"))
        .accessibilityHint(String(localized: "call.end.hint", defaultValue: "Termine l'appel en cours", bundle: .main))
    }

    // MARK: - Collapse Gesture

    private var pillDragOpacity: Double {
        let progress = min(abs(pillDragOffset) / 300, 1.0)
        return 1.0 - Double(progress) * 0.6
    }

    private var collapseDragGesture: some Gesture {
        DragGesture(minimumDistance: 10)
            .onChanged { value in
                // Sample BEFORE updating pillDragOffset, so onEnded can diff
                // against the second-to-last position — an instantaneous
                // velocity estimate, not one diluted by a slow start earlier
                // in the same gesture.
                pillLastDragSample = (Date(), pillDragOffset)
                pillDragOffset = value.translation.width
            }
            .onEnded { value in
                // iOS 16 floor — `DragGesture.Value.velocity` is iOS 17+, so
                // velocity is approximated from elapsed wall-clock time
                // instead (no existing precedent in this codebase uses the
                // iOS 17 API either).
                let velocityWidth: CGFloat
                if let sample = pillLastDragSample {
                    let elapsed = Date().timeIntervalSince(sample.time)
                    velocityWidth = elapsed > 0 ? (value.translation.width - sample.translationWidth) / CGFloat(elapsed) : 0
                } else {
                    velocityWidth = 0
                }
                pillLastDragSample = nil

                if CallBubbleGestureResolver.shouldCollapse(
                    translationWidth: value.translation.width,
                    velocityWidth: velocityWidth
                ) {
                    collapseToBubble(exitTranslation: value.translation.width)
                } else {
                    withAnimation(reduceMotion ? nil : .spring(response: 0.4, dampingFraction: 0.7)) {
                        pillDragOffset = 0
                    }
                    HapticFeedback.light()
                }
            }
    }

    private func collapseToBubble(exitTranslation: CGFloat) {
        HapticFeedback.success()
        let exitOffset: CGFloat = exitTranslation >= 0 ? 500 : -500
        withAnimation(reduceMotion ? nil : .easeIn(duration: 0.25)) {
            pillDragOffset = exitOffset
        }
        Task { @MainActor in
            if !reduceMotion {
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            // The call can end during this 250ms exit animation (user hangs
            // up immediately after swiping, remote hangs up, etc.) — guard
            // against flipping displayMode to .bubble for a call that's no
            // longer active, matching CallBubbleView's own display guard.
            guard callManager.callState.isActive else { return }
            callManager.displayMode = .bubble
            callManager.bubbleSizeTier = .circle
            pillDragOffset = 0
        }
    }

    // MARK: - Actions

    private func expandToFullScreen() {
        HapticFeedback.medium()
        guard !reduceMotion else {
            callManager.displayMode = .fullScreen
            return
        }
        // Agrandissement depuis la bannière (retour user 2026-08-12) : le
        // fullScreenCover est présenté SANS animation système ; CallView
        // consomme l'indice et joue l'expansion depuis le haut (mouvement
        // inverse de collapseIntoPip) — la bannière se retire par sa propre
        // transition .move(.top).
        callManager.requestPipExpansionMorph()
        var swap = Transaction()
        swap.disablesAnimations = true
        withTransaction(swap) {
            callManager.displayMode = .fullScreen
        }
    }

    // MARK: - Formatting

    private var formattedDuration: String {
        callManager.formattedDuration
    }

    /// Jumelle PARLÉE de `formattedDuration`, et même règle de délégation : le
    /// pill ne réimplémente ni l'une ni l'autre.
    private var spokenDuration: String {
        callManager.spokenDuration
    }
}
