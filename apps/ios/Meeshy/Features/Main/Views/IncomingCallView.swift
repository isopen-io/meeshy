import SwiftUI
import Combine
import MeeshySDK
import MeeshyUI

// MARK: - Incoming Call View

struct IncomingCallView: View {
    // Audit P1-16 — `@ObservedObject var x = CallManager.shared` would
    // re-create the subscription every time the parent CallView re-evaluates
    // its body (which happens often during the ringing pulse animation).
    // Receive the manager from the parent so SwiftUI keeps the same
    // subscription throughout the view's lifetime.
    @ObservedObject var callManager: CallManager
    // Audit P2-iOS-9 — see CallView; skip repeating animations for
    // motion-sensitive users.
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var ringScale: CGFloat = 0.8
    @State private var ringOpacity: Double = 1.0
    @State private var avatarBounce: Bool = false

    /// Tranche les permissions AVANT de laisser `CallManager` répondre.
    ///
    /// Ce chemin (bannière in-app, app au premier plan) est le seul où l'on
    /// peut demander avant l'acceptation — sur le chemin CallKit l'UI système
    /// répond pour nous et `CallManager.answerCall()` porte la garde de repli.
    /// Micro refusé ⇒ on ne répond pas et on raccroche : un appel accepté sans
    /// micro se connecte muet, l'appelant parlant dans le vide.
    /// Caméra refusée ⇒ on répond quand même, en audio (dégradation gérée en aval).
    private func acceptCall() {
        Task { @MainActor in
            guard await MediaPermissionCoordinator.ensureMicrophone() else {
                callManager.endCall()
                return
            }
            if callManager.isVideoEnabled {
                await MediaPermissionCoordinator.ensureCamera(announcesRefusal: false)
            }
            callManager.answerCall()
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            // Pulsing ring animation — purely decorative; caller name announced below
            ringAnimation
                .accessibilityHidden(true)
                .padding(.bottom, 32)

            // Caller name
            Text(callManager.remoteUsername ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                // Posé sur le fond sombre fixe de CallView → texte clair fixe
                // (theme.textPrimary suit le système et virait au foncé en Light).
                .foregroundColor(.white)
                .padding(.bottom, 8)

            // Call type label
            Text(callManager.isVideoEnabled
                ? String(localized: "call.incoming.video", defaultValue: "Appel video entrant", bundle: .main)
                : String(localized: "call.incoming.audio", defaultValue: "Appel entrant", bundle: .main))
                .font(.callout.weight(.medium))
                .foregroundColor(.white.opacity(0.7))
                .padding(.bottom, 12)

            // Call type badge
            callTypeBadge
                .padding(.bottom, 60)

            Spacer()

            // Accept / Reject buttons
            actionButtons
                .padding(.bottom, 80)
        }
        .onAppear {
            let callerName = callManager.remoteUsername
                ?? String(localized: "call.incoming.unknown_caller", defaultValue: "Inconnu", bundle: .main)
            let callTypeLabel = callManager.isVideoEnabled
                ? String(localized: "call.incoming.video", defaultValue: "Appel video entrant", bundle: .main)
                : String(localized: "call.incoming.audio", defaultValue: "Appel entrant", bundle: .main)
            UIAccessibility.post(
                notification: .screenChanged,
                argument: String(
                    localized: "call.incoming.a11y.announced",
                    defaultValue: "\(callTypeLabel), \(callerName)",
                    bundle: .main
                )
            )
        }
    }

    // MARK: - Ring Animation

    private var ringAnimation: some View {
        ZStack {
            // Expanding rings
            ForEach(0..<4, id: \.self) { index in
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [
                                MeeshyColors.success.opacity(0.4 - Double(index) * 0.08),
                                MeeshyColors.indigo400.opacity(0.2 - Double(index) * 0.04)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: max(1, 3 - CGFloat(index) * 0.5)
                    )
                    .frame(
                        width: 120 + CGFloat(index) * 35,
                        height: 120 + CGFloat(index) * 35
                    )
                    .scaleEffect(ringScale)
                    .opacity(ringOpacity - Double(index) * 0.15)
                    .animation(
                        reduceMotion ? nil
                            : .easeInOut(duration: 1.2)
                                .repeatForever(autoreverses: true)
                                .delay(Double(index) * 0.2),
                        value: ringScale
                    )
            }

            // Avatar
            avatarView
                .scaleEffect(avatarBounce ? 1.05 : 1.0)
                .animation(
                    reduceMotion
                        ? nil
                        : .spring(response: 0.6, dampingFraction: 0.5).repeatForever(autoreverses: true),
                    value: avatarBounce
                )
        }
        .onAppear {
            // Audit P2-iOS-9 — only kick off the infinite animations when
            // Reduce Motion is OFF. Otherwise the static layout is shown.
            ringScale = reduceMotion ? 1.0 : 1.1
            ringOpacity = reduceMotion ? 0.85 : 0.6
            avatarBounce = !reduceMotion
        }
        .onDisappear {
            withTransaction(Transaction(animation: nil)) {
                ringScale = 1.0
                ringOpacity = 0.0
                avatarBounce = false
            }
        }
    }

    private var avatarView: some View {
        let name = callManager.remoteUsername ?? "?"
        let initial = String(name.prefix(1)).uppercased()

        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.indigo500, MeeshyColors.indigo400],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 110, height: 110)

            Text(initial)
                // doctrine 82i — initiale bornée par le cercle d'avatar fixe 110×110 ;
                // décorative (déjà aplatie par le `.accessibilityHidden(true)` du ring parent)
                .font(.system(size: 44, weight: .bold, design: .rounded))
                .foregroundColor(.white)
        }
        .shadow(color: MeeshyColors.indigo500.opacity(0.4), radius: 16, y: 6)
    }

    // MARK: - Call Type Badge

    private var callTypeBadge: some View {
        CallTypeBadgeView(
            isVideo: callManager.isVideoEnabled,
            label: callManager.isVideoEnabled
                ? String(localized: "call.incoming.badge.video", defaultValue: "Video", bundle: .main)
                : String(localized: "call.incoming.badge.audio", defaultValue: "Audio", bundle: .main)
        )
    }

    // MARK: - Action Buttons

    private var actionButtons: some View {
        // iOS 26 Liquid Glass (prominent, tinted) for the two primary actions —
        // gating/fallback owned by the SDK Compatibility wrappers. Grouped so the
        // glass circles blend rather than clip (glass can't sample glass).
        AdaptiveGlassContainer(spacing: 40) {
            HStack(spacing: 60) {
                // Reject
                Button {
                    callManager.rejectCall()
                } label: {
                    VStack(spacing: 10) {
                        Image(systemName: "phone.down.fill")
                            // doctrine 82i — glyphe borné par le cercle de bouton fixe 70×70 ;
                            // le `Button` porte déjà son `.accessibilityLabel`/`.accessibilityHint`
                            .font(.system(size: 28, weight: .medium))
                            .foregroundColor(.white)
                            .frame(width: 70, height: 70)
                            .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.error)

                        Text(String(localized: "call.incoming.decline", defaultValue: "Refuser", bundle: .main))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(MeeshyColors.error)
                    }
                }
                .pressable()
                .accessibilityLabel(String(localized: "call.incoming.decline.label", defaultValue: "Refuser l'appel", bundle: .main))
                .accessibilityHint(String(localized: "call.incoming.decline.hint", defaultValue: "Décline l'appel entrant", bundle: .main))

                // Accept
                Button {
                    acceptCall()
                } label: {
                    VStack(spacing: 10) {
                        Image(systemName: callManager.isVideoEnabled ? "video.fill" : "phone.fill")
                            // doctrine 82i — glyphe borné par le cercle de bouton fixe 70×70 ;
                            // le `Button` porte déjà son `.accessibilityLabel`/`.accessibilityHint`
                            .font(.system(size: 28, weight: .medium))
                            .foregroundColor(.white)
                            .frame(width: 70, height: 70)
                            .adaptiveGlassProminent(in: Circle(), tint: MeeshyColors.success)

                        Text(String(localized: "call.incoming.accept", defaultValue: "Accepter", bundle: .main))
                            .font(.caption2.weight(.medium))
                            .foregroundColor(MeeshyColors.success)
                    }
                }
                .pressable()
                .accessibilityLabel(String(localized: "call.incoming.accept.label", defaultValue: "Accepter l'appel", bundle: .main))
                .accessibilityHint(String(localized: "call.incoming.accept.hint", defaultValue: "Répond à l'appel entrant", bundle: .main))
            }
        }
    }
}
