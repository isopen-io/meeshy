import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une vue unique, en mode Bulles** (#7618, #7579) — scellée ou déjà ouverte.
///
/// La bulle EST la puce `(1) · Touchez pour afficher` : aucun contenu n'est
/// monté, parce que `BubbleContent` ne le porte plus (`sealedForDisplay`). Le
/// voile posé sur un contenu monté ne protégeait que le pixel — le texte restait
/// dans l'arbre d'accessibilité, la légende sous le voile, le fichier dans la
/// file de téléchargement.
///
/// Le chrome au-dessus garde l'éphémère (la flamme et son décompte) ; la vue
/// unique ne s'y répète pas, la puce la dit (#7619 : un état se dit une fois).
struct BubbleViewOnceSealedView: View, Equatable {
    let state: ViewOnceChip.State
    let isMe: Bool
    let isDark: Bool
    let protection: MessageProtectionDescriptor
    /// Le pied de la puce (#16130) : l'heure et l'accusé, par le MÊME `BubbleFooter` que
    /// les feuilles sans bulle (sticker, emoji libre). Il n'est fait que de ce que
    /// `footerModel` y met — rien de ce que le sceau cache.
    let footer: BubbleFooterModel
    /// Renvoyer et « détails de lecture » : hors de l'égalité, comme tout rappel.
    var footerActions = BubbleFooterActions()
    /// Ce que fait le toucher, dit à VoiceOver (#8009).
    var hint: String? = nil
    let onOpen: () -> Void

    static func == (lhs: BubbleViewOnceSealedView, rhs: BubbleViewOnceSealedView) -> Bool {
        lhs.state == rhs.state && lhs.hint == rhs.hint
            && lhs.isMe == rhs.isMe
            && lhs.isDark == rhs.isDark
            && lhs.protection == rhs.protection
            && lhs.footer.timestamp == rhs.footer.timestamp
    }

    /// Le pied d'une vue unique : l'heure et le statut, et RIEN d'autre — ni identité, ni
    /// drapeau, ni traduction, qui diraient d'un contenu scellé plus que la puce.
    static func footerModel(for content: BubbleContent, isOnline: Bool) -> BubbleFooterModel {
        BubbleFooterModel.make(
            timeString: content.meta.timeString,
            deliveryStatus: .sent,
            isMe: false,
            isOnline: isOnline,
            sender: nil,
            flags: [],
            showsTranslate: false
        )
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: MeeshySpacing.sm) {
            if isMe { Spacer(minLength: 50) }

            VStack(alignment: isMe ? .trailing : .leading, spacing: MeeshySpacing.xs) {
                MessageProtectionChrome(descriptor: protection.withoutViewOnce, isDark: isDark)
                    .equatable()
                HStack(alignment: .center, spacing: MeeshySpacing.xsPlus) {
                    ViewOnceChip(state: state, isDark: isDark, hint: hint, onOpen: onOpen)
                        .equatable()
                    Text(footer.timestamp ?? "")
                        .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .regular))
                        .foregroundColor(ThemeManager.shared.textMuted)
                        .accessibilityHidden(true)
                }
            }

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.xxs)
    }
}
