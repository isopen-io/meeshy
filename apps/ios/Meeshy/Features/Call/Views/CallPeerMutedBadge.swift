import SwiftUI
import MeeshyUI

/// #8787 — le micro coupé du correspondant, posé SUR son image en vidéo (en
/// haut au centre de la grande image, au coin de la vignette après une
/// permutation). Hors du chrome qui s'efface : il reste tant que le micro du
/// pair est coupé. Muet pour VoiceOver — la puce de durée le dit
/// (`CallVideoBadgeAccessibility`).
struct CallPeerMutedBadge: View {
    let compact: Bool

    var body: some View {
        Image(systemName: "mic.slash.fill")
            .font(MeeshyFont.relative(compact ? MeeshyIconSize.xxs : MeeshyIconSize.sm, weight: .semibold))
            .foregroundStyle(.white)
            .padding(compact ? MeeshySpacing.xs : MeeshySpacing.sm)
            .callChromeGlass(in: Circle())
            .clipShape(Circle())
            .accessibilityHidden(true)
            .allowsHitTesting(false)
    }
}
