import SwiftUI
import MeeshySDK
import MeeshyUI

/// Visuel partagé du correspondant d'appel — flux vidéo distant si actif,
/// sinon avatar (cache-first, `resolveRemoteProfile`). Utilisé à 44pt dans
/// `FloatingCallPillView` et à 56pt dans `CallBubbleView` : extrait pour ne
/// pas dupliquer ni le layout ni la résolution de profil entre les deux
/// sites de montage (spec 2026-07-07-call-banner-swipe-collapse-design.md,
/// § CallBubbleView). Toujours circulaire.
struct CallParticipantVisual: View {
    let diameter: CGFloat

    // Audit P1-16 parity (see CallView.swift / FloatingCallPillView.swift /
    // CallBubbleView.swift) — injected by the caller instead of a
    // `= CallManager.shared` default. Both mount sites (FloatingCallPillView,
    // CallBubbleView) already hold their own @ObservedObject callManager and
    // re-evaluate their body on every call tick (duration/quality/mute), which
    // reconstructs this struct; a defaulted @ObservedObject would tear down
    // and rebuild its objectWillChange subscription on every such tick.
    @ObservedObject var callManager: CallManager
    @State private var remoteProfile: MeeshyUser?

    var body: some View {
        Group {
            if callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
                CallVideoView(track: callManager.remoteVideoTrack, contentMode: .scaleAspectFill)
                    .frame(width: diameter, height: diameter)
                    .clipShape(Circle())
                    .overlay(
                        Circle().stroke(Color.white.opacity(0.25), lineWidth: 1)
                    )
                    .accessibilityHidden(true)
            } else {
                avatarView
            }
        }
        .task(id: callManager.remoteUserId) {
            await resolveRemoteProfile(userId: callManager.remoteUserId)
        }
    }

    private var avatarView: some View {
        // CachedAvatarImage : échec silencieux (initiales 2 lettres + accent
        // indigo), zéro bouton retry sur un cercle d'appel 44-56pt — la
        // résolution du profil reste cache-first via resolveRemoteProfile.
        CachedAvatarImage(
            urlString: remoteProfile?.avatar,
            thumbHash: remoteProfile?.avatarThumbHash,
            name: callManager.remoteUsername ?? "?",
            size: diameter,
            accentColor: MeeshyColors.brandPrimaryHex
        )
        .accessibilityHidden(true)
    }

    /// Résolution cache-first (Instant App) : `.fresh`/`.stale` servis
    /// immédiatement, pas d'appel réseau ici — `CallView` rafraîchit et
    /// ré-alimente le cache quand l'appel passe en plein écran.
    private func resolveRemoteProfile(userId: String?) async {
        guard let userId, !userId.isEmpty else {
            remoteProfile = nil
            return
        }
        switch await CacheCoordinator.shared.profiles.load(for: userId) {
        case .fresh(let users, _), .stale(let users, _):
            remoteProfile = users.first
        case .expired, .empty:
            break
        }
    }
}
