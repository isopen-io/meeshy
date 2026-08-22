import SwiftUI
import MeeshySDK
import MeeshyUI

/// Feed video sound toggle (exigence produit 2026-08-22, S2) — chrome mirrors
/// `ReelFeedCard.reelGlyph` / `ReelRepostEmbedCell.reelBadge` (`.ultraThinMaterial`
/// circle, white 0.25 stroke, drop shadow), reused VERBATIM by both surfaces
/// so there is exactly ONE place that renders it (D2's "un seul geste à
/// apprendre" already implies one implementation, not two hand-copied ones).
///
/// Icon: `BackgroundSoundBadge.muteIconName(isMuted:)` — the SAME resolver
/// used product-wide, never a second one. Label: describes the ACTION the tap
/// will perform (unanimous convention across the four existing sound-toggle
/// `accessibilityLabel`s in this repo — `CallView`, `PostDetailView`,
/// `ReelsPlayerView`, SDK `VideoTransportControls`), not the current state.
struct ReelFeedSoundButton: View {
    let isSoundOn: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: BackgroundSoundBadge.muteIconName(isMuted: !isSoundOn))
                .font(MeeshyFont.relative(13, weight: .bold))
                .foregroundColor(.white)
                .padding(8)
                .background(Circle().fill(.ultraThinMaterial))
                .overlay(Circle().stroke(Color.white.opacity(0.25), lineWidth: 1))
                .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                .contentShape(Circle())
        }
        // Cible tactile 44×44 (HIG) — même correctif que `ReelFeedCard.likeButton` :
        // sans elle, un tap approximatif tombe dans le geste parent (tap-média,
        // ou le Button englobant du repost).
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(Rectangle())
        .buttonStyle(.plain)
        .accessibilityLabel(isSoundOn
            ? String(localized: "a11y.feed.video.sound.mute", defaultValue: "Couper le son de la vidéo", bundle: .main)
            : String(localized: "a11y.feed.video.sound.unmute", defaultValue: "Activer le son de la vidéo", bundle: .main))
    }
}
