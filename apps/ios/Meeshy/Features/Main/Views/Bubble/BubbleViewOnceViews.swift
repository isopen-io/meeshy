import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Une vue unique pas encore ouverte, en mode Bulles** (#7618).
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
    let isMe: Bool
    let isDark: Bool
    let protection: MessageProtectionDescriptor
    let timeString: String
    let onOpen: () -> Void

    static func == (lhs: BubbleViewOnceSealedView, rhs: BubbleViewOnceSealedView) -> Bool {
        lhs.isMe == rhs.isMe
            && lhs.isDark == rhs.isDark
            && lhs.protection == rhs.protection
            && lhs.timeString == rhs.timeString
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if isMe { Spacer(minLength: 50) }

            VStack(alignment: isMe ? .trailing : .leading, spacing: 4) {
                MessageProtectionChrome(descriptor: protection.withoutViewOnce, isDark: isDark)
                    .equatable()
                HStack(alignment: .center, spacing: 6) {
                    ViewOnceChip(state: .sealed, isDark: isDark, onOpen: onOpen)
                        .equatable()
                    Text(timeString)
                        .font(MeeshyFont.relative(11, weight: .regular))
                        .foregroundColor(ThemeManager.shared.textMuted)
                        .accessibilityHidden(true)
                }
            }

            if !isMe { Spacer(minLength: 50) }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, 2)
    }
}
