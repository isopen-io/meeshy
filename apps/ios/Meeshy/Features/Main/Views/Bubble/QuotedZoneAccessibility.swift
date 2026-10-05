import SwiftUI
import MeeshySDK

/// **LOI DES ZONES — la moitié VoiceOver, écrite UNE fois pour les deux
/// rangées** (`BubbleStandardLayout`, `FocalRow`, qui sert Focal et Script).
///
/// Les zones d'une citation sont des gestes posés DANS la citation. La rangée
/// qui l'héberge pose `.accessibilityElement(children: .combine)` puis
/// REMPLACE son libellé : le trait, l'indice et le libellé des zones ne sont
/// jamais prononcés, et VoiceOver n'a ni tap localisé ni appui long. Sans
/// action NOMMÉE, les zones sont indisponibles au lecteur d'écran.
///
/// Les deux rangées portaient chacune leur jumelle de ce bloc ; #8320 y ajoute
/// deux actions, et une jumelle qu'on modifie deux fois finit par diverger —
/// d'où ce site unique.
///
/// - zone 1 : « Affiche le profil de l'auteur cité » ;
/// - zone 2 : « Écouter le message cité » pour un AUDIO, qui se joue sur
///   place (#8320), « Ouvrir le média cité » pour le reste ;
/// - zone 3 : « Aller au message cité » (#8320) — le saut et la surbrillance,
///   que le toucher offrait déjà et que VoiceOver n'atteignait que par
///   l'activation générique de la rangée, sans nom.
///
/// Les actions suivent l'ARMEMENT, jamais la présence à l'écran : une action
/// nommée qui ne déclenche rien est un contrôle qui ment, et le rotor la
/// RÉCITE.
enum QuotedZoneAccessibility {

    @ViewBuilder
    static func actions(
        reference: ReplyReference?,
        onQuotedAuthorTap: ((ReplyReference) -> Void)?,
        onQuotedMediaTap: ((ReplyReference) -> Void)?,
        onReplyTap: ((String) -> Void)?
    ) -> some View {
        if let reference {
            if let onQuotedAuthorTap, reference.offersAuthorGate {
                Button(String(localized: "bubble.reply.author_hint", defaultValue: "Affiche le profil de l'auteur cité", bundle: .main)) {
                    onQuotedAuthorTap(reference)
                }
            }
            if let onQuotedMediaTap, reference.offersMediaGate {
                Button(mediaActionLabel(for: reference)) {
                    onQuotedMediaTap(reference)
                }
            }
            if let onReplyTap, !reference.isStoryReply, reference.opensQuotedTarget {
                Button(String(localized: "bubble.reply.go_to_quoted", defaultValue: "Aller au message cité", bundle: .main)) {
                    onReplyTap(reference.messageId)
                }
            }
        }
    }

    /// Le nom de la ZONE 2 — le même aux deux endroits qui la nomment : la
    /// zone elle-même (dans la citation) et l'action de la rangée.
    static func mediaActionLabel(for reference: ReplyReference) -> String {
        guard reference.quotedMediaKind == .audio else {
            return String(localized: "bubble.reply.open_media", defaultValue: "Ouvrir le média cité", bundle: .main)
        }
        return String(localized: "bubble.reply.listen_quoted", defaultValue: "Écouter le message cité", bundle: .main)
    }
}
