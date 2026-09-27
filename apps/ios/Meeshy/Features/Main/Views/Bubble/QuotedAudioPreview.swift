import SwiftUI
import MeeshySDK
import MeeshyUI

/// **L'aperçu d'un vocal CITÉ** (#8230) — un bouton de lecture et un motif
/// d'onde figé, dans une capsule.
///
/// Une citation d'image montrait l'image, une citation de vocal ne montrait
/// qu'un glyphe dans la bulle et RIEN dans la rangée plate : l'audio cité n'y
/// avait aucune zone média atteignable au doigt. Cette capsule EST cette zone
/// dans les deux peaux ; le geste est posé par la peau qui l'héberge (une zone
/// = un site, loi des zones), jamais ici.
///
/// La durée n'y est pas répétée : la ligne de détails voisine (« 0:42 ·
/// 60 Ko ») la dit déjà, depuis la règle partagée qui la retient pour un
/// média protégé.
///
/// Décorative pour VoiceOver : la peau nomme la zone (« Ouvrir le média
/// cité »), et la rangée l'offre en action nommée.
struct QuotedAudioPreview: View, Equatable {
    let tint: Color
    /// Vrai quand la zone média est ARMÉE : le bouton de lecture promet une
    /// action, il ne se dessine que si elle existe (loi 4 — un contrôle
    /// existe s'il a un effet). Sinon le glyphe dit le genre, pas l'action.
    let showsPlayGlyph: Bool
    private let bars: [CGFloat]

    init(seed: String, tint: Color, showsPlayGlyph: Bool) {
        self.tint = tint
        self.showsPlayGlyph = showsPlayGlyph
        self.bars = QuotedReplyPresentation.quotedAudioBars(seed: seed)
    }

    private static let barWidth: CGFloat = 2.5
    private static let barMaxHeight: CGFloat = 18

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: showsPlayGlyph ? "play.circle.fill" : "waveform")
                .font(MeeshyFont.relative(18, weight: .bold))
                .foregroundStyle(tint)

            HStack(alignment: .center, spacing: 2) {
                ForEach(bars.indices, id: \.self) { index in
                    Capsule()
                        .fill(tint.opacity(0.55))
                        .frame(width: Self.barWidth, height: max(4, bars[index] * Self.barMaxHeight))
                }
            }
        }
        .padding(.horizontal, 8)
        .frame(height: QuotedReplyPresentation.quotedAudioHeight)
        .background(Capsule().fill(tint.opacity(0.12)))
        .accessibilityHidden(true)
    }
}
