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
    /// rouge = rupture réseau en cours de récupération.
    var glyphColor: Color? {
        switch self {
        case .connected:    return nil
        case .ringing:      return MeeshyColors.warning
        case .connecting:   return MeeshyColors.warning
        case .reconnecting: return MeeshyColors.error
        }
    }

    static func from(_ state: CallState) -> CallPillStatus {
        switch state {
        case .connected:             return .connected
        case .ringing:               return .ringing
        case .offering, .connecting: return .connecting
        case .reconnecting:          return .reconnecting
        // The pill is hidden in `.idle`/`.ended` (callState.isActive == false);
        // map to a safe non-connected status so a stray render never shows green.
        case .idle, .ended:          return .connecting
        }
    }
}

// MARK: - Floating Call Pill View

/// Bannière d'appel réduite — pleine largeur façon WhatsApp, incrustée au
/// sommet de TOUTE l'app (overlay RootView). Toucher la bannière revient au
/// plein écran ; le bouton « agrandir » dédié a été retiré (redondant avec le
/// tap, retour user 2026-07-04). L'avatar réel du correspondant est résolu
/// cache-first (Instant App) et l'état de connexion est porté par des glyphes
/// code couleur, pas par du texte.
struct FloatingCallPillView: View {
    // Use the singleton directly via @ObservedObject like the rest of the
    // app (RootView, CallView). The previous @EnvironmentObject form
    // crashed at launch because the pill is mounted as a `.overlay` on
    // the RootView/iPadRootView ZStack — SwiftUI does NOT propagate
    // environment objects into overlay closures by default, and the app
    // does not inject CallManager via `.environmentObject(...)` either
    // (the singleton is the only source of truth).
    @ObservedObject private var callManager = CallManager.shared
    // Audit P2-iOS-9 — respect the user's Reduce Motion preference. The
    // slide-in/-out spring animation is the primary animation concern here;
    // when reduce motion is on, collapse it to a simple cross-fade.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
            CallParticipantVisual(diameter: 44)
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
        // iOS 26 Liquid Glass surface (SDK Compatibility wrapper owns the
        // gating + the .ultraThinMaterial fallback). The small inner controls stay
        // as vibrancy fills ON the glass — Apple HIG: don't nest glass in glass.
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(MeeshyColors.glassBorderGradient(isDark: true), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.25), radius: 12, x: 0, y: 6)
        // Plafond iPad/Mac : la barre reste un bandeau lisible et centré au
        // lieu de s'étirer sur toute une fenêtre paysage ; sur iPhone (<560 pt)
        // elle est pleine largeur.
        .frame(maxWidth: 560)
        .padding(.horizontal, 10)
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
                TransientCallSignalGlyph(strength: signalStrength)
                Text(formattedDuration)
                    .font(.caption.weight(.medium).monospacedDigit())
                    .foregroundColor(MeeshyColors.success)
            } else if let glyph = pillStatus.glyphSystemName, let color = pillStatus.glyphColor {
                Image(systemName: glyph)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(color)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(pillStatus.isConnected ? formattedDuration : pillStatus.label)
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
                .foregroundColor(callManager.isMuted ? MeeshyColors.error : .white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(callManager.isMuted ? MeeshyColors.error.opacity(0.2) : Color.white.opacity(0.1))
                )
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
        } label: {
            Image(systemName: callManager.isSpeaker ? "speaker.wave.3.fill" : "speaker.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(callManager.isSpeaker ? MeeshyColors.indigo400 : .white)
                .frame(width: 44, height: 44)
                .background(
                    Circle()
                        .fill(callManager.isSpeaker ? MeeshyColors.indigo400.opacity(0.2) : Color.white.opacity(0.1))
                )
        }
        .pressable()
        .accessibilityLabel(callManager.isSpeaker
            ? String(localized: "call.pill.speaker.off", defaultValue: "Désactiver le haut-parleur")
            : String(localized: "call.pill.speaker.on", defaultValue: "Activer le haut-parleur"))
        .callToggleAccessibility(isToggle: true, isActive: callManager.isSpeaker)
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

    // MARK: - Actions

    private func expandToFullScreen() {
        withAnimation(reduceMotion ? nil : .spring(response: 0.5, dampingFraction: 0.75)) {
            callManager.displayMode = .fullScreen
        }
        HapticFeedback.medium()
    }

    // MARK: - Formatting

    private var formattedDuration: String {
        let totalSeconds = Int(callManager.callDuration)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}
