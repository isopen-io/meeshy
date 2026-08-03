import SwiftUI
import MeeshySDK
import MeeshyUI

/// Visuel partagé du correspondant d'appel — flux vidéo distant si actif,
/// sinon avatar (cache-first, `resolveRemoteProfile`). Utilisé à 44pt
/// (cercle) dans `FloatingCallPillView`, et à 56pt (cercle) ou aux paliers
/// rectangle small/medium/large dans `CallBubbleView` : extrait pour ne pas
/// dupliquer ni le layout ni la résolution de profil entre les sites de
/// montage (spec 2026-07-07-call-banner-swipe-collapse-design.md, §
/// CallBubbleView). `RoundedRectangle(cornerRadius:)` rend un cercle parfait
/// quand `cornerRadius == min(width, height) / 2` — l'initialiseur
/// `diameter:` s'appuie sur cette identité pour garder ses sites d'appel
/// circulaires existants visuellement inchangés (spec
/// 2026-08-03-call-bubble-pip-resize-morph-design.md).
struct CallParticipantVisual: View {
    let width: CGFloat
    let height: CGFloat
    let cornerRadius: CGFloat

    // Audit P1-16 parity (see CallView.swift / FloatingCallPillView.swift /
    // CallBubbleView.swift) — injected by the caller instead of a
    // `= CallManager.shared` default. Both mount sites (FloatingCallPillView,
    // CallBubbleView) already hold their own @ObservedObject callManager and
    // re-evaluate their body on every call tick (duration/quality/mute), which
    // reconstructs this struct; a defaulted @ObservedObject would tear down
    // and rebuild its objectWillChange subscription on every such tick.
    @ObservedObject var callManager: CallManager
    @State private var remoteProfile: MeeshyUser?

    /// Initialiseur circulaire — les deux sites d'appel préexistants (avatar
    /// de la pilule, palier cercle de la bulle) continuent de passer un seul
    /// `diameter:`.
    init(diameter: CGFloat, callManager: CallManager) {
        self.width = diameter
        self.height = diameter
        self.cornerRadius = diameter / 2
        self.callManager = callManager
    }

    /// Initialiseur rectangle — paliers small/medium/large de `CallBubbleView`,
    /// où largeur et hauteur divergent et le rayon de coin ne dérive plus
    /// d'un diamètre unique.
    init(width: CGFloat, height: CGFloat, cornerRadius: CGFloat, callManager: CallManager) {
        self.width = width
        self.height = height
        self.cornerRadius = cornerRadius
        self.callManager = callManager
    }

    var body: some View {
        Group {
            if callManager.hasRemoteVideoTrack && callManager.isRemoteVideoEnabled {
                CallVideoView(track: callManager.remoteVideoTrack, contentMode: .scaleAspectFill)
                    .frame(width: width, height: height)
                    .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(Color.white.opacity(0.25), lineWidth: 1)
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
        // Aux paliers rectangle (width != height), l'avatar reste à sa
        // taille naturelle (min(width, height)) et centré sur un fond
        // assorti à la forme, plutôt que d'étirer un portrait carré hors de
        // son ratio.
        ZStack {
            if width != height {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(Color.black.opacity(0.55))
            }
            CachedAvatarImage(
                urlString: remoteProfile?.avatar,
                thumbHash: remoteProfile?.avatarThumbHash,
                name: callManager.remoteUsername ?? "?",
                size: min(width, height),
                accentColor: MeeshyColors.brandPrimaryHex
            )
        }
        .frame(width: width, height: height)
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
