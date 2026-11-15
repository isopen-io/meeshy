import SwiftUI
import MeeshySDK
import MeeshyUI

/// Feed video sound toggle (exigence produit 2026-08-22, S2) — chrome is the shared
/// fullscreen disc (`FullscreenChromeButton`, #8878), reused VERBATIM by both
/// surfaces (`ReelFeedCard`, `ReelRepostEmbedCell`) so there is exactly ONE place
/// that renders it (D2's "un seul geste à apprendre" already implies one
/// implementation, not two hand-copied ones).
///
/// Icon: `BackgroundSoundBadge.muteIconName(isMuted:)` — the SAME resolver
/// used product-wide, never a second one. Label: describes the ACTION the tap
/// will perform (unanimous convention across the four existing sound-toggle
/// `accessibilityLabel`s in this repo — `CallView`, `PostDetailView`,
/// `ReelsPlayerView`, SDK `VideoTransportControls`), not the current state.
///
/// `isSoundAudible` is the REAL player state (`!SharedAVPlayerManager
/// .shared.effectiveMuted`), never the raw session intention
/// (`ReelFeedSoundIntent.isSoundOn`) alone — DoD S2 rejet, constat majeur
/// #2 : a global `isMuted` left `true` by an unrelated surface (conversation
/// gallery mute button) keeps the player silent regardless of the feed's own
/// intent, and an icon driven by intent alone would lie about it.
struct ReelFeedSoundButton: View {
    let isSoundAudible: Bool
    let action: () -> Void

    var body: some View {
        FullscreenChromeButton(
            systemImage: BackgroundSoundBadge.muteIconName(isMuted: !isSoundAudible),
            label: isSoundAudible
                ? String(localized: "a11y.feed.video.sound.mute", defaultValue: "Couper le son de la vidéo", bundle: .main)
                : String(localized: "a11y.feed.video.sound.unmute", defaultValue: "Activer le son de la vidéo", bundle: .main),
            action: action
        )
    }
}
