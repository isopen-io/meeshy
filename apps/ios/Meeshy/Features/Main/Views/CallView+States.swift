import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI
import os

// Les états hors appel établi — sonnerie sortante, connexion, fin — et les
// pièces qu'ils partagent (avatars, badge de type, pastilles d'état). Sortis
// de `CallView.swift` (hors budget de taille, #8276).

extension CallView {
    // MARK: - Outgoing Ringing

    var outgoingRingingView: some View {
        VStack(spacing: 0) {
            Spacer()

            // Pulsing avatar
            pulsingAvatar
                .padding(.bottom, MeeshySpacing.xxl)

            // Name
            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, MeeshySpacing.sm)

            // §H2 — Status: "Appel en cours…" until 6s have elapsed, then the
            // calmer "En attente du correspondant…" so the user knows the ring
            // is reaching the peer (not a silent failure). The watchdog task
            // below drives this flag and auto-cancels on state transition.
            VStack(spacing: MeeshySpacing.xs) {
                Text(sdpOfferSlow
                    ? String(localized: "call.outgoing.waiting", defaultValue: "En attente du correspondant…", bundle: .main)
                    : String(localized: "call.outgoing.ringing", defaultValue: "Appel en cours...", bundle: .main))
                    .font(.callout.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
                if sdpOfferSlow {
                    Text(String(localized: "call.outgoing.waiting.hint", defaultValue: "Le correspondant n'a pas encore répondu.", bundle: .main))
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                }
            }
            .padding(.bottom, MeeshySpacing.sm)
            .animation(.easeInOut(duration: 0.3), value: sdpOfferSlow)

            // Call type badge
            callTypeBadge
                .padding(.bottom, MeeshySpacing.lg)

            // #8480, #8795 — ce que l'appelé reçoit vraiment avant de décrocher
            CallPreviewSeenLabel(preview: .shared, peerName: peerDisplayName)
                .frame(minHeight: 28)
                .padding(.bottom, MeeshySpacing.lg)

            Spacer()

            // #8795 — micro et caméra de l'aperçu, puis filtres et raccroché
            HStack(spacing: MeeshySpacing.xl) {
                CallPreviewOutgoingControls(
                    preview: .shared,
                    peerName: peerDisplayName,
                    isVideoCall: callManager.isVideoEnabled
                )
                if callManager.isVideoEnabled {
                    effectsToggleButton
                }
                endCallButton
            }
            .padding(.bottom, 80)
        }
        .task {
            sdpOfferSlow = false
            try? await Task.sleep(nanoseconds: sdpOfferSlowSeconds * 1_000_000_000)
            if !Task.isCancelled {
                withAnimation(.easeInOut(duration: 0.3)) { sdpOfferSlow = true }
                UIAccessibility.post(
                    notification: .announcement,
                    argument: String(localized: "call.outgoing.waiting",
                                    defaultValue: "En attente du correspondant…",
                                    bundle: .main)
                )
            }
        }
    }

    /// Le nom du correspondant, tel que la sonnerie l'affiche.
    var peerDisplayName: String {
        callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main)
    }

    // MARK: - Connecting

    var connectingView: some View {
        VStack(spacing: 0) {
            Spacer()

            pulsingAvatar
                .padding(.bottom, MeeshySpacing.xxl)

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title, design: .rounded).weight(.semibold))
                .foregroundColor(.white)
                .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
                .padding(.bottom, MeeshySpacing.sm)

            HStack(spacing: MeeshySpacing.sm) {
                ProgressView()
                    .tint(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(String(localized: "call.connecting", defaultValue: "Connexion...", bundle: .main))
                    .font(.callout.weight(.medium))
                    .foregroundColor(.white.opacity(0.7))
            }
            .accessibilityElement(children: .combine)
            .padding(.bottom, 60)

            Spacer()

            HStack(spacing: 40) {
                if callManager.isVideoEnabled {
                    effectsToggleButton
                }
                endCallButton
            }
            .padding(.bottom, 80)
        }
        // L'écran entier : l'aperçu de l'appelant posé derrière (`CallView`,
        // état `.connecting`) ne se limite pas à la colonne des boutons.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Ended

    func endedView(reason: CallEndReason) -> some View {
        VStack(spacing: MeeshySpacing.lg) {
            Spacer()

            avatarCircle(size: 100)
                .opacity(0.6)
                .accessibilityHidden(true)

            Text(callManager.remoteUsername ?? String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main))
                .font(.system(.title3, design: .rounded).weight(.semibold))
                .foregroundColor(.white.opacity(0.7))

            Text(endReasonText(reason))
                .font(.callout.weight(.medium))
                .foregroundColor(.white.opacity(0.7))

            if callManager.callDuration > 0 {
                Text(callManager.formattedDuration)
                    .font(.footnote.weight(.medium).monospacedDigit())
                    .foregroundColor(.white.opacity(0.45))
                    // Final call-total duration: same naked-readout fix, static
                    // (no .updatesFrequently). Bare "0:34" → "Durée de l'appel, 0:34".
                    .accessibilityLabel(String(localized: "call.duration.a11y.label"))
                    .accessibilityValue(callManager.spokenDuration)
            }

            if callManager.canRetryCall {
                // Transient failure — offer a one-tap re-dial (parité web/Android).
                Button {
                    callManager.retryCall()
                } label: {
                    Label(
                        String(localized: "call.action.retry", defaultValue: "Réessayer", bundle: .main),
                        systemImage: "arrow.clockwise"
                    )
                    .font(.callout.weight(.semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, MeeshySpacing.xxl)
                    .padding(.vertical, MeeshySpacing.md)
                    .frame(minHeight: 44)
                    .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.success)
                }
                .padding(.top, MeeshySpacing.sm)
                .accessibilityLabel(String(localized: "call.action.retry", defaultValue: "Réessayer", bundle: .main))
            }

            Spacer()
        }
    }

    // MARK: - UI Components

    var pulsingAvatar: some View {
        ZStack {
            // Pulse rings — decorative animation only
            ForEach(0..<3, id: \.self) { index in
                Circle()
                    .stroke(
                        LinearGradient(
                            colors: [MeeshyColors.indigo500.opacity(0.3), MeeshyColors.indigo400.opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 2
                    )
                    .frame(width: 120 + CGFloat(index) * 30, height: 120 + CGFloat(index) * 30)
                    .scaleEffect(pulseScale)
                    .opacity(2.0 - Double(pulseScale) * 0.8)
                    // Reduce Motion : aucune boucle, les anneaux restent posés
                    // (`startPulseAnimation` ne fait déjà pas varier `pulseScale`).
                    .animation(
                        reduceMotion ? nil : .easeInOut(duration: 1.5)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.3),
                        value: pulseScale
                    )
                    .accessibilityHidden(true)
            }

            callAvatarPair(size: 100)
        }
        // Decorative: the remote user's name is shown as a Text element directly
        // below this avatar in every layout that uses pulsingAvatar. VoiceOver
        // would otherwise read the first-initial letter from avatarCircle and then
        // the full name from the adjacent Text, producing a double-read.
        .accessibilityHidden(true)
    }

    func avatarCircle(size: CGFloat) -> some View {
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
                .frame(width: size, height: size)

            Text(initial)
                // Doctrine 86i : initiale d'avatar proportionnelle au cercle fixe `size` → figée.
                .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            // Vraie photo de profil par-dessus le fallback initiale (le
            // dégradé + initiale restent visibles pendant le chargement).
            if let avatar = remoteProfile?.avatar, !avatar.isEmpty {
                CachedAsyncImage(
                    url: avatar,
                    targetSize: CGSize(width: size, height: size),
                    thumbHash: remoteProfile?.avatarThumbHash
                ) {
                    Color.clear
                }
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
            }
        }
        .shadow(color: MeeshyColors.indigo500.opacity(0.3), radius: 12, y: 4)
    }

    /// Duo d'avatars de l'appel : le correspondant en grand, l'utilisateur
    /// local en pastille chevauchante bas-droite — appelant ET appelé sont
    /// identifiables d'un coup d'œil, quel que soit le sens de l'appel.
    func callAvatarPair(size: CGFloat) -> some View {
        let badgeSize = max(44, size * 0.4)
        return avatarCircle(size: size)
            .overlay(alignment: .bottomTrailing) {
                localAvatarBadge(size: badgeSize)
                    .offset(x: badgeSize * 0.22, y: badgeSize * 0.12)
            }
    }

    private func localAvatarBadge(size: CGFloat) -> some View {
        let user = AuthManager.shared.currentUser
        let name = user?.displayName ?? user?.username ?? "?"
        let initial = String(name.prefix(1)).uppercased()

        return ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [MeeshyColors.indigo600, MeeshyColors.indigo800],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )

            Text(initial)
                .font(.system(size: size * 0.4, weight: .bold, design: .rounded))
                .foregroundColor(.white)

            if let avatar = user?.avatar, !avatar.isEmpty {
                CachedAsyncImage(
                    url: avatar,
                    targetSize: CGSize(width: size, height: size),
                    thumbHash: user?.avatarThumbHash
                ) {
                    Color.clear
                }
                .scaledToFill()
                .frame(width: size, height: size)
                .clipShape(Circle())
            }
        }
        .frame(width: size, height: size)
        // Liseré au ton du fond : détache la pastille du grand cercle.
        .overlay(Circle().stroke(MeeshyColors.surfaceDarkDeep, lineWidth: 3))
        .accessibilityLabel(String(localized: "call.avatar.you", defaultValue: "Vous", bundle: .main))
    }

    var callTypeBadge: some View {
        CallTypeBadgeView(
            isVideo: callManager.isVideoEnabled,
            label: callManager.isVideoEnabled
                ? String(localized: "call.type.video", defaultValue: "Appel vidéo", bundle: .main)
                : String(localized: "call.type.audio", defaultValue: "Appel audio", bundle: .main)
        )
    }

    func statusPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: MeeshySpacing.xs) {
            Image(systemName: icon)
                .font(.caption2.weight(.semibold))
                .accessibilityHidden(true)
            Text(text)
                .font(.caption2.weight(.medium))
        }
        .foregroundColor(color)
        .padding(.horizontal, MeeshySpacing.smPlus)
        .padding(.vertical, MeeshySpacing.xs)
        .background(
            Capsule()
                .fill(color.opacity(0.12))
        )
    }
}
