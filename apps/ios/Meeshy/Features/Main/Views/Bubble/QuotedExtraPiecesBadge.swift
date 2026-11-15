import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - « +N » sur la face d'une citation (#9911)

/// **La citation d'un message à plusieurs pièces dit combien il en porte.**
///
/// La face montre la première tuile ; sans « +N », rien ne disait que la
/// citation ouvrait un lot. Le compte vient de la citation elle-même
/// (`ReplyReference.quotedExtraPieceCount`) : `nil` quand elle NOMME une pièce
/// (elle n'en montre qu'une, la bonne) et pour un contenu protégé — un compte
/// est déjà un fait sur ce que la protection retient.
///
/// Les trois peaux — bulle, rangée plate, bannière du composeur — posent le
/// MÊME badge au MÊME coin.
private struct QuotedExtraPiecesBadge: ViewModifier {
    let extra: Int?

    func body(content: Content) -> some View {
        if let extra {
            content.overlay(alignment: .bottomTrailing) {
                Text(verbatim: "+\(extra)")
                    .font(MeeshyFont.relative(MeeshyFont.captionSize, weight: .bold).monospacedDigit())
                    .foregroundStyle(.white)
                    .padding(.horizontal, MeeshySpacing.xs)
                    .padding(.vertical, MeeshySpacing.xxs / 2)
                    .background(Capsule().fill(Color.black.opacity(0.62)))
                    .padding(MeeshySpacing.xxs)
                    .allowsHitTesting(false)
            }
        } else {
            content
        }
    }
}

extension View {
    /// Pose « +N » sur la face d'une citation du message ENTIER (#9911).
    func quotedExtraPieces(_ reply: ReplyReference) -> some View {
        modifier(QuotedExtraPiecesBadge(extra: reply.quotedExtraPieceCount))
    }
}
